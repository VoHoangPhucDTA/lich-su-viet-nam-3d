"""Protected, read-only internal provenance validation endpoint."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings
from app.core.runtime import AiRuntimeResources
from app.dependencies import (
    get_request_settings,
    get_retrieval_service,
    get_runtime_resources,
    require_internal_token,
)
from app.provenance.models import (
    CanonicalSourceSearchRequest,
    CanonicalSourceSearchResponse,
    CanonicalSourceSearchResult,
    ProvenanceValidationRequest,
    ProvenanceValidationResponse,
)
from app.provenance.service import validate_provenance
from app.retrieval.models import RetrievalNotReadyError, RetrievalProviderError, RetrievalRequest
from app.retrieval.service import RetrievalService

router = APIRouter(prefix="/provenance", tags=["internal-provenance"])


def _retrieval_grade(value: int | None) -> Literal[10, 11, 12] | None:
    if value is None:
        return None
    if value == 10:
        return 10
    if value == 11:
        return 11
    if value == 12:
        return 12
    raise ValueError("grade must be between 10 and 12")


@router.post(
    "/validate",
    response_model=ProvenanceValidationResponse,
    dependencies=[Depends(require_internal_token)],
)
def provenance_validate(
    request: ProvenanceValidationRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
    resources: Annotated[AiRuntimeResources, Depends(get_runtime_resources)],
) -> ProvenanceValidationResponse:
    try:
        if settings.deterministic_e2e_provider:
            from app.e2e.deterministic import validate_deterministic_provenance

            return validate_deterministic_provenance(request)
        return validate_provenance(
            request,
            settings,
            expected_metadata=resources.expected_collection_metadata,
            collection=resources.collection,
        )
    except RetrievalNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Provenance index is unavailable"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Provenance validation failed"
        ) from exc


@router.post(
    "/sources/search",
    response_model=CanonicalSourceSearchResponse,
    dependencies=[Depends(require_internal_token)],
)
def canonical_source_search(
    request: CanonicalSourceSearchRequest,
    settings: Annotated[Settings, Depends(get_request_settings)],
    service: Annotated[RetrievalService, Depends(get_retrieval_service)],
) -> CanonicalSourceSearchResponse:
    try:
        response = service.retrieve(
            RetrievalRequest(
                query=request.query,
                grade=_retrieval_grade(request.grade),
                lesson_number=request.lesson_number,
                document_id=request.document_id,
                top_k=request.top_k,
            )
        )
        return CanonicalSourceSearchResponse(
            results=[
                CanonicalSourceSearchResult(
                    chunk_id=result.chunk_id,
                    chunk_hash=result.chunk_hash,
                    document_id=result.document_id,
                    grade=result.grade,
                    lesson_number=result.lesson_number,
                    lesson_title=result.lesson_title,
                    section_title=result.section_title,
                    page_start=result.page_start,
                    page_end=result.page_end,
                    excerpt=result.text[:600],
                    distance=result.distance,
                    pending_review=False,
                )
                for result in response.results
            ]
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (RetrievalNotReadyError, RetrievalProviderError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Canonical source search is unavailable"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Canonical source search failed"
        ) from exc
