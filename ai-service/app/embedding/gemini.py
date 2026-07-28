"""Google Gen AI SDK provider for Gemini Embedding 2."""

import re
from collections.abc import Callable
from typing import Any

import httpx
from google import genai
from google.genai import errors, types
from tenacity import Retrying, retry_if_exception, stop_after_attempt, wait_random_exponential

from app.core.deadline import (
    OperationDeadline,
    OperationDeadlineExceeded,
    log_deadline_event,
)
from app.embedding.base import validate_vectors
from app.embedding.formatter import RetrievalFormatter
from app.embedding.models import MissingGeminiApiKeyError, PermanentEmbeddingError

MAX_EMBEDDING_INPUT_CHARS = 32_000
REQUEST_STAGE = "embed_content"
_SECRET_VALUE = re.compile(r"(?i)(AIza[0-9A-Za-z_-]{20,}|Bearer\s+[^\s,}\]]+)")
_SECRET_KEY = re.compile(r"(?i)(api[-_]?key|authorization|credential|token|secret)")


def _redact_string(value: str, api_key: str = "") -> str:
    redacted = value.replace(api_key, "[REDACTED]") if api_key else value
    return _SECRET_VALUE.sub("[REDACTED]", redacted)


def sanitize_error_value(value: Any, api_key: str = "") -> Any:
    """Keep provider diagnostics while removing credentials and opaque objects."""
    if isinstance(value, dict):
        return {
            str(key): (
                "[REDACTED]"
                if _SECRET_KEY.search(str(key))
                else sanitize_error_value(item, api_key)
            )
            for key, item in value.items()
        }
    if isinstance(value, list | tuple):
        return [sanitize_error_value(item, api_key) for item in value]
    if isinstance(value, str):
        return _redact_string(value, api_key)
    if value is None or isinstance(value, bool | int | float):
        return value
    return _redact_string(str(value), api_key)


def error_context(
    exc: BaseException,
    *,
    api_key: str = "",
    model: str | None = None,
    dimension: int | None = None,
    stage: str = REQUEST_STAGE,
) -> dict[str, Any]:
    inherited = getattr(exc, "context", None)
    if isinstance(inherited, dict):
        return sanitize_error_value(inherited, api_key)
    message = getattr(exc, "message", None) or str(exc)
    return {
        "exceptionClass": type(exc).__name__,
        "httpCode": getattr(exc, "code", None),
        "providerStatus": getattr(exc, "status", None),
        "message": _redact_string(str(message), api_key),
        "providerDetails": sanitize_error_value(getattr(exc, "details", None), api_key),
        "model": model,
        "dimension": dimension,
        "requestStage": stage,
    }


def validate_embedding_text(text: object) -> str:
    if not isinstance(text, str):
        raise TypeError("Embedding input must be a string")
    if not text.strip():
        raise ValueError("Embedding input must not be blank")
    if len(text) > MAX_EMBEDDING_INPUT_CHARS:
        raise ValueError(
            f"Embedding input exceeds the {MAX_EMBEDDING_INPUT_CHARS}-character guard"
        )
    return text


def build_content(text: object) -> types.Content:
    validated = validate_embedding_text(text)
    return types.Content(parts=[types.Part.from_text(text=validated)])


def build_contents(documents: list[str]) -> list[types.Content]:
    return [build_content(document) for document in documents]


def is_retryable_gemini_error(exc: BaseException) -> bool:
    if isinstance(exc, errors.APIError):
        return exc.code == 429 or (
            isinstance(exc.code, int) and 500 <= exc.code <= 599
        )
    return isinstance(exc, httpx.TimeoutException | httpx.TransportError)


def is_api_key_failover_error(exc: BaseException) -> bool:
    if not isinstance(exc, errors.APIError):
        return False
    details = str(getattr(exc, "details", "")).upper()
    if exc.code == 401 or "API_KEY_INVALID" in details:
        return True
    return exc.code == 403 and any(
        marker in details
        for marker in ("API_KEY", "PROJECT", "ACCESS", "PERMISSION_DENIED")
    )


class GeminiEmbeddingProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        dimension: int,
        max_retries: int = 5,
        retry_min_seconds: float = 1,
        retry_max_seconds: float = 30,
        timeout_seconds: float | None = None,
        client_factory: Callable[..., Any] = genai.Client,
        formatter: RetrievalFormatter | None = None,
    ) -> None:
        self.api_keys = tuple(
            dict.fromkeys(part.strip() for part in api_key.split(",") if part.strip())
        )
        self._api_key_index = 0
        self.model = model
        self.dimension = dimension
        self.max_retries = max_retries
        self.retry_min_seconds = retry_min_seconds
        self.retry_max_seconds = retry_max_seconds
        self.timeout_seconds = timeout_seconds
        self.client_factory = client_factory
        self.formatter = formatter or RetrievalFormatter()
        self._client: Any | None = None
        self._client_timeout_seconds: float | None = None

    def _get_client(self, timeout_seconds: float | None = None) -> Any:
        if not self.api_keys:
            raise MissingGeminiApiKeyError(
                "GEMINI_API_KEY is required to call the Gemini embedding provider"
            )
        if self._client is not None and timeout_seconds != self._client_timeout_seconds:
            self.close()
        if self._client is None:
            kwargs: dict[str, Any] = {
                "api_key": self.api_keys[self._api_key_index],
                "vertexai": False,
            }
            if timeout_seconds is not None:
                kwargs["http_options"] = types.HttpOptions(
                    timeout=max(1, int(timeout_seconds * 1000))
                )
            self._client = self.client_factory(**kwargs)
            self._client_timeout_seconds = timeout_seconds
        return self._client

    def _advance_api_key(self) -> bool:
        if self._api_key_index + 1 >= len(self.api_keys):
            return False
        self.close()
        self._api_key_index += 1
        return True

    def _request(
        self,
        documents: list[str],
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        minimum_timeout_seconds: float = 0.001,
    ) -> list[list[float]]:
        contents = build_contents(documents)
        while True:
            if deadline is not None:
                deadline.checkpoint("query_embedding", is_cancelled)
                if timeout_seconds is not None:
                    timeout_seconds = deadline.clamp_timeout(
                        timeout_seconds,
                        stage="query_embedding",
                        minimum_seconds=minimum_timeout_seconds,
                    )
            try:
                response = self._get_client(timeout_seconds).models.embed_content(
                    model=self.model,
                    contents=contents,
                    config=types.EmbedContentConfig(
                        output_dimensionality=self.dimension,
                    ),
                )
                break
            except errors.APIError as exc:
                if is_api_key_failover_error(exc) and self._advance_api_key():
                    if deadline is not None:
                        deadline.checkpoint("query_embedding", is_cancelled)
                    continue
                if not is_retryable_gemini_error(exc):
                    current_key = (
                        self.api_keys[self._api_key_index] if self.api_keys else ""
                    )
                    context = error_context(
                        exc,
                        api_key=current_key,
                        model=self.model,
                        dimension=self.dimension,
                    )
                    raise PermanentEmbeddingError(
                        "Gemini request rejected: "
                        f"{context['httpCode']} {context['providerStatus']}: "
                        f"{context['message']}",
                        context=context,
                    ) from exc
                raise
        vectors = [list(embedding.values or []) for embedding in response.embeddings or []]
        return validate_vectors(vectors, len(documents), self.dimension)

    def embed_documents(
        self,
        documents: list[str],
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        minimum_timeout_seconds: float = 0.001,
    ) -> list[list[float]]:
        if not documents:
            return []
        configured_timeout = timeout_seconds or self.timeout_seconds
        attempt_number = 0

        def attempt() -> list[list[float]]:
            nonlocal attempt_number
            attempt_number += 1
            effective_timeout = configured_timeout
            if deadline is not None:
                deadline.checkpoint("query_embedding", is_cancelled)
                if configured_timeout is not None:
                    effective_timeout = deadline.clamp_timeout(
                        configured_timeout,
                        stage="query_embedding",
                        minimum_seconds=minimum_timeout_seconds,
                    )
                log_deadline_event(
                    deadline,
                    stage="query_embedding",
                    configured_timeout=configured_timeout,
                    effective_timeout=effective_timeout,
                    attempt_number=attempt_number,
                    outcome="started",
                )
            return self._request(
                documents,
                deadline=deadline,
                timeout_seconds=effective_timeout,
                is_cancelled=is_cancelled,
                minimum_timeout_seconds=minimum_timeout_seconds,
            )

        def sleep(seconds: float) -> None:
            if deadline is None:
                import time
                time.sleep(seconds)
                return
            deadline.sleep_within_budget(
                seconds,
                stage="query_embedding",
                is_cancelled=is_cancelled,
            )

        retrying = Retrying(
            retry=retry_if_exception(is_retryable_gemini_error),
            stop=stop_after_attempt(self.max_retries + 1),
            wait=wait_random_exponential(
                multiplier=self.retry_min_seconds,
                max=self.retry_max_seconds,
            ),
            sleep=sleep,
            reraise=True,
        )
        try:
            return retrying(attempt)
        except OperationDeadlineExceeded:
            raise
        except httpx.TimeoutException as exc:
            raise OperationDeadlineExceeded(
                "query_embedding", "EMBEDDING_TIMEOUT"
            ) from exc
        except errors.APIError as exc:
            context = error_context(
                exc,
                api_key=(self.api_keys[self._api_key_index] if self.api_keys else ""),
                model=self.model,
                dimension=self.dimension,
            )
            raise PermanentEmbeddingError(
                "Gemini request failed after retries: "
                f"{context['httpCode']} {context['providerStatus']}: "
                f"{context['message']}",
                context=context,
            ) from exc

    def embed_query(
        self,
        query: str,
        *,
        deadline: OperationDeadline | None = None,
        timeout_seconds: float | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        minimum_timeout_seconds: float = 0.001,
    ) -> list[float]:
        formatted = self.formatter.format_query(query)
        return self.embed_documents(
            [formatted],
            deadline=deadline,
            timeout_seconds=timeout_seconds,
            is_cancelled=is_cancelled,
            minimum_timeout_seconds=minimum_timeout_seconds,
        )[0]

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            self._client_timeout_seconds = None

    def __enter__(self) -> "GeminiEmbeddingProvider":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
