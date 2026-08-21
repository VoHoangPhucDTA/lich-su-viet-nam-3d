import copy
import json
from pathlib import Path
from typing import Any

from app.corpus.identity import canonical_jsonl_sha256
from app.embedding.models import EmbeddingManifest, EmbeddingRecord


def make_corpus_records(
    base: dict[str, Any], count: int
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index in range(count):
        record = copy.deepcopy(base)
        record["chunkId"] = f"chunk-{index:03d}"
        record["documentId"] = f"document-{index:03d}"
        record["chunkHash"] = f"{index + 1:064x}"
        records.append(record)
    return records


def write_corpus(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def write_valid_artifact(
    artifact_dir: Path,
    corpus_path: Path,
    corpus_records: list[dict[str, Any]],
    *,
    model: str = "test-embedding-model",
    dimension: int = 3,
    formatter_version: str = "test-formatter-v1",
) -> list[EmbeddingRecord]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    eligible = [
        record for record in corpus_records if not record["containsPendingReview"]
    ]
    embedding_records = [
        EmbeddingRecord(
            chunkId=record["chunkId"],
            chunkHash=record["chunkHash"],
            documentId=record["documentId"],
            embeddingModel=model,
            dimension=dimension,
            formatterVersion=formatter_version,
            vector=[float(index + 1)] * dimension,
        )
        for index, record in enumerate(eligible)
    ]
    (artifact_dir / "embedding_records.jsonl").write_text(
        "".join(record.model_dump_json() + "\n" for record in embedding_records),
        encoding="utf-8",
    )
    manifest = EmbeddingManifest(
        corpusSha256=canonical_jsonl_sha256(corpus_path),
        embeddingModel=model,
        dimension=dimension,
        formatterVersion=formatter_version,
        totalCorpusRecords=len(corpus_records),
        eligibleRecords=len(eligible),
        pendingReviewSkipped=len(corpus_records) - len(eligible),
        selectedRecords=len(eligible),
        newlyEmbedded=len(eligible),
        successfulRecords=len(eligible),
        attemptedRecords=len(eligible),
        unattemptedRecords=0,
        remainingRecords=0,
        unresolvedFailedRecords=0,
        failedRecords=0,
        status="COMPLETED",
    )
    (artifact_dir / "embedding_manifest.json").write_text(
        json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "embedding_failures.jsonl").write_text("", encoding="utf-8")
    return embedding_records
