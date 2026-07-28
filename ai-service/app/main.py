"""FastAPI application factory and default application instance."""

from fastapi import FastAPI

from app.api.router import api_router
from app.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.request_context import request_context_middleware


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    application = FastAPI(
        title="History RAG AI Service",
        version="0.1.0",
    )
    application.state.settings = resolved_settings
    application.middleware("http")(request_context_middleware)
    application.include_router(api_router, prefix="/ai")
    return application


app = create_app()
