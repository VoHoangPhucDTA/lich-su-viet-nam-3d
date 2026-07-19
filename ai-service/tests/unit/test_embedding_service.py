import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.embedding.fake import FakeEmbeddingProvider
from app.embedding.formatter import RetrievalFormatter
from app.embedding.models import EmbeddingManifest, PermanentEmbeddingError
from app.embedding.service import EmbeddingService


def make_records(
    base: dict[str, Any], count: int, *, pending_last: bool = False
) -> list[dict[str, Any]]:
    records = []
    for index in range(count):
        record = copy.deepcopy(base)
        record["chunkId"] = f"chunk-{index:03d}"
        record["chunkHash"] = f"{index + 1:064x}"
        record["documentId"] = f"document-{index:03d}"
        record["containsPendingReview"] = pending_last and index == count - 1
        records.append(record)
    return records


def write_corpus(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def make_service(
    tmp_path: Path,
    corpus_path: Path,
    *,
    model: str = "gemini-embedding-2",
    dimension: int = 4,
    formatter: RetrievalFormatter | None = None,
    batch_size: int = 2,
) -> EmbeddingService:
    return EmbeddingService(
        corpus_path=corpus_path,
        output_root=tmp_path / "embeddings",
        checkpoint_root=tmp_path / "checkpoints",
        model=model,
        dimension=dimension,
        batch_size=batch_size,
        formatter=formatter,
    )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_pending_review_is_skipped_by_default_and_can_be_included(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 3, pending_last=True))
    service = make_service(tmp_path, path)

    default = service.run(dry_run=True)
    included = service.run(dry_run=True, include_pending_review=True)

    assert default.eligibleRecords == 2
    assert default.pendingReviewSkipped == 1
    assert default.selectedRecords == 2
    assert default.successfulRecords == 0
    assert default.attemptedRecords == 0
    assert default.unattemptedRecords == 2
    assert default.remainingRecords == 2
    assert default.unresolvedFailedRecords == 0
    assert default.status == "DRY_RUN"
    assert included.eligibleRecords == 3
    assert included.pendingReviewSkipped == 0


def test_batch_mapping_and_manifest_counts_are_stable(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 3))
    service = make_service(tmp_path, path)
    provider = FakeEmbeddingProvider(dimension=4)

    manifest = service.run(provider)
    records = read_jsonl(service.store.records_path)

    assert [record["chunkId"] for record in records] == [
        "chunk-000",
        "chunk-001",
        "chunk-002",
    ]
    assert [len(call) for call in provider.document_calls] == [2, 1]
    assert manifest.totalCorpusRecords == 3
    assert manifest.eligibleRecords == 3
    assert manifest.newlyEmbedded == 3
    assert manifest.failedRecords == 0
    assert manifest.status == "COMPLETED"


def test_resume_skips_matching_records(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 2))
    service = make_service(tmp_path, path)
    service.run(FakeEmbeddingProvider(dimension=4))
    provider = FakeEmbeddingProvider(dimension=4)

    manifest = service.run(provider, resume=True)

    assert manifest.alreadyCompleted == 2
    assert manifest.newlyEmbedded == 0
    assert provider.document_calls == []


@pytest.mark.parametrize("changed", ["hash", "model", "dimension", "formatter"])
def test_resume_reembeds_when_identity_changes(
    tmp_path: Path, corpus_record: dict[str, Any], changed: str
) -> None:
    path = tmp_path / "corpus.jsonl"
    records = make_records(corpus_record, 1)
    write_corpus(path, records)
    make_service(tmp_path, path).run(FakeEmbeddingProvider(dimension=4))

    model = "gemini-embedding-2"
    dimension = 4
    formatter = RetrievalFormatter()
    if changed == "hash":
        records[0]["chunkHash"] = "f" * 64
        write_corpus(path, records)
    elif changed == "model":
        model = "gemini-embedding-next"
    elif changed == "dimension":
        dimension = 5
    else:
        formatter = RetrievalFormatter(version="gemini-retrieval-document-v2")

    service = make_service(
        tmp_path,
        path,
        model=model,
        dimension=dimension,
        formatter=formatter,
    )
    manifest = service.run(FakeEmbeddingProvider(dimension=dimension), resume=True)

    assert manifest.alreadyCompleted == 0
    assert manifest.newlyEmbedded == 1


class FailSecondBatchProvider(FakeEmbeddingProvider):
    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        if len(self.document_calls) == 1:
            self.document_calls.append(list(documents))
            raise RuntimeError("temporary test failure")
        return super().embed_documents(documents)


def test_failed_batch_does_not_remove_completed_batches(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 3))
    service = make_service(tmp_path, path, batch_size=1)

    manifest = service.run(FailSecondBatchProvider(dimension=4))

    assert manifest.newlyEmbedded == 2
    assert manifest.failedRecords == 1
    assert manifest.status == "COMPLETED_WITH_ERRORS"
    assert manifest.successfulRecords == 2
    assert manifest.attemptedRecords == 3
    assert manifest.unattemptedRecords == 0
    assert manifest.remainingRecords == 1
    assert manifest.unresolvedFailedRecords == 1
    assert len(service.store.load_records().records) == 2
    assert len(service.store.load_failures()) == 1
    assert len(read_jsonl(service.store.records_path)) == 2
    assert len(read_jsonl(service.store.failures_path)) == 1


def test_truncated_final_record_is_detected_and_recovered(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 1))
    service = make_service(tmp_path, path)
    service.run(FakeEmbeddingProvider(dimension=4))
    with service.store.records_path.open("ab") as output:
        output.write(b'{"chunkId":')

    manifest = service.run(FakeEmbeddingProvider(dimension=4), resume=True)

    assert manifest.truncatedTailRecovered is True
    assert manifest.alreadyCompleted == 1
    assert len(read_jsonl(service.store.records_path)) == 1


class DetailedFailureProvider(FakeEmbeddingProvider):
    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        raise PermanentEmbeddingError(
            "invalid request",
            context={
                "exceptionClass": "ClientError",
                "httpCode": 400,
                "providerStatus": "INVALID_ARGUMENT",
                "message": "invalid request",
                "providerDetails": {"error": {"reason": "bad content"}},
                "model": "gemini-embedding-2",
                "dimension": self.dimension,
                "requestStage": "embed_content",
            },
        )


def test_failure_artifact_is_diagnostic_and_resume_or_force_can_recover(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 2))
    service = make_service(tmp_path, path, batch_size=2)

    failed = service.run(DetailedFailureProvider(dimension=4))
    failures = read_jsonl(service.store.failures_path)

    assert failed.failedRecords == 2
    assert failures[0]["exceptionClass"] == "ClientError"
    assert failures[0]["httpCode"] == 400
    assert failures[0]["providerStatus"] == "INVALID_ARGUMENT"
    assert failures[0]["requestStage"] == "embed_content"
    assert failures[0]["batchSize"] == 1
    assert failures[0]["batchChunkIds"] == [failures[0]["chunkId"]]

    resumed = service.run(FakeEmbeddingProvider(dimension=4), resume=True)
    forced = service.run(FakeEmbeddingProvider(dimension=4), force=True)

    assert resumed.newlyEmbedded == 2
    assert resumed.status == "COMPLETED"
    assert forced.alreadyCompleted == 0
    assert forced.newlyEmbedded == 2
    assert read_jsonl(service.store.failures_path) == []


class PoisonChunkProvider(FakeEmbeddingProvider):
    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        if any("poison-content" in document for document in documents):
            self.document_calls.append(list(documents))
            raise PermanentEmbeddingError(
                "invalid chunk request",
                context={
                    "exceptionClass": "ClientError",
                    "httpCode": 400,
                    "providerStatus": "INVALID_ARGUMENT",
                    "message": "invalid chunk request",
                    "providerDetails": {"error": {"reason": "bad content"}},
                    "requestStage": "embed_content",
                },
            )
        return super().embed_documents(documents)


def test_invalid_batch_is_bisected_to_isolate_one_poison_chunk(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    values = make_records(corpus_record, 4)
    values[2]["embeddingText"] = "poison-content"
    write_corpus(path, values)
    service = make_service(tmp_path, path, batch_size=4)
    provider = PoisonChunkProvider(dimension=4)

    manifest = service.run(provider)
    failures = read_jsonl(service.store.failures_path)

    assert manifest.successfulRecords == 3
    assert manifest.attemptedRecords == 4
    assert manifest.unattemptedRecords == 0
    assert manifest.remainingRecords == 1
    assert manifest.unresolvedFailedRecords == 1
    assert manifest.status == "COMPLETED_WITH_ERRORS"
    assert [failure["chunkId"] for failure in failures] == ["chunk-002"]
    assert failures[0]["batchSize"] == 1
    assert len(provider.document_calls) == 5


def test_old_failure_is_removed_when_resume_succeeds(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "corpus.jsonl"
    values = make_records(corpus_record, 3)
    values[1]["embeddingText"] = "poison-content"
    write_corpus(path, values)
    service = make_service(tmp_path, path, batch_size=3)
    first = service.run(PoisonChunkProvider(dimension=4))

    resumed_provider = FakeEmbeddingProvider(dimension=4)
    resumed = service.run(resumed_provider, resume=True)

    assert first.unresolvedFailedRecords == 1
    assert resumed.alreadyCompleted == 2
    assert resumed.newlyEmbedded == 1
    assert resumed.successfulRecords == 3
    assert resumed.unresolvedFailedRecords == 0
    assert resumed.status == "COMPLETED"
    assert len(resumed_provider.document_calls) == 1
    assert len(resumed_provider.document_calls[0]) == 1
    assert read_jsonl(service.store.failures_path) == []


def test_partial_with_errors_status_semantics() -> None:
    manifest = EmbeddingManifest(
        corpusSha256="a" * 64,
        embeddingModel="model",
        dimension=4,
        formatterVersion="formatter",
        totalCorpusRecords=4,
        eligibleRecords=4,
        pendingReviewSkipped=0,
        selectedRecords=4,
        successfulRecords=1,
        attemptedRecords=2,
        unattemptedRecords=2,
        remainingRecords=3,
        unresolvedFailedRecords=1,
    )

    assert EmbeddingService._completion_status(manifest) == "PARTIAL_WITH_ERRORS"


def test_failure_artifact_redacts_secret_like_values(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    secret = "AIza" + "s" * 32

    class SecretFailureProvider(FakeEmbeddingProvider):
        def embed_documents(self, documents: list[str]) -> list[list[float]]:
            raise PermanentEmbeddingError(
                "bad request",
                context={
                    "exceptionClass": "ClientError",
                    "httpCode": 400,
                    "message": f"bad request {secret}",
                    "providerDetails": {"authorization": secret},
                },
            )

    path = tmp_path / "corpus.jsonl"
    write_corpus(path, make_records(corpus_record, 1))
    service = make_service(tmp_path, path, batch_size=1)

    service.run(SecretFailureProvider(dimension=4))
    artifact = service.store.failures_path.read_text(encoding="utf-8")

    assert secret not in artifact
    assert "[REDACTED]" in artifact
