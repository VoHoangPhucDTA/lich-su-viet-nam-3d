"""FastAPI dependencies shared by API routes."""

from fastapi import Request

from app.config import Settings


def get_request_settings(request: Request) -> Settings:
    return request.app.state.settings
