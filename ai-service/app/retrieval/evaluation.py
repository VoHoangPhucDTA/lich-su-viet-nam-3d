"""Engineering retrieval benchmark validation, cache, and metrics."""

import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path
from statistics import mean, median
from typing import Any

from pydantic import ValidationError

from app.corpus.loader import iter_corpus
from app.embedding.base import validate_vectors
from app.embedding.models import EmbeddingResponseError
from app.retrieval.models import (
    BenchmarkRecord,
    EvaluationQueryResult,
    EvaluationReport,
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


def load_benchmark(path: Path, corpus_path: Path) -> list[BenchmarkRecord]:
    records: list[BenchmarkRecord] = []
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                records.append(BenchmarkRecord.model_validate_json(line))
            except ValidationError as exc:
                raise ValueError(
                    f"Invalid benchmark record at line {line_number}: {exc}"
                ) from exc
    chunks = {chunk.chunkId: chunk for chunk in iter_corpus(corpus_path)}
    eligible_ids = {
        chunk_id
        for chunk_id, chunk in chunks.items()
        if not chunk.containsPendingReview
    }
    if len(records) < 30:
        raise ValueError("Benchmark must contain at least 30 records")
    distribution = Counter(record.grade for record in records)
    for grade in (10, 11, 12):
        if distribution[grade] < 12:
            raise ValueError(f"Benchmark must contain at least 12 grade {grade} queries")
    query_ids = [record.query_id for record in records]
    if len(query_ids) != len(set(query_ids)):
        raise ValueError("Benchmark query IDs must be unique")
    for record in records:
        expected = set(record.expected_chunk_ids)
        evidence = set(record.source_evidence.chunk_ids)
        if not expected <= eligible_ids or not evidence <= eligible_ids:
            raise ValueError(f"Benchmark {record.query_id} references ineligible chunks")
        if not expected <= evidence:
            raise ValueError(
                f"Benchmark {record.query_id} expected chunks lack source evidence"
            )
        if any(chunks[chunk_id].grade != record.grade for chunk_id in expected):
            raise ValueError(f"Benchmark {record.query_id} grade mismatches evidence")
    return records


def _hit(expected: set[Any], actual: list[Any], k: int) -> float:
    return float(bool(expected.intersection(actual[:k])))


def calculate_metrics(
    benchmark: list[BenchmarkRecord], results: list[EvaluationQueryResult]
) -> dict[str, float]:
    by_id = {result.query_id: result for result in results}
    chunk_hits: dict[int, list[float]] = {1: [], 3: [], 5: []}
    document_hits: dict[int, list[float]] = {1: [], 3: [], 5: []}
    lesson_hits: dict[int, list[float]] = {1: [], 3: [], 5: []}
    reciprocal_ranks: list[float] = []
    completed: list[EvaluationQueryResult] = []
    for record in benchmark:
        result = by_id.get(record.query_id)
        if result is None or result.error is not None:
            for values in (chunk_hits, document_hits, lesson_hits):
                for k in values:
                    values[k].append(0.0)
            reciprocal_ranks.append(0.0)
            continue
        completed.append(result)
        expected_chunks = set(record.expected_chunk_ids)
        expected_documents = set(record.expected_document_ids)
        for k in (1, 3, 5):
            chunk_hits[k].append(
                _hit(expected_chunks, result.result_chunk_ids, k)
            )
            document_hits[k].append(
                _hit(expected_documents, result.result_document_ids, k)
            )
            lesson_hits[k].append(
                _hit({record.lesson_number}, result.result_lessons, k)
            )
        rank = next(
            (
                index
                for index, chunk_id in enumerate(result.result_chunk_ids, start=1)
                if chunk_id in expected_chunks
            ),
            None,
        )
        reciprocal_ranks.append(0.0 if rank is None else 1.0 / rank)

    denominator = max(1, len(benchmark))
    latencies = sorted(result.latency_ms for result in completed)
    percentile_index = max(0, math.ceil(0.95 * len(latencies)) - 1)
    metrics = {
        **{f"strictChunkHit@{k}": sum(values) / denominator for k, values in chunk_hits.items()},
        **{f"documentHit@{k}": sum(values) / denominator for k, values in document_hits.items()},
        **{f"lessonHit@{k}": sum(values) / denominator for k, values in lesson_hits.items()},
        "mrr": sum(reciprocal_ranks) / denominator,
        "filterComplianceRate": sum(r.filter_compliant for r in completed)
        / max(1, len(completed)),
        "pendingReviewLeakageRate": sum(r.pending_review_leakage for r in completed)
        / max(1, len(completed)),
        "duplicateResultRate": sum(r.duplicate_results for r in completed)
        / max(1, len(completed)),
        "emptyResultRate": sum(not r.result_chunk_ids for r in completed)
        / max(1, len(completed)),
        "averageLatencyMs": mean(latencies) if latencies else 0.0,
        "p50LatencyMs": median(latencies) if latencies else 0.0,
        "p95LatencyMs": latencies[percentile_index] if latencies else 0.0,
        "embeddingDimensionMismatch": 0.0,
        "collectionMetadataMismatch": 0.0,
    }
    return {key: round(float(value), 6) for key, value in metrics.items()}


def build_evaluation_report(
    benchmark: list[BenchmarkRecord],
    results: list[EvaluationQueryResult],
    *,
    configuration: dict[str, Any],
    corpus_identity: dict[str, Any],
) -> EvaluationReport:
    failed = sum(result.error is not None for result in results)
    return EvaluationReport(
        status="COMPLETED_WITH_ERRORS" if failed else "COMPLETED",
        queryCount=len(benchmark),
        completedQueries=len(results) - failed,
        failedQueries=failed,
        configuration=configuration,
        corpusIdentity=corpus_identity,
        distributionByGrade={
            str(key): value for key, value in Counter(r.grade for r in benchmark).items()
        },
        distributionByCategory=dict(Counter(r.category for r in benchmark)),
        metrics=calculate_metrics(benchmark, results),
        queryResults=results,
    )


def render_markdown(report: EvaluationReport) -> str:
    lines = [
        "# Retrieval Evaluation — Engineering Baseline",
        "",
        "This is an initial source-evidenced engineering benchmark, not expert validation.",
        "",
        f"- Status: `{report.status}`",
        f"- Queries: {report.query_count}",
        f"- Completed: {report.completed_queries}",
        f"- Failed: {report.failed_queries}",
        "",
        "## Configuration",
        "",
    ]
    lines.extend(f"- {key}: `{value}`" for key, value in report.configuration.items())
    lines.extend(["", "## Corpus and index identity", ""])
    lines.extend(f"- {key}: `{value}`" for key, value in report.corpus_identity.items())
    lines.extend(["", "## Query distribution", ""])
    lines.append(
        "- Grade: "
        + ", ".join(
            f"{key}={value}" for key, value in sorted(report.distribution_by_grade.items())
        )
    )
    lines.append(
        "- Category: "
        + ", ".join(
            f"{key}={value}"
            for key, value in sorted(report.distribution_by_category.items())
        )
    )
    lines.extend(["", "## Metrics", ""])
    lines.extend(f"- {key}: {value}" for key, value in report.metrics.items())
    failures = [
        result
        for result in report.query_results
        if result.error is not None
        or not set(result.expected_chunk_ids).intersection(result.result_chunk_ids[:5])
    ]
    lines.extend(["", "## Failed strict chunk retrievals", ""])
    if not failures:
        lines.append("- None")
    for result in failures:
        lines.append(
            f"- `{result.query_id}`: error={result.error or 'none'}; "
            f"topChunk={result.result_chunk_ids[:1]}; "
            f"topDocument={result.result_document_ids[:1]}; "
            f"distance={result.distances[:1]}"
        )
    violations = [result for result in report.query_results if not result.filter_compliant]
    lines.extend(["", "## Filter violations", ""])
    if not violations:
        lines.append("- None")
    else:
        lines.extend(f"- `{result.query_id}`" for result in violations)
    lines.extend(
        [
            "",
            "## Latency",
            "",
            f"- Average: {report.metrics.get('averageLatencyMs', 0.0)} ms",
            f"- P50: {report.metrics.get('p50LatencyMs', 0.0)} ms",
            f"- P95: {report.metrics.get('p95LatencyMs', 0.0)} ms",
        ]
    )
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "- Ground truth was authored from canonical corpus evidence by engineering review.",
            "- Raw cosine distance is not interpreted as confidence or probability.",
            "- This baseline must not be selectively edited after observing results.",
            "",
            "## Next step",
            "",
            "Review failed queries and establish an expert-reviewed retrieval set before generation.",
            "",
        ]
    )
    return "\n".join(lines)
