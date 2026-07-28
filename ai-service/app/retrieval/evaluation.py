"""Retrieval benchmark validation, cache, metrics, and report-v2 helpers."""

import hashlib
import json
import math
import os
import unicodedata
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from statistics import mean, median
from typing import Any

from pydantic import ValidationError

from app.corpus.loader import iter_corpus
from app.corpus.models import CorpusChunk
from app.embedding.base import validate_vectors
from app.embedding.models import EmbeddingResponseError
from app.retrieval.models import (
    BenchmarkRecord,
    EvaluationQueryResult,
    EvaluationReport,
    HeldOutBenchmarkRecord,
)

RETRIEVAL_REPORT_SCHEMA_VERSION = "retrieval-evaluation-v2"
DEVELOPMENT_AUTHORING_PROTOCOL = (
    "ENGINEERING_AUTHORED_FROM_CANONICAL_EVIDENCE"
)


class EvaluationCache:
    def __init__(self, root: Path) -> None:
        self.root = root

    @staticmethod
    def identity(
        query: str, model: str, dimension: int, formatter_version: str
    ) -> str:
        payload = json.dumps(
            {
                "queryHash": hashlib.sha256(query.encode("utf-8")).hexdigest(),
                "model": model,
                "dimension": dimension,
                "formatterVersion": formatter_version,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def get(self, cache_key: str, dimension: int) -> list[float] | None:
        path = self.root / f"{cache_key}.json"
        if not path.is_file():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            vector = [float(item) for item in value["vector"]]
            return validate_vectors([vector], 1, dimension)[0]
        except (
            OSError,
            KeyError,
            TypeError,
            ValueError,
            json.JSONDecodeError,
            EmbeddingResponseError,
        ):
            return None

    def set(self, cache_key: str, vector: list[float], dimension: int) -> None:
        validated = validate_vectors([vector], 1, dimension)[0]
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{cache_key}.json"
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            json.dump({"cacheKey": cache_key, "vector": validated}, output)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)


def normalize_benchmark_query(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    return " ".join(without_marks.casefold().split())


def _load_jsonl(path: Path, model: type[Any]) -> list[Any]:
    records: list[Any] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"Benchmark cannot be read: {path}") from exc
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            records.append(model.model_validate_json(line))
        except (ValidationError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError(
                f"Invalid benchmark record at line {line_number}: {exc}"
            ) from exc
    return records


def _corpus_chunks(corpus_path: Path) -> dict[str, CorpusChunk]:
    return {chunk.chunkId: chunk for chunk in iter_corpus(corpus_path)}


def _validate_unique(values: Iterable[str], message: str) -> None:
    items = list(values)
    if len(items) != len(set(items)):
        raise ValueError(message)


def load_benchmark(
    path: Path,
    corpus_path: Path,
    *,
    minimum_records: int = 30,
    minimum_per_grade: int = 12,
) -> list[BenchmarkRecord]:
    records = _load_jsonl(path, BenchmarkRecord)
    chunks = _corpus_chunks(corpus_path)
    eligible_ids = {
        chunk_id
        for chunk_id, chunk in chunks.items()
        if chunk.ragEligible and not chunk.containsPendingReview
    }
    if len(records) < minimum_records:
        raise ValueError(
            f"Benchmark must contain at least {minimum_records} records"
        )
    distribution = Counter(record.grade for record in records)
    for grade in (10, 11, 12):
        if distribution[grade] < minimum_per_grade:
            raise ValueError(
                f"Benchmark must contain at least {minimum_per_grade} "
                f"grade {grade} queries"
            )
    _validate_unique(
        (record.query_id for record in records),
        "Benchmark query IDs must be unique",
    )
    _validate_unique(
        (normalize_benchmark_query(record.query) for record in records),
        "Benchmark normalized queries must be unique",
    )
    for record in records:
        expected = set(record.expected_chunk_ids)
        evidence = set(record.source_evidence.chunk_ids)
        if not expected:
            raise ValueError(
                f"Benchmark {record.query_id} has an empty relevant set"
            )
        if not expected <= eligible_ids or not evidence <= eligible_ids:
            raise ValueError(
                f"Benchmark {record.query_id} references ineligible chunks"
            )
        if not expected <= evidence:
            raise ValueError(
                f"Benchmark {record.query_id} expected chunks lack source evidence"
            )
        if any(chunks[chunk_id].grade != record.grade for chunk_id in expected):
            raise ValueError(
                f"Benchmark {record.query_id} grade mismatches evidence"
            )
        if record.filters.grade != record.grade:
            raise ValueError(
                f"Benchmark {record.query_id} grade mismatches filters"
            )
        if record.filters.lesson_number != record.lesson_number:
            raise ValueError(
                f"Benchmark {record.query_id} lesson mismatches filters"
            )
    return records


def validate_held_out_benchmark(
    path: Path,
    corpus_path: Path,
    development_queries: Iterable[str],
    *,
    minimum_records: int = 1,
    require_distinct_roles: bool = True,
) -> list[HeldOutBenchmarkRecord]:
    records = _load_jsonl(path, HeldOutBenchmarkRecord)
    if len(records) < minimum_records:
        raise ValueError(
            f"Held-out benchmark must contain at least {minimum_records} records"
        )
    chunks = _corpus_chunks(corpus_path)
    eligible_ids = {
        chunk_id
        for chunk_id, chunk in chunks.items()
        if chunk.ragEligible and not chunk.containsPendingReview
    }
    _validate_unique(
        (record.benchmark_case_id for record in records),
        "Held-out benchmark case IDs must be unique",
    )
    normalized_queries = [
        normalize_benchmark_query(record.query) for record in records
    ]
    _validate_unique(
        normalized_queries,
        "Held-out benchmark normalized queries must be unique",
    )
    development = {
        normalize_benchmark_query(query) for query in development_queries
    }
    for record, normalized_query in zip(records, normalized_queries, strict=False):
        if record.synthetic_schema_example:
            raise ValueError(
                "Synthetic schema examples are not evaluation data"
            )
        if normalized_query in development:
            raise ValueError(
                f"Held-out query {record.benchmark_case_id} duplicates development"
            )
        if require_distinct_roles and (
            record.query_author_pseudonym
            == record.relevance_reviewer_pseudonym
        ):
            raise ValueError(
                f"Held-out case {record.benchmark_case_id} must use distinct roles"
            )
        relevant = set(record.relevant_chunk_ids)
        if not relevant:
            raise ValueError(
                f"Held-out case {record.benchmark_case_id} has no relevant chunks"
            )
        if not relevant <= eligible_ids:
            raise ValueError(
                f"Held-out case {record.benchmark_case_id} references "
                "unknown or ineligible chunks"
            )
        if any(chunks[chunk_id].grade != record.grade for chunk_id in relevant):
            raise ValueError(
                f"Held-out case {record.benchmark_case_id} grade mismatches chunks"
            )
    return records


def calculate_recall_at_k(
    relevant_chunk_ids: set[str], ranked_chunk_ids: list[str], k: int
) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevant_chunk_ids:
        raise ValueError("relevant chunk set must not be empty")
    retrieved = set(ranked_chunk_ids[:k])
    return len(relevant_chunk_ids & retrieved) / len(relevant_chunk_ids)


def calculate_precision_at_k(
    relevant_chunk_ids: set[str], ranked_chunk_ids: list[str], k: int
) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevant_chunk_ids:
        raise ValueError("relevant chunk set must not be empty")
    retrieved = set(ranked_chunk_ids[:k])
    return len(relevant_chunk_ids & retrieved) / k


def calculate_reciprocal_rank(
    relevant_chunk_ids: set[str], ranked_chunk_ids: list[str]
) -> float:
    if not relevant_chunk_ids:
        raise ValueError("relevant chunk set must not be empty")
    for rank, chunk_id in enumerate(ranked_chunk_ids, start=1):
        if chunk_id in relevant_chunk_ids:
            return 1.0 / rank
    return 0.0


def classify_retrieval_cache_mode(
    cache_hits: int, cache_misses: int
) -> str:
    if cache_hits < 0 or cache_misses < 0:
        raise ValueError("cache counters must not be negative")
    if cache_hits and cache_misses:
        return "MIXED"
    if cache_hits:
        return "CACHE_REPLAY"
    if cache_misses:
        return "LIVE"
    return "UNKNOWN"


def calculate_pool_statistics(values: list[int | None]) -> dict[str, Any]:
    measured = sorted(value for value in values if value is not None)
    if not measured:
        return {
            "min": None,
            "median": None,
            "mean": None,
            "p95": None,
            "max": None,
            "countPoolLe3": 0,
            "countPoolLe5": 0,
            "measuredCount": 0,
        }
    p95_index = max(0, math.ceil(0.95 * len(measured)) - 1)
    return {
        "min": min(measured),
        "median": median(measured),
        "mean": round(mean(measured), 6),
        "p95": measured[p95_index],
        "max": max(measured),
        "countPoolLe3": sum(value <= 3 for value in measured),
        "countPoolLe5": sum(value <= 5 for value in measured),
        "measuredCount": len(measured),
    }


def _rate(count: int, denominator: int) -> float | None:
    return round(count / denominator, 6) if denominator else None


def calculate_safety_invariants(
    results: list[EvaluationQueryResult],
) -> dict[str, Any]:
    completed = [result for result in results if result.error is None]
    denominator = len(completed)
    pending = sum(result.pending_review_leakage for result in completed)
    duplicates = sum(result.duplicate_results for result in completed)
    empty = sum(not result.result_chunk_ids for result in completed)
    violations = sum(not result.filter_compliant for result in completed)
    return {
        "pendingReviewLeakageCount": pending,
        "pendingReviewLeakageRate": _rate(pending, denominator),
        "duplicateResultCount": duplicates,
        "duplicateResultRate": _rate(duplicates, denominator),
        "emptyResultCount": empty,
        "emptyResultRate": _rate(empty, denominator),
        "filterViolationCount": violations,
        "filterComplianceRate": _rate(denominator - violations, denominator),
        "population": denominator,
    }


def _aggregate_contract(values: list[bool | None]) -> bool | None:
    observed = [value for value in values if value is not None]
    if not observed:
        return None
    return all(observed)


def calculate_contract_checks(
    results: list[EvaluationQueryResult],
) -> dict[str, bool | None]:
    return {
        "embeddingContractMatched": _aggregate_contract(
            [result.embedding_contract_matched for result in results]
        ),
        "collectionMetadataMatched": _aggregate_contract(
            [result.collection_metadata_matched for result in results]
        ),
        "collectionDistanceMetricMatched": _aggregate_contract(
            [
                result.collection_distance_metric_matched
                for result in results
            ]
        ),
    }


def aggregate_effectiveness(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
    *,
    k: int,
    completed_only: bool,
) -> dict[str, Any]:
    by_id = {result.query_id: result for result in results}
    recalls: list[float] = []
    precisions: list[float] = []
    reciprocal_ranks: list[float] = []
    for record in benchmark:
        result = by_id.get(record.query_id)
        if result is None or result.error is not None:
            if completed_only:
                continue
            recalls.append(0.0)
            precisions.append(0.0)
            reciprocal_ranks.append(0.0)
            continue
        relevant = set(record.expected_chunk_ids)
        recalls.append(
            calculate_recall_at_k(relevant, result.result_chunk_ids, k)
        )
        precisions.append(
            calculate_precision_at_k(relevant, result.result_chunk_ids, k)
        )
        reciprocal_ranks.append(
            calculate_reciprocal_rank(relevant, result.result_chunk_ids)
        )
    population = len(recalls)
    return {
        "population": population,
        "strictChunkRecallAtK": (
            round(mean(recalls), 6) if population else None
        ),
        "strictChunkPrecisionAtK": (
            round(mean(precisions), 6) if population else None
        ),
        "strictChunkHitAtK": (
            round(
                sum(value > 0 for value in recalls) / population,
                6,
            )
            if population
            else None
        ),
        "meanReciprocalRank": (
            round(mean(reciprocal_ranks), 6) if population else None
        ),
        "k": k,
    }


def _section_keyword_coverage(
    record: BenchmarkRecord,
    result: EvaluationQueryResult,
    k: int,
) -> float | None:
    if not record.expected_section_keywords:
        return None
    section_text = normalize_benchmark_query(
        " ".join(result.result_sections[:k])
    )
    matches = sum(
        normalize_benchmark_query(keyword) in section_text
        for keyword in record.expected_section_keywords
    )
    return matches / len(record.expected_section_keywords)


def calculate_benchmark_diagnostics(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
    *,
    k: int,
) -> dict[str, Any]:
    records = {record.query_id: record for record in benchmark}
    completed = [result for result in results if result.error is None]
    document_compliance: list[float] = []
    lesson_compliance: list[float] = []
    section_coverage: list[float] = []
    for result in completed:
        record = records[result.query_id]
        document_compliance.append(
            float(
                bool(
                    set(record.expected_document_ids)
                    & set(result.result_document_ids[:k])
                )
            )
        )
        lesson_compliance.append(
            float(record.lesson_number in result.result_lessons[:k])
        )
        coverage = _section_keyword_coverage(record, result, k)
        if coverage is not None:
            section_coverage.append(coverage)
    return {
        "documentComplianceAtK": (
            round(mean(document_compliance), 6)
            if document_compliance
            else None
        ),
        "lessonComplianceAtK": (
            round(mean(lesson_compliance), 6)
            if lesson_compliance
            else None
        ),
        "sectionKeywordCoverageAtK": (
            round(mean(section_coverage), 6)
            if section_coverage
            else None
        ),
        "sectionKeywordPopulation": len(section_coverage),
        "eligiblePoolSizeBeforeTopK": calculate_pool_statistics(
            [
                result.eligible_pool_size_before_top_k
                for result in results
            ]
        ),
        "effectivePoolSizeAfterFilters": calculate_pool_statistics(
            [
                result.effective_pool_size_after_filters
                for result in results
            ]
        ),
        "candidatePoolSize": calculate_pool_statistics(
            [
                result.effective_pool_size_after_filters
                for result in results
            ]
        ),
        "returnedResultCount": calculate_pool_statistics(
            [result.returned_result_count for result in results]
        ),
    }


def _latency_summary(values: list[float | None]) -> dict[str, Any]:
    measured = sorted(float(value) for value in values if value is not None)
    if not measured:
        return {
            "averageMs": None,
            "p50Ms": None,
            "p95Ms": None,
            "timingAvailability": "NOT_INSTRUMENTED",
        }
    p95_index = max(0, math.ceil(0.95 * len(measured)) - 1)
    return {
        "averageMs": round(mean(measured), 2),
        "p50Ms": round(median(measured), 2),
        "p95Ms": round(measured[p95_index], 2),
        "timingAvailability": "MEASURED",
    }


def calculate_latency_provenance(
    results: list[EvaluationQueryResult],
) -> dict[str, Any]:
    return {
        "cacheLookupLatencyMs": _latency_summary(
            [result.cache_lookup_latency_ms for result in results]
        ),
        "queryEmbeddingLatencyMs": _latency_summary(
            [result.query_embedding_latency_ms for result in results]
        ),
        "chromaQueryLatencyMs": _latency_summary(
            [result.chroma_query_latency_ms for result in results]
        ),
        "postProcessingLatencyMs": _latency_summary(
            [result.post_processing_latency_ms for result in results]
        ),
        "totalLatencyMs": _latency_summary(
            [result.latency_ms for result in results]
        ),
    }


def build_filter_strata(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
    *,
    k: int = 5,
) -> dict[str, Any]:
    strata: dict[str, Any] = {}
    for mode in ("GRADE_AND_LESSON", "GRADE_ONLY", "FILTER_OFF"):
        mode_results = [
            result for result in results if result.filter_mode == mode
        ]
        if not mode_results:
            continue
        attempted = len(benchmark)
        completed = len(
            {
                result.query_id
                for result in mode_results
                if result.error is None
            }
        )
        failed = attempted - completed
        strata[mode] = {
            "attemptedCount": attempted,
            "completedCount": completed,
            "failedCount": failed,
            "failureRate": _rate(failed, attempted),
            "effectivenessAttempted": aggregate_effectiveness(
                benchmark,
                mode_results,
                k=k,
                completed_only=False,
            ),
            "effectivenessCompleted": aggregate_effectiveness(
                benchmark,
                mode_results,
                k=k,
                completed_only=True,
            ),
            "benchmarkConstrainedDiagnostics": (
                calculate_benchmark_diagnostics(
                    benchmark,
                    mode_results,
                    k=k,
                )
            ),
            "safetyInvariants": calculate_safety_invariants(mode_results),
            "contractChecks": calculate_contract_checks(mode_results),
            "runtimeProvenance": calculate_latency_provenance(mode_results),
        }
    return strata


def calculate_metrics(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
) -> dict[str, Any]:
    """Backward-compatible flat aliases plus report-v2 taxonomy."""

    primary = [
        result
        for result in results
        if result.filter_mode == "GRADE_AND_LESSON"
    ] or results
    metrics: dict[str, Any] = {}
    for k in (1, 3, 5):
        effectiveness = aggregate_effectiveness(
            benchmark,
            primary,
            k=k,
            completed_only=False,
        )
        diagnostics = calculate_benchmark_diagnostics(
            benchmark,
            primary,
            k=k,
        )
        metrics[f"strictChunkHit@{k}"] = effectiveness[
            "strictChunkHitAtK"
        ]
        metrics[f"strictChunkRecall@{k}"] = effectiveness[
            "strictChunkRecallAtK"
        ]
        metrics[f"strictChunkPrecision@{k}"] = effectiveness[
            "strictChunkPrecisionAtK"
        ]
        metrics[f"documentHit@{k}"] = diagnostics[
            "documentComplianceAtK"
        ]
        metrics[f"lessonHit@{k}"] = diagnostics["lessonComplianceAtK"]
    mrr = aggregate_effectiveness(
        benchmark,
        primary,
        k=5,
        completed_only=False,
    )["meanReciprocalRank"]
    metrics["mrr"] = mrr
    metrics.update(calculate_safety_invariants(primary))
    metrics.update(calculate_contract_checks(primary))
    metrics["mapAvailability"] = (
        "MAP_NOT_REPORTED_REDUNDANT_WITH_MRR_FOR_SINGLE_RELEVANT_ITEM"
    )
    metrics["ndcgAvailability"] = (
        "NDCG_NOT_AVAILABLE_NO_GRADED_RELEVANCE"
    )
    return metrics


def build_evaluation_report(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
    *,
    configuration: dict[str, Any],
    corpus_identity: dict[str, Any],
    cache_hits: int = 0,
    cache_misses: int = 0,
    evaluation_mode: str = "SYNTHETIC_TEST_DATA",
) -> EvaluationReport:
    failed_query_ids = {
        result.query_id for result in results if result.error is not None
    }
    failed = len(failed_query_ids)
    cache_mode = classify_retrieval_cache_mode(cache_hits, cache_misses)
    strata = build_filter_strata(
        benchmark,
        results,
        k=int(configuration.get("topK", 5)),
    )
    for values in strata.values():
        values["runtimeProvenance"].update(
            {
                "cacheHits": cache_hits,
                "cacheMisses": cache_misses,
                "cacheMode": cache_mode,
            }
        )
    return EvaluationReport(
        reportSchemaVersion=RETRIEVAL_REPORT_SCHEMA_VERSION,
        status="COMPLETED_WITH_ERRORS" if failed else "COMPLETED",
        evaluationMode=evaluation_mode,
        benchmarkRole="DEVELOPMENT_AUTHORED",
        authoringProtocol=DEVELOPMENT_AUTHORING_PROTOCOL,
        independentGroundTruth=False,
        filterMode="MULTI_STRATUM",
        metricPopulation={
            "effectivenessAttempted": (
                "all benchmark queries; failures count as retrieval misses"
            ),
            "effectivenessCompleted": (
                "only queries returning a valid retrieval response"
            ),
            "safetyAndDiagnostics": "completed retrieval responses only",
        },
        queryCount=len(benchmark),
        completedQueries=len(benchmark) - failed,
        failedQueries=failed,
        cacheHits=cache_hits,
        cacheMisses=cache_misses,
        cacheMode=cache_mode,
        configuration=configuration,
        corpusIdentity=corpus_identity,
        distributionByGrade={
            str(key): value
            for key, value in Counter(r.grade for r in benchmark).items()
        },
        distributionByCategory=dict(
            Counter(r.category for r in benchmark)
        ),
        metrics=calculate_metrics(benchmark, results),
        strata=strata,
        metricAvailability={
            "MAP": (
                "MAP_NOT_REPORTED_REDUNDANT_WITH_MRR_FOR_SINGLE_RELEVANT_ITEM"
            ),
            "nDCG": "NDCG_NOT_AVAILABLE_NO_GRADED_RELEVANCE",
        },
        queryResults=results,
    )


def render_markdown(report: EvaluationReport) -> str:
    lines = [
        "# Retrieval Evaluation — Engineering Benchmark v2",
        "",
        "This development-authored benchmark is for regression diagnostics, "
        "not independent efficacy or factual-correctness evidence.",
        "",
        f"- Status: `{report.status}`",
        f"- Schema: `{report.report_schema_version}`",
        f"- Evaluation mode: `{report.evaluation_mode}`",
        f"- Benchmark role: `{report.benchmark_role}`",
        f"- Independent ground truth: `{report.independent_ground_truth}`",
        f"- Cache mode: `{report.cache_mode}` "
        f"(hits={report.cache_hits}, misses={report.cache_misses})",
        "",
        "## Metric taxonomy",
        "",
        "- Effectiveness: strict chunk Recall@K, Precision@K and MRR.",
        "- Benchmark-constrained diagnostics: document/lesson compliance, "
        "section keyword coverage and pool sizes.",
        "- Safety invariants: pending-review leakage, duplicates, empty "
        "results and filter violations.",
        "- Contract checks: embedding, collection metadata and distance metric.",
        "- Runtime provenance: cache, embedding, Chroma, post-processing and "
        "total latency stages.",
        "",
        "Hit@K equals Recall@K only when a case has one relevant chunk.",
    ]
    for mode, values in report.strata.items():
        lines.extend(
            [
                "",
                f"## Stratum `{mode}`",
                "",
                f"- Attempted/completed/failed: "
                f"{values['attemptedCount']}/"
                f"{values['completedCount']}/"
                f"{values['failedCount']}",
                f"- Effectiveness attempted: "
                f"`{values['effectivenessAttempted']}`",
                f"- Effectiveness completed: "
                f"`{values['effectivenessCompleted']}`",
                f"- Pool diagnostics: "
                f"`{values['benchmarkConstrainedDiagnostics']['effectivePoolSizeAfterFilters']}`",
                f"- Safety: `{values['safetyInvariants']}`",
                f"- Contracts: `{values['contractChecks']}`",
            ]
        )
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "- Ground truth was authored from the same canonical evidence; "
            "it is not independent.",
            "- Filter-on and filter-off strata must never be merged.",
            "- Cache replay latency is not live embedding-provider latency.",
            "- MAP is redundant for the current single-relevant-item cases.",
            "- nDCG is unavailable because graded relevance does not exist.",
            "",
        ]
    )
    return "\n".join(lines)
