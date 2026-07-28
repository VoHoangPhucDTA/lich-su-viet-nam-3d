"""Internal grounded MCQ generation endpoint; never persists questions."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings
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
from app.retrieval.models import RetrievalNotReadyError, RetrievalProviderError

router = APIRouter(prefix="/quiz", tags=["generation"])


@router.post(
    "/generate",
    response_model=GenerationResponse,
    dependencies=[Depends(require_internal_token)],
)
def generate_quiz(
    request: GenerationRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> GenerationResponse:
    service = None
    try:
        service = create_generation_service(settings)
        return service.generate(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InsufficientContextError as exc:
        raise HTTPException(status_code=409, detail="INSUFFICIENT_CONTEXT") from exc
    except (RetrievalNotReadyError, RetrievalProviderError) as exc:
        raise HTTPException(status_code=503, detail="Retrieval is unavailable") from exc
    except (GenerationNotConfiguredError, GenerationTransientError) as exc:
        raise HTTPException(status_code=503, detail="Generation service is unavailable") from exc
    except (GenerationOutputError, GenerationPermanentError, GenerationSafetyError) as exc:
        raise HTTPException(status_code=502, detail="Generated output is invalid") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unexpected generation failure") from exc
    finally:
        if service is not None:
            service.close()
