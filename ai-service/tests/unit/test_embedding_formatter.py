from app.corpus.models import CorpusChunk
import pytest

from app.embedding.formatter import (
    FORMATTER_VERSION,
    RetrievalFormatter,
    format_retrieval_document,
)
from app.embedding.gemini import MAX_EMBEDDING_INPUT_CHARS


def test_document_formatter_uses_metadata_without_repeating_embedding_title(
    corpus_record: dict[str, object],
) -> None:
    chunk = CorpusChunk.model_validate(corpus_record)

    result = RetrievalFormatter().format_document(chunk)

    assert FORMATTER_VERSION == "gemini-retrieval-document-v1"
    assert result.startswith(
        "title: Lịch sử lớp 10 — Bài học mẫu — Mục 1 | text: "
    )
    assert result.count("Lịch sử lớp 10 — Bài học mẫu") == 1
    assert result.endswith("Nội dung.")


def test_query_formatter_uses_asymmetric_search_prefix() -> None:
    assert RetrievalFormatter().format_query("  Cách mạng   tháng Tám ") == (
        "task: search result | query: Cách mạng tháng Tám"
    )


def test_document_formatter_rejects_empty_text_and_non_string_values() -> None:
    with pytest.raises(ValueError, match="must not be blank"):
        format_retrieval_document("Tiêu đề", "  ")
    with pytest.raises(TypeError, match="must be a string"):
        format_retrieval_document("Tiêu đề", {"text": "not allowed"})
    with pytest.raises(TypeError, match="string or None"):
        format_retrieval_document(["not allowed"], "Nội dung")


def test_empty_or_nullable_title_uses_explicit_none_not_python_none() -> None:
    assert format_retrieval_document("", "Nội dung") == (
        "title: none | text: Nội dung"
    )
    result = format_retrieval_document(None, "Nội dung")
    assert result == "title: none | text: Nội dung"
    assert "None" not in result


def test_nullable_section_is_omitted_without_stringifying_none(
    corpus_record: dict[str, object],
) -> None:
    values = dict(corpus_record)
    values["sectionTitle"] = None
    chunk = CorpusChunk.model_construct(**values)

    result = RetrievalFormatter().format_document(chunk)

    assert result.startswith("title: Lịch sử lớp 10 — Bài học mẫu | text: ")
    assert "None" not in result


def test_document_formatter_preserves_unicode_and_markdown_tables() -> None:
    text = "| Mốc | Sự kiện |\n|---|---|\n| 1945 | Độc lập 🇻🇳 |"
    result = format_retrieval_document("Cách mạng tháng Tám", text)
    assert "Độc lập 🇻🇳" in result
    assert "|---|---|" in result


def test_document_formatter_enforces_controllable_length_guard() -> None:
    with pytest.raises(ValueError, match="character guard"):
        format_retrieval_document("T", "x" * MAX_EMBEDDING_INPUT_CHARS)
