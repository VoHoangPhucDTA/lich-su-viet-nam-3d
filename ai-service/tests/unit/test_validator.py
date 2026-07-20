import copy
import json
from pathlib import Path
from typing import Any

from app.corpus.validator import validate_corpus


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def test_validator_detects_duplicate_chunk_id(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "duplicate.jsonl"
    write_jsonl(path, [corpus_record, corpus_record])

    report = validate_corpus(path)

    assert report.status == "FAILED"
    assert report.duplicate_chunk_ids == ["chunk-001"]


def test_validator_classifies_pending_review(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    pending = copy.deepcopy(corpus_record)
    pending["chunkId"] = "chunk-002"
    pending["containsPendingReview"] = True
    path = tmp_path / "pending.jsonl"
    write_jsonl(path, [corpus_record, pending])

    report = validate_corpus(path)

    assert report.status == "PASSED"
    assert report.eligible_records == 1
    assert report.pending_review_records == 1


def test_validator_rejects_blank_text(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    corpus_record["text"] = "   "
    path = tmp_path / "blank.jsonl"
    write_jsonl(path, [corpus_record])

    report = validate_corpus(path)

    assert report.status == "FAILED"
    assert report.invalid_records[0].line_number == 1
    assert "text" in report.invalid_records[0].errors[0]


def test_real_corpus_is_valid_when_present() -> None:
    path = Path("data/corpus/sgk_chunks.jsonl")
    if not path.is_file():
        return

    report = validate_corpus(path)

    assert report.status == "PASSED"
    assert report.total_records > 0
    assert report.total_records == (
        report.eligible_records + report.pending_review_records
    )
