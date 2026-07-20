"""Streaming UTF-8 JSONL loader for the canonical SGK corpus."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.core.exceptions import (
    CorpusFileNotFoundError,
    CorpusJsonDecodeError,
    CorpusSchemaError,
)
from app.corpus.models import CorpusChunk


def iter_raw_corpus(path: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    if not path.is_file():
        raise CorpusFileNotFoundError(path)

    with path.open("r", encoding="utf-8") as corpus_file:
        for line_number, line in enumerate(corpus_file, start=1):
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise CorpusJsonDecodeError(line_number, str(exc)) from exc
            if not isinstance(value, dict):
                raise CorpusSchemaError(line_number, "record must be a JSON object")
            yield line_number, value


def parse_corpus_record(line_number: int, value: dict[str, Any]) -> CorpusChunk:
    try:
        return CorpusChunk.model_validate(value)
    except ValidationError as exc:
        messages = "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        )
        raise CorpusSchemaError(line_number, messages) from exc


def iter_corpus(path: Path) -> Iterator[CorpusChunk]:
    for line_number, value in iter_raw_corpus(path):
        yield parse_corpus_record(line_number, value)
