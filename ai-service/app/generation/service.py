"""Retrieval-grounded MCQ generation orchestration."""

import hashlib
import inspect
import logging
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

from app.config import Settings
from app.core.deadline import OperationDeadline
from app.core.request_context import current_request_id
from app.factual_guard import FactualGuard
from app.factual_guard.models import FactualDecision, FactualReasonCode
from app.generation.base import GenerationProvider
from app.generation.diagnostics import (
    GenerationDiagnosticRecorder,
    stable_output_error_code,
)
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import (
    FactualValidationError,
    GeneratedQuestion,
    GenerationMetadata,
    GenerationOutputError,
    GenerationRequest,
    GenerationResponse,
    GenerationSource,
    GenerationUseCase,
    InsufficientContextError,
    ValidationIssue,
    ValidationSummary,
)
from app.generation.prompt_builder import build_generation_prompt
from app.generation.repair import build_repair_prompt
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.validators import validate_questions
from app.retrieval.models import RetrievalRequest, RetrievalResponse, RetrievalResult
from app.retrieval.service import RetrievalServiceContract, create_retrieval_service

generation_logger = logging.getLogger("app.generation")


class GenerationModelClass(str, Enum):
    CURRENT = "CURRENT"
    CANDIDATE = "CANDIDATE"


@dataclass(frozen=True)
class GenerationRoutingDecision:
    model_class: GenerationModelClass
    canary_assigned: bool
    bucket: int | None
    reason: str


def self_practice_canary_bucket(subject: str, salt: str) -> int:
    digest = hashlib.sha256(f"{salt}:{subject}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % 100


def select_generation_route(
    request: GenerationRequest, settings: Settings
) -> GenerationRoutingDecision:
    if request.generation_use_case != GenerationUseCase.SELF_PRACTICE:
        return GenerationRoutingDecision(
            GenerationModelClass.CURRENT, False, None, "USE_CASE_NOT_ELIGIBLE"
        )
    if not settings.self_practice_model_enabled:
        return GenerationRoutingDecision(
            GenerationModelClass.CURRENT, False, None, "FEATURE_DISABLED"
        )
    if settings.self_practice_model_rollout_percent == 0:
        return GenerationRoutingDecision(
            GenerationModelClass.CURRENT, False, None, "ROLLOUT_ZERO"
        )
    if request.canary_subject is None:
        return GenerationRoutingDecision(
            GenerationModelClass.CURRENT, False, None, "MISSING_CANARY_SUBJECT"
        )
    bucket = self_practice_canary_bucket(
        request.canary_subject, settings.self_practice_rollout_salt
    )
    assigned = bucket < settings.self_practice_model_rollout_percent
    return GenerationRoutingDecision(
        GenerationModelClass.CANDIDATE if assigned else GenerationModelClass.CURRENT,
        assigned,
        bucket,
        "CANARY_ASSIGNED" if assigned else "OUTSIDE_ROLLOUT",
    )


class GenerationServiceContract(Protocol):
    def generate(
        self,
        request: GenerationRequest,
        *,
        retrieval_response: RetrievalResponse | None = None,
        evaluation_trace: "GenerationEvaluationTrace | None" = None,
        deadline: OperationDeadline | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> GenerationResponse: ...

    def close(self) -> None: ...


def _accepts_keyword(parameters: Mapping[str, inspect.Parameter], name: str) -> bool:
    return name in parameters or any(
        parameter.kind == inspect.Parameter.VAR_KEYWORD
        for parameter in parameters.values()
    )


@dataclass
class GenerationEvaluationTrace:
    """Internal evaluator data that is never serialized in the public API."""

    validation_issues: list[ValidationIssue] = field(default_factory=list)
    repair_attempt_count: int = 0
    repair_success_count: int = 0
    repair_failure_count: int = 0
    provider_latency_ms: float = 0.0
    factual_validation_status: str = "UNKNOWN"
    factual_reason_codes: list[str] = field(default_factory=list)
    factual_fact_ids_checked: list[str] = field(default_factory=list)
    factual_source_ids: list[str] = field(default_factory=list)
    factual_covered_claim_count: int = 0
    factual_unknown_claim_count: int = 0

    def reset(self) -> None:
        self.validation_issues.clear()
        self.repair_attempt_count = 0
        self.repair_success_count = 0
        self.repair_failure_count = 0
        self.provider_latency_ms = 0.0
        self.factual_validation_status = "UNKNOWN"
        self.factual_reason_codes.clear()
        self.factual_fact_ids_checked.clear()
        self.factual_source_ids.clear()
        self.factual_covered_claim_count = 0
        self.factual_unknown_claim_count = 0


class GenerationService:
    def __init__(
        self,
        *,
        settings: Settings,
        retrieval_service: RetrievalServiceContract,
        provider: GenerationProvider,
        owns_retrieval_service: bool = True,
        factual_guard: FactualGuard | None = None,
    ) -> None:
        self.settings = settings
        self.retrieval_service = retrieval_service
        self.provider = provider
        self.owns_retrieval_service = owns_retrieval_service
        self.factual_guard = factual_guard or FactualGuard.from_path(
            settings.factual_guard_registry_path
        )

    def _apply_factual_guard(
        self,
        questions: list[GeneratedQuestion],
        sources: list[RetrievalResult],
        *,
        corpus_sha256: str,
        evaluation_trace: GenerationEvaluationTrace | None,
    ) -> tuple[list[GeneratedQuestion], list[ValidationIssue]]:
        valid: list[GeneratedQuestion] = []
        issues: list[ValidationIssue] = []
        decisions: list[str] = []
        for index, question in enumerate(questions):
            result, question_issues = self.factual_guard.validate_question(
                question,
                sources,
                corpus_sha256=corpus_sha256,
                question_index=index,
            )
            decisions.append(result.decision.value)
            issues.extend(question_issues)
            if result.decision == FactualDecision.PASS:
                valid.append(question)
            if evaluation_trace is not None:
                evaluation_trace.factual_reason_codes.extend(
                    code.value for code in result.reason_codes
                )
                evaluation_trace.factual_fact_ids_checked.extend(result.fact_ids_checked)
                evaluation_trace.factual_source_ids.extend(result.source_ids)
                evaluation_trace.factual_covered_claim_count += result.covered_claim_count
                evaluation_trace.factual_unknown_claim_count += result.unknown_claim_count
        if evaluation_trace is not None:
            evaluation_trace.factual_validation_status = (
                FactualDecision.REJECT_REGENERATE.value
                if FactualDecision.REJECT_REGENERATE.value in decisions
                else FactualDecision.PASS.value
            )
            evaluation_trace.factual_reason_codes = sorted(
                set(evaluation_trace.factual_reason_codes)
            )
            evaluation_trace.factual_fact_ids_checked = sorted(
                set(evaluation_trace.factual_fact_ids_checked)
            )
            evaluation_trace.factual_source_ids = sorted(
                set(evaluation_trace.factual_source_ids)
            )
        return valid, issues

    def _validate_request_limits(self, request: GenerationRequest) -> int:
        count = request.count or self.settings.quiz_default_count
        if count > self.settings.quiz_max_count:
            raise ValueError(f"count must be <= {self.settings.quiz_max_count}")
        if len(request.style_examples) > self.settings.quiz_max_style_examples:
            raise ValueError(
                f"styleExamples must contain <= {self.settings.quiz_max_style_examples} items"
            )
        style_chars = sum(
            len(item.model_dump_json()) for item in request.style_examples
        )
        if style_chars > self.settings.quiz_max_style_example_chars:
            raise ValueError("styleExamples exceed configured character budget")
        for item in request.style_examples:
            if len(item.question) > self.settings.quiz_max_question_length:
                raise ValueError("style example question exceeds configured limit")
            if len(item.explanation) > self.settings.quiz_max_explanation_length:
                raise ValueError("style example explanation exceeds configured limit")
            if any(
                len(option.text) > self.settings.quiz_max_option_length
                for option in item.options
            ):
                raise ValueError("style example option exceeds configured limit")
            if [option.id for option in item.options] != ["A", "B", "C", "D"]:
                raise ValueError("style example options must be ordered A-D")
            if len({option.text.casefold() for option in item.options}) != 4:
                raise ValueError("style example option text must be distinct")
        return count

    def generate(
        self,
        request: GenerationRequest,
        *,
        retrieval_response: RetrievalResponse | None = None,
        evaluation_trace: GenerationEvaluationTrace | None = None,
        deadline: OperationDeadline | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> GenerationResponse:
        deadline = deadline or OperationDeadline(
            self.settings.ai_request_deadline_seconds
        )
        deadline.checkpoint("retrieval", is_cancelled)
        if evaluation_trace is not None:
            evaluation_trace.reset()
        started = time.monotonic()
        count = self._validate_request_limits(request)
        diagnostic_recorder = GenerationDiagnosticRecorder(
            current_request_id() or "unknown"
        )
        retrieval_started = time.monotonic()
        retrieval_request = RetrievalRequest(
            query=request.query,
            grade=request.grade,
            lesson_number=request.lesson_number,
            document_id=request.document_id,
            top_k=request.top_k,
        )
        if retrieval_response is not None:
            retrieval = retrieval_response
        else:
            retrieval_method: Callable[..., RetrievalResponse] = self.retrieval_service.retrieve
            retrieval_kwargs: dict[str, object] = {}
            parameters = inspect.signature(retrieval_method).parameters
            if _accepts_keyword(parameters, "deadline"):
                retrieval_kwargs["deadline"] = deadline
            if _accepts_keyword(parameters, "is_cancelled"):
                retrieval_kwargs["is_cancelled"] = is_cancelled
            retrieval = retrieval_method(retrieval_request, **retrieval_kwargs)
        retrieval_ms = (time.monotonic() - retrieval_started) * 1000
        deadline.checkpoint("retrieval", is_cancelled)
        if not retrieval.results or not retrieval.fact_context.text.strip():
            raise InsufficientContextError("INSUFFICIENT_CONTEXT")
        prompt_started = time.monotonic()
        prompt = build_generation_prompt(
            request, retrieval.fact_context, count=count
        )
        prompt_ms = (time.monotonic() - prompt_started) * 1000
        style_chars = sum(len(item.model_dump_json(by_alias=True)) for item in request.style_examples)
        repair_attempts = 0
        last_issues: list[ValidationIssue] = []
        raw_output = ""
        valid: list[GeneratedQuestion] = []
        current_prompt = prompt
        provider_initial_ms = 0.0
        repair_provider_ms = 0.0
        validation_issue_count = 0
        provider_deadline = deadline
        provider_budget_seconds = getattr(
            self.provider, "total_budget_seconds", None
        )
        if provider_budget_seconds is not None:
            provider_deadline = OperationDeadline(
                min(provider_budget_seconds, deadline.remaining_seconds()),
                clock=deadline.clock,
                sleeper=deadline.sleeper,
            )
        for attempt in range(self.settings.gemini_generation_repair_attempts + 1):
            stage = "generation" if attempt == 0 else "repair"
            deadline.checkpoint(stage, is_cancelled)
            if provider_deadline is not deadline:
                provider_deadline.checkpoint(stage, is_cancelled)
            if attempt > 0:
                diagnostic_recorder.record_repair_provider_call()
            provider_started = time.monotonic()
            try:
                provider_method: Callable[..., GeneratedQuestionBatch] = (
                    self.provider.generate_structured
                )
                provider_kwargs: dict[str, object] = {}
                parameters = inspect.signature(provider_method).parameters
                if _accepts_keyword(parameters, "deadline"):
                    provider_kwargs["deadline"] = provider_deadline
                if _accepts_keyword(parameters, "timeout_seconds"):
                    request_timeout_seconds = deadline.clamp_timeout(
                        self.settings.gemini_generation_timeout_seconds,
                        stage=stage,
                        minimum_seconds=self.settings.ai_min_provider_timeout_seconds,
                    )
                    provider_kwargs["timeout_seconds"] = (
                        provider_deadline.clamp_timeout(
                            request_timeout_seconds,
                            stage=stage,
                            minimum_seconds=(
                                self.settings.ai_min_provider_timeout_seconds
                            ),
                        )
                    )
                if _accepts_keyword(parameters, "is_cancelled"):
                    provider_kwargs["is_cancelled"] = is_cancelled
                if _accepts_keyword(parameters, "stage"):
                    provider_kwargs["stage"] = stage
                if _accepts_keyword(parameters, "minimum_timeout_seconds"):
                    provider_kwargs["minimum_timeout_seconds"] = (
                        self.settings.ai_min_provider_timeout_seconds
                    )
                batch = provider_method(current_prompt, **provider_kwargs)
            except GenerationOutputError as exc:
                raw_output = exc.raw_output
                last_issues = [
                    ValidationIssue(
                        code=stable_output_error_code(str(exc)),
                        message="structured output is invalid",
                    )
                ]
                if attempt == 0:
                    diagnostic_recorder.record_initial(last_issues)
                if evaluation_trace is not None:
                    evaluation_trace.validation_issues.extend(last_issues)
                    if attempt > 0:
                        evaluation_trace.repair_failure_count += 1
                if attempt >= self.settings.gemini_generation_repair_attempts:
                    diagnostic_recorder.record_final(last_issues, valid=False)
                    diagnostic_recorder.emit_decision()
                    raise
                deadline.checkpoint("repair", is_cancelled)
                diagnostic_recorder.record_repair_trigger(
                    last_issues,
                    attempt_number=attempt + 1,
                    repair_attempt_number=repair_attempts + 1,
                )
                repair_attempts += 1
                if evaluation_trace is not None:
                    evaluation_trace.repair_attempt_count = repair_attempts
                current_prompt = build_repair_prompt(
                    prompt,
                    raw_output,
                    last_issues,
                    retrieval.fact_context,
                )
                continue
            finally:
                provider_ms = (time.monotonic() - provider_started) * 1000
                if attempt == 0:
                    provider_initial_ms = provider_ms
                else:
                    repair_provider_ms += provider_ms
                if evaluation_trace is not None:
                    evaluation_trace.provider_latency_ms += provider_ms
            structurally_valid, summary = validate_questions(
                batch.questions,
                request,
                retrieval.results,
                self.settings,
            )
            valid, factual_issues = self._apply_factual_guard(
                structurally_valid,
                retrieval.results,
                corpus_sha256=retrieval.metadata.corpus_sha256,
                evaluation_trace=evaluation_trace,
            )
            if factual_issues:
                combined_issues = [*summary.issues, *factual_issues]
                summary = ValidationSummary(status="FAILED", issues=combined_issues)
            last_issues = summary.issues
            validation_issue_count += len(summary.issues)
            if attempt == 0:
                diagnostic_recorder.record_initial(summary.issues)
            if evaluation_trace is not None:
                evaluation_trace.validation_issues.extend(summary.issues)
            if len(valid) >= count and not any(
                issue.severity == "ERROR" for issue in summary.issues
            ):
                if evaluation_trace is not None and attempt > 0:
                    evaluation_trace.repair_success_count += 1
                diagnostic_recorder.record_final(summary.issues, valid=True)
                valid = valid[:count]
                break
            if attempt >= self.settings.gemini_generation_repair_attempts:
                if evaluation_trace is not None and attempt > 0:
                    if valid:
                        evaluation_trace.repair_success_count += 1
                    else:
                        evaluation_trace.repair_failure_count += 1
                break
            if evaluation_trace is not None and attempt > 0:
                evaluation_trace.repair_failure_count += 1
            deadline.checkpoint("repair", is_cancelled)
            repair_issues = [
                issue for issue in summary.issues if issue.severity == "ERROR"
            ]
            if not repair_issues:
                repair_issues = [
                    ValidationIssue(
                        code="COUNT_MISMATCH",
                        message="generated count differs from requested",
                    )
                ]
            diagnostic_recorder.record_repair_trigger(
                repair_issues,
                attempt_number=attempt + 1,
                repair_attempt_number=repair_attempts + 1,
            )
            repair_attempts += 1
            if evaluation_trace is not None:
                evaluation_trace.repair_attempt_count = repair_attempts
            current_prompt = build_repair_prompt(
                prompt,
                batch.model_dump_json(by_alias=True),
                summary.issues
                or [ValidationIssue(code="COUNT_MISMATCH", message="generated count differs from requested")],
                retrieval.fact_context,
            )
        if not valid:
            diagnostic_recorder.record_final(last_issues, valid=False)
            diagnostic_recorder.emit_decision()
            if evaluation_trace is not None:
                evaluation_trace.repair_failure_count = max(
                    evaluation_trace.repair_failure_count,
                    evaluation_trace.repair_attempt_count,
                )
            factual_codes = {code.value for code in FactualReasonCode}
            if any(issue.code in factual_codes for issue in last_issues):
                raise FactualValidationError()
            raise GenerationOutputError("NO_VALID_QUESTIONS_AFTER_REPAIR")
        diagnostic_recorder.record_final(last_issues, valid=True)
        diagnostic_recorder.emit_decision()
        warnings = sorted(
            {
                issue.code
                for issue in last_issues
                if issue.severity == "WARNING"
            }
        )
        if len(valid) < count:
            warnings.append("INSUFFICIENT_VALID_QUESTIONS")
        sources = [
            GenerationSource(
                chunk_id=item.chunk_id,
                document_id=item.document_id,
                grade=item.grade,
                lesson_number=item.lesson_number,
                lesson_title=item.lesson_title,
                section_title=item.section_title,
                page_start=item.page_start,
                page_end=item.page_end,
                chunk_hash=item.chunk_hash,
            )
            for item in retrieval.results
        ]
        response = GenerationResponse(
            questions=valid[:count],
            sources=sources,
            metadata=GenerationMetadata(
                requested_count=count,
                generated_count=min(len(valid), count),
                retrieved_chunk_count=len(retrieval.results),
                generation_model=self.provider.model,
                embedding_model=retrieval.metadata.embedding_model,
                embedding_dimension=retrieval.metadata.embedding_dimension,
                corpus_sha256=retrieval.metadata.corpus_sha256,
                collection_name=retrieval.metadata.collection_name,
                repair_attempts=repair_attempts,
                latency_ms=round((time.monotonic() - started) * 1000, 3),
            ),
            warnings=warnings,
        )
        if diagnostic_recorder.enabled:
            generation_logger.info(
                "event=generation.diagnostic requestId=%s status=success requestedCount=%s "
                "generatedCount=%s retrievalMs=%.2f contextChars=%s promptMs=%.2f promptChars=%s "
                "styleExampleCount=%s styleExampleChars=%s providerInitialMs=%.2f repairProviderMs=%.2f "
                "repairAttempts=%s repairTriggerCodes=%s validationIssueCount=%s "
                "factualStatus=%s factualReasonCodes=%s factualFactIds=%s factualSourceIds=%s "
                "coveredClaimCount=%s unknownClaimCount=%s totalMs=%.2f",
                current_request_id() or "unknown",
                count,
                response.metadata.generated_count,
                retrieval_ms,
                len(retrieval.fact_context.text),
                prompt_ms,
                len(prompt),
                len(request.style_examples),
                style_chars,
                provider_initial_ms,
                repair_provider_ms,
                repair_attempts,
                ",".join(diagnostic_recorder.repair_trigger_codes) or "NONE",
                validation_issue_count,
                (
                    evaluation_trace.factual_validation_status
                    if evaluation_trace is not None
                    else "NOT_RECORDED"
                ),
                (
                    ",".join(evaluation_trace.factual_reason_codes)
                    if evaluation_trace is not None
                    else "NOT_RECORDED"
                ),
                (
                    ",".join(evaluation_trace.factual_fact_ids_checked)
                    if evaluation_trace is not None
                    else "NOT_RECORDED"
                ),
                (
                    ",".join(evaluation_trace.factual_source_ids)
                    if evaluation_trace is not None
                    else "NOT_RECORDED"
                ),
                (
                    evaluation_trace.factual_covered_claim_count
                    if evaluation_trace is not None
                    else 0
                ),
                (
                    evaluation_trace.factual_unknown_claim_count
                    if evaluation_trace is not None
                    else 0
                ),
                (time.monotonic() - started) * 1000,
            )
        return response

    def close(self) -> None:
        self.provider.close()
        if self.owns_retrieval_service:
            self.retrieval_service.close()


class RoutedGenerationService:
    """Selects one isolated model pool without cross-model fallback."""

    def __init__(
        self,
        *,
        settings: Settings,
        current_service: GenerationServiceContract,
        candidate_service: GenerationServiceContract,
        retrieval_service: RetrievalServiceContract,
    ) -> None:
        self.settings = settings
        self.current_service = current_service
        self.candidate_service = candidate_service
        self.retrieval_service = retrieval_service
        self._closed = False

    def generate(
        self,
        request: GenerationRequest,
        *,
        retrieval_response: RetrievalResponse | None = None,
        evaluation_trace: GenerationEvaluationTrace | None = None,
        deadline: OperationDeadline | None = None,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> GenerationResponse:
        decision = select_generation_route(request, self.settings)
        bucket_group = "NONE"
        if decision.bucket is not None:
            lower = (decision.bucket // 5) * 5
            bucket_group = f"{lower:02d}-{lower + 4:02d}"
        generation_logger.info(
            "event=generation.routing requestId=%s generationUseCase=%s "
            "modelClass=%s canaryAssigned=%s bucketGroup=%s routingReason=%s",
            current_request_id() or "unknown",
            request.generation_use_case.value,
            decision.model_class.value,
            str(decision.canary_assigned).lower(),
            bucket_group,
            decision.reason,
        )
        service = (
            self.candidate_service
            if decision.model_class == GenerationModelClass.CANDIDATE
            else self.current_service
        )
        return service.generate(
            request,
            retrieval_response=retrieval_response,
            evaluation_trace=evaluation_trace,
            deadline=deadline,
            is_cancelled=is_cancelled,
        )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.current_service.close()
        self.candidate_service.close()
        self.retrieval_service.close()


def create_generation_service(settings: Settings) -> GenerationService:
    if settings.deterministic_e2e_provider:
        from app.e2e.deterministic import (
            DeterministicGenerationProvider,
            DeterministicRetrievalService,
        )

        return GenerationService(
            settings=settings,
            retrieval_service=DeterministicRetrievalService(),
            provider=DeterministicGenerationProvider(),
        )
    retrieval = create_retrieval_service(settings)
    provider = GeminiGenerationProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_generation_model,
        temperature=settings.gemini_generation_temperature,
        max_output_tokens=settings.gemini_generation_max_output_tokens,
        max_retries=settings.gemini_generation_max_retries,
        timeout_seconds=settings.gemini_generation_timeout_seconds,
    )
    return GenerationService(
        settings=settings,
        retrieval_service=retrieval,
        provider=provider,
    )
