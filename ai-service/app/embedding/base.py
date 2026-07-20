"""Embedding provider abstraction and provider-independent validation."""

import math
from typing import Protocol

from app.embedding.models import EmbeddingResponseError


class EmbeddingProvider(Protocol):
    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        """Return one embedding per document in input order."""

    def embed_query(self, query: str) -> list[float]:
        """Return one embedding for a formatted retrieval query."""

    def close(self) -> None:
        """Release provider resources, if any."""


def validate_vectors(
    vectors: list[list[float]], expected_count: int, dimension: int
) -> list[list[float]]:
    if len(vectors) != expected_count:
        raise EmbeddingResponseError(
            f"Expected {expected_count} embeddings, received {len(vectors)}"
        )
    for index, vector in enumerate(vectors):
        if not vector:
            raise EmbeddingResponseError(f"Embedding {index} is empty")
        if len(vector) != dimension:
            raise EmbeddingResponseError(
                f"Embedding {index} has dimension {len(vector)}, expected {dimension}"
            )
        if any(not math.isfinite(value) for value in vector):
            raise EmbeddingResponseError(
                f"Embedding {index} contains NaN or Infinity"
            )
    return vectors
