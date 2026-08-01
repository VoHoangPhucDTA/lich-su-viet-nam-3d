from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.vectorstore.artifact_validator import EmbeddingArtifactValidator
from app.vectorstore.index_service import ChromaIndexService
from tests.vectorstore_helpers import (
    make_corpus_records,
    write_corpus,
    write_valid_artifact,
)


def make_service(
    tmp_path: Path,
    corpus_record: dict[str, Any],
    *,
    client_factory=None,
) -> ChromaIndexService:
    corpus_path = tmp_path / "corpus.jsonl"
    corpus_records = make_corpus_records(corpus_record, 2)
    write_corpus(corpus_path, corpus_records)
    artifact_dir = tmp_path / "artifacts"
    write_valid_artifact(artifact_dir, corpus_path, corpus_records)
    validator = EmbeddingArtifactValidator(
        corpus_path=corpus_path,
        artifact_dir=artifact_dir,
        expected_model="test-embedding-model",
        expected_dimension=3,
        expected_formatter_version="test-formatter-v1",
    )
    kwargs = {}
    if client_factory is not None:
        kwargs["client_factory"] = client_factory
    return ChromaIndexService(
        validator=validator,
        persist_dir=tmp_path / "chroma",
        report_dir=tmp_path / "reports",
        collection_name="test-persistent-collection",
        distance_metric="cosine",
        batch_size=1,
        **kwargs,
    )


def test_dry_run_does_not_create_client_or_storage(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    def forbidden_client_factory(_: Path) -> None:
        raise AssertionError("dry-run must not create a Chroma client")

    service = make_service(
        tmp_path, corpus_record, client_factory=forbidden_client_factory
    )

    report = service.build(dry_run=True)

    assert report.status == "DRY_RUN"
    assert report.inputRecords == 2
    assert not service.persist_dir.exists()
    assert not service.report_path.exists()


def test_persistent_index_reopens_and_second_run_is_idempotent(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    service = make_service(tmp_path, corpus_record)

    first = service.build()
    inspection = service.inspect()
    second = service.build()

    assert first.collectionCountBefore == 0
    assert first.collectionCountAfter == 2
    assert inspection.count == 2
    assert inspection.metadata["embeddingModel"] == "test-embedding-model"
    assert inspection.configuration["hnsw"]["space"] == "cosine"
    assert second.collectionCountBefore == 2
    assert second.collectionCountAfter == 2
    assert service.report_path.is_file()
    service.close()


def test_index_service_cli_ownership_closes_client_once(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    service = make_service(tmp_path, corpus_record)
    stops: list[int] = []
    service._client = SimpleNamespace(
        _system=SimpleNamespace(stop=lambda: stops.append(1))
    )

    service.close()
    service.close()

    assert stops == [1]
