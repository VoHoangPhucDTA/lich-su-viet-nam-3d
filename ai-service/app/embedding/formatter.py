"""Deterministic asymmetric retrieval formatting for Gemini Embedding 2."""

from dataclasses import dataclass

from app.corpus.models import CorpusChunk

FORMATTER_VERSION = "gemini-retrieval-document-v1"


def _clean(value: str) -> str:
    return " ".join(value.split())


def format_retrieval_document(title: object, text: object) -> str:
    if title is not None and not isinstance(title, str):
        raise TypeError("Embedding title must be a string or None")
    if not isinstance(text, str):
        raise TypeError("Embedding text must be a string")
    clean_title = _clean(title) if isinstance(title, str) else ""
    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Embedding text must not be blank")
    result = f"title: {clean_title or 'none'} | text: {clean_text}"
    from app.embedding.gemini import validate_embedding_text

    return validate_embedding_text(result)


@dataclass(frozen=True)
class RetrievalFormatter:
    version: str = FORMATTER_VERSION

    def document_title(self, chunk: CorpusChunk) -> str:
        parts = [f"Lịch sử lớp {chunk.grade}", _clean(chunk.lessonTitle)]
        raw_section = getattr(chunk, "sectionTitle", None)
        if raw_section is not None and not isinstance(raw_section, str):
            raise TypeError("sectionTitle must be a string or None")
        section = _clean(raw_section) if raw_section else ""
        if section and section.casefold() not in parts[-1].casefold():
            parts.append(section)
        return " — ".join(parts)

    def document_content(self, chunk: CorpusChunk) -> str:
        content = chunk.embeddingText.strip()
        embedding_title = chunk.embeddingTitle.strip()
        if embedding_title and content.startswith(embedding_title):
            content = content[len(embedding_title) :].lstrip(" \r\n—:|")
        return content or chunk.text

    def format_document(self, chunk: CorpusChunk) -> str:
        return format_retrieval_document(
            self.document_title(chunk), self.document_content(chunk)
        )

    def format_query(self, query: str) -> str:
        cleaned = _clean(query)
        if not cleaned:
            raise ValueError("Query must not be blank")
        result = f"task: search result | query: {cleaned}"
        from app.embedding.gemini import validate_embedding_text

        return validate_embedding_text(result)
