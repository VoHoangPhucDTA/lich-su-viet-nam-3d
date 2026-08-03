"""Lazy helpers for Chroma persistent clients and compatible collections."""

from pathlib import Path
from typing import Any

import chromadb

from app.vectorstore.models import CollectionCompatibilityError


def create_persistent_client(path: Path) -> Any:
    path.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(path))


def close_persistent_client(client: Any) -> None:
    # Chroma 1.5.9 has no public close method for PersistentClient. Stopping its
    # system releases SQLite handles. Process-global Chroma cache reset is
    # intentionally excluded: application instances must not invalidate peers.
    system = getattr(client, "_system", None)
    if system is not None and hasattr(system, "stop"):
        system.stop()


def collection_exists(client: Any, name: str) -> bool:
    return any(collection.name == name for collection in client.list_collections())


def validate_collection_contract(
    collection: Any,
    expected_metadata: dict[str, str | int | float | bool],
    distance_metric: str,
) -> None:
    actual = collection.metadata or {}
    mismatches = {
        key: (actual.get(key), value)
        for key, value in expected_metadata.items()
        if actual.get(key) != value
    }
    actual_space = (collection.configuration or {}).get("hnsw", {}).get("space")
    if actual_space != distance_metric:
        mismatches["configuration.hnsw.space"] = (
            actual_space,
            distance_metric,
        )
    if mismatches:
        raise CollectionCompatibilityError(
            f"Collection metadata/configuration mismatch: {mismatches}. "
            "Use a new collection name or explicitly pass --recreate."
        )


def create_collection(
    client: Any,
    *,
    name: str,
    metadata: dict[str, str | int | float | bool],
    distance_metric: str,
) -> Any:
    return client.create_collection(
        name=name,
        metadata=metadata,
        configuration={"hnsw": {"space": distance_metric}},
        embedding_function=None,
    )


def get_collection(client: Any, name: str) -> Any:
    # Chroma >=1.1.13 persists the collection's explicit None embedding
    # function; reopening without an argument restores that contract.
    return client.get_collection(name=name)
