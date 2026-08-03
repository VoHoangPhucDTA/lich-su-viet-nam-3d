import json
from pathlib import Path

import pytest

from app.retrieval.evaluation import (
    EvaluationCache,
    aggregate_effectiveness,
    build_evaluation_report,
    build_filter_strata,
    calculate_contract_checks,
    calculate_metrics,
    calculate_pool_statistics,
    calculate_precision_at_k,
    calculate_recall_at_k,
    calculate_reciprocal_rank,
    calculate_safety_invariants,
    classify_retrieval_cache_mode,
    load_benchmark,
    validate_held_out_benchmark,
)
from app.retrieval.models import (
    BenchmarkRecord,
    EvaluationQueryResult,
    RetrievalFilters,
    SourceEvidence,
)


def benchmark_record(
    query_id: str = "q1",
    *,
    query: str = "query",
    relevant: list[str] | None = None,
) -> BenchmarkRecord:
    relevant_ids = relevant or ["expected"]
    return BenchmarkRecord(
        queryId=query_id,
        query=query,
        category="CAUSE",
        grade=12,
        lessonNumber=6,
        filters=RetrievalFilters(grade=12, lessonNumber=6),
        expectedChunkIds=relevant_ids,
        expectedDocumentIds=["doc-expected"],
        expectedSectionKeywords=["Nguyên nhân"],
        sourceEvidence=SourceEvidence(
            chunkIds=relevant_ids,
            note="evidence",
        ),
    )


def evaluation_result(
    chunk_ids: list[str],
    *,
    query_id: str = "q1",
    mode: str = "GRADE_AND_LESSON",
    error: str | None = None,
    pending: bool = False,
    compliant: bool = True,
    contracts: tuple[bool | None, bool | None, bool | None] = (
        True,
        True,
        True,
    ),
) -> EvaluationQueryResult:
    return EvaluationQueryResult(
        queryId=query_id,
        grade=12,
        category="CAUSE",
        expectedChunkIds=["expected"],
        expectedDocumentIds=["doc-expected"],
        resultChunkIds=chunk_ids,
        resultDocumentIds=[
            "doc-expected" if item == "expected" else "wrong-doc"
            for item in chunk_ids
        ],
        resultLessons=[6 if item == "expected" else 5 for item in chunk_ids],
        resultSections=["Nguyên nhân" for _ in chunk_ids],
        distances=[float(index) for index, _ in enumerate(chunk_ids)],
        filterCompliant=compliant,
        pendingReviewLeakage=pending,
        duplicateResults=len(chunk_ids) != len(set(chunk_ids)),
        latencyMs=10,
        filterMode=mode,
        requestedTopK=5,
        returnedResultCount=len(chunk_ids),
        effectiveK=min(5, len(chunk_ids)),
        eligiblePoolSizeBeforeTopK=414,
        effectivePoolSizeAfterFilters=3,
        embeddingContractMatched=contracts[0],
        collectionMetadataMatched=contracts[1],
        collectionDistanceMetricMatched=contracts[2],
        error=error,
    )


@pytest.mark.parametrize(
    ("ranked", "k", "recall", "precision", "rr"),
    [
        (["a"], 1, 1.0, 1.0, 1.0),
        (["x", "a"], 2, 1.0, 0.5, 0.5),
        (["x", "a"], 1, 0.0, 0.0, 0.5),
        ([], 5, 0.0, 0.0, 0.0),
        (["x", "x", "a"], 3, 1.0, 1 / 3, 1 / 3),
    ],
)
def test_standard_ir_metrics(
    ranked: list[str],
    k: int,
    recall: float,
    precision: float,
    rr: float,
) -> None:
    relevant = {"a"}
    assert calculate_recall_at_k(relevant, ranked, k) == recall
    assert calculate_precision_at_k(relevant, ranked, k) == precision
    assert calculate_reciprocal_rank(relevant, ranked) == rr


def test_ir_metrics_support_multiple_relevant_and_short_results() -> None:
    relevant = {"a", "b"}
    ranked = ["a"]
    assert calculate_recall_at_k(relevant, ranked, 5) == 0.5
    assert calculate_precision_at_k(relevant, ranked, 5) == 0.2
    with pytest.raises(ValueError, match="relevant"):
        calculate_recall_at_k(set(), ranked, 5)


def test_attempted_and_completed_populations_do_not_mix() -> None:
    benchmark = [
        benchmark_record("q1"),
        benchmark_record("q2", query="other"),
    ]
    results = [
        evaluation_result(["expected"], query_id="q1"),
        evaluation_result([], query_id="q2", error="RetrievalError"),
    ]
    attempted = aggregate_effectiveness(
        benchmark,
        results,
        k=5,
        completed_only=False,
    )
    completed = aggregate_effectiveness(
        benchmark,
        results,
        k=5,
        completed_only=True,
    )
    assert attempted["population"] == 2
    assert attempted["strictChunkRecallAtK"] == 0.5
    assert completed["population"] == 1
    assert completed["strictChunkRecallAtK"] == 1.0
    all_failed = aggregate_effectiveness(
        benchmark,
        [
            evaluation_result([], query_id="q1", error="x"),
            evaluation_result([], query_id="q2", error="x"),
        ],
        k=5,
        completed_only=True,
    )
    assert all_failed["population"] == 0
    assert all_failed["strictChunkRecallAtK"] is None


def test_safety_and_contract_metrics_derive_from_observed_results() -> None:
    values = [
        evaluation_result(
            ["expected", "expected"],
            pending=True,
            compliant=False,
        ),
        evaluation_result(
            [],
            query_id="q2",
            contracts=(False, False, False),
        ),
    ]
    safety = calculate_safety_invariants(values)
    assert safety["pendingReviewLeakageCount"] == 1
    assert safety["duplicateResultCount"] == 1
    assert safety["emptyResultCount"] == 1
    assert safety["filterViolationCount"] == 1
    assert safety["filterComplianceRate"] == 0.5
    assert calculate_contract_checks(values) == {
        "embeddingContractMatched": False,
        "collectionMetadataMatched": False,
        "collectionDistanceMetricMatched": False,
    }
    assert calculate_contract_checks(
        [evaluation_result(["expected"], contracts=(None, None, None))]
    ) == {
        "embeddingContractMatched": None,
        "collectionMetadataMatched": None,
        "collectionDistanceMetricMatched": None,
    }


def test_filter_strata_remain_separate_and_disclose_small_pools() -> None:
    benchmark = [benchmark_record()]
    results = [
        evaluation_result(["expected"], mode="GRADE_AND_LESSON"),
        evaluation_result(["wrong"], mode="FILTER_OFF"),
    ]
    results[1].effective_pool_size_after_filters = 414
    strata = build_filter_strata(benchmark, results)
    assert set(strata) == {"GRADE_AND_LESSON", "FILTER_OFF"}
    assert (
        strata["GRADE_AND_LESSON"]["effectivenessAttempted"][
            "strictChunkRecallAtK"
        ]
        == 1.0
    )
    assert (
        strata["FILTER_OFF"]["effectivenessAttempted"][
            "strictChunkRecallAtK"
        ]
        == 0.0
    )
    pool = strata["GRADE_AND_LESSON"][
        "benchmarkConstrainedDiagnostics"
    ]["effectivePoolSizeAfterFilters"]
    assert pool["countPoolLe3"] == 1
    assert calculate_pool_statistics([1, 3, 5, 7])["p95"] == 7


def test_cache_modes_and_timing_not_instrumented_contract() -> None:
    assert classify_retrieval_cache_mode(3, 0) == "CACHE_REPLAY"
    assert classify_retrieval_cache_mode(0, 3) == "LIVE"
    assert classify_retrieval_cache_mode(1, 1) == "MIXED"
    assert classify_retrieval_cache_mode(0, 0) == "UNKNOWN"
    report = build_evaluation_report(
        [benchmark_record()],
        [evaluation_result(["expected"])],
        configuration={"topK": 5},
        corpus_identity={"collection": "collection"},
        cache_hits=1,
        evaluation_mode="OFFLINE_CACHE_REPLAY",
    )
    runtime = report.strata["GRADE_AND_LESSON"]["runtimeProvenance"]
    assert runtime["queryEmbeddingLatencyMs"]["averageMs"] is None
    assert (
        runtime["queryEmbeddingLatencyMs"]["timingAvailability"]
        == "NOT_INSTRUMENTED"
    )
    assert report.cache_mode == "CACHE_REPLAY"
    serialized = report.model_dump(by_alias=True, mode="json")
    assert serialized["reportSchemaVersion"] == "retrieval-evaluation-v2"
    assert serialized["evaluationMode"] == "OFFLINE_CACHE_REPLAY"
    assert serialized["cacheMode"] == "CACHE_REPLAY"
    assert [item["queryId"] for item in serialized["queryResults"]] == ["q1"]
    assert "report_schema_version" not in serialized
    assert report.__class__.model_validate(serialized) == report


def test_flat_metrics_keep_compatibility_but_remove_literals() -> None:
    result = evaluation_result(["wrong", "expected", "expected"])
    metrics = calculate_metrics([benchmark_record()], [result])
    assert metrics["strictChunkHit@1"] == 0
    assert metrics["strictChunkHit@3"] == 1
    assert metrics["documentHit@3"] == 1
    assert metrics["lessonHit@3"] == 1
    assert metrics["mrr"] == 0.5
    assert metrics["duplicateResultRate"] == 1
    assert metrics["embeddingContractMatched"] is True
    assert "embeddingDimensionMismatch" not in metrics
    assert "collectionMetadataMismatch" not in metrics


def test_cache_identity_invalidates_semantic_inputs(tmp_path: Path) -> None:
    base = EvaluationCache.identity("query", "model", 3, "formatter")
    assert base != EvaluationCache.identity("changed", "model", 3, "formatter")
    assert base != EvaluationCache.identity("query", "other", 3, "formatter")
    assert base != EvaluationCache.identity("query", "model", 4, "formatter")
    assert base != EvaluationCache.identity("query", "model", 3, "other")
    cache = EvaluationCache(tmp_path)
    cache.set(base, [1.0, 0.0, 0.0], 3)
    assert cache.get(base, 3) == [1.0, 0.0, 0.0]
    assert cache.get(base, 4) is None
    assert "query" not in (
        tmp_path / f"{base}.json"
    ).read_text(encoding="utf-8")


def _chunk(
    chunk_id: str,
    *,
    pending: bool = False,
    grade: int = 12,
) -> dict:
    return {
        "chunkId": chunk_id,
        "documentId": "doc",
        "grade": grade,
        "book": "KNTT",
        "subject": "Lịch sử",
        "lessonNumber": 6,
        "lessonTitle": "Bài 6",
        "titleMayBeTruncated": False,
        "sourcePageId": "page",
        "sourceFile": "source",
        "sourceMarkdown": "source.md",
        "sectionPath": ["Mục"],
        "sectionTitle": "Mục",
        "pageStart": 1,
        "pageEnd": 1,
        "contentTypes": ["knowledge"],
        "text": "Nội dung",
        "markdown": "Nội dung",
        "embeddingTitle": "Tiêu đề",
        "embeddingText": "Nội dung",
        "sourceBlockIds": ["block"],
        "wordCount": 2,
        "charCount": 8,
        "containsPendingReview": pending,
        "reviewIssueIds": ["issue"] if pending else [],
        "ragEligible": not pending,
        "sourceMarkdownSha256": "a" * 64,
        "chunkHash": "b" * 64,
        "chunkingVersion": "structure-v2",
    }


def _write_corpus(path: Path) -> None:
    path.write_text(
        "\n".join(
            json.dumps(value, ensure_ascii=False)
            for value in [
                _chunk("eligible"),
                _chunk("other"),
                _chunk("pending", pending=True),
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _benchmark_value(**overrides) -> dict:
    value = benchmark_record(
        relevant=["eligible"],
    ).model_dump(by_alias=True)
    value.update(overrides)
    return value


def _write_jsonl(path: Path, values: list[dict] | list[str]) -> None:
    path.write_text(
        "\n".join(
            value if isinstance(value, str) else json.dumps(value)
            for value in values
        )
        + "\n",
        encoding="utf-8",
    )


def test_load_benchmark_validates_identity_queries_evidence_and_minimum(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "corpus.jsonl"
    benchmark = tmp_path / "benchmark.jsonl"
    _write_corpus(corpus)
    _write_jsonl(benchmark, [_benchmark_value()])
    records = load_benchmark(
        benchmark,
        corpus,
        minimum_records=1,
        minimum_per_grade=0,
    )
    assert records[0].benchmark_role == "DEVELOPMENT_AUTHORED"
    assert records[0].independent_ground_truth is False

    duplicate = _benchmark_value(queryId="q2", query=" QUERY ")
    _write_jsonl(benchmark, [_benchmark_value(), duplicate])
    with pytest.raises(ValueError, match="normalized queries"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )

    duplicate_id = _benchmark_value(query="different")
    _write_jsonl(benchmark, [_benchmark_value(), duplicate_id])
    with pytest.raises(ValueError, match="query IDs"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )

    _write_jsonl(
        benchmark,
        [_benchmark_value(expectedChunkIds=["pending"])],
    )
    with pytest.raises(ValueError, match="ineligible"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )

    _write_jsonl(benchmark, [_benchmark_value()])
    with pytest.raises(ValueError, match="at least 2"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=2,
            minimum_per_grade=0,
        )


def test_load_benchmark_rejects_malformed_and_evidence_contract(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "corpus.jsonl"
    benchmark = tmp_path / "benchmark.jsonl"
    _write_corpus(corpus)
    _write_jsonl(benchmark, ["{malformed"])
    with pytest.raises(ValueError, match="line 1"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )
    _write_jsonl(
        benchmark,
        [
            _benchmark_value(
                sourceEvidence={
                    "chunkIds": ["other"],
                    "note": "wrong",
                }
            )
        ],
    )
    with pytest.raises(ValueError, match="lack source evidence"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )
    benchmark.write_bytes(b"\xff\xfe\x00")
    with pytest.raises(ValueError, match="cannot be read"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"category": "INVALID"},
        {"grade": 9},
        {"expectedChunkIds": []},
    ],
)
def test_load_benchmark_rejects_invalid_schema_fields(
    tmp_path: Path,
    overrides: dict,
) -> None:
    corpus = tmp_path / "corpus.jsonl"
    benchmark = tmp_path / "benchmark.jsonl"
    _write_corpus(corpus)
    _write_jsonl(benchmark, [_benchmark_value(**overrides)])
    with pytest.raises(ValueError, match="line 1"):
        load_benchmark(
            benchmark,
            corpus,
            minimum_records=1,
            minimum_per_grade=0,
        )


def _held_out_value(**overrides) -> dict:
    value = {
        "benchmarkCaseId": "held-1",
        "query": "Câu hỏi độc lập",
        "grade": 12,
        "lessonNumber": 6,
        "category": "CAUSE",
        "relevantChunkIds": ["eligible"],
        "relevanceJudgmentVersion": "v1",
        "queryAuthorPseudonym": "QA01",
        "relevanceReviewerPseudonym": "RJ01",
        "queryAuthorViewedChunkContent": False,
        "benchmarkRole": "HELD_OUT_EXTERNAL",
    }
    value.update(overrides)
    return value


def test_held_out_validator_enforces_independent_authoring_protocol(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "corpus.jsonl"
    held_out = tmp_path / "held.jsonl"
    _write_corpus(corpus)
    _write_jsonl(held_out, [_held_out_value()])
    assert len(
        validate_held_out_benchmark(
            held_out,
            corpus,
            ["development query"],
        )
    ) == 1

    _write_jsonl(
        held_out,
        [_held_out_value(relevanceReviewerPseudonym="QA01")],
    )
    with pytest.raises(ValueError, match="distinct roles"):
        validate_held_out_benchmark(held_out, corpus, [])

    _write_jsonl(
        held_out,
        [_held_out_value(query="Development Query")],
    )
    with pytest.raises(ValueError, match="duplicates development"):
        validate_held_out_benchmark(
            held_out,
            corpus,
            [" development  query "],
        )

    _write_jsonl(
        held_out,
        [_held_out_value(syntheticSchemaExample=True)],
    )
    with pytest.raises(ValueError, match="not evaluation data"):
        validate_held_out_benchmark(held_out, corpus, [])

    _write_jsonl(
        held_out,
        [_held_out_value(relevantChunkIds=["pending"])],
    )
    with pytest.raises(ValueError, match="ineligible"):
        validate_held_out_benchmark(held_out, corpus, [])

    duplicate = _held_out_value(
        query="Câu hỏi khác",
    )
    _write_jsonl(held_out, [_held_out_value(), duplicate])
    with pytest.raises(ValueError, match="case IDs"):
        validate_held_out_benchmark(held_out, corpus, [])
