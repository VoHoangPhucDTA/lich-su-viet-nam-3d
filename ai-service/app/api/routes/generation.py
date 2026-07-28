"""Internal grounded MCQ generation endpoint; never persists questions."""

import inspect
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import Settings
from app.core.deadline import (
    ClientDisconnectedError,
    OperationDeadline,
    OperationDeadlineExceeded,
)
from app.dependencies import get_request_settings, require_internal_token
from app.generation.models import (
    GenerationNotConfiguredError,
    GenerationOutputError,
    GenerationPermanentError,
    GenerationRequest,
    GenerationResponse,
    GenerationSafetyError,
    GenerationTransientError,
    InsufficientContextError,
)
from app.generation.service import create_generation_service
from app.retrieval.models import (
    RetrievalNotReadyError,
    RetrievalProviderError,
    RetrievalSafetyError,
)

router = APIRouter(prefix="/quiz", tags=["generation"])


@router.post(
    "/generate",
    response_model=GenerationResponse,
    dependencies=[Depends(require_internal_token)],
)
async def generate_quiz(
    request: GenerationRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> GenerationResponse:
    service = None
    deadline = OperationDeadline(settings.ai_request_deadline_seconds)
    try:
        if await http_request.is_disconnected():
            raise ClientDisconnectedError("generation")
        service = create_generation_service(settings)
        method = service.generate
        parameters = inspect.signature(method).parameters

        def is_cancelled() -> bool:
            return anyio.from_thread.run(http_request.is_disconnected)

        kwargs = {}
        if "deadline" in parameters:
            kwargs["deadline"] = deadline
        if "is_cancelled" in parameters:
            kwargs["is_cancelled"] = is_cancelled
        return await anyio.to_thread.run_sync(
            lambda: method(request, **kwargs)
        )
    except OperationDeadlineExceeded as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(status_code=504, detail=exc.code) from exc
    except ClientDisconnectedError as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(status_code=503, detail=exc.code) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InsufficientContextError as exc:
        raise HTTPException(status_code=409, detail="INSUFFICIENT_CONTEXT") from exc
    except (RetrievalNotReadyError, RetrievalProviderError) as exc:
        raise HTTPException(status_code=503, detail="Retrieval is unavailable") from exc
    except RetrievalSafetyError as exc:
        http_request.state.error_code = exc.code
        raise HTTPException(status_code=503, detail=exc.code) from exc
    except (GenerationNotConfiguredError, GenerationTransientError) as exc:
        raise HTTPException(status_code=503, detail="Generation service is unavailable") from exc
    except (GenerationOutputError, GenerationPermanentError, GenerationSafetyError) as exc:
        raise HTTPException(status_code=502, detail="Generated output is invalid") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unexpected generation failure") from exc
    finally:
        if service is not None:
            await anyio.to_thread.run_sync(service.close)
