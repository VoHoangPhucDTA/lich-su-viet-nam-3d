"""Live, bounded latency diagnosis for grounded quiz generation.

This harness deliberately measures the existing production path without changing
its prompt, validator, repair policy, model, cache identity, or public response.
It records only counts, durations, stable validation codes, and request IDs.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.generation.models import GenerationRequest
from app.generation.service import GenerationEvaluationTrace, GenerationService
from app.main import create_app
from app.retrieval import service as retrieval_module
from app.retrieval.models import RetrievalEvaluationTrace

MAX_LOGICAL_REQUESTS = 6
MAX_PROVIDER_CALLS = 12
MAX_REPAIR_CALLS_PER_REQUEST = 1
CORPUS_PATH = Path("data/corpus/sgk_chunks.jsonl")
OUTPUT_ROOT = Path("../artifacts/ai-service/goal15j")


def _patch_attribute(target: Any, name: str, value: Any) -> None:
    setattr(target, name, value)


@dataclass
class Case:
    case_id: str
    query: str
    grade: int
    lesson_number: int
    difficulty: str
    count: int


@dataclass
class CaseTrace:
    case_id: str
    request_id: str = ""
    status_code: int = 0
    question_count: int = 0
    source_chunk_count: int = 0
    retrieved_candidate_count: int = 0
    fact_context_character_count: int = 0
    fact_context_approx_token_count: int = 0
    fact_context_configured_max_chars: int = 0
    fact_context_truncated: bool | None = None
    style_example_count: int = 0
    style_example_character_count: int = 0
    prompt_character_count: int = 0
    provider_output_character_count: int = 0
    usage_metadata_status: str = "NOT_AVAILABLE"
    cache_status: str = "NOT_APPLICABLE"
    cache_hit: bool = False
    cache_miss: bool = False
    provider_called: bool = False
    fastapi_total_ms: float | None = None
    service_total_ms: float | None = None
    runtime_dependency_ms: str = "NOT_APPLICABLE"
    retrieval_total_ms: float | None = None
    query_embedding_ms: float | None = None
    chroma_query_ms: float | None = None
    retrieval_post_processing_ms: float | None = None
    context_build_ms: float | None = None
    style_example_load_ms: str = "NOT_APPLICABLE"
    prompt_build_ms: float | None = None
    generation_attempt_1_ms: float | None = None
    generation_parse_1_ms: str = "NOT_APPLICABLE"
    validation_attempt_1_ms: float | None = None
    repair_prompt_build_ms: float | None = None
    repair_provider_ms: float | None = None
    repair_parse_ms: str = "NOT_APPLICABLE"
    final_validation_ms: float | None = None
    serialization_ms: float | None = None
    provider_call_count: int = 0
    repair_attempted: bool = False
    repair_attempt_count: int = 0
    repair_trigger_codes: list[str] = field(default_factory=list)
    initial_validation_issue_count: int = 0
    final_validation_issue_count: int = 0
    initial_output_parsed: bool = False
    final_output_valid: bool = False
    error_code: str | None = None
    error_detail: str | None = None
    timings_ms: list[float] = field(default_factory=list)


class BudgetExhausted(RuntimeError):
    """Raised before a live provider call would exceed the WP9 budget."""


class DiagnosticRun:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.provider_calls = 0
        self.logical_requests = 0
        self._active: CaseTrace | None = None
        self._original_generate = GenerationService.generate
        self._original_context = retrieval_module.build_fact_context
        self._original_prompt: Any = None
        self._original_repair_prompt: Any = None
        self._original_validate: Any = None

    def install(self) -> None:
        import app.generation.service as generation_module

        self._original_prompt = generation_module.build_generation_prompt
        self._original_repair_prompt = generation_module.build_repair_prompt
        self._original_validate = generation_module.validate_questions

        def timed_context(*args: Any, **kwargs: Any) -> Any:
            started = time.perf_counter()
            value = self._original_context(*args, **kwargs)
            if self._active is not None:
                self._active.context_build_ms = (time.perf_counter() - started) * 1000
                self._active.fact_context_character_count = value.character_count
                self._active.fact_context_approx_token_count = (value.character_count + 3) // 4
                self._active.fact_context_truncated = value.truncated
            return value

        def timed_prompt(*args: Any, **kwargs: Any) -> str:
            started = time.perf_counter()
            value = self._original_prompt(*args, **kwargs)
            if self._active is not None:
                self._active.prompt_build_ms = (time.perf_counter() - started) * 1000
                self._active.prompt_character_count = len(value)
            return value

        def timed_repair_prompt(*args: Any, **kwargs: Any) -> str:
            started = time.perf_counter()
            value = self._original_repair_prompt(*args, **kwargs)
            if self._active is not None:
                self._active.repair_prompt_build_ms = (time.perf_counter() - started) * 1000
            return value

        def timed_validate(*args: Any, **kwargs: Any) -> Any:
            started = time.perf_counter()
            value = self._original_validate(*args, **kwargs)
            if self._active is not None:
                elapsed = (time.perf_counter() - started) * 1000
                self._active.timings_ms.append(elapsed)
                issues = list(value[1].issues)
                if len(self._active.timings_ms) == 1:
                    self._active.validation_attempt_1_ms = elapsed
                    self._active.initial_validation_issue_count = len(issues)
                    self._active.repair_trigger_codes = sorted({issue.code for issue in issues})
                else:
                    self._active.final_validation_ms = elapsed
                    self._active.final_validation_issue_count = len(issues)
            return value

        def timed_generate(
            owner: GenerationService, request: GenerationRequest, *args: Any, **kwargs: Any
        ) -> Any:
            active = self._active
            if active is None:
                return self._original_generate(owner, request, *args, **kwargs)
            started = time.perf_counter()
            retrieval_trace = RetrievalEvaluationTrace()
            original_retrieve = owner.retrieval_service.retrieve
            original_provider = owner.provider.generate_structured

            def timed_retrieve(*retrieve_args: Any, **retrieve_kwargs: Any) -> Any:
                retrieve_kwargs["evaluation_trace"] = retrieval_trace
                retrieve_started = time.perf_counter()
                response = original_retrieve(*retrieve_args, **retrieve_kwargs)
                active.retrieval_total_ms = (time.perf_counter() - retrieve_started) * 1000
                active.query_embedding_ms = retrieval_trace.query_embedding_latency_ms
                active.chroma_query_ms = retrieval_trace.chroma_query_latency_ms
                active.retrieval_post_processing_ms = retrieval_trace.post_processing_latency_ms
                active.retrieved_candidate_count = response.candidate_count
                active.source_chunk_count = response.result_count
                active.fact_context_configured_max_chars = self.settings.rag_context_max_chars
                active.fact_context_character_count = response.fact_context.character_count
                active.fact_context_truncated = response.fact_context.truncated
                return response

            def timed_provider(*provider_args: Any, **provider_kwargs: Any) -> Any:
                if self.provider_calls >= MAX_PROVIDER_CALLS:
                    raise BudgetExhausted("BUDGET_EXHAUSTED")
                stage = str(provider_kwargs.get("stage", "generation"))
                if stage == "repair" and active.repair_attempt_count >= MAX_REPAIR_CALLS_PER_REQUEST:
                    raise BudgetExhausted("BUDGET_EXHAUSTED")
                self.provider_calls += 1
                active.provider_call_count += 1
                active.provider_called = True
                if stage == "repair":
                    active.repair_attempted = True
                    active.repair_attempt_count += 1
                provider_started = time.perf_counter()
                result = original_provider(*provider_args, **provider_kwargs)
                elapsed = (time.perf_counter() - provider_started) * 1000
                if stage == "repair":
                    active.repair_provider_ms = elapsed
                elif active.generation_attempt_1_ms is None:
                    active.generation_attempt_1_ms = elapsed
                else:
                    active.generation_attempt_1_ms += elapsed
                active.initial_output_parsed = active.initial_output_parsed or stage != "repair"
                active.provider_output_character_count = len(result.model_dump_json(by_alias=True))
                return result

            _patch_attribute(owner.retrieval_service, "retrieve", timed_retrieve)
            _patch_attribute(owner.provider, "generate_structured", timed_provider)
            try:
                result = self._original_generate(
                    owner,
                    request,
                    *args,
                    evaluation_trace=GenerationEvaluationTrace(),
                    **kwargs,
                )
                active.final_output_valid = True
                return result
            finally:
                active.service_total_ms = (time.perf_counter() - started) * 1000
                _patch_attribute(owner.retrieval_service, "retrieve", original_retrieve)
                _patch_attribute(owner.provider, "generate_structured", original_provider)

        generation_module.build_generation_prompt = timed_prompt
        generation_module.build_repair_prompt = timed_repair_prompt
        generation_module.validate_questions = timed_validate
        retrieval_module.build_fact_context = timed_context
        _patch_attribute(GenerationService, "generate", timed_generate)

    def uninstall(self) -> None:
        import app.generation.service as generation_module

        _patch_attribute(GenerationService, "generate", self._original_generate)
        retrieval_module.build_fact_context = self._original_context
        if self._original_prompt is not None:
            generation_module.build_generation_prompt = self._original_prompt
        if self._original_repair_prompt is not None:
            generation_module.build_repair_prompt = self._original_repair_prompt
        if self._original_validate is not None:
            generation_module.validate_questions = self._original_validate

    def request(self, client: TestClient, case: Case) -> CaseTrace:
        if self.logical_requests >= MAX_LOGICAL_REQUESTS:
            raise BudgetExhausted("BUDGET_EXHAUSTED")
        self.logical_requests += 1
        request_id = f"wp9-{case.case_id}-20260729"
        trace = CaseTrace(case_id=case.case_id, request_id=request_id, question_count=case.count)
        self._active = trace
        payload = {
            "query": case.query,
            "grade": case.grade,
            "lessonNumber": case.lesson_number,
            "difficulty": case.difficulty,
            "count": case.count,
            "topK": 5,
            "styleExamples": [],
        }
        started = time.perf_counter()
        try:
            response = client.post(
                "/ai/quiz/generate",
                json=payload,
                headers={
                    "X-Internal-Service-Token": self.settings.ai_service_internal_token.get_secret_value(),
                    "X-Request-ID": request_id,
                },
            )
            trace.fastapi_total_ms = response.elapsed.total_seconds() * 1000
            trace.status_code = response.status_code
            fastapi_total = trace.fastapi_total_ms
            service_total = trace.service_total_ms
            if fastapi_total is not None and service_total is not None:
                trace.serialization_ms = max(0.0, fastapi_total - service_total)
            returned_id = response.headers.get("X-Request-ID", "")
            if returned_id != request_id:
                trace.error_code = "REQUEST_ID_MISMATCH"
            if response.status_code >= 400:
                body = (
                    response.json()
                    if response.headers.get("content-type", "").startswith("application/json")
                    else {}
                )
                detail = body.get("detail") if isinstance(body, dict) else None
                trace.error_code = str(detail) if isinstance(detail, str) else f"HTTP_{response.status_code}"
                trace.error_detail = trace.error_code
            return trace
        finally:
            if trace.fastapi_total_ms is None:
                trace.fastapi_total_ms = (time.perf_counter() - started) * 1000
            self._active = None


def _load_cases() -> list[Case]:
    groups: dict[tuple[int, int, str], dict[str, Any]] = {}
    with CORPUS_PATH.open(encoding="utf-8") as source:
        for line in source:
            item = json.loads(line)
            if not item.get("ragEligible") or item.get("containsPendingReview"):
                continue
            key = (int(item["grade"]), int(item["lessonNumber"]), str(item["lessonTitle"]))
            groups.setdefault(key, item)
    selected = sorted(groups.values(), key=lambda item: (item["grade"], item["lessonNumber"]))
    if len(selected) < 2:
        raise RuntimeError("Need two production-eligible grade/lesson groups")
    first, second = selected[0], selected[1]

    def make(case_id: str, item: dict[str, Any], count: int) -> Case:
        return Case(
            case_id=case_id,
            query=str(item["lessonTitle"])[:500],
            grade=int(item["grade"]),
            lesson_number=int(item["lessonNumber"]),
            difficulty="MEDIUM",
            count=count,
        )

    return [
        make("A1", first, 1),
        make("A2", first, 1),
        make("B1", first, 5),
        make("B2", first, 5),
        make("B3", first, 5),
        make("C1", second, 5),
    ]


def _summary(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"n": 0, "min": None, "median": None, "max": None, "mean": None}
    ordered = sorted(values)
    middle = ordered[len(ordered) // 2]
    return {
        "n": len(values),
        "min": round(ordered[0], 3),
        "median": round(middle, 3),
        "max": round(ordered[-1], 3),
        "mean": round(sum(ordered) / len(ordered), 3),
    }


def _write_artifacts(output: Path, manifest: dict[str, Any], traces: list[CaseTrace]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "experiment-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "environment-summary.json").write_text(
        json.dumps(manifest["environment"], indent=2) + "\n", encoding="utf-8"
    )
    with (output / "per-request-latency.jsonl").open("w", encoding="utf-8") as target:
        for trace in traces:
            target.write(json.dumps(asdict(trace), ensure_ascii=False, sort_keys=True) + "\n")
    successful = [item for item in traces if item.status_code == 200 and item.fastapi_total_ms is not None]
    aggregate = {
        "status": manifest["status"],
        "logicalRequests": len(traces),
        "successfulRequests": len(successful),
        "providerCalls": sum(item.provider_call_count for item in traces),
        "repairCount": sum(item.repair_attempt_count for item in traces),
        "repairRate": round(sum(item.repair_attempted for item in traces) / len(traces), 6) if traces else 0,
        "latencyMs": {
            "fastApiTotal": _summary(
                [item.fastapi_total_ms for item in successful if item.fastapi_total_ms is not None]
            ),
            "providerInitial": _summary(
                [
                    item.generation_attempt_1_ms
                    for item in successful
                    if item.generation_attempt_1_ms is not None
                ]
            ),
            "repairProvider": _summary(
                [item.repair_provider_ms for item in successful if item.repair_provider_ms is not None]
            ),
            "retrieval": _summary(
                [item.retrieval_total_ms for item in successful if item.retrieval_total_ms is not None]
            ),
        },
        "usageMetadataStatus": "NOT_AVAILABLE",
    }
    (output / "aggregate-latency.json").write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Goal 15J live latency diagnosis",
        "",
        f"Status: **{manifest['status']}**",
        "",
        "Provider calls are live and bounded; no prompt or content is stored.",
        "",
    ]
    for name, value in aggregate["latencyMs"].items():
        lines.append(f"- {name}: `{value}`")
    (output / "aggregate-latency.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    repair = {
        "repairCount": aggregate["repairCount"],
        "repairRate": aggregate["repairRate"],
        "triggerCodes": sorted({code for item in traces for code in item.repair_trigger_codes}),
    }
    (output / "repair-summary.json").write_text(json.dumps(repair, indent=2) + "\n", encoding="utf-8")
    fields = [
        "case_id",
        "fastapi_total_ms",
        "retrieval_total_ms",
        "query_embedding_ms",
        "chroma_query_ms",
        "context_build_ms",
        "generation_attempt_1_ms",
        "repair_provider_ms",
        "validation_attempt_1_ms",
        "final_validation_ms",
        "serialization_ms",
    ]
    with (output / "stage-breakdown.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        for item in traces:
            row = asdict(item)
            writer.writerow({field: row.get(field, "NOT_APPLICABLE") for field in fields})
    log_lines = [
        f"status={manifest['status']}",
        f"logicalRequests={len(traces)}",
        f"providerCalls={aggregate['providerCalls']}",
        f"repairCount={aggregate['repairCount']}",
    ]
    (output / "run.log").write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    checksums = []
    for path in sorted(output.iterdir()):
        if path.name == "checksums.sha256":
            continue
        checksums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
    (output / "checksums.sha256").write_text("\n".join(checksums) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    args = parser.parse_args()
    settings = Settings()
    if not settings.ai_service_internal_token.get_secret_value():
        print("AI_SERVICE_INTERNAL_TOKEN is not configured", file=sys.stderr)
        return 2
    cases = _load_cases()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output_root / run_id
    manifest: dict[str, Any] = {
        "schemaVersion": "goal15j-live-latency-v1",
        "runId": run_id,
        "status": "RUNNING",
        "budget": {
            "maxLogicalRequests": MAX_LOGICAL_REQUESTS,
            "maxProviderCalls": MAX_PROVIDER_CALLS,
            "maxRepairCallsPerRequest": MAX_REPAIR_CALLS_PER_REQUEST,
        },
        "environment": {
            "provider": "live-gemini",
            "model": settings.gemini_generation_model,
            "embeddingModel": settings.gemini_embedding_model,
            "cachePolicy": "production generation path has no response cache; cache replay excluded",
            "outputDirectory": str(output),
        },
        "cases": [
            {
                "caseId": case.case_id,
                "grade": case.grade,
                "lessonNumber": case.lesson_number,
                "difficulty": case.difficulty,
                "questionCount": case.count,
            }
            for case in cases
        ],
    }
    traces: list[CaseTrace] = []
    diagnostic = DiagnosticRun(settings)
    try:
        diagnostic.install()
        application = create_app(settings)
        with TestClient(application) as client:
            for case in cases:
                try:
                    trace = diagnostic.request(client, case)
                except BudgetExhausted as exc:
                    trace = CaseTrace(case_id=case.case_id, error_code=str(exc), status_code=599)
                    manifest["status"] = "BUDGET_EXHAUSTED"
                    traces.append(trace)
                    break
                except Exception as exc:
                    trace = CaseTrace(
                        case_id=case.case_id,
                        error_code=type(exc).__name__,
                        error_detail="sanitized_exception_detail",
                    )
                traces.append(trace)
                if diagnostic.provider_calls >= MAX_PROVIDER_CALLS:
                    manifest["status"] = "BUDGET_EXHAUSTED"
                    break
    finally:
        diagnostic.uninstall()
    if manifest["status"] == "RUNNING":
        manifest["status"] = (
            "PERFORMANCE_DIAGNOSIS_COMPLETED"
            if len(traces) == len(cases)
            else "PERFORMANCE_DIAGNOSIS_INCONCLUSIVE"
        )
    manifest["actual"] = {
        "logicalRequests": len(traces),
        "providerCalls": diagnostic.provider_calls,
        "repairCalls": sum(item.repair_attempt_count for item in traces),
    }
    _write_artifacts(output, manifest, traces)
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "runId": run_id,
                "logicalRequests": len(traces),
                "providerCalls": diagnostic.provider_calls,
                "output": str(output),
            },
            ensure_ascii=False,
        )
    )
    return 0 if manifest["status"] == "PERFORMANCE_DIAGNOSIS_COMPLETED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
