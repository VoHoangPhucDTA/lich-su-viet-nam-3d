"""Request correlation context and sanitized completion logging."""

from contextvars import ContextVar
import re
import time
from uuid import uuid4

from fastapi import Request, Response

from app.core.logging import request_logger

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_request_id: ContextVar[str] = ContextVar("request_id", default="")


def current_request_id() -> str:
    return _request_id.get()


def _validated_request_id(value: str | None) -> str:
    if value is not None and _REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return str(uuid4())


async def request_context_middleware(
    request: Request,
    call_next,
) -> Response:
    request_id = _validated_request_id(request.headers.get(REQUEST_ID_HEADER))
    request.state.request_id = request_id
    token = _request_id.set(request_id)
    started = time.perf_counter()
    response: Response | None = None
    exception_class: str | None = None
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        exception_class = type(exc).__name__
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000
        status_code = response.status_code if response is not None else 500
        error_code = f"HTTP_{status_code}" if status_code >= 400 else "NONE"
        request_logger.info(
            "event=request.completed requestId=%s route=%s method=%s "
            "statusCode=%s durationMs=%.2f outcome=%s errorCode=%s "
            "exceptionClass=%s",
            request_id,
            request.url.path,
            request.method,
            status_code,
            duration_ms,
            "success" if status_code < 400 else "error",
            error_code,
            exception_class or "none",
        )
        if response is not None:
            response.headers[REQUEST_ID_HEADER] = request_id
        _request_id.reset(token)
