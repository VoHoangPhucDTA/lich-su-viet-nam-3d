"""Resumable corpus-to-embedding pipeline."""

import hashlib
import logging
from pathlib import Path

from app.core.exceptions import CorpusError
from app.corpus.loader import iter_corpus
from app.corpus.models import CorpusChunk
from app.corpus.validator import validate_corpus
from app.embedding.base import EmbeddingProvider, validate_vectors
from app.embedding.checkpoint import EmbeddingArtifactStore
from app.embedding.formatter import RetrievalFormatter
from app.embedding.gemini import error_context
from app.embedding.models import (
    EmbeddingFailure,
    EmbeddingManifest,
    EmbeddingRecord,
    EmbeddingResponseError,
    MissingGeminiApiKeyError,
    PermanentEmbeddingError,
)

logger = logging.getLogger(__name__)
MAX_BATCH_SPLIT_DEPTH = 16


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _batches(values: list[CorpusChunk], size: int) -> list[list[CorpusChunk]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


class EmbeddingService:
    def __init__(
        self,
        *,
        corpus_path: Path,
        output_root: Path,
        checkpoint_root: Path,
        model: str,
        dimension: int,
        batch_size: int,
        formatter: RetrievalFormatter | None = None,
    ) -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self.corpus_path = corpus_path
        self.model = model
        self.dimension = dimension
        self.batch_size = batch_size
        self.formatter = formatter or RetrievalFormatter()
        self.store = EmbeddingArtifactStore(
            output_root, checkpoint_root, model, dimension
        )

    def _is_completed(self, chunk: CorpusChunk, record: EmbeddingRecord) -> bool:
        return record.resume_key() == (
            chunk.chunkId,
            chunk.chunkHash,
            self.model,
            self.dimension,
            self.formatter.version,
        )

    def _failure_matches(self, chunk: CorpusChunk, failure: EmbeddingFailure) -> bool:
        return (
            failure.chunkId == chunk.chunkId
            and failure.chunkHash == chunk.chunkHash
            and failure.embeddingModel == self.model
            and failure.dimension == self.dimension
            and failure.formatterVersion == self.formatter.version
        )

    def _update_counts(
        self,
        manifest: EmbeddingManifest,
        selected: list[CorpusChunk],
        records: dict[str, EmbeddingRecord],
        failures: dict[str, EmbeddingFailure],
    ) -> None:
        successful_ids = {
            chunk.chunkId
            for chunk in selected
            if (record := records.get(chunk.chunkId)) is not None
            and self._is_completed(chunk, record)
        }
        unresolved_ids = {
            chunk.chunkId
            for chunk in selected
            if chunk.chunkId not in successful_ids
            and (failure := failures.get(chunk.chunkId)) is not None
            and self._failure_matches(chunk, failure)
        }
        manifest.successfulRecords = len(successful_ids)
        manifest.unresolvedFailedRecords = len(unresolved_ids)
        manifest.failedRecords = manifest.unresolvedFailedRecords
        manifest.attemptedRecords = len(successful_ids | unresolved_ids)
        manifest.unattemptedRecords = (
            manifest.selectedRecords - manifest.attemptedRecords
        )
        manifest.remainingRecords = manifest.selectedRecords - manifest.successfulRecords

    def _persist_progress(
        self,
        manifest: EmbeddingManifest,
        selected: list[CorpusChunk],
        records: dict[str, EmbeddingRecord],
        failures: dict[str, EmbeddingFailure],
    ) -> None:
        self._update_counts(manifest, selected, records, failures)
        self.store.write_records(records)
        self.store.write_failures(list(failures.values()))
        self.store.write_manifest(manifest)

    @staticmethod
    def _completion_status(manifest: EmbeddingManifest) -> str:
        if manifest.remainingRecords == 0 and manifest.unresolvedFailedRecords == 0:
            return "COMPLETED"
        if manifest.unattemptedRecords == 0 and manifest.unresolvedFailedRecords:
            return "COMPLETED_WITH_ERRORS"
        if manifest.unresolvedFailedRecords:
            return "PARTIAL_WITH_ERRORS"
        return "PARTIAL"

    @staticmethod
    def _context_code(exc: BaseException) -> int | None:
        context = getattr(exc, "context", None)
        if isinstance(context, dict):
            code = context.get("httpCode")
            return code if isinstance(code, int) else None
        return None

    @staticmethod
    def _is_fatal_run_error(exc: BaseException) -> bool:
        if isinstance(exc, MissingGeminiApiKeyError):
            return True
        if not isinstance(exc, PermanentEmbeddingError):
            return False
        context = exc.context
        code = context.get("httpCode")
        serialized = str(context).upper()
        if code in (401, 403, 404) or "API_KEY_INVALID" in serialized:
            return True
        return code == 400 and any(
            marker in serialized
            for marker in ("OUTPUT_DIMENSION", "OUTPUT_DIMENSIONALITY", "MODEL NOT FOUND")
        )

    def _should_bisect(self, exc: BaseException, batch_size: int, depth: int) -> bool:
        if batch_size <= 1 or depth >= MAX_BATCH_SPLIT_DEPTH:
            return False
        if isinstance(exc, TypeError | ValueError | EmbeddingResponseError):
            return True
        return self._context_code(exc) in (400, 413, 422)

    def _failure_for(
        self,
        chunk: CorpusChunk,
        exc: BaseException,
        batch: list[CorpusChunk],
    ) -> EmbeddingFailure:
        context = error_context(exc, model=self.model, dimension=self.dimension)
        return EmbeddingFailure(
            chunkId=chunk.chunkId,
            chunkHash=chunk.chunkHash,
            documentId=chunk.documentId,
            embeddingModel=self.model,
            dimension=self.dimension,
            formatterVersion=self.formatter.version,
            errorType=type(exc).__name__,
            message=str(context.get("message") or str(exc))[:1000],
            exceptionClass=context.get("exceptionClass"),
            httpCode=context.get("httpCode"),
            providerStatus=context.get("providerStatus"),
            providerDetails=context.get("providerDetails"),
            requestStage=context.get("requestStage", "embed_content"),
            batchSize=len(batch),
            batchChunkIds=[item.chunkId for item in batch],
        )

    def _process_batch(
        self,
        provider: EmbeddingProvider,
        batch: list[CorpusChunk],
        manifest: EmbeddingManifest,
        selected: list[CorpusChunk],
        records: dict[str, EmbeddingRecord],
        failures: dict[str, EmbeddingFailure],
        *,
        depth: int = 0,
    ) -> None:
        try:
            documents = [self.formatter.format_document(chunk) for chunk in batch]
            vectors = validate_vectors(
                provider.embed_documents(documents), len(batch), self.dimension
            )
        except Exception as exc:
            if self._is_fatal_run_error(exc):
                raise
            if self._should_bisect(exc, len(batch), depth):
                midpoint = len(batch) // 2
                self._process_batch(
                    provider,
                    batch[:midpoint],
                    manifest,
                    selected,
                    records,
                    failures,
                    depth=depth + 1,
                )
                self._process_batch(
                    provider,
                    batch[midpoint:],
                    manifest,
                    selected,
                    records,
                    failures,
                    depth=depth + 1,
                )
                return
            logger.error(
                "Embedding batch failed for %d records (%s)",
                len(batch),
                type(exc).__name__,
            )
            for chunk in batch:
                if not (
                    (record := records.get(chunk.chunkId)) is not None
                    and self._is_completed(chunk, record)
                ):
                    failures[chunk.chunkId] = self._failure_for(chunk, exc, batch)
            self._persist_progress(manifest, selected, records, failures)
            return

        for chunk, vector in zip(batch, vectors, strict=False):
            records[chunk.chunkId] = EmbeddingRecord(
                chunkId=chunk.chunkId,
                chunkHash=chunk.chunkHash,
                documentId=chunk.documentId,
                embeddingModel=self.model,
                dimension=self.dimension,
                formatterVersion=self.formatter.version,
                vector=vector,
            )
            failures.pop(chunk.chunkId, None)
        manifest.newlyEmbedded += len(batch)
        self._persist_progress(manifest, selected, records, failures)

    def run(
        self,
        provider: EmbeddingProvider | None = None,
        *,
        dry_run: bool = False,
        limit: int | None = None,
        resume: bool = True,
        force: bool = False,
        include_pending_review: bool = False,
    ) -> EmbeddingManifest:
        if limit is not None and limit <= 0:
            raise ValueError("limit must be positive")

        validation = validate_corpus(self.corpus_path)
        if validation.status != "PASSED":
            raise CorpusError("Canonical corpus validation failed")

        chunks = list(iter_corpus(self.corpus_path))
        selected = [
            chunk
            for chunk in chunks
            if include_pending_review or not chunk.containsPendingReview
        ]
        pending_skipped = sum(
            chunk.containsPendingReview for chunk in chunks
        ) if not include_pending_review else 0
        eligible_count = len(selected)
        if limit is not None:
            selected = selected[:limit]

        manifest = EmbeddingManifest(
            corpusSha256=_sha256(self.corpus_path),
            embeddingModel=self.model,
            dimension=self.dimension,
            formatterVersion=self.formatter.version,
            totalCorpusRecords=len(chunks),
            eligibleRecords=eligible_count,
            pendingReviewSkipped=pending_skipped,
            selectedRecords=len(selected),
            dryRun=dry_run,
            unattemptedRecords=len(selected),
            remainingRecords=len(selected),
            status="DRY_RUN" if dry_run else "IN_PROGRESS",
        )
        if dry_run:
            return manifest
        if provider is None:
            raise ValueError("An embedding provider is required outside dry-run mode")

        loaded = self.store.load_records()
        records = loaded.records
        manifest.truncatedTailRecovered = loaded.truncated_tail_recovered
        if loaded.truncated_tail_recovered:
            self.store.write_records(records)

        pending: list[CorpusChunk] = []
        for chunk in selected:
            existing = records.get(chunk.chunkId)
            if resume and not force and existing and self._is_completed(chunk, existing):
                manifest.alreadyCompleted += 1
            else:
                pending.append(chunk)

        loaded_failures = self.store.load_failures()
        failures = {
            chunk.chunkId: failure
            for chunk in selected
            if (failure := loaded_failures.get(chunk.chunkId)) is not None
            and self._failure_matches(chunk, failure)
            and not (
                (record := records.get(chunk.chunkId)) is not None
                and self._is_completed(chunk, record)
            )
        }
        self._persist_progress(manifest, selected, records, failures)

        try:
            for batch in _batches(pending, self.batch_size):
                self._process_batch(
                    provider, batch, manifest, selected, records, failures
                )
        except Exception:
            manifest.status = "FAILED"
            self._persist_progress(manifest, selected, records, failures)
            raise

        self._update_counts(manifest, selected, records, failures)
        manifest.status = self._completion_status(manifest)
        self._persist_progress(manifest, selected, records, failures)
        return manifest
