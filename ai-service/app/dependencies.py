"""FastAPI dependencies shared by API routes."""

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings
from app.core.runtime import AiRuntimeResources


def get_request_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_runtime_resources(request: Request) -> AiRuntimeResources:
    resources: AiRuntimeResources = request.app.state.runtime_resources
    if not resources.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI runtime is not ready",
        )
    return resources


def get_retrieval_service(
    resources: Annotated[AiRuntimeResources, Depends(get_runtime_resources)],
):
    return resources.retrieval_service


def get_generation_service(
    resources: Annotated[AiRuntimeResources, Depends(get_runtime_resources)],
):
    return resources.generation_service


def require_internal_token(
    settings: Annotated[Settings, Depends(get_request_settings)],
    token: Annotated[str | None, Header(alias="X-Internal-Service-Token")] = None,
) -> None:
    """Protect service-to-service routes without logging or echoing secrets."""

    expected = settings.ai_service_internal_token.get_secret_value()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal authentication is not configured",
        )
    if token is None or not secrets.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal authentication required",
        )
