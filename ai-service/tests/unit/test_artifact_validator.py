import json
from pathlib import Path
from typing import Any

import pytest

from app.corpus.identity import canonical_jsonl_sha256
from app.vectorstore.artifact_validator import EmbeddingArtifactValidator
from app.vectorstore.models import ArtifactValidationError
from tests.vectorstore_helpers import (
    make_corpus_records,
    write_corpus,
    write_valid_artifact,
)


def make_validator(corpus_path: Path, artifact_dir: Path) -> EmbeddingArtifactValidator:
    return EmbeddingArtifactValidator(
        corpus_path=corpus_path,
        artifact_dir=artifact_dir,
        expected_model="test-embedding-model",
        expected_dimension=3,
        expected_formatter_version="test-formatter-v1",
    )


def setup_valid(
    tmp_path: Path, corpus_record: dict[str, Any], count: int = 2
) -> tuple[Path, Path]:
    corpus_path = tmp_path / "corpus.jsonl"
    records = make_corpus_records(corpus_record, count)
    write_corpus(corpus_path, records)
    artifact_dir = tmp_path / "artifacts"
    write_valid_artifact(artifact_dir, corpus_path, records)
    return corpus_path, artifact_dir


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def write_jsonl(path: Path, values: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(value, ensure_ascii=False) + "\n" for value in values),
        encoding="utf-8",
    )


def test_missing_manifest_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path = tmp_path / "corpus.jsonl"
    write_corpus(corpus_path, make_corpus_records(corpus_record, 1))
    with pytest.raises(ArtifactValidationError, match="manifest is missing"):
        make_validator(corpus_path, tmp_path / "missing").validate()


def test_corpus_hash_mismatch_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record)
    manifest_path = artifact_dir / "embedding_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["corpusSha256"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ArtifactValidationError, match="SHA-256"):
        make_validator(corpus_path, artifact_dir).validate()


def test_lf_manifest_is_compatible_with_crlf_working_tree(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path = tmp_path / "corpus.jsonl"
    records = make_corpus_records(corpus_record, 2)
    lf_bytes = "".join(
        json.dumps(record, ensure_ascii=False) + "\n" for record in records
    ).encode("utf-8")
    corpus_path.write_bytes(lf_bytes)
    artifact_dir = tmp_path / "artifacts"
    write_valid_artifact(artifact_dir, corpus_path, records)

    corpus_path.write_bytes(lf_bytes.replace(b"\n", b"\r\n"))

    validated = make_validator(corpus_path, artifact_dir).validate()
    assert validated.manifest.corpusSha256 == canonical_jsonl_sha256(corpus_path)


def test_wrong_vector_dimension_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record)
    path = artifact_dir / "embedding_records.jsonl"
    values = read_jsonl(path)
    values[0]["vector"] = [1.0, 2.0]
    write_jsonl(path, values)
    with pytest.raises(ArtifactValidationError, match="vector dimension mismatch"):
        make_validator(corpus_path, artifact_dir).validate()


def test_nan_vector_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record)
    path = artifact_dir / "embedding_records.jsonl"
    values = read_jsonl(path)
    values[0]["vector"][0] = float("nan")
    write_jsonl(path, values)
    with pytest.raises(ArtifactValidationError, match="NaN or Infinity"):
        make_validator(corpus_path, artifact_dir).validate()


def test_duplicate_chunk_id_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record, count=1)
    path = artifact_dir / "embedding_records.jsonl"
    values = read_jsonl(path)
    write_jsonl(path, values + values)
    with pytest.raises(ArtifactValidationError, match="duplicate embedding"):
        make_validator(corpus_path, artifact_dir).validate()


def test_missing_chunk_embedding_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record)
    path = artifact_dir / "embedding_records.jsonl"
    write_jsonl(path, read_jsonl(path)[:1])
    with pytest.raises(ArtifactValidationError, match="missing embedding records"):
        make_validator(corpus_path, artifact_dir).validate()


def test_extra_embedding_record_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record, count=1)
    path = artifact_dir / "embedding_records.jsonl"
    values = read_jsonl(path)
    extra = dict(values[0])
    extra["chunkId"] = "not-in-corpus"
    write_jsonl(path, [*values, extra])
    with pytest.raises(ArtifactValidationError, match="extra or pending-review"):
        make_validator(corpus_path, artifact_dir).validate()


def test_unresolved_failure_report_is_rejected(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_path, artifact_dir = setup_valid(tmp_path, corpus_record, count=1)
    (artifact_dir / "embedding_failures.jsonl").write_text("{}\n", encoding="utf-8")
    with pytest.raises(ArtifactValidationError, match="unresolved embedding failures"):
        make_validator(corpus_path, artifact_dir).validate()
