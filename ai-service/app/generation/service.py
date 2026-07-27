"""Retrieval-grounded MCQ generation orchestration."""

from dataclasses import dataclass, field
import time

from app.config import Settings
from app.generation.base import GenerationProvider
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import (
    GeneratedQuestion,
    GenerationMetadata,
    GenerationOutputError,
    GenerationRequest,
    GenerationResponse,
    GenerationSource,
    InsufficientContextError,
    ValidationIssue,
)
from app.generation.prompt_builder import build_generation_prompt
from app.generation.repair import build_repair_prompt
from app.generation.validators import validate_questions
from app.retrieval.models import RetrievalRequest, RetrievalResponse
from app.retrieval.service import RetrievalService, create_retrieval_service


@dataclass
class GenerationEvaluationTrace:
    """Internal evaluator data that is never serialized in the public API."""

    validation_issues: list[ValidationIssue] = field(default_factory=list)
    repair_attempt_count: int = 0
    repair_success_count: int = 0
    repair_failure_count: int = 0
    provider_latency_ms: float = 0.0

    def reset(self) -> None:
        self.validation_issues.clear()
        self.repair_attempt_count = 0
        self.repair_success_count = 0
        self.repair_failure_count = 0
        self.provider_latency_ms = 0.0


class GenerationService:
    def __init__(
        self,
        *,
        settings: Settings,
        retrieval_service: RetrievalService,
        provider: GenerationProvider,
    ) -> None:
        self.settings = settings
        self.retrieval_service = retrieval_service
        self.provider = provider

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
    ) -> GenerationResponse:
        if evaluation_trace is not None:
            evaluation_trace.reset()
        started = time.monotonic()
        count = self._validate_request_limits(request)
        retrieval = retrieval_response or self.retrieval_service.retrieve(
            RetrievalRequest(
                query=request.query,
                grade=request.grade,
                lessonNumber=request.lesson_number,
                documentId=request.document_id,
                topK=request.top_k,
            )
        )
        if not retrieval.results or not retrieval.fact_context.text.strip():
            raise InsufficientContextError("INSUFFICIENT_CONTEXT")
        prompt = build_generation_prompt(
            request, retrieval.fact_context, count=count
        )
        repair_attempts = 0
        last_issues: list[ValidationIssue] = []
        raw_output = ""
        valid: list[GeneratedQuestion] = []
        current_prompt = prompt
        for attempt in range(self.settings.gemini_generation_repair_attempts + 1):
            provider_started = time.monotonic()
            try:
                batch = self.provider.generate_structured(current_prompt)
            except GenerationOutputError as exc:
                raw_output = getattr(exc, "raw_output", "")
                last_issues = [
                    ValidationIssue(code=str(exc), message="structured output is invalid")
                ]
                if evaluation_trace is not None:
                    evaluation_trace.validation_issues.extend(last_issues)
                    if attempt > 0:
                        evaluation_trace.repair_failure_count += 1
                if attempt >= self.settings.gemini_generation_repair_attempts:
                    raise
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
                if evaluation_trace is not None:
                    evaluation_trace.provider_latency_ms += (
                        time.monotonic() - provider_started
                    ) * 1000
            valid, summary = validate_questions(
                batch.questions,
                request,
                retrieval.results,
                self.settings,
            )
            last_issues = summary.issues
            if evaluation_trace is not None:
                evaluation_trace.validation_issues.extend(summary.issues)
            if len(valid) >= count and not any(
                issue.severity == "ERROR" for issue in summary.issues
            ):
                if evaluation_trace is not None and attempt > 0:
                    evaluation_trace.repair_success_count += 1
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
            if evaluation_trace is not None:
                evaluation_trace.repair_failure_count = max(
                    evaluation_trace.repair_failure_count,
                    evaluation_trace.repair_attempt_count,
                )
            raise GenerationOutputError("NO_VALID_QUESTIONS_AFTER_REPAIR")
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
                chunkId=item.chunk_id,
                documentId=item.document_id,
                grade=item.grade,
                lessonNumber=item.lesson_number,
                lessonTitle=item.lesson_title,
                sectionTitle=item.section_title,
                pageStart=item.page_start,
                pageEnd=item.page_end,
                chunkHash=item.chunk_hash,
            )
            for item in retrieval.results
        ]
        return GenerationResponse(
            questions=valid[:count],
            sources=sources,
            metadata=GenerationMetadata(
                requestedCount=count,
                generatedCount=min(len(valid), count),
                retrievedChunkCount=len(retrieval.results),
                generationModel=self.provider.model,
                embeddingModel=retrieval.metadata.embedding_model,
                embeddingDimension=retrieval.metadata.embedding_dimension,
                corpusSha256=retrieval.metadata.corpus_sha256,
                collectionName=retrieval.metadata.collection_name,
                repairAttempts=repair_attempts,
                latencyMs=round((time.monotonic() - started) * 1000, 3),
            ),
            warnings=warnings,
        )

    def close(self) -> None:
        self.provider.close()
        self.retrieval_service.close()


def create_generation_service(settings: Settings) -> GenerationService:
    if settings.deterministic_e2e_provider:
        from app.e2e.deterministic import (
            DeterministicGenerationProvider,
            DeterministicRetrievalService,
        )

        return GenerationService(
            settings=settings,
            retrieval_service=DeterministicRetrievalService(),  # type: ignore[arg-type]
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
