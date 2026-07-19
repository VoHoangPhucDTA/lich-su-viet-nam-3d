"""Deterministic, network-free embedding provider for tests only."""

import hashlib

from app.embedding.base import validate_vectors


class FakeEmbeddingProvider:
    def __init__(self, dimension: int = 8) -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        self.dimension = dimension
        self.document_calls: list[list[str]] = []

    def _embed(self, text: str) -> list[float]:
        values: list[float] = []
        counter = 0
        while len(values) < self.dimension:
            digest = hashlib.sha256(f"{counter}:{text}".encode("utf-8")).digest()
            values.extend((byte / 127.5) - 1.0 for byte in digest)
            counter += 1
        return values[: self.dimension]

    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        self.document_calls.append(list(documents))
        return validate_vectors(
            [self._embed(document) for document in documents],
            len(documents),
            self.dimension,
        )

    def embed_query(self, query: str) -> list[float]:
        return self._embed(query)

    def close(self) -> None:
        return None
