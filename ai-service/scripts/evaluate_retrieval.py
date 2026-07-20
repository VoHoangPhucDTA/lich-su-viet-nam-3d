"""Evaluate production retrieval with cached query embeddings."""

import json
import os
import sys
import time
from pathlib import Path

from app.config import SERVICE_ROOT, get_settings
from app.embedding.base import validate_vectors
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import QUERY_FORMATTER_VERSION
from app.retrieval.evaluation import (
    EvaluationCache,
    build_evaluation_report,
    load_benchmark,
    render_markdown,
)
from app.retrieval.filters import candidate_matches_filters
from app.retrieval.models import (
    EvaluationQueryResult,
    RawChromaCandidate,
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


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    settings = get_settings()
    artifact_dir = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    manifest = json.loads(
        (artifact_dir / "embedding_manifest.json").read_text(encoding="utf-8")
    )
    benchmark = load_benchmark(BENCHMARK_PATH, settings.sgk_chunks_path)
    cache = EvaluationCache(CACHE_ROOT)
    service = create_retrieval_service(settings)
    results: list[EvaluationQueryResult] = []
    cache_hits = 0
    cache_misses = 0
    try:
        for record in benchmark:
            started = time.monotonic()
            try:
                cache_key = cache.identity(
                    record.query,
                    settings.gemini_embedding_model,
                    settings.gemini_embedding_dimension,
                    QUERY_FORMATTER_VERSION,
                )
                vector = cache.get(cache_key, settings.gemini_embedding_dimension)
                if vector is None:
                    cache_misses += 1
                    vector = service.provider.embed_query(record.query)
                    vector = validate_vectors(
                        [vector], 1, settings.gemini_embedding_dimension
                    )[0]
                    cache.set(cache_key, vector, settings.gemini_embedding_dimension)
                else:
                    cache_hits += 1
                request = RetrievalRequest(
                    query=record.query,
                    grade=record.filters.grade,
                    lessonNumber=record.filters.lesson_number,
                    documentId=record.filters.document_id,
                    topK=5,
                )
                response = service.retrieve(request, query_vector=vector)
                filters = request.filters()
                compliant = all(
                    candidate_matches_filters(
                        RawChromaCandidate(
                            chunk_id=item.chunk_id,
                            document_id=item.document_id,
                            grade=item.grade,
                            lesson_number=item.lesson_number,
                            lesson_title=item.lesson_title,
                            section_title=item.section_title,
                            section_path=item.section_path,
                            page_start=item.page_start,
                            page_end=item.page_end,
                            content_types=item.content_types,
                            text=item.text,
                            distance=item.distance,
                            chunk_hash=item.chunk_hash,
                        ),
                        filters,
                    )
                    for item in response.results
                )
                chunk_ids = [item.chunk_id for item in response.results]
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
                        filterCompliant=compliant,
                        pendingReviewLeakage=False,
                        duplicateResults=len(chunk_ids) != len(set(chunk_ids)),
                        latencyMs=(time.monotonic() - started) * 1000,
                    )
                )
            except Exception as exc:
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
                        latencyMs=(time.monotonic() - started) * 1000,
                        error=type(exc).__name__,
                    )
                )
    finally:
        service.close()

    report = build_evaluation_report(
        benchmark,
        results,
        configuration={
            "model": settings.gemini_embedding_model,
            "dimension": settings.gemini_embedding_dimension,
            "queryFormatterVersion": QUERY_FORMATTER_VERSION,
            "topK": 5,
            "candidateMultiplier": settings.rag_candidate_multiplier,
            "maxChunksPerDocument": settings.rag_max_chunks_per_document,
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
        json.dumps(report.model_dump(by_alias=True), ensure_ascii=False, indent=2)
        + "\n",
    )
    _atomic_write(REPORT_ROOT / "retrieval-evaluation.md", render_markdown(report))
    print(
        json.dumps(
            {
                "status": report.status,
                "queryCount": report.query_count,
                "completedQueries": report.completed_queries,
                "failedQueries": report.failed_queries,
                "cacheHits": cache_hits,
                "cacheMisses": cache_misses,
                "metrics": report.metrics,
                "reportDirectory": str(REPORT_ROOT),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if report.failed_queries else 0


if __name__ == "__main__":
    raise SystemExit(main())
