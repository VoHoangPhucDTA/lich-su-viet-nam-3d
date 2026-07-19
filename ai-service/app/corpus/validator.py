"""Validation and eligibility classification for canonical corpus records."""

import json
from pathlib import Path
from typing import Any

from app.core.exceptions import CorpusFileNotFoundError, CorpusSchemaError
from app.corpus.loader import parse_corpus_record
from app.schemas.corpus import CorpusValidationReport, InvalidRecord


def _format_schema_errors(exc: Exception) -> list[str]:
    message = str(exc)
    return [message.split(": ", maxsplit=1)[-1]]


def validate_corpus(path: Path) -> CorpusValidationReport:
    if not path.is_file():
        raise CorpusFileNotFoundError(path)

    report = CorpusValidationReport()
    seen_chunk_ids: set[str] = set()
    duplicate_chunk_ids: set[str] = set()

    with path.open("r", encoding="utf-8") as corpus_file:
        for line_number, line in enumerate(corpus_file, start=1):
            report.total_records += 1
            try:
                value: Any = json.loads(line)
            except json.JSONDecodeError as exc:
                report.invalid_records.append(
                    InvalidRecord(line_number=line_number, errors=[f"invalid JSON: {exc}"])
                )
                continue

            if not isinstance(value, dict):
                report.invalid_records.append(
                    InvalidRecord(
                        line_number=line_number,
                        errors=["record must be a JSON object"],
                    )
                )
                continue

            try:
                chunk = parse_corpus_record(line_number, value)
            except CorpusSchemaError as exc:
                report.invalid_records.append(
                    InvalidRecord(
                        line_number=line_number,
                        errors=_format_schema_errors(exc),
                    )
                )
                continue

            if chunk.chunkId in seen_chunk_ids:
                duplicate_chunk_ids.add(chunk.chunkId)
            seen_chunk_ids.add(chunk.chunkId)

            if chunk.containsPendingReview:
                report.pending_review_records += 1
            else:
                report.eligible_records += 1

    report.duplicate_chunk_ids = sorted(duplicate_chunk_ids)
    if report.invalid_records or report.duplicate_chunk_ids:
        report.status = "FAILED"
    return report
