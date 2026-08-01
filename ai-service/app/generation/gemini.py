"""Lazy Google Gen AI structured generation provider."""

import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, NoReturn

import httpx
from google import genai
from google.genai import errors, types

from app.config import parse_gemini_api_keys
from app.core.deadline import (
    OperationDeadline,
    OperationDeadlineExceeded,
    log_deadline_event,
)
from app.core.request_context import current_request_id
from app.embedding.gemini import (
    error_context,
    is_api_key_failover_error,
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
DEFAULT_RETRYABLE_STATUS_CODES = frozenset({429, *range(500, 600)})
provider_logger = logging.getLogger("app.generation.provider")


@dataclass(frozen=True)
class ProviderCallDiagnostics:
    attempt_count: int = 0
    retry_count: int = 0
    retry_reasons: tuple[str, ...] = ()
    retry_delays_ms: tuple[float, ...] = ()
    attempt_latencies_ms: tuple[float, ...] = ()
    total_latency_ms: float = 0.0
    terminal_category: str = "NONE"
    status_code: int | None = None
    retry_after_seconds: float | None = None


def generation_error_category(exc: BaseException) -> str:
    if isinstance(exc, errors.APIError):
        return f"HTTP_{exc.code}" if isinstance(exc.code, int) else "UNKNOWN_TRANSIENT"
    if isinstance(exc, httpx.ReadTimeout):
        return "READ_TIMEOUT"
    if isinstance(exc, httpx.ConnectTimeout | httpx.ConnectError):
        return "NETWORK_CONNECT"
    if isinstance(exc, httpx.TimeoutException):
        return "PROVIDER_TIMEOUT"
    if isinstance(exc, httpx.TransportError):
        return "NETWORK_RESET"
    return "UNKNOWN_TRANSIENT"


def retry_after_seconds(exc: BaseException) -> float | None:
    if not isinstance(exc, errors.APIError):
        return None
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    retry_after_ms = headers.get("retry-after-ms")
    if retry_after_ms is not None:
        try:
            value = float(retry_after_ms) / 1000
        except (TypeError, ValueError):
            return None
        return value if value >= 0 else None
    header_value = headers.get("retry-after")
    if header_value is None:
        return None
    try:
        seconds = float(header_value)
    except (TypeError, ValueError):
        try:
            parsed = parsedate_to_datetime(str(header_value))
        except (TypeError, ValueError, OverflowError):
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        seconds = (parsed - datetime.now(timezone.utc)).total_seconds()
    return max(0.0, seconds)


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
        retry_min_seconds: float = 0,
        retry_max_seconds: float = 30,
        retryable_status_codes: frozenset[int] = DEFAULT_RETRYABLE_STATUS_CODES,
        total_budget_seconds: float | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleeper: Callable[[float], None] = time.sleep,
        random_uniform: Callable[[float, float], float] = random.uniform,
        client_factory: Callable[..., Any] = genai.Client,
    ) -> None:
        self.api_keys = parse_gemini_api_keys(api_key)
        self.model = model.strip()
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self.retry_min_seconds = retry_min_seconds
        self.retry_max_seconds = retry_max_seconds
        self.retryable_status_codes = retryable_status_codes
        self.total_budget_seconds = total_budget_seconds
        self.clock = clock
        self.sleeper = sleeper
        self.random_uniform = random_uniform
        self.client_factory = client_factory
        self._api_key_index = 0
        self._client: Any | None = None
        self._client_timeout_seconds: float | None = None
        self.last_diagnostics = ProviderCallDiagnostics()

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
                    timeout=max(1, int(effective_timeout * 1000)),
                    retry_options=types.HttpRetryOptions(attempts=0),
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
            block_reason = getattr(feedback, "block_reason", None)
            if block_reason:
                return str(block_reason).split(".")[-1]
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
        call_started = self.clock()
        attempt_latencies_ms: list[float] = []
        retry_reasons: list[str] = []
        retry_delays_ms: list[float] = []
        last_retry_after: float | None = None

        for attempt_number in range(1, self.max_retries + 2):
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
            attempt_started = self.clock()
            try:
                result = self._request(
                    prompt,
                    deadline=deadline,
                    timeout_seconds=effective_timeout,
                    is_cancelled=is_cancelled,
                    stage=stage,
                    minimum_timeout_seconds=minimum_timeout_seconds,
                )
            except OperationDeadlineExceeded:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                    terminal_category="PROVIDER_TIMEOUT",
                    retry_after=last_retry_after,
                )
                raise
            except GenerationNotConfiguredError:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                    terminal_category="NOT_CONFIGURED",
                )
                raise
            except GenerationSafetyError:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                    terminal_category="SAFETY_REJECTION",
                )
                raise
            except GenerationOutputError:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                    terminal_category="OUTPUT_INVALID",
                )
                raise
            except (errors.APIError, httpx.TimeoutException, httpx.TransportError) as exc:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                category = generation_error_category(exc)
                status_code = exc.code if isinstance(exc, errors.APIError) else None
                last_retry_after = retry_after_seconds(exc)
                retryable = self._is_retryable(exc)
                attempts_remain = attempt_number <= self.max_retries
                if retryable and attempts_remain:
                    delay = self._retry_delay(exc, attempt_number)
                    enough_budget = (
                        deadline is None
                        or deadline.remaining_seconds()
                        >= delay + minimum_timeout_seconds
                    )
                    if enough_budget:
                        if deadline is None:
                            self.sleeper(delay)
                        else:
                            deadline.sleep_within_budget(
                                delay,
                                stage=stage,
                                is_cancelled=is_cancelled,
                            )
                        retry_reasons.append(category)
                        retry_delays_ms.append(round(delay * 1000, 3))
                        continue
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                    terminal_category=category,
                    status_code=status_code,
                    retry_after=last_retry_after,
                )
                self._raise_provider_error(
                    exc,
                    stage=stage,
                    category=category,
                    status_code=status_code,
                    retry_after=last_retry_after,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_delays_ms=retry_delays_ms,
                )
            else:
                attempt_latencies_ms.append(
                    round((self.clock() - attempt_started) * 1000, 3)
                )
                self._record_diagnostics(
                    stage=stage,
                    call_started=call_started,
                    attempt_latencies_ms=attempt_latencies_ms,
                    retry_reasons=retry_reasons,
                    retry_delays_ms=retry_delays_ms,
                )
                return result
        raise AssertionError("provider retry loop exhausted without a result")

    def _is_retryable(self, exc: BaseException) -> bool:
        if isinstance(exc, errors.APIError):
            return exc.code in self.retryable_status_codes
        return isinstance(exc, httpx.TimeoutException | httpx.TransportError)

    def _retry_delay(self, exc: BaseException, attempt_number: int) -> float:
        provider_delay = retry_after_seconds(exc)
        if provider_delay is not None:
            return provider_delay
        if self.retry_min_seconds == 0:
            upper = min(
                self.retry_max_seconds,
                2 ** max(0, attempt_number - 1),
            )
        else:
            upper = min(
                self.retry_max_seconds,
                max(
                    self.retry_min_seconds,
                    self.retry_min_seconds
                    * (1.5 ** max(0, attempt_number - 1)),
                ),
            )
        return self.random_uniform(self.retry_min_seconds, upper)

    def _record_diagnostics(
        self,
        *,
        stage: str,
        call_started: float,
        attempt_latencies_ms: list[float],
        retry_reasons: list[str],
        retry_delays_ms: list[float],
        terminal_category: str = "NONE",
        status_code: int | None = None,
        retry_after: float | None = None,
    ) -> None:
        diagnostics = ProviderCallDiagnostics(
            attempt_count=len(attempt_latencies_ms),
            retry_count=max(0, len(attempt_latencies_ms) - 1),
            retry_reasons=tuple(retry_reasons),
            retry_delays_ms=tuple(retry_delays_ms),
            attempt_latencies_ms=tuple(attempt_latencies_ms),
            total_latency_ms=round((self.clock() - call_started) * 1000, 3),
            terminal_category=terminal_category,
            status_code=status_code,
            retry_after_seconds=retry_after,
        )
        self.last_diagnostics = diagnostics
        provider_logger.info(
            "event=generation.provider requestId=%s stage=%s model=%s "
            "providerAttemptCount=%s providerRetryCount=%s providerRetryReason=%s "
            "providerRetryDelayMs=%s providerLatencyMs=%.3f "
            "providerAttemptLatenciesMs=%s terminalCategory=%s statusCode=%s "
            "retryAfterMs=%s",
            current_request_id() or "unknown",
            stage,
            self.model,
            diagnostics.attempt_count,
            diagnostics.retry_count,
            ",".join(diagnostics.retry_reasons) or "NONE",
            round(sum(diagnostics.retry_delays_ms), 3),
            diagnostics.total_latency_ms,
            ",".join(str(value) for value in diagnostics.attempt_latencies_ms)
            or "NONE",
            terminal_category,
            status_code if status_code is not None else "NONE",
            (
                round(retry_after * 1000, 3)
                if retry_after is not None
                else "NONE"
            ),
        )

    def _raise_provider_error(
        self,
        exc: BaseException,
        *,
        stage: str,
        category: str,
        status_code: int | None,
        retry_after: float | None,
        attempt_latencies_ms: list[float],
        retry_delays_ms: list[float],
    ) -> NoReturn:
        retry_count = max(0, len(attempt_latencies_ms) - 1)
        if isinstance(exc, errors.APIError):
            context = error_context(
                exc,
                api_key=(
                    self.api_keys[self._api_key_index] if self.api_keys else ""
                ),
                model=self.model,
                stage="generate_content",
            )
            message = (
                f"Gemini generation failed: {context['httpCode']} "
                f"{context['providerStatus']}"
            )
            if self._is_retryable(exc):
                raise GenerationTransientError(
                    message,
                    category=category,
                    status_code=status_code,
                    retry_after_seconds=retry_after,
                    attempt_count=len(attempt_latencies_ms),
                    retry_count=retry_count,
                    attempt_latencies_ms=tuple(attempt_latencies_ms),
                    retry_delays_ms=tuple(retry_delays_ms),
                ) from exc
            raise GenerationPermanentError(message) from exc
        if isinstance(exc, httpx.TimeoutException):
            raise OperationDeadlineExceeded(
                stage,
                "REPAIR_TIMEOUT" if stage == "repair" else "GENERATION_TIMEOUT",
            ) from exc
        raise GenerationTransientError(
            "Gemini generation transport failed",
            category=category,
            attempt_count=len(attempt_latencies_ms),
            retry_count=retry_count,
            attempt_latencies_ms=tuple(attempt_latencies_ms),
            retry_delays_ms=tuple(retry_delays_ms),
        ) from exc

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            self._client_timeout_seconds = None
