"""Service health endpoint."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings
from app.dependencies import get_request_settings
from app.embedding.checkpoint import sanitize_artifact_name
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


def _retrieval_ready(settings: Settings, chroma_ready: bool) -> bool:
    if not chroma_ready or not settings.gemini_configured:
        return False
    report_path = (
        settings.chroma_report_dir
        / f"{settings.chroma_collection_name}-index-report.json"
    )
    artifact_dir = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    manifest_path = artifact_dir / "embedding_manifest.json"
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    count = report.get("collectionCountAfter")
    corpus_sha = manifest.get("corpusSha256")
    return (
        report.get("embeddingModel") == settings.gemini_embedding_model
        and report.get("dimension") == settings.gemini_embedding_dimension
        and manifest.get("status") == "COMPLETED"
        and manifest.get("embeddingModel") == settings.gemini_embedding_model
        and manifest.get("dimension") == settings.gemini_embedding_dimension
        and manifest.get("eligibleRecords") == count
        and manifest.get("successfulRecords") == count
        and isinstance(corpus_sha, str)
        and len(corpus_sha) == 64
        and bool(str(manifest.get("formatterVersion", "")).strip())
    )
@router.get("/health", response_model=HealthResponse)
def health(
    settings: Annotated[Settings, Depends(get_request_settings)],
) -> HealthResponse:
    if settings.deterministic_e2e_provider:
        return HealthResponse(
            status="ok",
            service="history-rag-ai-service",
            environment=settings.app_env,
            chroma_ready=True,
            retrieval_ready=True,
            generation_ready=True,
            gemini_configured=False,
        )
    chroma_ready = _chroma_ready(settings)
    retrieval_ready = _retrieval_ready(settings, chroma_ready)
    return HealthResponse(
        status="ok",
        service="history-rag-ai-service",
        environment=settings.app_env,
        chroma_ready=chroma_ready,
        retrieval_ready=retrieval_ready,
        generation_ready=(
            retrieval_ready
            and bool(settings.gemini_generation_model.strip())
            and settings.gemini_configured
        ),
        gemini_configured=settings.gemini_configured,
    )
