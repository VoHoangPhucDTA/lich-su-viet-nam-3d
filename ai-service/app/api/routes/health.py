"""Service health endpoint."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings
from app.dependencies import get_request_settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


def _chroma_ready(settings: Settings) -> bool:
    database = settings.chroma_persist_dir / "chroma.sqlite3"
    report = (
        settings.chroma_report_dir
        / f"{settings.chroma_collection_name}-index-report.json"
    )
    if not database.is_file() or not report.is_file():
        return False
    try:
        value = json.loads(report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (
        value.get("status") == "COMPLETED"
        and value.get("collectionName") == settings.chroma_collection_name
        and value.get("collectionCountAfter", 0) == value.get("inputRecords", -1)
        and value.get("collectionCountAfter", 0) > 0
    )


@router.get("/health", response_model=HealthResponse)
def health(
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="history-rag-ai-service",
        environment=settings.app_env,
        chroma_ready=_chroma_ready(settings),
        gemini_configured=settings.gemini_configured,
    )
