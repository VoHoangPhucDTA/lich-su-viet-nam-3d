"""Orchestration for query embedding, retrieval, diversity, and context."""

import inspect
import json
import time
from collections.abc import Callable

from app.config import Settings
from app.core.deadline import OperationDeadline, OperationDeadlineExceeded
from app.embedding.base import EmbeddingProvider, validate_vectors
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import QUERY_FORMATTER_VERSION
from app.embedding.gemini import GeminiEmbeddingProvider
from app.retrieval.context_builder import build_fact_context
from app.retrieval.filters import candidate_matches_filters
from app.retrieval.models import (
    RawChromaCandidate,
    RetrievalEvaluationTrace,
    RetrievalMetadata,
    RetrievalNotReadyError,
    RetrievalProviderError,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
    RetrievalSafetyError,
)
from app.retrieval.retriever import ChromaRetriever


def _accepts_keyword(parameters: dict, name: str) -> bool:
    return name in parameters or any(
        parameter.kind == inspect.Parameter.VAR_KEYWORD
        for parameter in parameters.values()
    )


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
        collection_metadata: dict[str, str | int | float | bool] | None = None,
    ) -> None:
        self.settings = settings
        self.provider = provider
        self.retriever = retriever
        self.collection_metadata = (
            collection_metadata or _expected_collection_metadata(settings)
        )

    def retrieve(
        self,
        request: RetrievalRequest,
        *,
        query_vector: list[float] | None = None,
        evaluation_trace: RetrievalEvaluationTrace | None = None,
        deadline: OperationDeadline | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> RetrievalResponse:
        deadline = deadline or OperationDeadline(
            self.settings.ai_request_deadline_seconds
        )
        if evaluation_trace is not None:
            evaluation_trace.reset()
        if len(request.query) > self.settings.rag_query_max_length:
            raise ValueError(
                f"query exceeds maximum length {self.settings.rag_query_max_length}"
            )
        top_k = request.top_k or self.settings.rag_default_top_k
        if top_k > self.settings.rag_max_top_k:
            raise ValueError(f"topK must be <= {self.settings.rag_max_top_k}")
        started = deadline.clock()

        def checkpoint(stage: str) -> None:
            deadline.checkpoint(stage, is_cancelled)
            if deadline.clock() - started >= self.settings.rag_retrieval_timeout_seconds:
                raise OperationDeadlineExceeded(stage, "RETRIEVAL_TIMEOUT")

        checkpoint("query_embedding")
        if query_vector is None:
            embedding_started = time.perf_counter()
            try:
                method = self.provider.embed_query
                kwargs = {}
                parameters = inspect.signature(method).parameters
                if _accepts_keyword(parameters, "deadline"):
                    kwargs["deadline"] = deadline
                if _accepts_keyword(parameters, "timeout_seconds"):
                    kwargs["timeout_seconds"] = deadline.clamp_timeout(
                        min(
                            self.settings.gemini_embedding_timeout_seconds,
                            self.settings.rag_retrieval_timeout_seconds,
                        ),
                        stage="query_embedding",
                        minimum_seconds=self.settings.ai_min_provider_timeout_seconds,
                    )
                if _accepts_keyword(parameters, "is_cancelled"):
                    kwargs["is_cancelled"] = is_cancelled
                if _accepts_keyword(parameters, "minimum_timeout_seconds"):
                    kwargs["minimum_timeout_seconds"] = (
                        self.settings.ai_min_provider_timeout_seconds
                    )
                query_vector = method(request.query, **kwargs)
            except OperationDeadlineExceeded:
                raise
            except Exception as exc:
                raise RetrievalProviderError("Query embedding failed") from exc
            finally:
                if evaluation_trace is not None:
                    evaluation_trace.query_embedding_latency_ms = (
                        time.perf_counter() - embedding_started
                    ) * 1000
        checkpoint("query_embedding")
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
        checkpoint("chroma_query")
        retrieve_method = self.retriever.retrieve
        retrieve_kwargs = {}
        parameters = inspect.signature(retrieve_method).parameters
        if evaluation_trace is not None and _accepts_keyword(parameters, "evaluation_trace"):
            retrieve_kwargs["evaluation_trace"] = evaluation_trace
        if _accepts_keyword(parameters, "deadline"):
            retrieve_kwargs["deadline"] = deadline
        if _accepts_keyword(parameters, "is_cancelled"):
            retrieve_kwargs["is_cancelled"] = is_cancelled
        candidates = retrieve_method(
            vector,
            request.filters(),
            candidate_count,
            **retrieve_kwargs,
        )
        checkpoint("chroma_query")
        post_processing_started = time.perf_counter()
        selected = diversify_candidates(
            candidates,
            top_k=top_k,
            max_per_document=self.settings.rag_max_chunks_per_document,
        )
        if any(candidate.contains_pending_review for candidate in selected):
            raise RetrievalSafetyError("PENDING_REVIEW_SELECTION_VIOLATION")
        filters = request.filters()
        if any(not candidate_matches_filters(candidate, filters) for candidate in selected):
            raise RetrievalSafetyError("PRODUCTION_ELIGIBILITY_VIOLATION")
        checkpoint("retrieval_post_processing")
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
        checkpoint("retrieval_post_processing")
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
        self.retriever.close()


def create_retrieval_service(
    settings: Settings,
    *,
    client=None,
    collection=None,
    collection_metadata: dict[str, str | int | float | bool] | None = None,
) -> RetrievalService:
    provider = GeminiEmbeddingProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_embedding_model,
        dimension=settings.gemini_embedding_dimension,
        max_retries=settings.gemini_embedding_max_retries,
        retry_min_seconds=settings.gemini_embedding_retry_min_seconds,
        retry_max_seconds=settings.gemini_embedding_retry_max_seconds,
        timeout_seconds=settings.gemini_embedding_timeout_seconds,
    )
    expected_metadata = collection_metadata or _expected_collection_metadata(settings)
    retriever = ChromaRetriever(
        persist_dir=settings.chroma_persist_dir,
        collection_name=settings.chroma_collection_name,
        expected_metadata=expected_metadata,
        distance_metric=settings.chroma_distance_metric,
        client=client,
        collection=collection,
        owns_client=client is None,
    )
    return RetrievalService(
        settings=settings,
        provider=provider,
        retriever=retriever,
        collection_metadata=collection_metadata,
    )
