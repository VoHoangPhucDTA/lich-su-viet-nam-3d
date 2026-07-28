"""Internal retrieval debug endpoint; never calls a generation model."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings
from app.dependencies import get_request_settings, require_internal_token
from app.retrieval.models import (
    RetrievalError,
    RetrievalNotReadyError,
    RetrievalProviderError,
    RetrievalRequest,
    RetrievalResponse,
)
from app.retrieval.service import create_retrieval_service

router = APIRouter(prefix="/retrieval", tags=["retrieval"])


@router.post(
    "/debug",
    response_model=RetrievalResponse,
    dependencies=[Depends(require_internal_token)],
)
def retrieval_debug(
    request: RetrievalRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> RetrievalResponse:
    service = None
    try:
        service = create_retrieval_service(settings)
        return service.retrieve(request)
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
    finally:
        if service is not None:
            service.close()
