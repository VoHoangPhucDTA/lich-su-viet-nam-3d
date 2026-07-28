"""Monotonic request budgets and cooperative cancellation primitives."""

from collections.abc import Callable
from dataclasses import dataclass, field
import logging
import time

from app.core.request_context import current_request_id


_ERROR_CODES = {
    "query_embedding": "EMBEDDING_TIMEOUT",
    "chroma_query": "RETRIEVAL_TIMEOUT",
    "retrieval_post_processing": "RETRIEVAL_TIMEOUT",
    "generation": "GENERATION_TIMEOUT",
    "repair": "REPAIR_TIMEOUT",
}
deadline_logger = logging.getLogger("app.deadline")


class OperationDeadlineExceeded(Exception):
    """Stable, sanitized timeout raised before starting more work."""

    def __init__(self, stage: str, code: str | None = None) -> None:
        self.stage = stage
        self.code = code or _ERROR_CODES.get(stage, "AI_REQUEST_DEADLINE_EXCEEDED")
        super().__init__(self.code)


class ClientDisconnectedError(Exception):
    code = "AI_CLIENT_DISCONNECTED"

    def __init__(self, stage: str) -> None:
        self.stage = stage
        super().__init__(self.code)


@dataclass
class OperationDeadline:
    """One request-scoped deadline based only on a monotonic clock."""

    duration_seconds: float
    clock: Callable[[], float] = time.monotonic
    sleeper: Callable[[float], None] = time.sleep
    _started: float = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if self.duration_seconds <= 0:
            raise ValueError("deadline duration must be greater than zero")
        self._started = self.clock()

    @property
    def expired(self) -> bool:
        return self.remaining_seconds() <= 0

    def remaining_seconds(self) -> float:
        return max(0.0, self.duration_seconds - (self.clock() - self._started))

    def raise_if_expired(self, stage: str) -> None:
        if self.expired:
            raise OperationDeadlineExceeded(stage)

    def checkpoint(
        self,
        stage: str,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> None:
        if is_cancelled is not None and is_cancelled():
            raise ClientDisconnectedError(stage)
        self.raise_if_expired(stage)

    def clamp_timeout(
        self,
        configured_timeout: float,
        *,
        stage: str = "request",
        minimum_seconds: float = 0.001,
    ) -> float:
        if configured_timeout <= 0 or minimum_seconds <= 0:
            raise ValueError("timeouts must be greater than zero")
        remaining = self.remaining_seconds()
        if remaining < minimum_seconds:
            raise OperationDeadlineExceeded(stage)
        return min(configured_timeout, remaining)

    def sleep_within_budget(
        self,
        seconds: float,
        *,
        stage: str,
        is_cancelled: Callable[[], bool] | None = None,
    ) -> None:
        self.checkpoint(stage, is_cancelled)
        requested = max(0.0, seconds)
        remaining = self.remaining_seconds()
        actual = min(requested, remaining)
        if actual:
            self.sleeper(actual)
        self.checkpoint(stage, is_cancelled)
        if actual < requested:
            raise OperationDeadlineExceeded(stage)


def log_deadline_event(
    deadline: OperationDeadline,
    *,
    stage: str,
    configured_timeout: float | None,
    effective_timeout: float | None,
    attempt_number: int,
    outcome: str,
    error_code: str = "NONE",
) -> None:
    """Emit bounded operational fields without request content or credentials."""

    deadline_logger.info(
        "event=deadline.stage requestId=%s stage=%s configuredDeadlineMs=%d "
        "remainingBudgetMs=%d effectiveProviderTimeoutMs=%s attemptNumber=%d "
        "outcome=%s errorCode=%s",
        current_request_id() or "none",
        stage,
        round(deadline.duration_seconds * 1000),
        round(deadline.remaining_seconds() * 1000),
        "none" if effective_timeout is None else round(effective_timeout * 1000),
        attempt_number,
        outcome,
        error_code,
    )
