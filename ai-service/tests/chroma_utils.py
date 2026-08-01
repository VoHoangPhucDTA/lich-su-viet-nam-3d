"""Explicit process-global Chroma reset for isolated tests only."""

from chromadb.api.client import SharedSystemClient


def reset_chroma_system_cache_for_tests() -> None:
    SharedSystemClient.clear_system_cache()
