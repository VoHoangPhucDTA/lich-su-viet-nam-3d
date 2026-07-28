"""Protected, read-only internal provenance validation endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings
from app.dependencies import get_request_settings, require_internal_token
from app.provenance.models import (
    CanonicalSourceSearchRequest,
    CanonicalSourceSearchResponse,
    CanonicalSourceSearchResult,
    ProvenanceValidationRequest,
    ProvenanceValidationResponse,
)
from app.provenance.service import validate_provenance
from app.retrieval.models import RetrievalNotReadyError, RetrievalProviderError, RetrievalRequest
from app.retrieval.service import create_retrieval_service

router = APIRouter(prefix="/provenance", tags=["internal-provenance"])

@router.post(
    "/validate",
    response_model=ProvenanceValidationResponse,
    dependencies=[Depends(require_internal_token)],
)
def provenance_validate(
    request: ProvenanceValidationRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> ProvenanceValidationResponse:
    try:
        if settings.deterministic_e2e_provider:
            from app.e2e.deterministic import validate_deterministic_provenance

            return validate_deterministic_provenance(request)
        return validate_provenance(request, settings)
    except RetrievalNotReadyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Provenance index is unavailable") from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Provenance validation failed") from exc


@router.post(
    "/sources/search",
    response_model=CanonicalSourceSearchResponse,
    dependencies=[Depends(require_internal_token)],
)
def canonical_source_search(
    request: CanonicalSourceSearchRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> CanonicalSourceSearchResponse:
    service = None
    try:
        if settings.deterministic_e2e_provider:
            from app.e2e.deterministic import DeterministicRetrievalService

            service = DeterministicRetrievalService()
        else:
            service = create_retrieval_service(settings)
        response = service.retrieve(RetrievalRequest(
            query=request.query,
            grade=request.grade,
            lessonNumber=request.lesson_number,
            documentId=request.document_id,
            topK=request.top_k,
        ))
        return CanonicalSourceSearchResponse(results=[CanonicalSourceSearchResult(
            chunkId=result.chunk_id,
            chunkHash=result.chunk_hash,
            documentId=result.document_id,
            grade=result.grade,
            lessonNumber=result.lesson_number,
            lessonTitle=result.lesson_title,
            sectionTitle=result.section_title,
            pageStart=result.page_start,
            pageEnd=result.page_end,
            excerpt=result.text[:600],
            distance=result.distance,
            pendingReview=False,
        ) for result in response.results])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (RetrievalNotReadyError, RetrievalProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Canonical source search is unavailable") from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Canonical source search failed") from exc
    finally:
        if service is not None:
            service.close()
