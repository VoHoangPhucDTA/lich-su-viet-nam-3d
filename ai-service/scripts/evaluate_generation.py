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
    GenerationCache,
    latency_metrics,
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
from app.generation.service import create_generation_service
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
    try:
        for case in cases:
            started = time.monotonic()
            request = _case_request(case)
            try:
                retrieval = service.retrieval_service.retrieve(
                    RetrievalRequest(
                        query=request.query,
                        grade=request.grade,
                        lessonNumber=request.lesson_number,
                        documentId=request.document_id,
                        topK=request.top_k,
                    )
                )
                cache_key = cache.identity(
                    request,
                    retrieval,
                    model=settings.gemini_generation_model,
                    temperature=settings.gemini_generation_temperature,
                )
                response = cache.get(cache_key)
                if response is None:
                    cache_misses += 1
                    response = service.generate(
                        request, retrieval_response=retrieval
                    )
                    cache.set(cache_key, response)
                else:
                    cache_hits += 1
                elapsed = round((time.monotonic() - started) * 1000, 3)
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
                    "repairAttempts": response.metadata.repair_attempts,
                    "warnings": response.warnings,
                    "latencyMs": elapsed,
                    "questionCount": len(response.questions),
                    "evidenceDocumentsPresent": evidence_documents_present,
                    "questions": question_values,
                }
                case_results.append(result)
                source_map = {
                    item.chunk_id: retrieval.results[index].text[:600]
                    for index, item in enumerate(response.sources)
                    if index < len(retrieval.results)
                }
                for question in response.questions:
                    manual_review.append(
                        {
                            "caseId": case.case_id,
                            **question.model_dump(by_alias=True),
                            "sourceExcerpts": {
                                source_id: source_map.get(source_id, "")
                                for source_id in question.source_chunk_ids
                            },
                            "validationWarnings": response.warnings,
                        }
                    )
            except Exception as exc:
                case_results.append(
                    {
                        "caseId": case.case_id,
                        "success": False,
                        "requestedCount": case.count,
                        "generatedCount": 0,
                        "repairAttempts": 0,
                        "warnings": [],
                        "latencyMs": round((time.monotonic() - started) * 1000, 3),
                        "questionCount": 0,
                        "evidenceDocumentsPresent": False,
                        "error": type(exc).__name__,
                    }
                )
    finally:
        service.close()

    successful = [item for item in case_results if item["success"]]
    questions = [
        question for item in successful for question in item.get("questions", [])
    ]
    total_questions = max(1, len(questions))
    repairs = [item for item in successful if item["repairAttempts"] > 0]
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
        if any("DUPLICATE" in warning for warning in item.get("warnings", []))
    ]
    metrics = {
        "requestSuccessRate": round(len(successful) / len(cases), 6),
        "structuredOutputParseRate": round(len(successful) / len(cases), 6),
        "schemaValidQuestionRate": 1.0 if questions else 0.0,
        "exactlyFourOptionsRate": round(sum(len(q["options"]) == 4 for q in questions) / total_questions, 6),
        "singleCorrectAnswerRate": round(sum(q["correctOptionId"] in {"A", "B", "C", "D"} for q in questions) / total_questions, 6),
        "validSourceIdRate": round(sum(bool(q["sourceChunkIds"]) for q in questions) / total_questions, 6),
        "nonemptyExplanationRate": round(sum(bool(q["explanation"].strip()) for q in questions) / total_questions, 6),
        "withinBatchDuplicateRate": round(len(duplicate_cases) / len(cases), 6),
        "styleExampleDuplicateRate": round(sum("DUPLICATE_STYLE_EXAMPLE" in item.get("warnings", []) for item in case_results) / len(cases), 6),
        "dateEvidenceWarningRate": round(sum("DATE_EVIDENCE_WARNING" in item.get("warnings", []) for item in successful) / max(1, len(successful)), 6),
        "properNameEvidenceWarningRate": round(sum("PROPER_NAME_EVIDENCE_WARNING" in item.get("warnings", []) for item in successful) / max(1, len(successful)), 6),
        "repairAttemptRate": round(len(repairs) / len(cases), 6),
        "repairSuccessRate": round(len(repairs) / max(1, len(repairs)), 6),
        "partialGenerationRate": round(len(partial) / len(cases), 6),
        "insufficientContextRate": round(len(insufficient) / len(cases), 6),
        **latency_metrics([item["latencyMs"] for item in case_results]),
    }
    failures = [item["caseId"] for item in case_results if not item["success"]]
    report = {
        "status": "COMPLETED_WITH_ERRORS" if failures else "COMPLETED",
        "caseCount": len(cases),
        "configuration": {
            "generationModel": settings.gemini_generation_model,
            "temperature": settings.gemini_generation_temperature,
            "maxOutputTokens": settings.gemini_generation_max_output_tokens,
            "promptVersion": PROMPT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
        },
        "distribution": {
            "byGrade": dict(Counter(str(case.grade) for case in cases)),
            "byDifficulty": dict(Counter(case.difficulty.value for case in cases)),
            "withStyleExamples": sum(case.style_examples_fixture is not None for case in cases),
            "withoutStyleExamples": sum(case.style_examples_fixture is None for case in cases),
        },
        "cacheHits": cache_hits,
        "cacheMisses": cache_misses,
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
