"""Controlled dense/BM25 retrieval experiment runner.

This module deliberately keeps experiment output separate from the legacy
``retrieval-evaluation-v2`` report contract.  It never caches live query
embeddings and never writes to tracked source files.
"""

from __future__ import annotations

import csv
import hashlib
import inspect
import json
import math
import os
import platform
import random
import re
import subprocess
import time
import unicodedata
from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from statistics import mean, median, stdev
from typing import Any

from app.config import SERVICE_ROOT, Settings
from app.corpus.loader import iter_corpus
from app.corpus.models import CorpusChunk
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import QUERY_FORMATTER_VERSION
from app.retrieval.evaluation import (
    calculate_precision_at_k,
    calculate_recall_at_k,
    calculate_reciprocal_rank,
    load_benchmark,
    validate_held_out_benchmark,
)
from app.retrieval.models import (
    BenchmarkRecord,
    RetrievalEvaluationTrace,
    RetrievalRequest,
)
from app.retrieval.service import create_retrieval_service
from app.vectorstore.chroma_client import (
    close_persistent_client,
    collection_exists,
    create_persistent_client,
    get_collection,
    validate_collection_contract,
)

EXPERIMENT_SCHEMA_VERSION = "retrieval-experiment-v2"
BM25_INDEX_VERSION = "BM25_WHITESPACE_V1"
BM25_DOCUMENT_FORMATTER_VERSION = "BM25_DOCUMENT_TITLE_SECTION_CANONICAL_V1"
EXPERIMENT_METHODS = (
    "DENSE_FILTER_ON",
    "DENSE_FILTER_OFF",
    "BM25_FILTER_ON",
    "BM25_FILTER_OFF",
)
TOP_K_VALUES = (1, 3, 5)
EXPECTED_COLLECTION = "sgk_kntt_history_gemini_v1"
EXPECTED_CORPUS_SHA256 = "a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2"
EXPECTED_ELIGIBLE_COUNT = 414


class ExperimentPreflightError(ValueError):
    """A contract or explicit-run gate failed before a provider call."""


def _json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "NOT_INSTALLED"


def _normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def tokenize_whitespace(value: str) -> list[str]:
    """Deterministic Unicode-aware whitespace/punctuation tokenization."""

    normalized = _normalize_text(value)
    return re.findall(r"\w+", normalized, flags=re.UNICODE)


def _document_text(chunk: CorpusChunk) -> str:
    return " | ".join((chunk.embeddingTitle, chunk.sectionTitle, chunk.text))


class BM25Index:
    """Small in-memory BM25 index for the fixed 414-chunk corpus."""

    def __init__(self, chunks: Sequence[CorpusChunk], *, k1: float = 1.2, b: float = 0.75) -> None:
        if k1 <= 0 or not 0 <= b <= 1:
            raise ValueError("invalid BM25 parameters")
        self.chunks = tuple(
            chunk for chunk in chunks if chunk.ragEligible and not chunk.containsPendingReview
        )
        self.k1 = k1
        self.b = b
        self._tokens = tuple(tokenize_whitespace(_document_text(chunk)) for chunk in self.chunks)
        self._lengths = tuple(len(tokens) for tokens in self._tokens)

    @property
    def corpus_count(self) -> int:
        return len(self.chunks)

    def search(
        self,
        query: str,
        *,
        grade: int | None,
        lesson_number: int | None,
        top_k: int,
    ) -> list[CorpusChunk]:
        if top_k <= 0:
            raise ValueError("top_k must be positive")
        query_terms = tokenize_whitespace(query)
        filtered = [
            (index, chunk)
            for index, chunk in enumerate(self.chunks)
            if (grade is None or chunk.grade == grade)
            and (lesson_number is None or chunk.lessonNumber == lesson_number)
        ]
        n = len(filtered)
        if not n:
            return []
        local_average_length = mean(self._lengths[index] for index, _chunk in filtered)
        local_document_frequency: Counter[str] = Counter()
        for index, _chunk in filtered:
            local_document_frequency.update(set(self._tokens[index]))
        scores: list[tuple[float, str, CorpusChunk]] = []
        for index, chunk in filtered:
            terms = self._tokens[index]
            counts = Counter(terms)
            length = len(terms)
            score = 0.0
            for term in query_terms:
                frequency = counts.get(term, 0)
                if frequency == 0:
                    continue
                df = local_document_frequency.get(term, 0)
                idf = math.log(1.0 + (n - df + 0.5) / (df + 0.5))
                denominator = frequency + self.k1 * (
                    1.0 - self.b + self.b * length / max(local_average_length, 1.0)
                )
                score += idf * frequency * (self.k1 + 1.0) / denominator
            scores.append((score, chunk.chunkId, chunk))
        scores.sort(key=lambda item: (-item[0], item[1]))
        return [item[2] for item in scores[:top_k]]


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def _p95(values: Sequence[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)]


def validate_live_cache_provenance(*, cache_hits: int, cache_misses: int, distinct_queries: int) -> str:
    if cache_hits != 0 or cache_misses != distinct_queries:
        return "INVALID_LIVE_RUN"
    return "VALID_LIVE_RUN"


def paired_bootstrap_ci(
    deltas: Sequence[float], *, iterations: int = 10_000, seed: int = 1406
) -> dict[str, Any]:
    """Paired query-level bootstrap for a valid external held-out set."""

    if iterations <= 0 or not deltas:
        raise ValueError("bootstrap requires observations and positive iterations")
    generator = random.Random(seed)
    samples = sorted(mean(generator.choice(deltas) for _ in deltas) for _ in range(iterations))
    lower = samples[max(0, math.floor(0.025 * iterations))]
    upper = samples[min(iterations - 1, math.ceil(0.975 * iterations) - 1)]
    return {
        "N": len(deltas),
        "iterations": iterations,
        "seed": seed,
        "pointEstimate": round(mean(deltas), 6),
        "confidenceInterval95": [round(lower, 6), round(upper, 6)],
    }


def _latency(values: Iterable[float | None]) -> dict[str, Any]:
    measured = [float(value) for value in values if value is not None]
    if not measured:
        return {
            "N": 0,
            "minMs": None,
            "medianMs": None,
            "p95Ms": None,
            "maxMs": None,
            "meanMs": None,
            "stddevMs": None,
        }
    return {
        "N": len(measured),
        "minMs": round(min(measured), 6),
        "medianMs": round(median(measured), 6),
        "p95Ms": round(_p95(measured) or 0.0, 6),
        "maxMs": round(max(measured), 6),
        "meanMs": round(mean(measured), 6),
        "stddevMs": round(stdev(measured), 6) if len(measured) > 1 else 0.0,
    }


def _eligible_chunks(chunks: Sequence[CorpusChunk]) -> tuple[list[CorpusChunk], int]:
    eligible = [chunk for chunk in chunks if chunk.ragEligible and not chunk.containsPendingReview]
    pending = sum(chunk.containsPendingReview for chunk in chunks)
    return eligible, pending


@dataclass(frozen=True)
class ExperimentRecord:
    query_id: str
    query: str
    category: str
    grade: int
    lesson_number: int | None
    expected_chunk_ids: list[str]
    expected_document_ids: list[str]
    expected_section_keywords: list[str]


@dataclass(frozen=True)
class Preflight:
    settings: Settings
    benchmark: list[BenchmarkRecord]
    chunks: list[CorpusChunk]
    eligible_chunks: list[CorpusChunk]
    pending_excluded_count: int
    manifest: dict[str, Any]
    benchmark_sha256: str
    held_out_status: str
    held_out_sha256: str | None
    held_out_benchmark: list[ExperimentRecord]
    configuration: dict[str, Any]
    expected_collection_metadata: dict[str, Any]
    chroma_client: Any | None = None
    collection: Any | None = None


def run_preflight(
    settings: Settings,
    *,
    benchmark_path: Path,
    held_out_path: Path,
    configuration: dict[str, Any],
    keep_client: bool = False,
) -> Preflight:
    if settings.chroma_collection_name != EXPECTED_COLLECTION:
        raise ExperimentPreflightError("production collection name contract mismatch")
    artifact_dir = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    manifest_path = artifact_dir / "embedding_manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExperimentPreflightError("embedding manifest cannot be read") from exc
    chunks = list(iter_corpus(settings.sgk_chunks_path))
    eligible, pending = _eligible_chunks(chunks)
    contract_fields = {
        "corpusSha256": manifest.get("corpusSha256"),
        "embeddingModel": settings.gemini_embedding_model,
        "embeddingDimension": settings.gemini_embedding_dimension,
        "formatterVersion": manifest.get("formatterVersion"),
        "chunkingVersion": "structure-v2",
        "distanceMetric": settings.chroma_distance_metric,
        "sourceType": "sgk-kntt-history",
    }
    if (
        manifest.get("status") != "COMPLETED"
        or manifest.get("corpusSha256") != EXPECTED_CORPUS_SHA256
        or manifest.get("eligibleRecords") != EXPECTED_ELIGIBLE_COUNT
        or len(eligible) != EXPECTED_ELIGIBLE_COUNT
        or settings.gemini_embedding_model != "gemini-embedding-2"
        or settings.gemini_embedding_dimension != 768
        or settings.chroma_distance_metric != "cosine"
    ):
        raise ExperimentPreflightError("production embedding/corpus contract mismatch")
    client = create_persistent_client(settings.chroma_persist_dir)
    collection = None
    try:
        if not collection_exists(client, settings.chroma_collection_name):
            raise ExperimentPreflightError("production collection is missing")
        collection = get_collection(client, settings.chroma_collection_name)
        validate_collection_contract(collection, contract_fields, settings.chroma_distance_metric)
        if collection.count() != EXPECTED_ELIGIBLE_COUNT:
            raise ExperimentPreflightError("production collection count contract mismatch")
    except Exception:
        close_persistent_client(client)
        raise
    if not keep_client:
        close_persistent_client(client)
        client = None
        collection = None
    try:
        benchmark = load_benchmark(benchmark_path, settings.sgk_chunks_path)
        held_out_status = "NOT_PROVIDED"
        held_out_sha256: str | None = None
        held_out_benchmark: list[ExperimentRecord] = []
        if held_out_path.is_file():
            held_out_sha256 = sha256_file(held_out_path)
            held_out_records = validate_held_out_benchmark(
                held_out_path,
                settings.sgk_chunks_path,
                [record.query for record in benchmark],
            )
            chunks_by_id = {chunk.chunkId: chunk for chunk in chunks}
            held_out_benchmark = [
                ExperimentRecord(
                    query_id=f"heldout:{record.benchmark_case_id}",
                    query=record.query,
                    category=record.category,
                    grade=record.grade,
                    lesson_number=record.lesson_number,
                    expected_chunk_ids=list(record.relevant_chunk_ids),
                    expected_document_ids=sorted(
                        {chunks_by_id[chunk_id].documentId for chunk_id in record.relevant_chunk_ids}
                    ),
                    expected_section_keywords=[],
                )
                for record in held_out_records
            ]
            held_out_status = "VALID"
    except Exception as exc:
        if client is not None:
            close_persistent_client(client)
        if isinstance(exc, ExperimentPreflightError):
            raise
        raise ExperimentPreflightError(f"benchmark validation failed: {exc}") from exc
    return Preflight(
        settings=settings,
        benchmark=benchmark,
        chunks=chunks,
        eligible_chunks=eligible,
        pending_excluded_count=pending,
        manifest=manifest,
        benchmark_sha256=sha256_file(benchmark_path),
        held_out_status=held_out_status,
        held_out_sha256=held_out_sha256,
        held_out_benchmark=held_out_benchmark,
        configuration=configuration,
        expected_collection_metadata=contract_fields,
        chroma_client=client,
        collection=collection,
    )


def _method_filter(record: BenchmarkRecord | ExperimentRecord, method: str) -> tuple[int | None, int | None]:
    if method.endswith("FILTER_ON"):
        return record.grade, record.lesson_number
    return None, None


def _result_row(
    record: BenchmarkRecord | ExperimentRecord,
    method: str,
    chunks: Sequence[CorpusChunk],
    *,
    benchmark_role: str = "DEVELOPMENT_AUTHORED",
    latency: dict[str, float | None],
    error: str | None = None,
    contract: tuple[bool | None, bool | None, bool | None] = (None, None, None),
) -> dict[str, Any]:
    chunk_ids = [chunk.chunkId for chunk in chunks]
    return {
        "queryId": record.query_id,
        "benchmarkRole": benchmark_role,
        "method": method,
        "grade": record.grade,
        "category": record.category,
        "expectedChunkIds": record.expected_chunk_ids,
        "expectedDocumentIds": record.expected_document_ids,
        "resultChunkIds": chunk_ids,
        "resultDocumentIds": [chunk.documentId for chunk in chunks],
        "resultLessons": [chunk.lessonNumber for chunk in chunks],
        "resultSections": [chunk.sectionTitle for chunk in chunks],
        "distances": [None for _ in chunks],
        "requestedTopK": 5,
        "returnedResultCount": len(chunks),
        "effectiveK": min(5, len(chunks)),
        "eligiblePoolSizeBeforeTopK": None,
        "effectivePoolSizeAfterFilters": None,
        "filterCompliant": True,
        "pendingReviewLeakage": any(chunk.containsPendingReview for chunk in chunks),
        "duplicateResults": len(chunk_ids) != len(set(chunk_ids)),
        "latencyMs": latency.get("total"),
        "queryEmbeddingLatencyMs": latency.get("embedding"),
        "chromaQueryLatencyMs": latency.get("chroma"),
        "bm25ScoringLatencyMs": latency.get("bm25"),
        "postProcessingLatencyMs": latency.get("postProcessing"),
        "embeddingContractMatched": contract[0],
        "collectionMetadataMatched": contract[1],
        "collectionDistanceMetricMatched": contract[2],
        "error": error,
    }


def _apply_pool_and_filter_diagnostics(
    row: dict[str, Any],
    record: BenchmarkRecord | ExperimentRecord,
    all_chunks: Sequence[CorpusChunk],
    grade: int | None,
    lesson: int | None,
) -> None:
    eligible, _ = _eligible_chunks(all_chunks)
    filtered = [
        chunk
        for chunk in eligible
        if (grade is None or chunk.grade == grade) and (lesson is None or chunk.lessonNumber == lesson)
    ]
    row["eligiblePoolSizeBeforeTopK"] = len(eligible)
    row["effectivePoolSizeAfterFilters"] = len(filtered)
    row["filterCompliant"] = all(
        (grade is None or chunk.grade == grade) and (lesson is None or chunk.lessonNumber == lesson)
        for chunk_id in row["resultChunkIds"]
        for chunk in all_chunks
        if chunk.chunkId == chunk_id
    )
    if record.expected_section_keywords:
        section = _normalize_text(" ".join(row["resultSections"][:5]))
        row["sectionKeywordCoverageAtK"] = sum(
            _normalize_text(keyword) in section for keyword in record.expected_section_keywords
        ) / len(record.expected_section_keywords)
    else:
        row["sectionKeywordCoverageAtK"] = None


def _metric_for_row(
    record: BenchmarkRecord | ExperimentRecord, row: dict[str, Any], k: int
) -> tuple[float, float, float]:
    relevant = set(record.expected_chunk_ids)
    ranked = row["resultChunkIds"]
    if row["error"] is not None:
        return 0.0, 0.0, 0.0
    return (
        calculate_recall_at_k(relevant, ranked, k),
        calculate_precision_at_k(relevant, ranked, k),
        calculate_reciprocal_rank(relevant, ranked),
    )


def _method_report(
    benchmark: Sequence[BenchmarkRecord | ExperimentRecord], rows: Sequence[dict[str, Any]], method: str
) -> dict[str, Any]:
    by_id = {row["queryId"]: row for row in rows if row["method"] == method}
    failed = sum(row["error"] is not None for row in by_id.values())
    completed = len(benchmark) - failed
    effectiveness: dict[str, Any] = {}
    for k in TOP_K_VALUES:
        attempted_values = [_metric_for_row(record, by_id[record.query_id], k) for record in benchmark]
        completed_values = [
            _metric_for_row(record, by_id[record.query_id], k)
            for record in benchmark
            if by_id[record.query_id]["error"] is None
        ]

        def avg(values: Sequence[tuple[float, float, float]], index: int) -> float | None:
            return round(mean(value[index] for value in values), 6) if values else None

        effectiveness[str(k)] = {
            "attempted": {
                "N": len(attempted_values),
                "Recall": avg(attempted_values, 0),
                "Precision": avg(attempted_values, 1),
                "Hit": round(mean(float(value[0] > 0) for value in attempted_values), 6)
                if attempted_values
                else None,
                "MRR": avg(attempted_values, 2),
            },
            "completed": {
                "N": len(completed_values),
                "Recall": avg(completed_values, 0),
                "Precision": avg(completed_values, 1),
                "Hit": round(mean(float(value[0] > 0) for value in completed_values), 6)
                if completed_values
                else None,
                "MRR": avg(completed_values, 2),
            },
        }
    mode_rows = list(by_id.values())
    pools = [row["effectivePoolSizeAfterFilters"] for row in mode_rows]
    returned = [row["returnedResultCount"] for row in mode_rows]
    diagnostics = {
        "pool": {
            "min": min(pools) if pools else None,
            "median": median(pools) if pools else None,
            "mean": round(mean(pools), 6) if pools else None,
            "p95": _p95(pools) if pools else None,
            "max": max(pools) if pools else None,
            "poolLe3": sum(value <= 3 for value in pools),
            "poolLe5": sum(value <= 5 for value in pools),
        },
        "returnedCount": {
            "min": min(returned) if returned else None,
            "median": median(returned) if returned else None,
            "mean": round(mean(returned), 6) if returned else None,
            "p95": _p95(returned) if returned else None,
            "max": max(returned) if returned else None,
        },
        "effectiveK": {
            "min": min(returned) if returned else None,
            "median": median(returned) if returned else None,
            "mean": round(mean(returned), 6) if returned else None,
            "p95": _p95(returned) if returned else None,
            "max": max(returned) if returned else None,
        },
        "emptyResultRate": round(sum(not value for value in returned) / len(returned), 6)
        if returned
        else None,
        "documentComplianceAt5": round(
            mean(
                float(
                    bool(
                        set(record.expected_document_ids)
                        & set(by_id[record.query_id]["resultDocumentIds"][:5])
                    )
                )
                for record in benchmark
                if by_id[record.query_id]["error"] is None
            ),
            6,
        )
        if completed
        else None,
        "lessonComplianceAt5": round(
            mean(
                float(record.lesson_number in by_id[record.query_id]["resultLessons"][:5])
                for record in benchmark
                if by_id[record.query_id]["error"] is None
            ),
            6,
        )
        if completed
        else None,
        "sectionKeywordCoverageAt5": round(
            mean(
                by_id[record.query_id]["sectionKeywordCoverageAtK"]
                for record in benchmark
                if by_id[record.query_id]["error"] is None
                and by_id[record.query_id]["sectionKeywordCoverageAtK"] is not None
            ),
            6,
        )
        if any(row["sectionKeywordCoverageAtK"] is not None for row in mode_rows if row["error"] is None)
        else None,
        "pendingReviewLeakage": sum(row["pendingReviewLeakage"] for row in mode_rows),
        "filterViolations": sum(not row["filterCompliant"] for row in mode_rows if row["error"] is None),
        "duplicateResultCount": sum(row["duplicateResults"] for row in mode_rows if row["error"] is None),
        "emptyResultCount": sum(not row["resultChunkIds"] for row in mode_rows if row["error"] is None),
    }
    latency = {
        "queryEmbeddingProvider": _latency(row["queryEmbeddingLatencyMs"] for row in mode_rows),
        "chromaQuery": _latency(row["chromaQueryLatencyMs"] for row in mode_rows),
        "bm25Scoring": _latency(row["bm25ScoringLatencyMs"] for row in mode_rows),
        "postProcessing": _latency(row["postProcessingLatencyMs"] for row in mode_rows),
        "composedTotal": _latency(row["latencyMs"] for row in mode_rows),
    }
    contracts = [row for row in mode_rows if row["error"] is None]
    return {
        "method": method,
        "attempted": len(benchmark),
        "completed": completed,
        "failed": failed,
        "effectiveness": effectiveness,
        "diagnostics": diagnostics,
        "latency": latency,
        "contractChecks": {
            "embedding": all(row["embeddingContractMatched"] is not False for row in contracts)
            if contracts
            else None,
            "collection": all(row["collectionMetadataMatched"] is not False for row in contracts)
            if contracts
            else None,
            "distance": all(row["collectionDistanceMetricMatched"] is not False for row in contracts)
            if contracts
            else None,
        },
    }


def _paired_comparison(
    benchmark: Sequence[BenchmarkRecord | ExperimentRecord],
    rows: Sequence[dict[str, Any]],
    *,
    bootstrap: bool = False,
) -> list[dict[str, Any]]:
    reports: list[dict[str, Any]] = []
    by_method = {
        method: {row["queryId"]: row for row in rows if row["method"] == method}
        for method in EXPERIMENT_METHODS
    }
    pairs = (
        ("DENSE_FILTER_ON", "DENSE_FILTER_OFF"),
        ("BM25_FILTER_ON", "BM25_FILTER_OFF"),
        ("DENSE_FILTER_ON", "BM25_FILTER_ON"),
        ("DENSE_FILTER_OFF", "BM25_FILTER_OFF"),
    )

    def append_metric(
        left: str, right: str, metric: str, left_values: list[float], right_values: list[float]
    ) -> None:
        report = {
            "left": left,
            "right": right,
            "metric": metric,
            "commonN": len(left_values),
            "leftMean": round(mean(left_values), 6) if left_values else None,
            "rightMean": round(mean(right_values), 6) if right_values else None,
            "delta": round(mean(left_values) - mean(right_values), 6) if left_values else None,
            "wins": sum(a > b for a, b in zip(left_values, right_values, strict=False)),
            "ties": sum(a == b for a, b in zip(left_values, right_values, strict=False)),
            "losses": sum(a < b for a, b in zip(left_values, right_values, strict=False)),
        }
        if bootstrap and left_values:
            report["pairedBootstrap95"] = paired_bootstrap_ci(
                [a - b for a, b in zip(left_values, right_values, strict=False)]
            )
            if len(left_values) < 30:
                report["statisticalLimitation"] = "SMALL_SAMPLE_INTERPRET_CAUTIOUSLY"
        reports.append(report)

    for left, right in pairs:
        common = [
            record
            for record in benchmark
            if record.query_id in by_method[left]
            and record.query_id in by_method[right]
            and by_method[left][record.query_id]["error"] is None
            and by_method[right][record.query_id]["error"] is None
        ]
        for k in TOP_K_VALUES:
            left_metrics = [_metric_for_row(record, by_method[left][record.query_id], k) for record in common]
            right_metrics = [
                _metric_for_row(record, by_method[right][record.query_id], k) for record in common
            ]
            append_metric(
                left,
                right,
                f"Recall@{k}",
                [value[0] for value in left_metrics],
                [value[0] for value in right_metrics],
            )
            append_metric(
                left,
                right,
                f"Precision@{k}",
                [value[1] for value in left_metrics],
                [value[1] for value in right_metrics],
            )
        left_mrr = [_metric_for_row(record, by_method[left][record.query_id], 5)[2] for record in common]
        right_mrr = [_metric_for_row(record, by_method[right][record.query_id], 5)[2] for record in common]
        append_metric(left, right, "MRR", left_mrr, right_mrr)
    return reports


def _write_checksums(output_dir: Path) -> None:
    entries = []
    for path in sorted(output_dir.iterdir()):
        if path.name == "checksums.sha256" or not path.is_file():
            continue
        entries.append(f"{sha256_file(path)}  {path.name}")
    _atomic_write(output_dir / "checksums.sha256", "\n".join(entries) + "\n")


def _manifest(
    preflight: Preflight, *, run_id: str, allow_provider_call: bool, no_cache: bool
) -> dict[str, Any]:
    config = dict(preflight.configuration)
    config["configSha256"] = _json_hash(config)
    return {
        "schemaVersion": EXPERIMENT_SCHEMA_VERSION,
        "runId": run_id,
        "benchmarkRole": "DEVELOPMENT_AUTHORED",
        "authoringProtocol": "ENGINEERING_AUTHORED_FROM_CANONICAL_EVIDENCE",
        "independentGroundTruth": False,
        "methods": list(EXPERIMENT_METHODS),
        "topK": list(TOP_K_VALUES),
        "candidateMultiplier": preflight.configuration.get("candidateMultiplier"),
        "allowProviderCall": allow_provider_call,
        "cachePolicy": "NO_CACHE" if no_cache else "PROVIDER_CALL_DISABLED",
        "randomSeed": 1406,
        "queryEmbeddingSharedAcrossDenseStrata": True,
        "bm25Version": BM25_INDEX_VERSION,
        "bm25DocumentFormatterVersion": BM25_DOCUMENT_FORMATTER_VERSION,
        "bm25DocumentFormatter": "embeddingTitle + sectionTitle + canonical chunk text",
        "bm25Limitation": (
            "Simple deterministic Unicode whitespace/punctuation baseline for "
            "Vietnamese; not semantic search."
        ),
        "configuration": config,
        "identity": {
            "branch": subprocess.check_output(
                ["git", "branch", "--show-current"], cwd=SERVICE_ROOT.parent, text=True
            ).strip(),
            "commit": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=SERVICE_ROOT.parent, text=True
            ).strip(),
            "workingTreeState": subprocess.check_output(
                ["git", "status", "--short"], cwd=SERVICE_ROOT.parent, text=True
            ).splitlines(),
            "workingTreeAiServiceState": subprocess.check_output(
                ["git", "status", "--short", "--", "ai-service"],
                cwd=SERVICE_ROOT.parent,
                text=True,
            ).splitlines(),
            "corpusSha256": preflight.manifest.get("corpusSha256"),
            "eligibleChunkCount": len(preflight.eligible_chunks),
            "pendingReviewExcludedCount": preflight.pending_excluded_count,
            "embeddingModel": preflight.settings.gemini_embedding_model,
            "embeddingDimension": preflight.settings.gemini_embedding_dimension,
            "distanceMetric": preflight.settings.chroma_distance_metric,
            "collectionName": preflight.settings.chroma_collection_name,
            "queryFormatterVersion": QUERY_FORMATTER_VERSION,
            "benchmarkSha256": preflight.benchmark_sha256,
            "heldOutSha256": preflight.held_out_sha256,
            "heldOutStatus": preflight.held_out_status,
            "pythonVersion": platform.python_version(),
            "packageVersions": {
                package: _package_version(package)
                for package in ("fastapi", "pydantic", "chromadb", "google-genai")
            },
        },
    }


def run_experiment(
    settings: Settings,
    *,
    output_root: Path,
    benchmark_path: Path,
    held_out_path: Path,
    allow_provider_call: bool,
    no_cache: bool,
    methods: Sequence[str] = EXPERIMENT_METHODS,
    top_k: Sequence[int] = TOP_K_VALUES,
    service_factory: Callable[[Settings], Any] = create_retrieval_service,
) -> dict[str, Any]:
    if allow_provider_call and not no_cache:
        raise ExperimentPreflightError("--no-cache is required for a live run")
    if tuple(methods) != EXPERIMENT_METHODS:
        raise ExperimentPreflightError("Goal 14F requires all four method strata")
    if tuple(top_k) != TOP_K_VALUES:
        raise ExperimentPreflightError("Goal 14F requires topK 1,3,5")
    configuration = {
        "methods": list(methods),
        "topK": list(top_k),
        "candidateMultiplier": 4,
        "allowProviderCall": allow_provider_call,
        "cachePolicy": "NO_CACHE" if no_cache else "CACHE_FORBIDDEN",
        "randomSeed": 1406,
        "deadlineSeconds": settings.ai_request_deadline_seconds,
    }
    startup_started = time.perf_counter()
    preflight = run_preflight(
        settings,
        benchmark_path=benchmark_path,
        held_out_path=held_out_path,
        configuration=configuration,
        keep_client=allow_provider_call,
    )
    startup_latency_ms = (time.perf_counter() - startup_started) * 1000
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = output_root / run_id
    suffix = 1
    while output_dir.exists():
        output_dir = output_root / f"{run_id}-{suffix}"
        suffix += 1
    output_dir.mkdir(parents=True)
    manifest = _manifest(
        preflight, run_id=output_dir.name, allow_provider_call=allow_provider_call, no_cache=no_cache
    )
    _atomic_write(
        output_dir / "experiment-manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    experiment_records: list[tuple[str, BenchmarkRecord | ExperimentRecord]] = [
        ("DEVELOPMENT_AUTHORED", record) for record in preflight.benchmark
    ] + [("HELD_OUT_EXTERNAL", record) for record in preflight.held_out_benchmark]
    planned_calls = len({record.query for _role, record in experiment_records})
    preflight_payload = {
        "status": "PASS",
        "branch": manifest["identity"]["branch"],
        "commit": manifest["identity"]["commit"],
        "workingTreeAiServiceState": manifest["identity"]["workingTreeAiServiceState"],
        "providerCallAllowed": allow_provider_call,
        "noCache": no_cache,
        "plannedProviderCalls": planned_calls,
        "estimatedMaximumCallCount": planned_calls,
        "distinctQueryCount": planned_calls,
        "benchmarkCount": len(preflight.benchmark),
        "heldOutBenchmarkCount": len(preflight.held_out_benchmark),
        "embeddingModel": settings.gemini_embedding_model,
        "embeddingDimension": settings.gemini_embedding_dimension,
        "deadlineSeconds": settings.ai_request_deadline_seconds,
        "eligibleChunkCount": len(preflight.eligible_chunks),
        "heldOutStatus": preflight.held_out_status,
        "startupLatencyMs": startup_latency_ms,
        "outputDirectory": str(output_dir),
    }
    _atomic_write(
        output_dir / "preflight-report.json",
        json.dumps(preflight_payload, ensure_ascii=False, indent=2) + "\n",
    )
    if not allow_provider_call:
        preflight_payload["runStatus"] = "PREFLIGHT_ONLY_PROVIDER_CALL_NOT_ALLOWED"
        _atomic_write(
            output_dir / "preflight-report.json",
            json.dumps(preflight_payload, ensure_ascii=False, indent=2) + "\n",
        )
        _write_checksums(output_dir)
        return {
            "status": preflight_payload["runStatus"],
            "outputDirectory": str(output_dir),
            "preflight": preflight_payload,
        }
    print(json.dumps({"providerPreflight": preflight_payload}, ensure_ascii=False, indent=2))
    bm25 = BM25Index(preflight.chunks)
    experiment_settings = settings.model_copy(
        update={"rag_candidate_multiplier": int(configuration["candidateMultiplier"])}
    )
    service_kwargs = {
        "client": preflight.chroma_client,
        "collection": preflight.collection,
        "collection_metadata": preflight.expected_collection_metadata,
    }
    try:
        service_signature = inspect.signature(service_factory)
        accepts_runtime_client = any(
            parameter.kind == inspect.Parameter.VAR_KEYWORD
            or name in {"client", "collection", "collection_metadata"}
            for name, parameter in service_signature.parameters.items()
        )
    except (TypeError, ValueError):
        accepts_runtime_client = True
    service = (
        service_factory(experiment_settings, **service_kwargs)
        if accepts_runtime_client
        else service_factory(experiment_settings)
    )
    rows: list[dict[str, Any]] = []
    vectors: dict[str, list[float]] = {}
    embedding_latencies: dict[str, float] = {}
    provider_calls = 0
    provider_failures = 0
    cache_hits = 0
    cache_misses = 0
    embedding_errors: dict[str, tuple[str, float]] = {}
    provider = service.provider
    warmup: dict[str, Any] = {
        "policy": "ONE_SHARED_VECTOR_CHROMA_AND_BM25_DISCARDED",
        "completed": False,
        "chromaCompleted": False,
        "bm25Completed": False,
        "chromaMs": None,
        "bm25Ms": None,
    }
    try:
        for benchmark_role, record in experiment_records:
            embedding_error: str | None = None
            if record.query in vectors:
                embedding_ms = embedding_latencies[record.query]
            elif record.query in embedding_errors:
                embedding_error, embedding_ms = embedding_errors[record.query]
            else:
                cache_misses += 1
                embedding_started = time.perf_counter()
                try:
                    embed_kwargs = {}
                    if "timeout_seconds" in inspect.signature(provider.embed_query).parameters:
                        embed_kwargs["timeout_seconds"] = settings.gemini_embedding_timeout_seconds
                    vector = provider.embed_query(record.query, **embed_kwargs)
                    vectors[record.query] = vector
                    provider_calls += 1
                    embedding_ms = (time.perf_counter() - embedding_started) * 1000
                    embedding_latencies[record.query] = embedding_ms
                except Exception as exc:
                    provider_calls += 1
                    provider_failures += 1
                    embedding_ms = (time.perf_counter() - embedding_started) * 1000
                    embedding_error = type(exc).__name__
                    embedding_errors[record.query] = (embedding_error, embedding_ms)
            chunks_by_id = {chunk.chunkId: chunk for chunk in preflight.chunks}
            if not warmup["bm25Completed"]:
                try:
                    warm_started = time.perf_counter()
                    bm25.search(record.query, grade=None, lesson_number=None, top_k=1)
                    warmup["bm25Ms"] = (time.perf_counter() - warm_started) * 1000
                    warmup["bm25Completed"] = True
                except Exception as exc:
                    warmup["bm25Error"] = f"{type(exc).__name__}: {str(exc)[:160]}".strip()
            if embedding_error is None and not warmup["chromaCompleted"]:
                try:
                    warm_started = time.perf_counter()
                    service.retrieve(
                        RetrievalRequest(query=record.query, topK=1),
                        query_vector=vectors[record.query],
                        evaluation_trace=RetrievalEvaluationTrace(),
                    )
                    warmup["chromaMs"] = (time.perf_counter() - warm_started) * 1000
                    warmup["chromaCompleted"] = True
                except Exception as exc:
                    warmup["chromaError"] = f"{type(exc).__name__}: {str(exc)[:160]}".strip()
            warmup["completed"] = bool(warmup["bm25Completed"] and warmup["chromaCompleted"])
            for method in methods:
                grade, lesson = _method_filter(record, method)
                started = time.perf_counter()
                error = None
                contract = (None, None, None)
                selected: list[CorpusChunk] = []
                latency: dict[str, float | None] = {
                    "embedding": embedding_ms if method.startswith("DENSE") else None
                }
                if method.startswith("DENSE") and embedding_error is not None:
                    row = _result_row(
                        record,
                        method,
                        [],
                        benchmark_role=benchmark_role,
                        latency={"total": embedding_ms, "embedding": embedding_ms},
                        error=embedding_error,
                    )
                    _apply_pool_and_filter_diagnostics(row, record, preflight.chunks, grade, lesson)
                    rows.append(row)
                    continue
                try:
                    if method.startswith("DENSE"):
                        trace = RetrievalEvaluationTrace()
                        response = service.retrieve(
                            RetrievalRequest(query=record.query, grade=grade, lessonNumber=lesson, topK=5),
                            query_vector=vectors[record.query],
                            evaluation_trace=trace,
                        )
                        selected = [chunks_by_id[result.chunk_id] for result in response.results]
                        latency["chroma"] = trace.chroma_query_latency_ms
                        latency["postProcessing"] = trace.post_processing_latency_ms
                        contract = (
                            trace.embedding_contract_matched,
                            trace.collection_metadata_matched,
                            trace.collection_distance_metric_matched,
                        )
                    else:
                        bm25_started = time.perf_counter()
                        selected = bm25.search(record.query, grade=grade, lesson_number=lesson, top_k=5)
                        latency["bm25"] = (time.perf_counter() - bm25_started) * 1000
                except Exception as exc:
                    error = f"{type(exc).__name__}: {str(exc)[:160]}".strip()
                retrieval_ms = (time.perf_counter() - started) * 1000
                latency["total"] = embedding_ms + retrieval_ms if method.startswith("DENSE") else retrieval_ms
                row = _result_row(
                    record,
                    method,
                    selected,
                    benchmark_role=benchmark_role,
                    latency=latency,
                    error=error,
                    contract=contract,
                )
                _apply_pool_and_filter_diagnostics(row, record, preflight.chunks, grade, lesson)
                rows.append(row)
    finally:
        service.close()
        if preflight.chroma_client is not None:
            close_persistent_client(preflight.chroma_client)
    development_rows = [row for row in rows if row["benchmarkRole"] == "DEVELOPMENT_AUTHORED"]
    held_out_rows = [row for row in rows if row["benchmarkRole"] == "HELD_OUT_EXTERNAL"]
    method_reports = {
        method: _method_report(preflight.benchmark, development_rows, method) for method in methods
    }
    held_out_method_reports = (
        {method: _method_report(preflight.held_out_benchmark, held_out_rows, method) for method in methods}
        if preflight.held_out_benchmark
        else {}
    )
    cache_provenance = validate_live_cache_provenance(
        cache_hits=cache_hits,
        cache_misses=cache_misses,
        distinct_queries=planned_calls,
    )
    if cache_provenance != "VALID_LIVE_RUN" or provider_calls != planned_calls:
        run_status = "INVALID_LIVE_RUN"
    elif provider_failures or any(row["error"] for row in rows):
        run_status = "COMPLETED_WITH_ERRORS"
    else:
        run_status = "COMPLETED"
    held_out_executed = bool(preflight.held_out_benchmark)
    final_held_out_status = "VALID_AND_RUN" if held_out_executed else preflight.held_out_status
    aggregate = {
        "schemaVersion": EXPERIMENT_SCHEMA_VERSION,
        "status": run_status,
        "benchmarkRole": "DEVELOPMENT_AUTHORED",
        "heldOutStatus": final_held_out_status,
        "providerCallCount": provider_calls,
        "plannedProviderCalls": planned_calls,
        "providerFailures": provider_failures,
        "cacheHits": cache_hits,
        "cacheMisses": cache_misses,
        "cacheMode": "LIVE",
        "cacheProvenance": cache_provenance,
        "queryEmbeddingSharedAcrossDenseStrata": True,
        "embeddingLatencyAttribution": (
            "ONE_SHARED_PROVIDER_CALL_PER_DISTINCT_QUERY; "
            "DENSE_TOTALS_ARE_HYPOTHETICAL_COMPOSITIONS"
        ),
        "methods": method_reports,
        "pairedComparison": _paired_comparison(preflight.benchmark, development_rows),
        "statisticalPolicy": {
            "development": "DESCRIPTIVE_ONLY_NO_GENERALIZATION_CI",
            "heldOut": "PAIRED_BOOTSTRAP_95_FIXED_SEED_IF_VALID_AND_RUN",
            "bootstrapSeed": 1406,
            "bootstrapIterations": 10000,
            "heldOutExecuted": held_out_executed,
        },
        "claimGuard": {
            "supports": [
                "engineering comparison under authored benchmark",
                "filter ablation",
                "baseline comparison",
                "local runtime measurement",
            ],
            "doesNotSupport": [
                "independent generalization",
                "generated-question factual correctness",
                "teacher acceptance",
                "production SLO",
            ],
        },
    }
    _atomic_write(
        output_dir / "per-query-results.jsonl",
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    )
    _atomic_write(
        output_dir / "aggregate-report.json", json.dumps(aggregate, ensure_ascii=False, indent=2) + "\n"
    )
    markdown = (
        "# Retrieval Experiment v2\n\n"
        "## What this experiment supports\n\n"
        "- Engineering comparison under the development-authored benchmark.\n"
        "- Dense filter ablation and BM25 baseline comparison.\n"
        "- Local stage latency measurement.\n\n"
        "## What this experiment does not support\n\n"
        "- Independent generalization, factual correctness, teacher acceptance "
        "or production SLO.\n\n"
    )
    markdown += (
        f"- Status: `{aggregate['status']}`\n"
        f"- Cache: `LIVE`, hits={aggregate['cacheHits']}, "
        f"misses={aggregate['cacheMisses']}\n"
        f"- Provider calls: {provider_calls}/{aggregate['plannedProviderCalls']}\n"
        f"- Held-out: `{final_held_out_status}`\n\n"
    )
    if not held_out_executed:
        markdown += "Held-out experiment: **NOT RUN — external data not provided**.\n\n"
    for method, report in method_reports.items():
        markdown += (
            f"## {method}\n\n"
            f"- Attempted/completed/failed: {report['attempted']}/"
            f"{report['completed']}/{report['failed']}\n"
            "- Recall@1/3/5: "
            + ", ".join(str(report["effectiveness"][str(k)]["attempted"]["Recall"]) for k in TOP_K_VALUES)
            + "\n- Precision@1/3/5: "
            + ", ".join(str(report["effectiveness"][str(k)]["attempted"]["Precision"]) for k in TOP_K_VALUES)
            + f"\n- MRR: {report['effectiveness']['5']['attempted']['MRR']}\n- Latency: "
            + json.dumps(report["latency"], ensure_ascii=False)
            + "\n\n"
        )
    _atomic_write(output_dir / "aggregate-report.md", markdown)
    with (output_dir / "method-comparison.csv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "left",
                "right",
                "metric",
                "commonN",
                "leftMean",
                "rightMean",
                "delta",
                "wins",
                "ties",
                "losses",
            ],
        )
        writer.writeheader()
        writer.writerows(aggregate["pairedComparison"])
    if held_out_executed:
        held_out_comparison = _paired_comparison(
            preflight.held_out_benchmark,
            held_out_rows,
            bootstrap=True,
        )
        held_out_failed = any(row["error"] for row in held_out_rows)
        held_out_aggregate = {
            "schemaVersion": EXPERIMENT_SCHEMA_VERSION,
            "status": "COMPLETED_WITH_ERRORS" if held_out_failed else "COMPLETED",
            "benchmarkRole": "HELD_OUT_EXTERNAL",
            "heldOutStatus": "VALID_AND_RUN",
            "benchmarkCount": len(preflight.held_out_benchmark),
            "methods": held_out_method_reports,
            "pairedComparison": held_out_comparison,
            "statisticalPolicy": {
                "method": "PAIRED_QUERY_LEVEL_BOOTSTRAP_95",
                "seed": 1406,
                "iterations": 10000,
                "smallSampleLimitationThreshold": 30,
            },
            "claimGuard": {
                "supports": ["retrieval effectiveness on this externally authored held-out sample"],
                "doesNotSupport": [
                    "generated-question factual correctness",
                    "teacher acceptance",
                    "production SLO",
                ],
            },
        }
        _atomic_write(
            output_dir / "held-out-validation-report.json",
            json.dumps(
                {
                    "status": "VALID_AND_RUN",
                    "recordCount": len(preflight.held_out_benchmark),
                    "fileSha256": preflight.held_out_sha256,
                    "queryAuthorDidNotViewChunks": True,
                    "distinctAuthorReviewerRoles": True,
                    "developmentQueryOverlap": 0,
                    "relevantChunksProductionEligible": True,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
        )
        _atomic_write(
            output_dir / "held-out-aggregate-report.json",
            json.dumps(held_out_aggregate, ensure_ascii=False, indent=2) + "\n",
        )
        held_out_fields = [
            "left",
            "right",
            "metric",
            "commonN",
            "leftMean",
            "rightMean",
            "delta",
            "wins",
            "ties",
            "losses",
            "pairedBootstrap95",
            "statisticalLimitation",
        ]
        with (output_dir / "held-out-method-comparison.csv").open(
            "w", encoding="utf-8", newline=""
        ) as output:
            writer = csv.DictWriter(output, fieldnames=held_out_fields)
            writer.writeheader()
            writer.writerows(held_out_comparison)
    latency_report = {
        "publicationStatus": "PUBLISHED"
        if cache_provenance == "VALID_LIVE_RUN"
        else "SUPPRESSED_INVALID_LIVE_RUN",
        "queryEmbeddingProviderShared": _latency(embedding_latencies.values()),
        "denseTotalLatencySemantics": (
            "Hypothetical composition of the one shared query-embedding call plus "
            "each dense stratum's retrieval stages."
        ),
        "runTiming": {
            "startupLatencyMs": startup_latency_ms,
            "warmup": warmup,
            "firstMeasuredComposedMs": {
                method: next(row["latencyMs"] for row in rows if row["method"] == method)
                for method in methods
            },
        },
        "methods": {method: report["latency"] for method, report in method_reports.items()},
    }
    if cache_provenance != "VALID_LIVE_RUN":
        latency_report = {
            "publicationStatus": "SUPPRESSED_INVALID_LIVE_RUN",
            "reason": "Live cache provenance gate failed; latency samples are intentionally not published.",
        }
    _atomic_write(
        output_dir / "latency-report.json", json.dumps(latency_report, ensure_ascii=False, indent=2) + "\n"
    )
    _atomic_write(
        output_dir / "run.log",
        f"runId={output_dir.name}\n"
        f"status={aggregate['status']}\n"
        f"providerCalls={provider_calls}\n"
        f"cacheHits={cache_hits}\n"
        f"cacheMisses={aggregate['cacheMisses']}\n",
    )
    _write_checksums(output_dir)
    return {"status": aggregate["status"], "outputDirectory": str(output_dir), "aggregate": aggregate}
