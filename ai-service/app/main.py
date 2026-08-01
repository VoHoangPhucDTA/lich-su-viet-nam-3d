"""FastAPI application factory and default application instance."""

from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.request_context import request_context_middleware
from app.core.runtime import AiRuntimeResources


def create_app(
    settings: Settings | None = None,
    runtime_factory: Callable[[Settings], AiRuntimeResources] | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)

    resources = (
        runtime_factory(resolved_settings)
        if runtime_factory is not None
        else AiRuntimeResources(resolved_settings)
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        resources.start()
        try:
            yield
        finally:
            resources.shutdown()

    application = FastAPI(
        title="History RAG AI Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.runtime_resources = resources
    application.middleware("http")(request_context_middleware)
    application.include_router(api_router, prefix="/ai")
    return application


app = create_app()
