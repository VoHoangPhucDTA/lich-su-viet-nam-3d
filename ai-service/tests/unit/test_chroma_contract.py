from typing import Any

import pytest

from app.vectorstore.chroma_client import validate_collection_contract
from app.vectorstore.index_service import partition_batches
from app.vectorstore.models import CollectionCompatibilityError


class FakeCollection:
    def __init__(self, metadata: dict[str, Any], space: str = "cosine") -> None:
        self.metadata = metadata
        self.configuration = {"hnsw": {"space": space}}


def test_collection_metadata_mismatch_is_rejected() -> None:
    expected = {"embeddingModel": "gemini-embedding-2", "dimension": 768}
    collection = FakeCollection(
        {"embeddingModel": "another-model", "dimension": 768}
    )

    with pytest.raises(CollectionCompatibilityError, match="mismatch"):
        validate_collection_contract(collection, expected, "cosine")


def test_collection_distance_metric_mismatch_is_rejected() -> None:
    expected = {"embeddingModel": "gemini-embedding-2"}
    collection = FakeCollection(expected, space="l2")

    with pytest.raises(CollectionCompatibilityError, match="hnsw.space"):
        validate_collection_contract(collection, expected, "cosine")


def test_batch_partition_preserves_order() -> None:
    assert partition_batches(list(range(7)), 3) == [[0, 1, 2], [3, 4, 5], [6]]
