from typing import Any

from app.corpus.models import CorpusChunk
from app.embedding.models import EmbeddingRecord
from app.vectorstore.metadata_mapper import map_chroma_metadata


def make_embedding(chunk: CorpusChunk) -> EmbeddingRecord:
    return EmbeddingRecord(
        chunkId=chunk.chunkId,
        chunkHash=chunk.chunkHash,
        documentId=chunk.documentId,
        embeddingModel="gemini-embedding-2",
        dimension=768,
        formatterVersion="gemini-retrieval-document-v1",
        vector=[0.0] * 768,
    )


def test_metadata_flattening_is_deterministic(
    corpus_record: dict[str, Any],
) -> None:
    corpus_record["sectionPath"] = ["Phần 1", "Mục 2"]
    corpus_record["contentTypes"] = ["table", "knowledge"]
    chunk = CorpusChunk.model_validate(corpus_record)

    first = map_chroma_metadata(chunk, make_embedding(chunk))
    second = map_chroma_metadata(chunk, make_embedding(chunk))

    assert first == second
    assert first["sectionPath"] == "Phần 1 > Mục 2"
    assert first["contentTypes"] == "knowledge|table"
    assert all(not isinstance(value, (list, dict)) for value in first.values())


def test_nullable_pages_are_omitted(corpus_record: dict[str, Any]) -> None:
    corpus_record["pageStart"] = None
    corpus_record["pageEnd"] = None
    chunk = CorpusChunk.model_validate(corpus_record)

    metadata = map_chroma_metadata(chunk, make_embedding(chunk))

    assert "pageStart" not in metadata
    assert "pageEnd" not in metadata
