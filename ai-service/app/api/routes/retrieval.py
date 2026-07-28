"""Internal retrieval debug endpoint; never calls a generation model."""

import inspect
from collections.abc import Callable
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.config import Settings
from app.core.deadline import (
    ClientDisconnectedError,
    OperationDeadline,
    OperationDeadlineExceeded,
)
from app.dependencies import (
    get_request_settings,
    get_retrieval_service,
    require_internal_token,
)
from app.retrieval.models import (
    RetrievalError,
    RetrievalNotReadyError,
    RetrievalProviderError,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalSafetyError,
)
from app.retrieval.service import RetrievalService

router = APIRouter(prefix="/retrieval", tags=["retrieval"])


@router.post(
    "/debug",
    response_model=RetrievalResponse,
    dependencies=[Depends(require_internal_token)],
)
async def retrieval_debug(
    request: RetrievalRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_request_settings)],
    service: Annotated[RetrievalService, Depends(get_retrieval_service)],
) -> RetrievalResponse:
    deadline = OperationDeadline(settings.ai_request_deadline_seconds)
    try:
        if await http_request.is_disconnected():
            raise ClientDisconnectedError("retrieval")
        retrieval_method: Callable[..., RetrievalResponse] = service.retrieve
        parameters = inspect.signature(retrieval_method).parameters

        def is_cancelled() -> bool:
            return anyio.from_thread.run(http_request.is_disconnected)

        retrieval_kwargs: dict[str, object] = {}
        if "deadline" in parameters:
            retrieval_kwargs["deadline"] = deadline
        if "is_cancelled" in parameters:
            retrieval_kwargs["is_cancelled"] = is_cancelled
        return await anyio.to_thread.run_sync(
            lambda: retrieval_method(request, **retrieval_kwargs)
        )
    except OperationDeadlineExceeded as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=exc.code,
        ) from exc
    except ClientDisconnectedError as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.code,
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RetrievalNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Retrieval index is not ready",
        ) from exc
    except RetrievalProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Query embedding service is unavailable",
        ) from exc
    except RetrievalSafetyError as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.code,
        ) from exc
    except RetrievalError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Retrieval failed",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected retrieval failure",
        ) from exc
