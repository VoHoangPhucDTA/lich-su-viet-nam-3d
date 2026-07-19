"""Validate the canonical corpus and write a machine-readable report."""

import json
from pathlib import Path

from app.config import get_settings
from app.core.exceptions import CorpusFileNotFoundError
from app.corpus.validator import validate_corpus

REPORT_PATH = Path("data/corpus/runtime_validation_report.json")


def main() -> int:
    settings = get_settings()
    try:
        report = validate_corpus(settings.sgk_chunks_path)
    except CorpusFileNotFoundError as exc:
        print(f"Corpus validation FAILED: {exc}")
        return 2

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report.model_dump(by_alias=True), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print("SGK corpus validation")
    print(f"  Status: {report.status}")
    print(f"  Total records: {report.total_records}")
    print(f"  Eligible records: {report.eligible_records}")
    print(f"  Pending review records: {report.pending_review_records}")
    print(f"  Duplicate chunk IDs: {len(report.duplicate_chunk_ids)}")
    print(f"  Invalid records: {len(report.invalid_records)}")
    print(f"  Report: {REPORT_PATH}")
    return 0 if report.status == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
