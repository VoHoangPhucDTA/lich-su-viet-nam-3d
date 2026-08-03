"""Run the Goal 15M paired, content-free Gemini generation benchmark."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import statistics
import sys
import time
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, cast

from app.config import Settings
from app.generation.diagnostics import issue_locations
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import (
    Difficulty,
    GenerationRequest,
    GenerationResponse,
    QuizOption,
    StyleExample,
)
from app.generation.prompt_builder import build_generation_prompt
from app.generation.service import GenerationEvaluationTrace, GenerationService
from app.generation.validators import validate_questions
from app.retrieval.context_builder import build_fact_context
from app.retrieval.models import (
    RetrievalFilters,
    RetrievalMetadata,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
)

CANDIDATE_ENV = "GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE"
MAX_LOGICAL_REQUESTS = 8
MAX_PROVIDER_CALLS = 16
MAX_REPAIRS_PER_REQUEST = 1
OUTPUT_ROOT = Path("../artifacts/ai-service/goal15m")
PROMPT_VERSION = "grounded-mcq-v2"


class CandidateNotConfigured(RuntimeError):
    """Raised before live calls when the explicit candidate is absent."""


class BudgetExhausted(RuntimeError):
    """Raised before a provider stage would exceed the hard budget."""


@dataclass(frozen=True)
class PreparedCase:
    case_id: str
    group: str
    request: GenerationRequest
    retrieval: RetrievalResponse
    fact_context_identity: str
    style_example_identity: str
    request_configuration_identity: str


@dataclass
class RequestMetrics:
    case_id: str
    group: str
    variant: str
    model: str
    execution_order: int
    request_id: str
    success: bool = False
    final_valid: bool = False
    question_count: int = 0
    total_latency_ms: float = 0.0
    retrieval_latency_ms: float = 0.0
    initial_provider_latency_ms: float = 0.0
    repair_latency_ms: float = 0.0
    validation_latency_ms: float = 0.0
    repair_attempted: bool = False
    repair_trigger_codes: list[str] = field(default_factory=list)
    repair_trigger_fields: list[str] = field(default_factory=list)
    initial_issue_count: int = 0
    final_issue_count: int = 0
    issue_codes: list[str] = field(default_factory=list)
    fact_context_chars: int = 0
    style_example_chars: int = 0
    prompt_chars: int = 0
    provider_output_chars: int = 0
    source_contract_valid: bool = False
    options_contract_valid: bool = False
    answer_contract_valid: bool = False
    explanation_contract_valid: bool = False
    scaffolding_leak_free: bool = False
    duplicate_free: bool = False
    pending_review_free: bool = True
    error_code: str | None = None


@dataclass
class ProviderBudget:
    calls: int = 0

    def claim(self) -> None:
        if self.calls >= MAX_PROVIDER_CALLS:
            raise BudgetExhausted("BUDGET_EXHAUSTED")
        self.calls += 1


class TrackingProvider:  # pragma: no cover - exercised only by the bounded live run
    """Measure one logical request while delegating to an unchanged provider."""

    def __init__(self, delegate: GeminiGenerationProvider, budget: ProviderBudget) -> None:
        self.delegate = delegate
        self.budget = budget
        self.model = delegate.model
        self.initial_ms = 0.0
        self.repair_ms = 0.0
        self.output_chars = 0
        self.repair_calls = 0

    def generate_structured(self, prompt: str, **kwargs: Any) -> Any:
        stage = str(kwargs.get("stage", "generation"))
        if stage == "repair" and self.repair_calls >= MAX_REPAIRS_PER_REQUEST:
            raise BudgetExhausted("BUDGET_EXHAUSTED")
        self.budget.claim()
        if stage == "repair":
            self.repair_calls += 1
        started = time.perf_counter()
        try:
            result = self.delegate.generate_structured(prompt, **kwargs)
            self.output_chars = len(result.model_dump_json(by_alias=True))
            return result
        finally:
            elapsed = (time.perf_counter() - started) * 1000
            if stage == "repair":
                self.repair_ms += elapsed
            else:
                self.initial_ms += elapsed

    def close(self) -> None:
        return None


class UnusedRetrieval:  # pragma: no cover - guard for injected live fixtures
    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        raise AssertionError("prepared retrieval must be injected")

    def close(self) -> None:
        return None


class DiagnosticCapture(logging.Handler):  # pragma: no cover - live log adapter
    def __init__(self) -> None:
        super().__init__(logging.INFO)
        self.payloads: list[tuple[str, dict[str, Any]]] = []

    def emit(self, record: logging.LogRecord) -> None:
        message = record.getMessage()
        if " payload=" not in message:
            return
        prefix, encoded = message.split(" payload=", 1)
        event = prefix.removeprefix("event=")
        try:
            payload = json.loads(encoded)
        except json.JSONDecodeError:
            return
        if isinstance(payload, dict):
            self.payloads.append((event, payload))

    def decision(self) -> dict[str, Any]:
        for event, payload in reversed(self.payloads):
            if event == "generation.repair_decision":
                return payload
        return {}


def candidate_model_from_env(environ: Mapping[str, str]) -> str:
    value = environ.get(CANDIDATE_ENV, "").strip()
    if not value:
        raise CandidateNotConfigured("MODEL_CANDIDATE_NOT_CONFIGURED")
    return value


def crossover_plan(cases: Sequence[PreparedCase]) -> list[tuple[PreparedCase, str]]:
    plan: list[tuple[PreparedCase, str]] = []
    for index, case in enumerate(cases):
        variants = ("current", "candidate") if index % 2 == 0 else ("candidate", "current")
        plan.extend((case, variant) for variant in variants)
    return plan


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _style_example() -> StyleExample:  # pragma: no cover - live fixture construction
    return StyleExample(
        question="Theo sử liệu, nhận định nào phản ánh đúng nội dung được đề cập?",
        options=[
            QuizOption(id="A", text="Nhận định thứ nhất"),
            QuizOption(id="B", text="Nhận định thứ hai"),
            QuizOption(id="C", text="Nhận định thứ ba"),
            QuizOption(id="D", text="Nhận định thứ tư"),
        ],
        correct_option_id="B",
        explanation="Nguồn sử liệu trực tiếp hỗ trợ nhận định thứ hai.",
        difficulty=Difficulty.MEDIUM,
    )


def _corpus_groups(path: Path) -> dict[str, list[dict[str, Any]]]:  # pragma: no cover
    groups: dict[str, list[dict[str, Any]]] = {"B": [], "C": []}
    titles = {
        "B": "Hiện Thực Lịch Sử Và Nhận Thức Lị",
        "C": "Tri Thức Lịch Sử Và Cuộc Sống",
    }
    with path.open(encoding="utf-8") as source:
        for line in source:
            item = json.loads(line)
            if not item.get("ragEligible") or item.get("containsPendingReview"):
                continue
            for group, title in titles.items():
                if item.get("lessonTitle") == title and len(groups[group]) < 5:
                    groups[group].append(item)
    if any(len(items) < 5 for items in groups.values()):
        raise RuntimeError("paired corpus fixtures are unavailable")
    return groups


def _retrieval_response(
    items: list[dict[str, Any]], query: str, settings: Settings
) -> RetrievalResponse:  # pragma: no cover - live fixture construction
    results = [
        RetrievalResult(
            rank=index,
            chunk_id=str(item["chunkId"]),
            document_id=str(item["documentId"]),
            grade=cast(Literal[10, 11, 12], int(item["grade"])),
            lesson_number=int(item["lessonNumber"]),
            lesson_title=str(item["lessonTitle"]),
            section_title=str(item["sectionTitle"]),
            section_path=" > ".join(item.get("sectionPath", [])),
            page_start=item.get("pageStart"),
            page_end=item.get("pageEnd"),
            content_types=",".join(item.get("contentTypes", [])),
            text=str(item["text"]),
            distance=0.0,
            chunk_hash=str(item["chunkHash"]),
        )
        for index, item in enumerate(items, start=1)
    ]
    context = build_fact_context(
        results,
        max_chars=settings.rag_context_max_chars,
        max_chunks=settings.rag_context_max_chunks,
    )
    first = results[0]
    return RetrievalResponse(
        query=query,
        filters=RetrievalFilters(grade=first.grade, lesson_number=first.lesson_number),
        top_k=5,
        candidate_count=5,
        result_count=5,
        results=results,
        fact_context=context,
        metadata=RetrievalMetadata(
            embedding_model=settings.gemini_embedding_model,
            embedding_dimension=settings.gemini_embedding_dimension,
            corpus_sha256="a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2",
            query_formatter_version="gemini-retrieval-query-v1",
            collection_name=settings.chroma_collection_name,
            distance_metric=settings.chroma_distance_metric,
        ),
    )


def prepare_cases(settings: Settings) -> list[PreparedCase]:  # pragma: no cover
    style = _style_example()
    groups = _corpus_groups(settings.sgk_chunks_path)
    cases: list[PreparedCase] = []
    for case_id, group in (("P1", "B"), ("P2", "B"), ("P3", "C"), ("P4", "C")):
        query = str(groups[group][0]["lessonTitle"])
        retrieval = _retrieval_response(groups[group], query, settings)
        request = GenerationRequest(
            query=query,
            grade=retrieval.results[0].grade,
            lesson_number=retrieval.results[0].lesson_number,
            difficulty=Difficulty.MEDIUM,
            count=5,
            top_k=5,
            style_examples=[style],
        )
        cases.append(
            PreparedCase(
                case_id=case_id,
                group=group,
                request=request,
                retrieval=retrieval,
                fact_context_identity=hashlib.sha256(
                    retrieval.fact_context.text.encode("utf-8")
                ).hexdigest(),
                style_example_identity=_sha256_json(
                    [item.model_dump(by_alias=True) for item in request.style_examples]
                ),
                request_configuration_identity=_sha256_json(
                    {
                        "query": request.query,
                        "grade": request.grade,
                        "lessonNumber": request.lesson_number,
                        "difficulty": request.difficulty.value,
                        "count": request.count,
                        "topK": request.top_k,
                        "temperature": settings.gemini_generation_temperature,
                        "deadline": settings.ai_request_deadline_seconds,
                        "repairLimit": settings.gemini_generation_repair_attempts,
                        "promptVersion": PROMPT_VERSION,
                    }
                ),
            )
        )
    return cases


def _quality(
    metrics: RequestMetrics,
    response: GenerationResponse,
    case: PreparedCase,
    settings: Settings,
) -> None:  # pragma: no cover - validated by the bounded live run
    started = time.perf_counter()
    valid, summary = validate_questions(
        response.questions,
        case.request,
        case.retrieval.results,
        settings,
    )
    metrics.validation_latency_ms = (time.perf_counter() - started) * 1000
    codes = {issue.code for issue in summary.issues}
    metrics.issue_codes = sorted(codes)
    metrics.question_count = len(response.questions)
    metrics.source_contract_valid = not codes & {"UNKNOWN_SOURCE_ID", "DUPLICATE_SOURCE_ID", "SOURCE_FAILURE"}
    metrics.options_contract_valid = not codes & {
        "OPTION_IDS_INVALID", "DUPLICATE_OPTION", "OPTION_TOO_LONG", "FORBIDDEN_OPTION"
    }
    metrics.answer_contract_valid = all(
        sum(option.id == question.correct_option_id for option in question.options) == 1
        for question in response.questions
    )
    metrics.explanation_contract_valid = not codes & {"EXPLANATION_TOO_LONG"} and all(
        question.explanation.strip() for question in response.questions
    )
    metrics.scaffolding_leak_free = "PROMPT_SCAFFOLDING_LEAK" not in codes
    metrics.duplicate_free = not codes & {
        "DUPLICATE_OPTION", "DUPLICATE_WITHIN_BATCH", "DUPLICATE_STYLE_EXAMPLE"
    }
    metrics.final_valid = (
        len(valid) == 5
        and metrics.source_contract_valid
        and metrics.options_contract_valid
        and metrics.answer_contract_valid
        and metrics.explanation_contract_valid
        and metrics.scaffolding_leak_free
        and metrics.duplicate_free
        and metrics.pending_review_free
        and not any(issue.severity == "ERROR" for issue in summary.issues)
    )


def run_request(
    case: PreparedCase,
    variant: str,
    execution_order: int,
    provider: GeminiGenerationProvider,
    budget: ProviderBudget,
    settings: Settings,
) -> RequestMetrics:  # pragma: no cover - bounded live provider path
    request_id = f"wp12-{case.case_id}-{variant}-{execution_order}"
    metrics = RequestMetrics(
        case_id=case.case_id,
        group=case.group,
        variant=variant,
        model=provider.model,
        execution_order=execution_order,
        request_id=request_id,
        fact_context_chars=case.retrieval.fact_context.character_count,
        style_example_chars=sum(
            len(item.model_dump_json(by_alias=True)) for item in case.request.style_examples
        ),
        prompt_chars=len(build_generation_prompt(case.request, case.retrieval.fact_context, count=5)),
    )
    tracked = TrackingProvider(provider, budget)
    capture = DiagnosticCapture()
    logger = logging.getLogger("app.generation.diagnostics")
    logger.addHandler(capture)
    logger.setLevel(logging.INFO)
    trace = GenerationEvaluationTrace()
    service = GenerationService(
        settings=settings,
        retrieval_service=UnusedRetrieval(),
        provider=tracked,
    )
    started = time.perf_counter()
    try:
        response = service.generate(
            case.request,
            retrieval_response=case.retrieval,
            evaluation_trace=trace,
        )
        metrics.success = True
        _quality(metrics, response, case, settings)
    except BudgetExhausted:
        metrics.error_code = "BUDGET_EXHAUSTED"
        raise
    except Exception as exc:
        metrics.error_code = type(exc).__name__
    finally:
        metrics.total_latency_ms = (time.perf_counter() - started) * 1000
        metrics.initial_provider_latency_ms = tracked.initial_ms
        metrics.repair_latency_ms = tracked.repair_ms
        metrics.provider_output_chars = tracked.output_chars
        metrics.repair_attempted = tracked.repair_calls > 0
        metrics.issue_codes = sorted(
            set(metrics.issue_codes) | {issue.code for issue in trace.validation_issues}
        )
        decision = capture.decision()
        initial_errors = [
            issue for issue in trace.validation_issues if issue.severity == "ERROR"
        ]
        metrics.repair_trigger_codes = list(
            decision.get(
                "repairTriggerCodes",
                list(dict.fromkeys(issue.code for issue in initial_errors))
                if metrics.repair_attempted
                else [],
            )
        )
        metrics.repair_trigger_fields = list(
            decision.get(
                "repairTriggerFields",
                list(
                    dict.fromkeys(
                        location.output_field.value
                        for issue in initial_errors
                        for location in issue_locations(issue)
                    )
                )
                if metrics.repair_attempted
                else [],
            )
        )
        metrics.initial_issue_count = int(
            decision.get("initialValidationIssueCount", len(trace.validation_issues))
        )
        metrics.final_issue_count = int(decision.get("finalValidationIssueCount", 0))
        logger.removeHandler(capture)
    return metrics


def _median(values: Sequence[float]) -> float:
    return statistics.median(values) if values else 0.0


def aggregate(rows: Sequence[RequestMetrics], variant: str) -> dict[str, Any]:
    selected = [row for row in rows if row.variant == variant]
    latencies = [row.total_latency_ms for row in selected]
    return {
        "variant": variant,
        "model": selected[0].model if selected else None,
        "requests": len(selected),
        "successful": sum(row.success for row in selected),
        "finalValid": sum(row.final_valid for row in selected),
        "repairCount": sum(row.repair_attempted for row in selected),
        "repairRate": sum(row.repair_attempted for row in selected) / len(selected) if selected else 0,
        "totalLatencyMs": {
            "mean": statistics.mean(latencies) if latencies else None,
            "median": _median(latencies) if latencies else None,
            "sum": sum(latencies),
        },
        "initialProviderLatencyMs": {
            "mean": (
                statistics.mean(row.initial_provider_latency_ms for row in selected)
                if selected
                else None
            ),
            "sum": sum(row.initial_provider_latency_ms for row in selected),
        },
        "repairLatencyMs": sum(row.repair_latency_ms for row in selected),
        "repairTriggerDistribution": _distribution(
            code for row in selected for code in row.repair_trigger_codes
        ),
        "issueDistribution": _distribution(code for row in selected for code in row.issue_codes),
    }


def _distribution(values: Any) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        result[str(value)] = result.get(str(value), 0) + 1
    return dict(sorted(result.items()))


def acceptance_decision(rows: Sequence[RequestMetrics]) -> dict[str, Any]:
    current = {row.case_id: row for row in rows if row.variant == "current"}
    candidate = {row.case_id: row for row in rows if row.variant == "candidate"}
    paired = sorted(set(current) & set(candidate))
    if len(paired) != 4:
        state = "CANDIDATE_UNAVAILABLE" if any(
            row.variant == "candidate" and row.error_code for row in rows
        ) else "BENCHMARK_INCONCLUSIVE"
        return {"decision": state, "checks": {"fourPairedCases": False}}
    current_rows = [current[case] for case in paired]
    candidate_rows = [candidate[case] for case in paired]
    current_mean = statistics.mean(row.total_latency_ms for row in current_rows)
    candidate_mean = statistics.mean(row.total_latency_ms for row in candidate_rows)
    current_median = _median([row.total_latency_ms for row in current_rows])
    candidate_median = _median([row.total_latency_ms for row in candidate_rows])
    current_codes = {code for row in current_rows for code in row.issue_codes}
    candidate_codes = {code for row in candidate_rows for code in row.issue_codes}
    checks = {
        "candidateFinalValid4Of4": all(row.final_valid for row in candidate_rows),
        "candidateFiveQuestions4Of4": all(row.question_count == 5 for row in candidate_rows),
        "zeroSourceOrPendingReviewViolation": all(
            row.source_contract_valid and row.pending_review_free for row in candidate_rows
        ),
        "zeroUnresolvedScaffoldingLeak": all(row.scaffolding_leak_free for row in candidate_rows),
        "candidateRepairCountLeCurrent": sum(row.repair_attempted for row in candidate_rows)
        <= sum(row.repair_attempted for row in current_rows),
        "fasterInAtLeast3Pairs": sum(
            candidate[case].total_latency_ms < current[case].total_latency_ms for case in paired
        ) >= 3,
        "meanImprovementAtLeast20Pct": candidate_mean <= current_mean * 0.8,
        "medianImprovementAtLeast15Pct": candidate_median <= current_median * 0.85,
        "noCandidateCaseSlowerOver10Pct": all(
            candidate[case].total_latency_ms <= current[case].total_latency_ms * 1.1
            for case in paired
        ),
        "noNewIssueCode": candidate_codes <= current_codes,
    }
    quality_keys = {
        "candidateFinalValid4Of4",
        "candidateFiveQuestions4Of4",
        "zeroSourceOrPendingReviewViolation",
        "zeroUnresolvedScaffoldingLeak",
    }
    if not all(checks[key] for key in quality_keys):
        state = "CANDIDATE_QUALITY_REJECTED"
    elif not checks["candidateRepairCountLeCurrent"]:
        state = "CANDIDATE_REPAIR_REJECTED"
    elif not all(checks.values()):
        state = "CANDIDATE_LATENCY_REJECTED"
    else:
        state = "CANDIDATE_ACCEPTED_FOR_PRODUCTION_PROPOSAL"
    return {
        "decision": state,
        "checks": checks,
        "pairedCases": paired,
        "meanImprovementPct": ((current_mean - candidate_mean) / current_mean) * 100,
        "medianImprovementPct": ((current_median - candidate_median) / current_median) * 100,
    }


def _write_json(path: Path, value: Any) -> None:  # pragma: no cover
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_artifacts(
    output: Path,
    manifest: dict[str, Any],
    cases: Sequence[PreparedCase],
    rows: Sequence[RequestMetrics],
) -> None:  # pragma: no cover - live artifact serialization
    output.mkdir(parents=True, exist_ok=True)
    decision = acceptance_decision(rows)
    current = aggregate(rows, "current")
    candidate = aggregate(rows, "candidate")
    identities = [
        {
            "caseId": case.case_id,
            "group": case.group,
            "factContextIdentity": case.fact_context_identity,
            "styleExampleIdentity": case.style_example_identity,
            "requestConfigurationIdentity": case.request_configuration_identity,
        }
        for case in cases
    ]
    _write_json(output / "manifest.json", manifest | {"decision": decision["decision"]})
    _write_json(output / "case-identities.json", identities)
    with (output / "per-request.jsonl").open("w", encoding="utf-8") as target:
        for row in rows:
            target.write(json.dumps(asdict(row), sort_keys=True) + "\n")
    with (output / "paired-comparison.csv").open("w", newline="", encoding="utf-8") as target:
        fields = ["caseId", "currentMs", "candidateMs", "candidateDeltaMs", "candidateDeltaPct"]
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        by_case = {(row.case_id, row.variant): row for row in rows}
        for case in cases:
            current_row = by_case.get((case.case_id, "current"))
            candidate_row = by_case.get((case.case_id, "candidate"))
            if current_row is None or candidate_row is None:
                continue
            delta = candidate_row.total_latency_ms - current_row.total_latency_ms
            writer.writerow(
                {
                    "caseId": case.case_id,
                    "currentMs": round(current_row.total_latency_ms, 3),
                    "candidateMs": round(candidate_row.total_latency_ms, 3),
                    "candidateDeltaMs": round(delta, 3),
                    "candidateDeltaPct": round(delta / current_row.total_latency_ms * 100, 3),
                }
            )
    _write_json(output / "aggregate-current.json", current)
    _write_json(output / "aggregate-candidate.json", candidate)
    _write_json(
        output / "repair-comparison.json",
        {
            "current": {
                "count": current["repairCount"],
                "rate": current["repairRate"],
                "latencyMs": current["repairLatencyMs"],
                "triggers": current["repairTriggerDistribution"],
            },
            "candidate": {
                "count": candidate["repairCount"],
                "rate": candidate["repairRate"],
                "latencyMs": candidate["repairLatencyMs"],
                "triggers": candidate["repairTriggerDistribution"],
            },
        },
    )
    _write_json(
        output / "quality-comparison.json",
        {
            "currentFinalValid": current["finalValid"],
            "candidateFinalValid": candidate["finalValid"],
            "currentIssues": current["issueDistribution"],
            "candidateIssues": candidate["issueDistribution"],
        },
    )
    _write_json(output / "acceptance-decision.json", decision)
    _write_json(
        output / "option-id-feasibility.json",
        {
            "wp11Issue": "OPTION_IDS_INVALID",
            "classification": "CONTENT_OR_STRUCTURE_INVALID",
            "evidence": ["DUPLICATE_OPTION co-occurred in the same initial output"],
            "normalizationImplemented": False,
            "nextGoalNote": (
                "Re-evaluate ID-only normalization only with an isolated fixture "
                "proving unique content and answer mapping."
            ),
        },
    )
    checksums = []
    for path in sorted(output.iterdir()):
        if path.name == "checksums.sha256":
            continue
        checksums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
    (output / "checksums.sha256").write_text("\n".join(checksums) + "\n", encoding="utf-8")


def main() -> int:  # pragma: no cover - bounded live CLI
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    args = parser.parse_args()
    settings = Settings()
    try:
        candidate_model = candidate_model_from_env(os.environ)
    except CandidateNotConfigured as exc:
        print(str(exc), file=sys.stderr)
        return 2
    current_model = settings.gemini_generation_model.strip()
    if not current_model:
        print("CURRENT_MODEL_NOT_CONFIGURED", file=sys.stderr)
        return 2
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output_root / run_id
    cases = prepare_cases(settings)
    plan = crossover_plan(cases)
    print(
        json.dumps(
            {
                "currentModel": current_model,
                "candidateModelConfigured": True,
                "candidateModel": candidate_model,
                "configurationSource": "process environment",
                "logicalRequestCount": len(plan),
                "maximumProviderCalls": MAX_PROVIDER_CALLS,
                "maximumRepairCalls": len(plan),
                "artifactDirectory": str(output),
                "warmupPolicy": "NONE",
            },
            sort_keys=True,
        )
    )
    providers = {
        "current": GeminiGenerationProvider(
            api_key=settings.gemini_api_key,
            model=current_model,
            temperature=settings.gemini_generation_temperature,
            max_output_tokens=settings.gemini_generation_max_output_tokens,
            max_retries=settings.gemini_generation_max_retries,
            timeout_seconds=settings.gemini_generation_timeout_seconds,
        ),
        "candidate": GeminiGenerationProvider(
            api_key=settings.gemini_api_key,
            model=candidate_model,
            temperature=settings.gemini_generation_temperature,
            max_output_tokens=settings.gemini_generation_max_output_tokens,
            max_retries=settings.gemini_generation_max_retries,
            timeout_seconds=settings.gemini_generation_timeout_seconds,
        ),
    }
    budget = ProviderBudget()
    rows: list[RequestMetrics] = []
    previous_diagnostics = os.environ.get("AI_GENERATION_DIAGNOSTICS")
    os.environ["AI_GENERATION_DIAGNOSTICS"] = "true"
    try:
        for execution_order, (case, variant) in enumerate(plan, start=1):
            try:
                row = run_request(
                    case,
                    variant,
                    execution_order,
                    providers[variant],
                    budget,
                    settings,
                )
            except BudgetExhausted:
                break
            rows.append(row)
            if variant == "candidate" and row.error_code == "GenerationPermanentError":
                break
    finally:
        for provider in providers.values():
            provider.close()
        if previous_diagnostics is None:
            os.environ.pop("AI_GENERATION_DIAGNOSTICS", None)
        else:
            os.environ["AI_GENERATION_DIAGNOSTICS"] = previous_diagnostics
    decision = acceptance_decision(rows)
    manifest = {
        "schemaVersion": "goal15m-paired-generation-v1",
        "runId": run_id,
        "currentModel": current_model,
        "candidateModelConfigured": True,
        "candidateModel": candidate_model,
        "configurationSource": "process environment",
        "prompt": PROMPT_VERSION,
        "repairLimit": settings.gemini_generation_repair_attempts,
        "warmupPolicy": "NONE",
        "budget": {
            "logicalRequests": MAX_LOGICAL_REQUESTS,
            "maxProviderCalls": MAX_PROVIDER_CALLS,
            "maxRepairsPerRequest": MAX_REPAIRS_PER_REQUEST,
        },
        "actual": {
            "logicalRequests": len(rows),
            "providerCalls": budget.calls,
            "repairCalls": sum(row.repair_attempted for row in rows),
        },
        "crossoverOrder": [f"{case.case_id}:{variant}" for case, variant in plan],
        "publicApiChanged": False,
        "productionRoutingChanged": False,
    }
    write_artifacts(output, manifest, cases, rows)
    print(
        json.dumps(
            {
                "decision": decision["decision"],
                "logicalRequests": len(rows),
                "providerCalls": budget.calls,
                "output": str(output),
            },
            sort_keys=True,
        )
    )
    return 0 if len(rows) == MAX_LOGICAL_REQUESTS else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
