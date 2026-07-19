"""FastAPI application factory and default application instance."""

from fastapi import FastAPI

from app.api.router import api_router
from app.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    application = FastAPI(
        title="History RAG AI Service",
        version="0.1.0",
    )
    application.state.settings = resolved_settings
    application.include_router(api_router, prefix="/ai")
    return application


app = create_app()
