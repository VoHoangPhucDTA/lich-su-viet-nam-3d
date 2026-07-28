"""Legacy Goal 14B retrieval evaluation (retrieval-evaluation-v2 contract)."""

import json
import os
import sys
import time
from pathlib import Path

from app.config import SERVICE_ROOT, get_settings
from app.corpus.loader import iter_corpus
from app.embedding.base import validate_vectors
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import QUERY_FORMATTER_VERSION
from app.retrieval.evaluation import (
    EvaluationCache,
    build_evaluation_report,
    classify_retrieval_cache_mode,
    load_benchmark,
    render_markdown,
)
from app.retrieval.models import (
    EvaluationQueryResult,
    FilterMode,
    RetrievalEvaluationTrace,
    RetrievalFilters,
    RetrievalRequest,
)
from app.retrieval.service import create_retrieval_service

BENCHMARK_PATH = SERVICE_ROOT / "data" / "evaluation" / "retrieval_benchmark.jsonl"
CACHE_ROOT = SERVICE_ROOT / "storage" / "evaluation-cache"
REPORT_ROOT = SERVICE_ROOT / "storage" / "evaluation-reports"


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def _filters_for_mode(record, mode: FilterMode) -> RetrievalFilters:
    if mode == "GRADE_AND_LESSON":
        return RetrievalFilters(grade=record.grade, lessonNumber=record.lesson_number)
    if mode == "GRADE_ONLY":
        return RetrievalFilters(grade=record.grade)
    return RetrievalFilters()


def _eligible_pool_sizes(chunks, filters: RetrievalFilters) -> tuple[int, int]:
    eligible = [chunk for chunk in chunks if chunk.ragEligible and not chunk.containsPendingReview]
    filtered = [
        chunk
        for chunk in eligible
        if (filters.grade is None or chunk.grade == filters.grade)
        and (filters.lesson_number is None or chunk.lessonNumber == filters.lesson_number)
        and (filters.document_id is None or chunk.documentId == filters.document_id)
    ]
    return len(eligible), len(filtered)


def _filter_compliant(response, filters: RetrievalFilters) -> bool:
    return all(
        (filters.grade is None or result.grade == filters.grade)
        and (filters.lesson_number is None or result.lesson_number == filters.lesson_number)
        and (filters.document_id is None or result.document_id == filters.document_id)
        for result in response.results
    )


def _evaluation_mode(cache_hits: int, cache_misses: int) -> str:
    cache_mode = classify_retrieval_cache_mode(cache_hits, cache_misses)
    return {
        "CACHE_REPLAY": "OFFLINE_CACHE_REPLAY",
        "LIVE": "LIVE_CACHE_FILL",
        "MIXED": "MIXED",
        "UNKNOWN": "SYNTHETIC_TEST_DATA",
    }[cache_mode]


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    settings = get_settings()
    artifact_dir = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    manifest = json.loads((artifact_dir / "embedding_manifest.json").read_text(encoding="utf-8"))
    benchmark = load_benchmark(BENCHMARK_PATH, settings.sgk_chunks_path)
    corpus_chunks = list(iter_corpus(settings.sgk_chunks_path))
    cache = EvaluationCache(CACHE_ROOT)
    service = create_retrieval_service(settings)
    results: list[EvaluationQueryResult] = []
    cache_hits = 0
    cache_misses = 0
    try:
        for record in benchmark:
            cache_started = time.perf_counter()
            cache_key = cache.identity(
                record.query,
                settings.gemini_embedding_model,
                settings.gemini_embedding_dimension,
                QUERY_FORMATTER_VERSION,
            )
            vector = cache.get(cache_key, settings.gemini_embedding_dimension)
            cache_lookup_latency_ms = (time.perf_counter() - cache_started) * 1000
            query_embedding_latency_ms: float | None = None
            if vector is None:
                cache_misses += 1
                embedding_started = time.perf_counter()
                try:
                    vector = service.provider.embed_query(record.query)
                    query_embedding_latency_ms = (time.perf_counter() - embedding_started) * 1000
                    vector = validate_vectors([vector], 1, settings.gemini_embedding_dimension)[0]
                    cache.set(cache_key, vector, settings.gemini_embedding_dimension)
                except Exception as exc:
                    query_embedding_latency_ms = (time.perf_counter() - embedding_started) * 1000
                    for mode in ("GRADE_AND_LESSON", "FILTER_OFF"):
                        typed_mode: FilterMode = mode
                        filters = _filters_for_mode(record, typed_mode)
                        eligible_pool, filtered_pool = _eligible_pool_sizes(corpus_chunks, filters)
                        results.append(
                            EvaluationQueryResult(
                                queryId=record.query_id,
                                grade=record.grade,
                                category=record.category,
                                expectedChunkIds=record.expected_chunk_ids,
                                expectedDocumentIds=record.expected_document_ids,
                                resultChunkIds=[],
                                resultDocumentIds=[],
                                resultLessons=[],
                                resultSections=[],
                                distances=[],
                                filterCompliant=False,
                                pendingReviewLeakage=False,
                                duplicateResults=False,
                                latencyMs=cache_lookup_latency_ms + query_embedding_latency_ms,
                                filterMode=typed_mode,
                                requestedTopK=5,
                                returnedResultCount=0,
                                effectiveK=0,
                                eligiblePoolSizeBeforeTopK=eligible_pool,
                                effectivePoolSizeAfterFilters=filtered_pool,
                                cacheLookupLatencyMs=cache_lookup_latency_ms,
                                queryEmbeddingLatencyMs=query_embedding_latency_ms,
                                error=type(exc).__name__,
                            )
                        )
                    continue
            else:
                cache_hits += 1
            for mode in ("GRADE_AND_LESSON", "FILTER_OFF"):
                typed_mode: FilterMode = mode
                filters = _filters_for_mode(record, typed_mode)
                eligible_pool, filtered_pool = _eligible_pool_sizes(corpus_chunks, filters)
                trace = RetrievalEvaluationTrace()
                started = time.perf_counter()
                try:
                    request = RetrievalRequest(
                        query=record.query,
                        grade=filters.grade,
                        lessonNumber=filters.lesson_number,
                        documentId=filters.document_id,
                        topK=5,
                    )
                    response = service.retrieve(request, query_vector=vector, evaluation_trace=trace)
                    chunk_ids = [item.chunk_id for item in response.results]
                    retrieval_latency_ms = (time.perf_counter() - started) * 1000
                    results.append(
                        EvaluationQueryResult(
                            queryId=record.query_id,
                            grade=record.grade,
                            category=record.category,
                            expectedChunkIds=record.expected_chunk_ids,
                            expectedDocumentIds=record.expected_document_ids,
                            resultChunkIds=chunk_ids,
                            resultDocumentIds=[item.document_id for item in response.results],
                            resultLessons=[item.lesson_number for item in response.results],
                            resultSections=[item.section_title for item in response.results],
                            distances=[item.distance for item in response.results],
                            filterCompliant=_filter_compliant(response, filters),
                            pendingReviewLeakage=bool(trace.pending_review_candidate_ids),
                            duplicateResults=len(chunk_ids) != len(set(chunk_ids)),
                            latencyMs=cache_lookup_latency_ms
                            + (query_embedding_latency_ms or 0.0)
                            + retrieval_latency_ms,
                            filterMode=typed_mode,
                            requestedTopK=5,
                            returnedResultCount=len(chunk_ids),
                            effectiveK=min(5, len(chunk_ids)),
                            eligiblePoolSizeBeforeTopK=eligible_pool,
                            effectivePoolSizeAfterFilters=filtered_pool,
                            cacheLookupLatencyMs=cache_lookup_latency_ms,
                            queryEmbeddingLatencyMs=query_embedding_latency_ms,
                            chromaQueryLatencyMs=trace.chroma_query_latency_ms,
                            postProcessingLatencyMs=trace.post_processing_latency_ms,
                            embeddingContractMatched=trace.embedding_contract_matched,
                            collectionMetadataMatched=trace.collection_metadata_matched,
                            collectionDistanceMetricMatched=trace.collection_distance_metric_matched,
                        )
                    )
                except Exception as exc:
                    retrieval_latency_ms = (time.perf_counter() - started) * 1000
                    results.append(
                        EvaluationQueryResult(
                            queryId=record.query_id,
                            grade=record.grade,
                            category=record.category,
                            expectedChunkIds=record.expected_chunk_ids,
                            expectedDocumentIds=record.expected_document_ids,
                            resultChunkIds=[],
                            resultDocumentIds=[],
                            resultLessons=[],
                            resultSections=[],
                            distances=[],
                            filterCompliant=False,
                            pendingReviewLeakage=bool(trace.pending_review_candidate_ids),
                            duplicateResults=False,
                            latencyMs=cache_lookup_latency_ms
                            + (query_embedding_latency_ms or 0.0)
                            + retrieval_latency_ms,
                            filterMode=typed_mode,
                            requestedTopK=5,
                            returnedResultCount=0,
                            effectiveK=0,
                            eligiblePoolSizeBeforeTopK=eligible_pool,
                            effectivePoolSizeAfterFilters=filtered_pool,
                            cacheLookupLatencyMs=cache_lookup_latency_ms,
                            queryEmbeddingLatencyMs=query_embedding_latency_ms,
                            chromaQueryLatencyMs=trace.chroma_query_latency_ms,
                            postProcessingLatencyMs=trace.post_processing_latency_ms,
                            embeddingContractMatched=trace.embedding_contract_matched,
                            collectionMetadataMatched=trace.collection_metadata_matched,
                            collectionDistanceMetricMatched=trace.collection_distance_metric_matched,
                            error=type(exc).__name__,
                        )
                    )
    finally:
        service.close()
    report = build_evaluation_report(
        benchmark,
        results,
        cache_hits=cache_hits,
        cache_misses=cache_misses,
        evaluation_mode=_evaluation_mode(cache_hits, cache_misses),
        configuration={
            "model": settings.gemini_embedding_model,
            "dimension": settings.gemini_embedding_dimension,
            "queryFormatterVersion": QUERY_FORMATTER_VERSION,
            "topK": 5,
            "candidateMultiplier": settings.rag_candidate_multiplier,
            "maxChunksPerDocument": settings.rag_max_chunks_per_document,
            "filterModes": ["GRADE_AND_LESSON", "FILTER_OFF"],
        },
        corpus_identity={
            "corpusSha256": manifest.get("corpusSha256"),
            "embeddingModel": settings.gemini_embedding_model,
            "embeddingDimension": settings.gemini_embedding_dimension,
            "documentFormatterVersion": manifest.get("formatterVersion"),
            "queryFormatterVersion": QUERY_FORMATTER_VERSION,
            "collection": settings.chroma_collection_name,
            "distanceMetric": settings.chroma_distance_metric,
            "eligibleRecords": manifest.get("eligibleRecords"),
            "embeddingStatus": manifest.get("status"),
        },
    )
    _atomic_write(
        REPORT_ROOT / "retrieval-evaluation.json",
        json.dumps(report.model_dump(by_alias=True), ensure_ascii=False, indent=2) + "\n",
    )
    _atomic_write(REPORT_ROOT / "retrieval-evaluation.md", render_markdown(report))
    print(
        json.dumps(
            {
                "status": report.status,
                "queryCount": report.query_count,
                "completedQueries": report.completed_queries,
                "failedQueries": report.failed_queries,
                "cacheHits": report.cache_hits,
                "cacheMisses": report.cache_misses,
                "cacheMode": report.cache_mode,
                "evaluationMode": report.evaluation_mode,
                "strata": list(report.strata),
                "reportDirectory": str(REPORT_ROOT),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if report.failed_queries else 0


if __name__ == "__main__":
    raise SystemExit(main())
