"""Lazy Google Gen AI structured generation provider."""

from collections.abc import Callable
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_random_exponential

from app.config import parse_gemini_api_keys
from app.core.deadline import (
    OperationDeadline,
    OperationDeadlineExceeded,
    log_deadline_event,
)
from app.embedding.gemini import (
    error_context,
    is_api_key_failover_error,
    is_retryable_gemini_error,
)
from app.generation.models import (
    GenerationNotConfiguredError,
    GenerationOutputError,
    GenerationPermanentError,
    GenerationSafetyError,
    GenerationTransientError,
)
from app.generation.parser import parse_generation_json
from app.generation.schemas import GeneratedQuestionBatch

SAFETY_FINISH_REASONS = {
    "SAFETY",
    "RECITATION",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
}


class GeminiGenerationProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        temperature: float,
        max_output_tokens: int,
        max_retries: int,
        timeout_seconds: float,
        client_factory: Callable[..., Any] = genai.Client,
    ) -> None:
        self.api_keys = parse_gemini_api_keys(api_key)
        self.model = model.strip()
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self.client_factory = client_factory
        self._api_key_index = 0
        self._client: Any | None = None
        self._client_timeout_seconds: float | None = None

    def _get_client(self, timeout_seconds: float | None = None) -> Any:
        if not self.model:
            raise GenerationNotConfiguredError("GEMINI_GENERATION_MODEL is required")
        if not self.api_keys:
            raise GenerationNotConfiguredError("GEMINI_API_KEY is required")
        effective_timeout = timeout_seconds or self.timeout_seconds
        if (
            self._client is not None
            and effective_timeout != self._client_timeout_seconds
        ):
            self.close()
        if self._client is None:
            self._client = self.client_factory(
                api_key=self.api_keys[self._api_key_index],
                vertexai=False,
                http_options=types.HttpOptions(
                    timeout=max(1, int(effective_timeout * 1000))
                ),
            )
            self._client_timeout_seconds = effective_timeout
        return self._client

    def _advance_key(self) -> bool:
        if self._api_key_index + 1 >= len(self.api_keys):
            return False
        self.close()
        self._api_key_index += 1
        return True

    @staticmethod
    def _finish_reason(response: Any) -> str:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            feedback = getattr(response, "prompt_feedback", None)
            if getattr(feedback, "block_reason", None):
                return str(feedback.block_reason).split(".")[-1]
            return "NO_CANDIDATE"
        reason = getattr(candidates[0], "finish_reason", None)
        return str(reason).split(".")[-1] if reason is not None else "UNKNOWN"

    def _request(
        self,
        prompt: str,
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        stage: str = "generation",
        minimum_timeout_seconds: float = 0.001,
    ) -> GeneratedQuestionBatch:
        while True:
            if deadline is not None:
                deadline.checkpoint(stage, is_cancelled)
                timeout_seconds = deadline.clamp_timeout(
                    timeout_seconds or self.timeout_seconds,
                    stage=stage,
                    minimum_seconds=minimum_timeout_seconds,
                )
            try:
                response = self._get_client(timeout_seconds).models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=self.temperature,
                        max_output_tokens=self.max_output_tokens,
                        response_mime_type="application/json",
                        response_json_schema=GeneratedQuestionBatch.model_json_schema(
                            by_alias=True
                        ),
                    ),
                )
                break
            except errors.APIError as exc:
                if is_api_key_failover_error(exc) and self._advance_key():
                    if deadline is not None:
                        deadline.checkpoint(stage, is_cancelled)
                    continue
                raise
        finish_reason = self._finish_reason(response)
        if finish_reason in SAFETY_FINISH_REASONS:
            raise GenerationSafetyError(f"generation blocked: {finish_reason}")
        if finish_reason not in {"STOP", "UNKNOWN"}:
            raise GenerationOutputError(f"GENERATION_FINISH_{finish_reason}")
        raw = getattr(response, "text", None) or ""
        try:
            return parse_generation_json(raw)
        except GenerationOutputError as exc:
            exc.raw_output = raw[:12000]
            raise

    def generate_structured(
        self,
        prompt: str,
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        stage: str = "generation",
        minimum_timeout_seconds: float = 0.001,
    ) -> GeneratedQuestionBatch:
        configured_timeout = timeout_seconds or self.timeout_seconds
        attempt_number = 0

        def attempt() -> GeneratedQuestionBatch:
            nonlocal attempt_number
            attempt_number += 1
            effective_timeout = configured_timeout
            if deadline is not None:
                deadline.checkpoint(stage, is_cancelled)
                effective_timeout = deadline.clamp_timeout(
                    configured_timeout,
                    stage=stage,
                    minimum_seconds=minimum_timeout_seconds,
                )
                log_deadline_event(
                    deadline,
                    stage=stage,
                    configured_timeout=configured_timeout,
                    effective_timeout=effective_timeout,
                    attempt_number=attempt_number,
                    outcome="started",
                )
            return self._request(
                prompt,
                deadline=deadline,
                timeout_seconds=effective_timeout,
                is_cancelled=is_cancelled,
                stage=stage,
                minimum_timeout_seconds=minimum_timeout_seconds,
            )

        def sleep(seconds: float) -> None:
            if deadline is None:
                import time
                time.sleep(seconds)
                return
            deadline.sleep_within_budget(
                seconds,
                stage=stage,
                is_cancelled=is_cancelled,
            )

        retrying = Retrying(
            retry=retry_if_exception(is_retryable_gemini_error),
            stop=stop_after_attempt(self.max_retries + 1),
            wait=wait_random_exponential(multiplier=1, max=30),
            sleep=sleep,
            reraise=True,
        )
        try:
            return retrying(attempt)
        except OperationDeadlineExceeded:
            raise
        except GenerationNotConfiguredError:
            raise
        except (GenerationSafetyError, GenerationOutputError):
            raise
        except errors.APIError as exc:
            context = error_context(
                exc,
                api_key=(self.api_keys[self._api_key_index] if self.api_keys else ""),
                model=self.model,
                stage="generate_content",
            )
            message = f"Gemini generation failed: {context['httpCode']} {context['providerStatus']}"
            if is_retryable_gemini_error(exc):
                raise GenerationTransientError(message) from exc
            raise GenerationPermanentError(message) from exc
        except httpx.TimeoutException as exc:
            raise OperationDeadlineExceeded(
                stage,
                "REPAIR_TIMEOUT" if stage == "repair" else "GENERATION_TIMEOUT",
            ) from exc
        except httpx.TransportError as exc:
            raise GenerationTransientError("Gemini generation transport failed") from exc

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            self._client_timeout_seconds = None
