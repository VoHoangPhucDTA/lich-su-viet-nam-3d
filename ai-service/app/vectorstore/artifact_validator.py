"""Strict validation gate for production embedding artifacts."""

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.corpus.loader import iter_corpus
from app.embedding.models import EmbeddingManifest, EmbeddingRecord
from app.vectorstore.models import ArtifactValidationError, ValidatedEmbeddingArtifact


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class EmbeddingArtifactValidator:
    def __init__(
        self,
        *,
        corpus_path: Path,
        artifact_dir: Path,
        expected_model: str,
        expected_dimension: int,
        expected_formatter_version: str,
    ) -> None:
        self.corpus_path = corpus_path
        self.artifact_dir = artifact_dir
        self.expected_model = expected_model
        self.expected_dimension = expected_dimension
        self.expected_formatter_version = expected_formatter_version

    def _read_manifest(self) -> EmbeddingManifest:
        path = self.artifact_dir / "embedding_manifest.json"
        if not path.is_file():
            raise ArtifactValidationError(f"Embedding manifest is missing: {path}")
        try:
            return EmbeddingManifest.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError) as exc:
            raise ArtifactValidationError(f"Invalid embedding manifest: {exc}") from exc

    def _read_records(self) -> tuple[list[EmbeddingRecord], list[str]]:
        path = self.artifact_dir / "embedding_records.jsonl"
        if not path.is_file():
            raise ArtifactValidationError(f"Embedding records are missing: {path}")
        records: list[EmbeddingRecord] = []
        duplicates: set[str] = set()
        seen: set[str] = set()
        with path.open("r", encoding="utf-8") as source:
            for line_number, line in enumerate(source, start=1):
                try:
                    value: Any = json.loads(line)
                    record = EmbeddingRecord.model_validate(value)
                except (json.JSONDecodeError, ValidationError) as exc:
                    raise ArtifactValidationError(
                        f"Invalid embedding record at line {line_number}: {exc}"
                    ) from exc
                if record.chunkId in seen:
                    duplicates.add(record.chunkId)
                seen.add(record.chunkId)
                records.append(record)
        return records, sorted(duplicates)

    def _failure_count(self) -> int:
        path = self.artifact_dir / "embedding_failures.jsonl"
        if not path.is_file():
            raise ArtifactValidationError(f"Embedding failure report is missing: {path}")
        with path.open("r", encoding="utf-8") as source:
            return sum(bool(line.strip()) for line in source)

    def validate(self) -> ValidatedEmbeddingArtifact:
        if not self.corpus_path.is_file():
            raise ArtifactValidationError(f"Canonical corpus is missing: {self.corpus_path}")
        manifest = self._read_manifest()
        issues: list[str] = []
        if manifest.status != "COMPLETED" or manifest.dryRun:
            issues.append(f"manifest status must be COMPLETED, got {manifest.status}")
        if manifest.embeddingModel != self.expected_model:
            issues.append("manifest embedding model does not match configuration")
        if manifest.dimension != self.expected_dimension:
            issues.append("manifest dimension does not match configuration")
        if manifest.formatterVersion != self.expected_formatter_version:
            issues.append("manifest formatter version does not match configuration")
        corpus_sha = sha256_file(self.corpus_path)
        if manifest.corpusSha256 != corpus_sha:
            issues.append("manifest corpus SHA-256 does not match canonical corpus")

        chunks = list(iter_corpus(self.corpus_path))
        chunks_by_id = {chunk.chunkId: chunk for chunk in chunks}
        eligible_ids = {
            chunk.chunkId for chunk in chunks if not chunk.containsPendingReview
        }
        pending_count = sum(chunk.containsPendingReview for chunk in chunks)
        if manifest.totalCorpusRecords != len(chunks):
            issues.append("manifest total corpus count does not match canonical corpus")
        if manifest.eligibleRecords != len(eligible_ids):
            issues.append("manifest eligible count does not match canonical corpus")
        if manifest.pendingReviewSkipped != pending_count:
            issues.append("manifest pending-review count does not match canonical corpus")
        if manifest.selectedRecords != manifest.eligibleRecords:
            issues.append("manifest does not represent a full eligible-corpus run")
        if manifest.successfulRecords != manifest.eligibleRecords:
            issues.append("manifest successful count does not match eligible count")
        if manifest.attemptedRecords != manifest.eligibleRecords:
            issues.append("manifest attempted count does not match eligible count")
        if manifest.unattemptedRecords != 0:
            issues.append("manifest has unattempted embedding records")
        if manifest.remainingRecords != 0:
            issues.append("manifest has remaining embedding records")
        if manifest.unresolvedFailedRecords != 0:
            issues.append("manifest has unresolved failed records")
        if manifest.alreadyCompleted + manifest.newlyEmbedded != manifest.eligibleRecords:
            issues.append("manifest completed count does not match eligible count")

        try:
            records, duplicate_ids = self._read_records()
        except ArtifactValidationError as exc:
            issues.append(str(exc))
            records, duplicate_ids = [], []
        if duplicate_ids:
            issues.append(f"duplicate embedding chunk IDs: {duplicate_ids}")
        try:
            failure_count = self._failure_count()
        except ArtifactValidationError as exc:
            issues.append(str(exc))
            failure_count = 0
        if manifest.failedRecords != 0 or failure_count != 0:
            issues.append(
                f"unresolved embedding failures: manifest={manifest.failedRecords}, file={failure_count}"
            )
        if len(records) != manifest.eligibleRecords:
            issues.append(
                f"embedding record count {len(records)} does not equal manifest eligible count "
                f"{manifest.eligibleRecords}"
            )

        record_ids = {record.chunkId for record in records}
        missing_ids = sorted(eligible_ids - record_ids)
        extra_ids = sorted(record_ids - eligible_ids)
        if missing_ids:
            issues.append(f"missing embedding records: {len(missing_ids)}")
        if extra_ids:
            issues.append(f"extra or pending-review embedding records: {extra_ids[:10]}")

        for record in records:
            chunk = chunks_by_id.get(record.chunkId)
            if chunk is None:
                continue
            if record.chunkHash != chunk.chunkHash:
                issues.append(f"chunk hash mismatch: {record.chunkId}")
            if record.documentId != chunk.documentId:
                issues.append(f"document ID mismatch: {record.chunkId}")
            if record.embeddingModel != self.expected_model:
                issues.append(f"embedding model mismatch: {record.chunkId}")
            if record.dimension != self.expected_dimension:
                issues.append(f"record dimension metadata mismatch: {record.chunkId}")
            if record.formatterVersion != self.expected_formatter_version:
                issues.append(f"formatter version mismatch: {record.chunkId}")
            if len(record.vector) != self.expected_dimension:
                issues.append(f"vector dimension mismatch: {record.chunkId}")
            elif any(not math.isfinite(value) for value in record.vector):
                issues.append(f"vector contains NaN or Infinity: {record.chunkId}")
            if chunk.containsPendingReview:
                issues.append(f"pending-review chunk is not indexable: {record.chunkId}")

        if issues:
            raise ArtifactValidationError("; ".join(issues))
        return ValidatedEmbeddingArtifact(
            manifest=manifest,
            records=records,
            chunks_by_id=chunks_by_id,
            corpus_path=self.corpus_path,
            artifact_dir=self.artifact_dir,
        )
