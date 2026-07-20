from pathlib import Path

from app.retrieval.evaluation import (
    EvaluationCache,
    build_evaluation_report,
    calculate_metrics,
)
from app.retrieval.models import (
    BenchmarkRecord,
    EvaluationQueryResult,
    RetrievalFilters,
    SourceEvidence,
)


def benchmark_record(query_id: str = "q1") -> BenchmarkRecord:
    return BenchmarkRecord(
        queryId=query_id,
        query="query",
        category="CAUSE",
        grade=12,
        lessonNumber=6,
        filters=RetrievalFilters(grade=12, lessonNumber=6),
        expectedChunkIds=["expected"],
        expectedDocumentIds=["doc-expected"],
        expectedSectionKeywords=["Nguyên nhân"],
        sourceEvidence=SourceEvidence(chunkIds=["expected"], note="evidence"),
    )


def evaluation_result(
    chunk_ids: list[str], document_ids: list[str], lessons: list[int]
) -> EvaluationQueryResult:
    return EvaluationQueryResult(
        queryId="q1",
        grade=12,
        category="CAUSE",
        expectedChunkIds=["expected"],
        expectedDocumentIds=["doc-expected"],
        resultChunkIds=chunk_ids,
        resultDocumentIds=document_ids,
        resultLessons=lessons,
        resultSections=["Nguyên nhân" for _ in chunk_ids],
        distances=[float(index) for index, _ in enumerate(chunk_ids)],
        filterCompliant=True,
        pendingReviewLeakage=False,
        duplicateResults=len(chunk_ids) != len(set(chunk_ids)),
        latencyMs=10,
    )


def test_hit_at_k_mrr_filter_and_duplicate_metrics() -> None:
    result = evaluation_result(
        ["wrong", "expected", "expected"],
        ["wrong-doc", "doc-expected", "doc-expected"],
        [5, 6, 6],
    )
    metrics = calculate_metrics([benchmark_record()], [result])
    assert metrics["strictChunkHit@1"] == 0
    assert metrics["strictChunkHit@3"] == 1
    assert metrics["documentHit@1"] == 0
    assert metrics["documentHit@3"] == 1
    assert metrics["lessonHit@1"] == 0
    assert metrics["lessonHit@3"] == 1
    assert metrics["mrr"] == 0.5
    assert metrics["filterComplianceRate"] == 1
    assert metrics["duplicateResultRate"] == 1
    assert metrics["pendingReviewLeakageRate"] == 0


def test_cache_identity_invalidates_query_model_dimension_and_formatter(
    tmp_path: Path,
) -> None:
    base = EvaluationCache.identity("query", "model", 3, "formatter")
    assert base != EvaluationCache.identity("changed", "model", 3, "formatter")
    assert base != EvaluationCache.identity("query", "other", 3, "formatter")
    assert base != EvaluationCache.identity("query", "model", 4, "formatter")
    assert base != EvaluationCache.identity("query", "model", 3, "other")
    cache = EvaluationCache(tmp_path)
    cache.set(base, [1.0, 0.0, 0.0], 3)
    assert cache.get(base, 3) == [1.0, 0.0, 0.0]
    assert cache.get(base, 4) is None
    assert "query" not in (tmp_path / f"{base}.json").read_text(encoding="utf-8")


def test_evaluation_report_has_distribution_and_no_vectors() -> None:
    report = build_evaluation_report(
        [benchmark_record()],
        [evaluation_result(["expected"], ["doc-expected"], [6])],
        configuration={"dimension": 768},
        corpus_identity={"collection": "collection"},
    )
    assert report.status == "COMPLETED"
    assert report.distribution_by_grade == {"12": 1}
    assert report.distribution_by_category == {"CAUSE": 1}
    assert "vector" not in report.model_dump_json().lower()
