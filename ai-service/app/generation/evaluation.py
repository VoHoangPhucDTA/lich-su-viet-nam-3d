"""Generation evaluation cache identity and metric helpers."""

import hashlib
import json
import os
from pathlib import Path
from statistics import mean, median
from typing import Any

from pydantic import ValidationError

from app.generation.models import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    GenerationRequest,
    GenerationResponse,
    GenerationSource,
)
from app.retrieval.models import RetrievalResponse, RetrievalResult

EVALUATION_REPORT_VERSION = "generation-evaluation-v2"
DEFAULT_EXCERPT_LENGTH = 600


class GenerationCache:
    def __init__(self, root: Path) -> None:
        self.root = root

    @staticmethod
    def identity(
        request: GenerationRequest,
        retrieval: RetrievalResponse,
        *,
        model: str,
        temperature: float,
        max_output_tokens: int = 8192,
        repair_attempts: int = 1,
        provider_mode: str = "production",
        prompt_version: str = PROMPT_VERSION,
        schema_version: str = SCHEMA_VERSION,
    ) -> str:
        request_value = request.model_dump(by_alias=True, mode="json")
        style_hash = hashlib.sha256(
            json.dumps(
                request_value.get("styleExamples", []),
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        fact_context_hash = hashlib.sha256(
            retrieval.fact_context.model_dump_json(by_alias=True).encode("utf-8")
        ).hexdigest()
        payload = {
            "cacheIdentityVersion": "generation-cache-v2",
            "requestHash": hashlib.sha256(
                json.dumps(request_value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
                    "utf-8"
                )
            ).hexdigest(),
            "sources": [
                {"chunkId": item.chunk_id, "chunkHash": item.chunk_hash} for item in retrieval.results
            ],
            "factContextHash": fact_context_hash,
            "model": model,
            "promptVersion": prompt_version,
            "schemaVersion": schema_version,
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
            "repairAttempts": repair_attempts,
            "providerMode": provider_mode,
            "styleHash": style_hash,
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    def get(self, key: str) -> GenerationResponse | None:
        path = self.root / f"{key}.json"
        if not path.is_file():
            return None
        try:
            return GenerationResponse.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return None

    def set(self, key: str, response: GenerationResponse) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{key}.json"
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            output.write(response.model_dump_json(by_alias=True, indent=2))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)


def latency_metrics(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    if not ordered:
        return {"averageLatencyMs": 0.0, "p50LatencyMs": 0.0, "p95LatencyMs": 0.0}
    p95_index = max(0, int(len(ordered) * 0.95 + 0.999999) - 1)
    return {
        "averageLatencyMs": round(mean(ordered), 3),
        "p50LatencyMs": round(median(ordered), 3),
        "p95LatencyMs": round(ordered[p95_index], 3),
    }


def classify_cache_mode(cache_hits: int, cache_misses: int) -> str:
    if cache_hits < 0 or cache_misses < 0:
        raise ValueError("cache counters must not be negative")
    if cache_hits and cache_misses:
        return "MIXED"
    if cache_misses:
        return "LIVE"
    return "CACHE_REPLAY"


def classify_live_latency_status(cache_misses: int, provider_mode: str) -> str:
    if cache_misses < 0:
        raise ValueError("cache miss count must not be negative")
    return "MEASURED" if cache_misses and provider_mode == "production" else "NOT_MEASURED"


def calculate_repair_metrics(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    attempt_count = sum(int(item.get("repairAttemptCount", 0)) for item in case_results)
    success_count = sum(int(item.get("repairSuccessCount", 0)) for item in case_results)
    failure_count = sum(int(item.get("repairFailureCount", 0)) for item in case_results)
    attempted_cases = sum(int(item.get("repairAttemptCount", 0)) > 0 for item in case_results)
    return {
        "repairAttemptCount": attempt_count,
        "repairSuccessCount": success_count,
        "repairFailureCount": failure_count,
        "repairAttemptRate": (round(attempted_cases / len(case_results), 6) if case_results else 0.0),
        "repairSuccessRate": (round(success_count / attempt_count, 6) if attempt_count else None),
    }


def _issue_codes(item: dict[str, Any]) -> set[str]:
    return {
        str(issue.get("code"))
        for issue in item.get("validationIssues", [])
        if isinstance(issue, dict) and issue.get("code")
    }


def calculate_duplicate_metrics(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    within_count = sum("DUPLICATE_WITHIN_BATCH" in _issue_codes(item) for item in case_results)
    style_count = sum("DUPLICATE_STYLE_EXAMPLE" in _issue_codes(item) for item in case_results)
    denominator = len(case_results)
    return {
        "withinBatchDuplicateCount": within_count,
        "withinBatchDuplicateRate": (round(within_count / denominator, 6) if denominator else 0.0),
        "styleExampleDuplicateCount": style_count,
        "styleExampleDuplicateRate": (round(style_count / denominator, 6) if denominator else 0.0),
    }


def _named_latency_metrics(name: str, values: list[float | None]) -> dict[str, float | None]:
    measured = [float(value) for value in values if value is not None]
    if not measured:
        return {
            f"average{name}LatencyMs": None,
            f"p50{name}LatencyMs": None,
            f"p95{name}LatencyMs": None,
        }
    summary = latency_metrics(measured)
    return {
        f"average{name}LatencyMs": summary["averageLatencyMs"],
        f"p50{name}LatencyMs": summary["p50LatencyMs"],
        f"p95{name}LatencyMs": summary["p95LatencyMs"],
    }


def calculate_generation_metrics(
    case_results: list[dict[str, Any]],
) -> dict[str, Any]:
    successful = [item for item in case_results if item.get("success")]
    questions = [question for item in successful for question in item.get("questions", [])]
    total_questions = max(1, len(questions))
    denominator = max(1, len(case_results))
    partial = [item for item in successful if item.get("generatedCount", 0) < item.get("requestedCount", 0)]
    insufficient = [item for item in case_results if item.get("error") == "InsufficientContextError"]
    metrics: dict[str, Any] = {
        "requestSuccessRate": round(len(successful) / denominator, 6),
        "structuredOutputParseRate": round(len(successful) / denominator, 6),
        "schemaValidQuestionRate": 1.0 if questions else 0.0,
        "exactlyFourOptionsRate": round(
            sum(len(q["options"]) == 4 for q in questions) / total_questions,
            6,
        ),
        "singleCorrectAnswerRate": round(
            sum(q["correctOptionId"] in {"A", "B", "C", "D"} for q in questions) / total_questions,
            6,
        ),
        "validSourceIdRate": round(
            sum(bool(q["sourceChunkIds"]) for q in questions) / total_questions,
            6,
        ),
        "nonemptyExplanationRate": round(
            sum(bool(q["explanation"].strip()) for q in questions) / total_questions,
            6,
        ),
        "dateEvidenceWarningRate": round(
            sum("DATE_EVIDENCE_WARNING" in item.get("warnings", []) for item in successful)
            / max(1, len(successful)),
            6,
        ),
        "properNameEvidenceWarningRate": round(
            sum("PROPER_NAME_EVIDENCE_WARNING" in item.get("warnings", []) for item in successful)
            / max(1, len(successful)),
            6,
        ),
        "partialGenerationRate": round(len(partial) / denominator, 6),
        "insufficientContextRate": round(len(insufficient) / denominator, 6),
    }
    metrics.update(calculate_repair_metrics(case_results))
    metrics.update(calculate_duplicate_metrics(case_results))
    timings = [item.get("timings", {}) for item in case_results]
    for name, key in (
        ("Total", "totalLatencyMs"),
        ("Retrieval", "retrievalLatencyMs"),
        ("CacheLookup", "cacheLookupLatencyMs"),
        ("Provider", "providerLatencyMs"),
    ):
        metrics.update(_named_latency_metrics(name, [value.get(key) for value in timings]))
    return metrics


def build_excerpt_metadata(
    source: GenerationSource,
    retrieval_result: RetrievalResult | None,
    *,
    max_length: int = DEFAULT_EXCERPT_LENGTH,
) -> dict[str, Any]:
    if max_length <= 0:
        raise ValueError("max_length must be positive")
    if retrieval_result is None:
        return {
            "chunkId": source.chunk_id,
            "chunkHash": source.chunk_hash,
            "excerpt": None,
            "excerptLength": 0,
            "fullTextLength": None,
            "truncated": None,
            "missing": True,
            "issue": "MISSING_RETRIEVAL_RESULT",
        }
    excerpt = retrieval_result.text[:max_length]
    return {
        "chunkId": source.chunk_id,
        "chunkHash": source.chunk_hash,
        "excerpt": excerpt,
        "excerptLength": len(excerpt),
        "fullTextLength": len(retrieval_result.text),
        "truncated": len(retrieval_result.text) > len(excerpt),
        "missing": False,
        "issue": None,
    }


def missing_excerpt_metadata(chunk_id: str) -> dict[str, Any]:
    return {
        "chunkId": chunk_id,
        "chunkHash": None,
        "excerpt": None,
        "excerptLength": 0,
        "fullTextLength": None,
        "truncated": None,
        "missing": True,
        "issue": "SOURCE_NOT_DECLARED_IN_RESPONSE",
    }


def build_source_excerpt_map(
    sources: list[GenerationSource],
    retrieval_results: list[RetrievalResult],
    *,
    max_length: int = DEFAULT_EXCERPT_LENGTH,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, str]]]:
    diagnostics: list[dict[str, str]] = []
    retrieval_by_id: dict[str, RetrievalResult] = {}
    duplicate_retrieval_ids: set[str] = set()
    for result in retrieval_results:
        if result.chunk_id in retrieval_by_id:
            duplicate_retrieval_ids.add(result.chunk_id)
        else:
            retrieval_by_id[result.chunk_id] = result
    for chunk_id in duplicate_retrieval_ids:
        retrieval_by_id.pop(chunk_id, None)
        diagnostics.append({"code": "DUPLICATE_RETRIEVAL_CHUNK_ID", "chunkId": chunk_id})

    excerpt_map: dict[str, dict[str, Any]] = {}
    for source in sources:
        if source.chunk_id in excerpt_map:
            diagnostics.append({"code": "DUPLICATE_RESPONSE_SOURCE_ID", "chunkId": source.chunk_id})
            continue
        result = retrieval_by_id.get(source.chunk_id)
        excerpt_map[source.chunk_id] = build_excerpt_metadata(
            source,
            result,
            max_length=max_length,
        )
        if result is None:
            diagnostics.append({"code": "MISSING_RETRIEVAL_RESULT", "chunkId": source.chunk_id})
    return excerpt_map, diagnostics


def render_generation_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Generation Evaluation — Engineering Baseline",
        "",
        "This automated report does not claim 100% factual accuracy or groundedness.",
        "",
        f"- Status: `{report['status']}`",
        f"- Cases: {report['caseCount']}",
        f"- Manual review required: {len(report['manualReviewRequired'])}",
        "",
        f"- Cache mode: `{report['cacheProvenance']['cacheMode']}`",
        f"- Live provider latency: `{report['cacheProvenance']['liveLatencyStatus']}`",
        "- Cache replay total latency is not provider/Gemini latency.",
        "",
        "## Configuration",
        "",
    ]
    lines.extend(f"- {key}: `{value}`" for key, value in report["configuration"].items())
    lines.extend(["", "## Distribution", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["distribution"].items())
    lines.extend(["", "## Metrics", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["metrics"].items())
    for title, key in (
        ("Validation failures", "validationFailures"),
        ("Repair cases", "repairCases"),
        ("Partial or insufficient cases", "partialOrInsufficientCases"),
        ("Duplicate cases", "duplicateCases"),
        ("Quota incidents", "quotaIncidents"),
    ):
        lines.extend(["", f"## {title}", ""])
        values = report[key]
        if values:
            lines.extend(f"- `{value}`" for value in values)
        else:
            lines.append("- None")
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "- Ground truth and automated structural heuristics do not prove factual correctness.",
            "- Source-ID validity does not prove semantic factual correctness.",
            "- Cache replay latency is not provider latency.",
            "- Style fixtures are synthetic and sanitized, not production MySQL data.",
            "",
        ]
    )
    return "\n".join(lines)
