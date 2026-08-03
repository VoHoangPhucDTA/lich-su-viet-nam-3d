"""Root router for AI service endpoints."""

from fastapi import APIRouter

from app.api.routes.generation import router as generation_router
from app.api.routes.health import router as health_router
from app.api.routes.provenance import router as provenance_router
from app.api.routes.retrieval import router as retrieval_router

api_router = APIRouter()
api_router.include_router(generation_router)
api_router.include_router(health_router)
api_router.include_router(retrieval_router)
api_router.include_router(provenance_router)
