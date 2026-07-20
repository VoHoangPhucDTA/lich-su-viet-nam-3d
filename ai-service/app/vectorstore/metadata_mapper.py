"""Deterministic flattening of corpus metadata for Chroma records."""

from app.corpus.models import CorpusChunk
from app.embedding.models import EmbeddingRecord


def map_chroma_metadata(
    chunk: CorpusChunk, embedding: EmbeddingRecord
) -> dict[str, str | int | float | bool]:
    metadata: dict[str, str | int | float | bool] = {
        "documentId": chunk.documentId,
        "grade": chunk.grade,
        "lessonNumber": chunk.lessonNumber,
        "lessonTitle": chunk.lessonTitle,
        "sectionTitle": chunk.sectionTitle,
        "sectionPath": " > ".join(chunk.sectionPath),
        "contentTypes": "|".join(sorted(chunk.contentTypes)),
        "containsPendingReview": chunk.containsPendingReview,
        "chunkHash": chunk.chunkHash,
        "chunkingVersion": chunk.chunkingVersion,
        "embeddingModel": embedding.embeddingModel,
        "embeddingDimension": embedding.dimension,
        "formatterVersion": embedding.formatterVersion,
    }
    if chunk.pageStart is not None:
        metadata["pageStart"] = chunk.pageStart
    if chunk.pageEnd is not None:
        metadata["pageEnd"] = chunk.pageEnd
    return metadata
