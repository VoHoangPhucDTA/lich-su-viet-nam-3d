"""Read-only Chroma retrieval using precomputed query embeddings."""

import math
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.retrieval.filters import build_chroma_where, candidate_matches_filters
from app.retrieval.models import (
    RawChromaCandidate,
    RetrievalEvaluationTrace,
    RetrievalFilters,
    RetrievalNotReadyError,
)
from app.vectorstore.chroma_client import (
    close_persistent_client,
    collection_exists,
    create_persistent_client,
    get_collection,
    validate_collection_contract,
)
from app.vectorstore.models import CollectionCompatibilityError


class ChromaRetriever:
    def __init__(
        self,
        *,
        persist_dir: Path,
        collection_name: str,
        expected_metadata: dict[str, str | int | float | bool],
        distance_metric: str,
        client_factory: Callable[[Path], Any] = create_persistent_client,
    ) -> None:
        self.persist_dir = persist_dir
        self.collection_name = collection_name
        self.expected_metadata = expected_metadata
        self.distance_metric = distance_metric
        self.client_factory = client_factory

    @staticmethod
    def _parse_candidate(
        chunk_id: object,
        document: object,
        metadata: object,
        distance: object,
    ) -> RawChromaCandidate | None:
        if not isinstance(chunk_id, str) or not isinstance(document, str):
            return None
        if not isinstance(metadata, dict) or not isinstance(distance, (int, float)):
            return None
        if not math.isfinite(float(distance)):
            return None
        try:
            candidate = RawChromaCandidate(
                chunk_id=chunk_id,
                document_id=metadata.get("documentId"),
                grade=metadata.get("grade"),
                lesson_number=metadata.get("lessonNumber"),
                lesson_title=metadata.get("lessonTitle"),
                section_title=metadata.get("sectionTitle"),
                section_path=metadata.get("sectionPath", ""),
                page_start=metadata.get("pageStart"),
                page_end=metadata.get("pageEnd"),
                content_types=metadata.get("contentTypes", ""),
                text=document,
                distance=float(distance),
                chunk_hash=metadata.get("chunkHash"),
                contains_pending_review=metadata.get(
                    "containsPendingReview", False
                ),
            )
        except ValidationError:
            return None
        return candidate

    def retrieve(
        self,
        query_vector: list[float],
        filters: RetrievalFilters,
        candidate_count: int,
        evaluation_trace: RetrievalEvaluationTrace | None = None,
    ) -> list[RawChromaCandidate]:
        if not (self.persist_dir / "chroma.sqlite3").is_file():
            raise RetrievalNotReadyError("Chroma persistence is not ready")
        client = self.client_factory(self.persist_dir)
        try:
            if not collection_exists(client, self.collection_name):
                if evaluation_trace is not None:
                    evaluation_trace.collection_metadata_matched = False
                    evaluation_trace.collection_distance_metric_matched = False
                raise RetrievalNotReadyError("Retrieval collection does not exist")
            collection = get_collection(client, self.collection_name)
            if evaluation_trace is not None:
                actual_metadata = collection.metadata or {}
                evaluation_trace.collection_metadata_matched = all(
                    actual_metadata.get(key) == value
                    for key, value in self.expected_metadata.items()
                )
                actual_space = (collection.configuration or {}).get(
                    "hnsw", {}
                ).get("space")
                evaluation_trace.collection_distance_metric_matched = (
                    actual_space == self.distance_metric
                )
            try:
                validate_collection_contract(
                    collection, self.expected_metadata, self.distance_metric
                )
            except CollectionCompatibilityError as exc:
                raise RetrievalNotReadyError(
                    "Retrieval collection contract is incompatible"
                ) from exc
            where = build_chroma_where(filters)
            collection_count = collection.count()
            if collection_count == 0:
                return []
            kwargs: dict[str, Any] = {
                "query_embeddings": [query_vector],
                "n_results": min(candidate_count, collection_count),
                "include": ["documents", "metadatas", "distances"],
            }
            if where is not None:
                kwargs["where"] = where
            query_started = time.perf_counter()
            raw = collection.query(**kwargs)
            if evaluation_trace is not None:
                evaluation_trace.chroma_query_latency_ms = (
                    time.perf_counter() - query_started
                ) * 1000
        finally:
            close_persistent_client(client)

        ids = (raw.get("ids") or [[]])[0]
        documents = (raw.get("documents") or [[]])[0]
        metadatas = (raw.get("metadatas") or [[]])[0]
        distances = (raw.get("distances") or [[]])[0]
        candidates: list[RawChromaCandidate] = []
        for values in zip(ids, documents, metadatas, distances):
            candidate = self._parse_candidate(*values)
            if candidate is None:
                continue
            if evaluation_trace is not None:
                evaluation_trace.raw_candidate_chunk_ids.append(candidate.chunk_id)
            if candidate.contains_pending_review:
                if evaluation_trace is not None:
                    evaluation_trace.pending_review_candidate_ids.append(
                        candidate.chunk_id
                    )
                continue
            if candidate_matches_filters(candidate, filters):
                candidates.append(candidate)
                if evaluation_trace is not None:
                    evaluation_trace.filtered_candidate_chunk_ids.append(
                        candidate.chunk_id
                    )
        return sorted(candidates, key=lambda candidate: candidate.distance)
