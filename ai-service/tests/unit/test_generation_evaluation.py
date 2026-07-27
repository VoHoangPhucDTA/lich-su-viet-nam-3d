from app.generation.evaluation import (
    build_excerpt_metadata,
    build_source_excerpt_map,
    calculate_duplicate_metrics,
    calculate_generation_metrics,
    calculate_repair_metrics,
    classify_cache_mode,
    classify_live_latency_status,
)
from app.generation.models import GenerationSource
from tests.unit.test_generation import source


def generation_source(chunk_id: str = "chunk-1") -> GenerationSource:
    return GenerationSource(
        chunkId=chunk_id,
        documentId="doc-1",
        grade=12,
        lessonNumber=6,
        lessonTitle="Bài học",
        sectionTitle="Mục",
        pageStart=None,
        pageEnd=None,
        chunkHash=("a" if chunk_id == "chunk-1" else "b") * 64,
    )


def test_cache_mode_classification() -> None:
    assert classify_cache_mode(3, 0) == "CACHE_REPLAY"
    assert classify_cache_mode(0, 3) == "LIVE"
    assert classify_cache_mode(2, 1) == "MIXED"
    assert classify_cache_mode(0, 0) == "CACHE_REPLAY"


def test_live_latency_requires_a_production_provider_call() -> None:
    assert classify_live_latency_status(0, "production") == "NOT_MEASURED"
    assert classify_live_latency_status(2, "deterministic") == "NOT_MEASURED"
    assert classify_live_latency_status(2, "production") == "MEASURED"


def test_repair_metrics_cover_none_success_failure_and_mixed() -> None:
    assert calculate_repair_metrics([]) == {
        "repairAttemptCount": 0,
        "repairSuccessCount": 0,
        "repairFailureCount": 0,
        "repairAttemptRate": 0.0,
        "repairSuccessRate": None,
    }
    values = [
        {
            "repairAttemptCount": 1,
            "repairSuccessCount": 1,
            "repairFailureCount": 0,
        },
        {
            "repairAttemptCount": 1,
            "repairSuccessCount": 0,
            "repairFailureCount": 1,
        },
        {
            "repairAttemptCount": 2,
            "repairSuccessCount": 1,
            "repairFailureCount": 1,
        },
        {
            "repairAttemptCount": 0,
            "repairSuccessCount": 0,
            "repairFailureCount": 0,
        },
    ]
    metrics = calculate_repair_metrics(values)
    assert metrics["repairAttemptCount"] == 4
    assert metrics["repairSuccessCount"] == 2
    assert metrics["repairFailureCount"] == 2
    assert metrics["repairAttemptRate"] == 0.75
    assert metrics["repairSuccessRate"] == 0.5


def test_duplicate_metrics_read_internal_validation_issues() -> None:
    cases = [
        {
            "validationIssues": [
                {"code": "DUPLICATE_WITHIN_BATCH", "severity": "ERROR"}
            ]
        },
        {
            "validationIssues": [
                {"code": "DUPLICATE_STYLE_EXAMPLE", "severity": "ERROR"}
            ]
        },
        {"validationIssues": [], "warnings": ["DUPLICATE_WITHIN_BATCH"]},
    ]
    assert calculate_duplicate_metrics(cases) == {
        "withinBatchDuplicateCount": 1,
        "withinBatchDuplicateRate": 0.333333,
        "styleExampleDuplicateCount": 1,
        "styleExampleDuplicateRate": 0.333333,
    }


def test_source_mapping_uses_chunk_id_for_reorder_and_subset() -> None:
    first = source("chunk-1", "first")
    second = source("chunk-2", "second")
    mapping, diagnostics = build_source_excerpt_map(
        [generation_source("chunk-2")],
        [first, second],
    )
    assert diagnostics == []
    assert list(mapping) == ["chunk-2"]
    assert mapping["chunk-2"]["excerpt"] == "second"


def test_source_mapping_reports_unknown_duplicate_and_missing_without_fallback() -> None:
    sources = [
        generation_source("missing"),
        generation_source("missing"),
        generation_source("chunk-1"),
    ]
    duplicate_results = [source("chunk-1", "first"), source("chunk-1", "wrong")]
    mapping, diagnostics = build_source_excerpt_map(sources, duplicate_results)
    assert mapping["missing"]["excerpt"] is None
    assert mapping["missing"]["issue"] == "MISSING_RETRIEVAL_RESULT"
    assert mapping["chunk-1"]["excerpt"] is None
    assert {item["code"] for item in diagnostics} == {
        "DUPLICATE_RETRIEVAL_CHUNK_ID",
        "DUPLICATE_RESPONSE_SOURCE_ID",
        "MISSING_RETRIEVAL_RESULT",
    }


def test_excerpt_metadata_discloses_exact_boundary_and_late_evidence() -> None:
    short = build_excerpt_metadata(
        generation_source(),
        source("chunk-1", "x" * 599),
    )
    exact = build_excerpt_metadata(
        generation_source(),
        source("chunk-1", "x" * 600),
    )
    long_text = "x" * 600 + "EVIDENCE_AFTER_LIMIT"
    long = build_excerpt_metadata(
        generation_source(),
        source("chunk-1", long_text),
    )
    assert short["truncated"] is False and short["excerptLength"] == 599
    assert exact["truncated"] is False and exact["excerptLength"] == 600
    assert long["truncated"] is True
    assert long["excerptLength"] == 600
    assert long["fullTextLength"] == len(long_text)
    assert long["chunkHash"] == "a" * 64
    assert "EVIDENCE_AFTER_LIMIT" not in long["excerpt"]


def test_generation_metrics_do_not_invent_provider_latency() -> None:
    cases = [
        {
            "success": True,
            "requestedCount": 1,
            "generatedCount": 1,
            "questions": [
                {
                    "options": [{}, {}, {}, {}],
                    "correctOptionId": "A",
                    "sourceChunkIds": ["chunk-1"],
                    "explanation": "valid",
                }
            ],
            "warnings": [],
            "validationIssues": [],
            "repairAttemptCount": 0,
            "repairSuccessCount": 0,
            "repairFailureCount": 0,
            "timings": {
                "cacheLookupLatencyMs": 1.0,
                "retrievalLatencyMs": 2.0,
                "providerLatencyMs": None,
                "totalLatencyMs": 3.0,
            },
        }
    ]
    metrics = calculate_generation_metrics(cases)
    assert metrics["averageProviderLatencyMs"] is None
    assert metrics["averageCacheLookupLatencyMs"] == 1.0
    assert metrics["averageRetrievalLatencyMs"] == 2.0
    assert metrics["averageTotalLatencyMs"] == 3.0
    assert metrics["repairSuccessRate"] is None
