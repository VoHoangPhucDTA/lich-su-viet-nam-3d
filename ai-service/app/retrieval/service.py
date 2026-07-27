"""Orchestration for query embedding, retrieval, diversity, and context."""

import json
import time
from pathlib import Path

from app.config import Settings
from app.embedding.base import EmbeddingProvider, validate_vectors
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import QUERY_FORMATTER_VERSION
from app.embedding.gemini import GeminiEmbeddingProvider
from app.retrieval.context_builder import build_fact_context
from app.retrieval.models import (
    RawChromaCandidate,
    RetrievalEvaluationTrace,
    RetrievalMetadata,
    RetrievalNotReadyError,
    RetrievalProviderError,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
)
from app.retrieval.retriever import ChromaRetriever


def _expected_collection_metadata(settings: Settings) -> dict[str, str | int | float | bool]:
    artifact = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    manifest_path = artifact / "embedding_manifest.json"
    if not manifest_path.is_file():
        raise RetrievalNotReadyError("Embedding manifest is unavailable")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RetrievalNotReadyError("Embedding manifest is invalid") from exc
    if manifest.get("status") != "COMPLETED":
        raise RetrievalNotReadyError("Embedding artifact is incomplete")
    return {
        "corpusSha256": manifest.get("corpusSha256"),
        "embeddingModel": settings.gemini_embedding_model,
        "embeddingDimension": settings.gemini_embedding_dimension,
        "formatterVersion": manifest.get("formatterVersion"),
        "chunkingVersion": "structure-v2",
        "distanceMetric": settings.chroma_distance_metric,
        "sourceType": "sgk-kntt-history",
    }


def diversify_candidates(
    candidates: list[RawChromaCandidate], *, top_k: int, max_per_document: int
) -> list[RawChromaCandidate]:
    unique: list[RawChromaCandidate] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate.chunk_id not in seen:
            seen.add(candidate.chunk_id)
            unique.append(candidate)
    selected: list[RawChromaCandidate] = []
    per_document: dict[str, int] = {}
    deferred: list[RawChromaCandidate] = []
    for candidate in unique:
        if per_document.get(candidate.document_id, 0) < max_per_document:
            selected.append(candidate)
            per_document[candidate.document_id] = (
                per_document.get(candidate.document_id, 0) + 1
            )
        else:
            deferred.append(candidate)
        if len(selected) == top_k:
            return selected
    for candidate in deferred:
        selected.append(candidate)
        if len(selected) == top_k:
            break
    return selected


class RetrievalService:
    def __init__(
        self,
        *,
        settings: Settings,
        provider: EmbeddingProvider,
        retriever: ChromaRetriever,
    ) -> None:
        self.settings = settings
        self.provider = provider
        self.retriever = retriever
        self.collection_metadata = _expected_collection_metadata(settings)

    def retrieve(
        self,
        request: RetrievalRequest,
        *,
        query_vector: list[float] | None = None,
        evaluation_trace: RetrievalEvaluationTrace | None = None,
    ) -> RetrievalResponse:
        if evaluation_trace is not None:
            evaluation_trace.reset()
        if len(request.query) > self.settings.rag_query_max_length:
            raise ValueError(
                f"query exceeds maximum length {self.settings.rag_query_max_length}"
            )
        top_k = request.top_k or self.settings.rag_default_top_k
        if top_k > self.settings.rag_max_top_k:
            raise ValueError(f"topK must be <= {self.settings.rag_max_top_k}")
        started = time.monotonic()
        if query_vector is None:
            embedding_started = time.perf_counter()
            try:
                query_vector = self.provider.embed_query(request.query)
            except Exception as exc:
                raise RetrievalProviderError("Query embedding failed") from exc
            finally:
                if evaluation_trace is not None:
                    evaluation_trace.query_embedding_latency_ms = (
                        time.perf_counter() - embedding_started
                    ) * 1000
        try:
            vector = validate_vectors(
                [query_vector], 1, self.settings.gemini_embedding_dimension
            )[0]
            if evaluation_trace is not None:
                evaluation_trace.embedding_contract_matched = True
        except Exception:
            if evaluation_trace is not None:
                evaluation_trace.embedding_contract_matched = False
            raise
        candidate_count = min(
            self.settings.rag_max_candidates,
            max(top_k, top_k * self.settings.rag_candidate_multiplier),
        )
        if evaluation_trace is None:
            candidates = self.retriever.retrieve(
                vector,
                request.filters(),
                candidate_count,
            )
        else:
            candidates = self.retriever.retrieve(
                vector,
                request.filters(),
                candidate_count,
                evaluation_trace=evaluation_trace,
            )
        post_processing_started = time.perf_counter()
        selected = diversify_candidates(
            candidates,
            top_k=top_k,
            max_per_document=self.settings.rag_max_chunks_per_document,
        )
        results = [
            RetrievalResult(rank=index, **candidate.model_dump())
            for index, candidate in enumerate(selected, start=1)
        ]
        fact_context = build_fact_context(
            results,
            max_chars=self.settings.rag_context_max_chars,
            max_chunks=self.settings.rag_context_max_chunks,
        )
        if evaluation_trace is not None:
            evaluation_trace.post_processing_latency_ms = (
                time.perf_counter() - post_processing_started
            ) * 1000
        if time.monotonic() - started > self.settings.rag_retrieval_timeout_seconds:
            raise RetrievalProviderError("Retrieval exceeded configured timeout")
        return RetrievalResponse(
            query=request.query,
            filters=request.filters(),
            topK=top_k,
            candidateCount=candidate_count,
            resultCount=len(results),
            results=results,
            factContext=fact_context,
            metadata=RetrievalMetadata(
                embeddingModel=self.settings.gemini_embedding_model,
                embeddingDimension=self.settings.gemini_embedding_dimension,
                corpusSha256=str(self.collection_metadata["corpusSha256"]),
                queryFormatterVersion=QUERY_FORMATTER_VERSION,
                collectionName=self.settings.chroma_collection_name,
                distanceMetric=self.settings.chroma_distance_metric,
            ),
        )

    def close(self) -> None:
        self.provider.close()


def create_retrieval_service(settings: Settings) -> RetrievalService:
    provider = GeminiEmbeddingProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_embedding_model,
        dimension=settings.gemini_embedding_dimension,
        max_retries=settings.gemini_embedding_max_retries,
        retry_min_seconds=settings.gemini_embedding_retry_min_seconds,
        retry_max_seconds=settings.gemini_embedding_retry_max_seconds,
    )
    retriever = ChromaRetriever(
        persist_dir=settings.chroma_persist_dir,
        collection_name=settings.chroma_collection_name,
        expected_metadata=_expected_collection_metadata(settings),
        distance_metric=settings.chroma_distance_metric,
    )
    return RetrievalService(settings=settings, provider=provider, retriever=retriever)
