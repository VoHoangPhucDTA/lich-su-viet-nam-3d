from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.config import Settings
from app.core.deadline import OperationDeadline
from app.core.runtime import (
    _default_candidate_generation_provider,
    _default_generation_provider,
)
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import (
    GenerationOutputError,
    GenerationPermanentError,
    GenerationRequest,
    GenerationTransientError,
)
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationService
from tests.unit.test_generation import (
    StubRetrieval,
    configured,
    question,
    retrieval_response,
)


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


class SequenceModels:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = outcomes
        self.calls = 0

    def generate_content(self, **_kwargs):
        outcome = self.outcomes[self.calls]
        self.calls += 1
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class FakeClient:
    def __init__(self, outcomes: list[object]) -> None:
        self.models = SequenceModels(outcomes)

    def close(self) -> None:
        return None


def valid_response() -> SimpleNamespace:
    raw = GeneratedQuestionBatch(
        questions=[question()]
    ).model_dump_json(by_alias=True)
    return SimpleNamespace(
        text=raw,
        candidates=[SimpleNamespace(finish_reason="STOP")],
        prompt_feedback=None,
    )


def api_error(
    status_code: int,
    *,
    retry_after: str | None = None,
) -> errors.APIError:
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    response = httpx.Response(
        status_code,
        headers=headers,
        request=httpx.Request("POST", "https://provider.invalid"),
    )
    return errors.APIError(
        status_code,
        {"error": {"message": "sanitized", "status": "TEMPORARY"}},
        response,
    )


def provider(
    outcomes: list[object],
    *,
    clock: FakeClock | None = None,
) -> tuple[GeminiGenerationProvider, SequenceModels]:
    fake_clock = clock or FakeClock()
    client = FakeClient(outcomes)
    value = GeminiGenerationProvider(
        api_key="safe-test-key",
        model="gemini-3.5-flash-lite",
        temperature=0.3,
        max_output_tokens=8192,
        max_retries=1,
        timeout_seconds=20,
        retry_min_seconds=0.25,
        retry_max_seconds=0.5,
        retryable_status_codes=frozenset({429, 500, 502, 503, 504}),
        total_budget_seconds=20,
        clock=fake_clock,
        sleeper=fake_clock.sleep,
        random_uniform=lambda _minimum, _maximum: 0.25,
        client_factory=lambda **_kwargs: client,
    )
    return value, client.models


def test_transient_503_retries_once_then_succeeds() -> None:
    value, models = provider([api_error(503), valid_response()])

    result = value.generate_structured("hidden prompt")

    assert result.questions
    assert models.calls == 2
    assert value.last_diagnostics.attempt_count == 2
    assert value.last_diagnostics.retry_count == 1
    assert value.last_diagnostics.retry_reasons == ("HTTP_503",)


def test_429_honors_bounded_retry_after() -> None:
    clock = FakeClock()
    value, _ = provider(
        [api_error(429, retry_after="0.4"), valid_response()],
        clock=clock,
    )

    value.generate_structured("hidden prompt")

    assert clock.sleeps == [0.4]
    assert value.last_diagnostics.retry_delays_ms == (400.0,)
    assert value.last_diagnostics.retry_reasons == ("HTTP_429",)


def test_network_transient_retries_once_then_succeeds() -> None:
    value, models = provider(
        [httpx.ConnectError("temporary network failure"), valid_response()]
    )

    value.generate_structured("hidden prompt")

    assert models.calls == 2
    assert value.last_diagnostics.retry_reasons == ("NETWORK_CONNECT",)


@pytest.mark.parametrize("status_code", [400, 401, 403, 404, 501])
def test_permanent_http_error_does_not_retry(status_code: int) -> None:
    value, models = provider([api_error(status_code), valid_response()])

    with pytest.raises(GenerationPermanentError):
        value.generate_structured("hidden prompt")

    assert models.calls == 1
    assert value.last_diagnostics.retry_count == 0
    assert value.last_diagnostics.status_code == status_code


def test_invalid_schema_uses_repair_layer_not_provider_retry() -> None:
    malformed = SimpleNamespace(
        text="{not-json",
        candidates=[SimpleNamespace(finish_reason="STOP")],
        prompt_feedback=None,
    )
    value, models = provider([malformed, valid_response()])

    with pytest.raises(GenerationOutputError):
        value.generate_structured("hidden prompt")

    assert models.calls == 1
    assert value.last_diagnostics.retry_count == 0
    assert value.last_diagnostics.terminal_category == "OUTPUT_INVALID"


def test_second_transient_failure_returns_sanitized_error() -> None:
    value, models = provider([api_error(503), api_error(503)])

    with pytest.raises(GenerationTransientError) as caught:
        value.generate_structured("hidden prompt")

    assert models.calls == 2
    assert caught.value.category == "HTTP_503"
    assert caught.value.status_code == 503
    assert caught.value.attempt_count == 2
    assert caught.value.retry_count == 1
    assert value.last_diagnostics.retry_count == 1


def test_remaining_budget_too_small_does_not_retry() -> None:
    clock = FakeClock()
    value, models = provider([api_error(503), valid_response()], clock=clock)
    deadline = OperationDeadline(0.2, clock=clock, sleeper=clock.sleep)

    with pytest.raises(GenerationTransientError) as caught:
        value.generate_structured(
            "hidden prompt",
            deadline=deadline,
            minimum_timeout_seconds=0.05,
        )

    assert models.calls == 1
    assert caught.value.retry_count == 0
    assert clock.sleeps == []


def test_retry_after_larger_than_remaining_budget_does_not_retry() -> None:
    clock = FakeClock()
    value, models = provider(
        [api_error(429, retry_after="30"), valid_response()],
        clock=clock,
    )
    deadline = OperationDeadline(20, clock=clock, sleeper=clock.sleep)

    with pytest.raises(GenerationTransientError) as caught:
        value.generate_structured(
            "hidden prompt",
            deadline=deadline,
            minimum_timeout_seconds=0.05,
        )

    assert models.calls == 1
    assert caught.value.retry_after_seconds == 30
    assert caught.value.retry_count == 0
    assert clock.sleeps == []


def test_diagnostics_are_content_free(caplog) -> None:
    caplog.set_level("INFO", logger="app.generation.provider")
    value, _ = provider([api_error(503), valid_response()])

    value.generate_structured("secret prompt that must not be logged")

    log_text = caplog.text
    assert "providerAttemptCount=2" in log_text
    assert "providerRetryCount=1" in log_text
    assert "providerRetryReason=HTTP_503" in log_text
    assert "secret prompt" not in log_text
    assert "safe-test-key" not in log_text


def test_candidate_policy_is_pool_scoped_and_current_policy_is_unchanged() -> None:
    settings = Settings(
        _env_file=None,
        gemini_api_key="safe-test-key",
        gemini_generation_model="gemini-2.5-flash",
    )

    current = _default_generation_provider(settings)
    candidate = _default_candidate_generation_provider(settings)

    assert current.max_retries == settings.gemini_generation_max_retries == 3
    assert current.total_budget_seconds is None
    assert candidate.max_retries == 1
    assert candidate.total_budget_seconds == 20
    assert candidate.retryable_status_codes == frozenset(
        {429, 500, 502, 503, 504}
    )


def test_candidate_provider_budget_is_shared_with_schema_repair(
    tmp_path,
) -> None:
    class RepairingProvider:
        model = "gemini-3.5-flash-lite"
        total_budget_seconds = 20

        def __init__(self) -> None:
            self.deadlines: list[OperationDeadline] = []

        def generate_structured(self, _prompt, **kwargs):
            self.deadlines.append(kwargs["deadline"])
            if len(self.deadlines) == 1:
                raise GenerationOutputError(
                    "GENERATION_JSON_INVALID",
                    raw_output="{}",
                )
            return GeneratedQuestionBatch(questions=[question()])

        def close(self) -> None:
            return None

    retrying_provider = RepairingProvider()
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),
        provider=retrying_provider,
    )

    result = service.generate(GenerationRequest(query="history", count=1))

    assert result.metadata.repair_attempts == 1
    assert len(retrying_provider.deadlines) == 2
    assert retrying_provider.deadlines[0] is retrying_provider.deadlines[1]
    assert retrying_provider.deadlines[0].duration_seconds == 20
