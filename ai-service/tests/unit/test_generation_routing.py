from unittest.mock import Mock

import pytest

from app.config import Settings
from app.generation.models import GenerationRequest, GenerationUseCase
from app.generation.service import (
    GenerationModelClass,
    RoutedGenerationService,
    select_generation_route,
    self_practice_canary_bucket,
)


def settings(**overrides: object) -> Settings:
    values: dict[str, object] = {"gemini_generation_model": "current-model"}
    values.update(overrides)
    return Settings(_env_file=None, **values)


def request(
    use_case: GenerationUseCase = GenerationUseCase.SELF_PRACTICE,
    subject: str | None = "user-1",
) -> GenerationRequest:
    return GenerationRequest(
        query="history",
        generation_use_case=use_case,
        canary_subject=subject,
    )


def test_canary_bucket_is_stable_and_salted() -> None:
    first = self_practice_canary_bucket("user-1", "salt-a")

    assert first == self_practice_canary_bucket("user-1", "salt-a")
    assert 0 <= first < 100
    assert first != self_practice_canary_bucket("user-1", "salt-b")


@pytest.mark.parametrize(
    ("configured", "generation_request", "reason"),
    [
        (settings(), request(), "FEATURE_DISABLED"),
        (settings(self_practice_model_enabled=True), request(), "ROLLOUT_ZERO"),
        (
            settings(
                self_practice_model_enabled=True,
                self_practice_model_rollout_percent=100,
            ),
            request(subject=None),
            "MISSING_CANARY_SUBJECT",
        ),
        (
            settings(
                self_practice_model_enabled=True,
                self_practice_model_rollout_percent=100,
            ),
            request(GenerationUseCase.ADMIN_REVIEW),
            "USE_CASE_NOT_ELIGIBLE",
        ),
        (
            settings(
                self_practice_model_enabled=True,
                self_practice_model_rollout_percent=100,
            ),
            request(GenerationUseCase.EVALUATION),
            "USE_CASE_NOT_ELIGIBLE",
        ),
    ],
)
def test_ineligible_or_fail_safe_requests_stay_on_current(
    configured: Settings,
    generation_request: GenerationRequest,
    reason: str,
) -> None:
    decision = select_generation_route(generation_request, configured)

    assert decision.model_class == GenerationModelClass.CURRENT
    assert decision.canary_assigned is False
    assert decision.reason == reason


def test_full_rollout_assigns_only_self_practice_to_candidate() -> None:
    configured = settings(
        self_practice_model_enabled=True,
        self_practice_model_rollout_percent=100,
    )

    decision = select_generation_route(request(), configured)

    assert decision.model_class == GenerationModelClass.CANDIDATE
    assert decision.canary_assigned is True
    assert decision.bucket is not None


def test_router_uses_one_pool_and_never_cross_model_fallback() -> None:
    configured = settings(
        self_practice_model_enabled=True,
        self_practice_model_rollout_percent=100,
    )
    current = Mock()
    candidate = Mock()
    retrieval = Mock()
    candidate.generate.side_effect = RuntimeError("candidate failed")
    router = RoutedGenerationService(
        settings=configured,
        current_service=current,
        candidate_service=candidate,
        retrieval_service=retrieval,
    )

    with pytest.raises(RuntimeError, match="candidate failed"):
        router.generate(request())

    candidate.generate.assert_called_once()
    current.generate.assert_not_called()


def test_router_closes_both_pools_and_shared_retrieval_once() -> None:
    current = Mock()
    candidate = Mock()
    retrieval = Mock()
    router = RoutedGenerationService(
        settings=settings(),
        current_service=current,
        candidate_service=candidate,
        retrieval_service=retrieval,
    )

    router.close()
    router.close()

    current.close.assert_called_once()
    candidate.close.assert_called_once()
    retrieval.close.assert_called_once()
