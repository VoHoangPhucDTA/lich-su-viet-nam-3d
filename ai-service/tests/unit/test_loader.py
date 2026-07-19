import json
from pathlib import Path
from typing import Any

import pytest

from app.core.exceptions import CorpusJsonDecodeError
from app.corpus.loader import iter_corpus


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def test_loader_reads_utf8_jsonl(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "fixture.jsonl"
    write_jsonl(path, [corpus_record])

    chunks = list(iter_corpus(path))

    assert len(chunks) == 1
    assert chunks[0].lessonTitle == "Bài học mẫu"
    assert chunks[0].text == corpus_record["text"]


def test_loader_reports_invalid_json_line(
    tmp_path: Path, corpus_record: dict[str, Any]
) -> None:
    path = tmp_path / "malformed.jsonl"
    path.write_text(
        json.dumps(corpus_record, ensure_ascii=False) + "\n" + "{not-json}\n",
        encoding="utf-8",
    )

    with pytest.raises(CorpusJsonDecodeError, match="Corpus line 2") as exc_info:
        list(iter_corpus(path))

    assert exc_info.value.line_number == 2
