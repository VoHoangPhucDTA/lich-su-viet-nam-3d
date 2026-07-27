"""Run the evidence-backed generation benchmark with resumable output cache."""

from collections import Counter
import json
import os
from pathlib import Path
import sys
import time

from pydantic import TypeAdapter

from app.config import SERVICE_ROOT, get_settings
from app.generation.evaluation import (
    EVALUATION_REPORT_VERSION,
    GenerationCache,
    build_source_excerpt_map,
    calculate_generation_metrics,
    classify_cache_mode,
    classify_live_latency_status,
    missing_excerpt_metadata,
    render_generation_markdown,
)
from app.generation.models import (
    GenerationBenchmarkCase,
    GenerationRequest,
    GenerationResponse,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    StyleExample,
)
from app.generation.service import (
    GenerationEvaluationTrace,
    create_generation_service,
)
from app.generation.validators import validate_questions
from app.retrieval.models import RetrievalRequest


BENCHMARK_PATH = SERVICE_ROOT / "data" / "evaluation" / "generation_benchmark.jsonl"
CACHE_ROOT = SERVICE_ROOT / "storage" / "generation-cache"
REPORT_ROOT = SERVICE_ROOT / "storage" / "evaluation-reports"


def _atomic_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as output:
        output.write(value)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def _load_cases() -> list[GenerationBenchmarkCase]:
    cases = [
        GenerationBenchmarkCase.model_validate_json(line)
        for line in BENCHMARK_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not 12 <= len(cases) <= 18:
        raise ValueError("generation benchmark must contain 12-18 cases")
    if set(case.grade for case in cases) != {10, 11, 12}:
        raise ValueError("generation benchmark must cover grades 10, 11, and 12")
    if set(case.difficulty.value for case in cases) != {"EASY", "MEDIUM", "HARD"}:
        raise ValueError("generation benchmark must cover every difficulty")
    if len({case.case_id for case in cases}) != len(cases):
        raise ValueError("generation benchmark case IDs must be unique")
    corpus_documents = {
        json.loads(line)["documentId"]
        for line in (SERVICE_ROOT / "data" / "corpus" / "sgk_chunks.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip() and not json.loads(line)["containsPendingReview"]
    }
    for case in cases:
        required = set(case.expected.get("requiredSourceDocumentIds", []))
        if not required or not required <= corpus_documents:
            raise ValueError(f"benchmark {case.case_id} has invalid source evidence")
    return cases


def _load_styles(relative_path: str | None) -> list[StyleExample]:
    if relative_path is None:
        return []
    value = json.loads((SERVICE_ROOT / relative_path).read_text(encoding="utf-8"))
    return TypeAdapter(list[StyleExample]).validate_python(value)


def _case_request(case: GenerationBenchmarkCase) -> GenerationRequest:
    return GenerationRequest(
        query=case.query,
        grade=case.grade,
        lessonNumber=case.lesson_number,
        difficulty=case.difficulty,
        count=case.count,
        topK=case.top_k,
        styleExamples=_load_styles(case.style_examples_fixture),
    )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    settings = get_settings()
    cases = _load_cases()
    cache = GenerationCache(CACHE_ROOT)
    service = create_generation_service(settings)
    case_results: list[dict] = []
    manual_review: list[dict] = []
    cache_hits = 0
    cache_misses = 0
    provider_mode = (
        "deterministic" if settings.deterministic_e2e_provider else "production"
    )
    try:
        for case in cases:
            started = time.perf_counter()
            request = _case_request(case)
            trace = GenerationEvaluationTrace()
            retrieval_latency_ms: float | None = None
            cache_lookup_latency_ms: float | None = None
            provider_latency_ms: float | None = None
            try:
                retrieval_started = time.perf_counter()
                retrieval = service.retrieval_service.retrieve(
                    RetrievalRequest(
                        query=request.query,
                        grade=request.grade,
                        lessonNumber=request.lesson_number,
                        documentId=request.document_id,
                        topK=request.top_k,
                    )
                )
                retrieval_latency_ms = round(
                    (time.perf_counter() - retrieval_started) * 1000, 3
                )
                cache_key = cache.identity(
                    request,
                    retrieval,
                    model=settings.gemini_generation_model,
                    temperature=settings.gemini_generation_temperature,
                    max_output_tokens=settings.gemini_generation_max_output_tokens,
                    repair_attempts=settings.gemini_generation_repair_attempts,
                    provider_mode=provider_mode,
                )
                cache_started = time.perf_counter()
                response = cache.get(cache_key)
                cache_lookup_latency_ms = round(
                    (time.perf_counter() - cache_started) * 1000, 3
                )
                if response is None:
                    cache_misses += 1
                    response = service.generate(
                        request,
                        retrieval_response=retrieval,
                        evaluation_trace=trace,
                    )
                    provider_latency_ms = round(trace.provider_latency_ms, 3)
                    cache.set(cache_key, response)
                else:
                    cache_hits += 1
                    trace.repair_attempt_count = response.metadata.repair_attempts
                    if trace.repair_attempt_count:
                        trace.repair_success_count = 1
                        trace.repair_failure_count = max(
                            0, trace.repair_attempt_count - 1
                        )
                    _, cached_summary = validate_questions(
                        response.questions,
                        request,
                        retrieval.results,
                        settings,
                    )
                    trace.validation_issues.extend(cached_summary.issues)
                elapsed = round((time.perf_counter() - started) * 1000, 3)
                required_documents = set(
                    case.expected.get("requiredSourceDocumentIds", [])
                )
                actual_documents = {source.document_id for source in response.sources}
                evidence_documents_present = required_documents <= actual_documents
                question_values = [
                    question.model_dump(by_alias=True) for question in response.questions
                ]
                result = {
                    "caseId": case.case_id,
                    "success": True,
                    "requestedCount": case.count,
                    "generatedCount": len(response.questions),
                    "repairAttemptCount": trace.repair_attempt_count,
                    "repairSuccessCount": trace.repair_success_count,
                    "repairFailureCount": trace.repair_failure_count,
                    "validationIssues": [
                        issue.model_dump(by_alias=True)
                        for issue in trace.validation_issues
                    ],
                    "warnings": response.warnings,
                    "timings": {
                        "cacheLookupLatencyMs": cache_lookup_latency_ms,
                        "retrievalLatencyMs": retrieval_latency_ms,
                        "providerLatencyMs": provider_latency_ms,
                        "totalLatencyMs": elapsed,
                    },
                    "questionCount": len(response.questions),
                    "evidenceDocumentsPresent": evidence_documents_present,
                    "questions": question_values,
                }
                case_results.append(result)
                source_map, source_diagnostics = build_source_excerpt_map(
                    response.sources,
                    retrieval.results,
                )
                for question in response.questions:
                    manual_review.append(
                        {
                            "caseId": case.case_id,
                            **question.model_dump(by_alias=True),
                            "sourceExcerpts": {
                                source_id: source_map.get(
                                    source_id,
                                    missing_excerpt_metadata(source_id),
                                )
                                for source_id in question.source_chunk_ids
                            },
                            "sourceDiagnostics": source_diagnostics,
                            "validationWarnings": response.warnings,
                        }
                    )
            except Exception as exc:
                elapsed = round((time.perf_counter() - started) * 1000, 3)
                case_results.append(
                    {
                        "caseId": case.case_id,
                        "success": False,
                        "requestedCount": case.count,
                        "generatedCount": 0,
                        "repairAttemptCount": trace.repair_attempt_count,
                        "repairSuccessCount": trace.repair_success_count,
                        "repairFailureCount": trace.repair_failure_count,
                        "validationIssues": [
                            issue.model_dump(by_alias=True)
                            for issue in trace.validation_issues
                        ],
                        "warnings": [],
                        "timings": {
                            "cacheLookupLatencyMs": cache_lookup_latency_ms,
                            "retrievalLatencyMs": retrieval_latency_ms,
                            "providerLatencyMs": (
                                round(trace.provider_latency_ms, 3)
                                if trace.provider_latency_ms
                                else None
                            ),
                            "totalLatencyMs": elapsed,
                        },
                        "questionCount": 0,
                        "evidenceDocumentsPresent": False,
                        "error": type(exc).__name__,
                    }
                )
    finally:
        service.close()

    successful = [item for item in case_results if item["success"]]
    repairs = [
        item for item in case_results if item["repairAttemptCount"] > 0
    ]
    partial = [
        item
        for item in successful
        if item["generatedCount"] < item["requestedCount"]
    ]
    insufficient = [
        item for item in case_results if item.get("error") == "InsufficientContextError"
    ]
    duplicate_cases = [
        item
        for item in case_results
        if any(
            str(issue.get("code", "")).startswith("DUPLICATE_")
            for issue in item.get("validationIssues", [])
        )
    ]
    metrics = calculate_generation_metrics(case_results)
    failures = [item["caseId"] for item in case_results if not item["success"]]
    cache_mode = classify_cache_mode(cache_hits, cache_misses)
    live_latency_status = classify_live_latency_status(
        cache_misses,
        provider_mode,
    )
    report = {
        "reportVersion": EVALUATION_REPORT_VERSION,
        "status": "COMPLETED_WITH_ERRORS" if failures else "COMPLETED",
        "caseCount": len(cases),
        "configuration": {
            "generationModel": settings.gemini_generation_model,
            "temperature": settings.gemini_generation_temperature,
            "maxOutputTokens": settings.gemini_generation_max_output_tokens,
            "promptVersion": PROMPT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "providerMode": provider_mode,
        },
        "distribution": {
            "byGrade": dict(Counter(str(case.grade) for case in cases)),
            "byDifficulty": dict(Counter(case.difficulty.value for case in cases)),
            "withStyleExamples": sum(case.style_examples_fixture is not None for case in cases),
            "withoutStyleExamples": sum(case.style_examples_fixture is None for case in cases),
        },
        "cacheHits": cache_hits,
        "cacheMisses": cache_misses,
        "cacheProvenance": {
            "cacheHits": cache_hits,
            "cacheMisses": cache_misses,
            "cacheMode": cache_mode,
            "liveLatencyStatus": live_latency_status,
            "timingSemantics": {
                "cacheLookupLatencyMs": "cache lookup only",
                "retrievalLatencyMs": "retrieval service call only",
                "providerLatencyMs": (
                    "sum of provider calls; null when provider was not called"
                ),
                "totalLatencyMs": "complete evaluator case wall time",
            },
        },
        "metrics": metrics,
        "validationFailures": failures,
        "repairCases": [item["caseId"] for item in repairs],
        "partialOrInsufficientCases": [item["caseId"] for item in partial + insufficient],
        "duplicateCases": [item["caseId"] for item in duplicate_cases],
        "quotaIncidents": [],
        "manualReviewRequired": manual_review,
        "caseResults": case_results,
    }
    _atomic_write(
        REPORT_ROOT / "generation-evaluation.json",
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
    )
    _atomic_write(
        REPORT_ROOT / "generation-evaluation.md",
        render_generation_markdown(report),
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "caseCount": len(cases),
                "cacheHits": cache_hits,
                "cacheMisses": cache_misses,
                "cacheMode": cache_mode,
                "liveLatencyStatus": live_latency_status,
                "metrics": metrics,
                "manualReviewRequired": len(manual_review),
                "reportDirectory": str(REPORT_ROOT),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
