"""Compatibility entry point for running the AI service directly."""

import uvicorn

from app.config import get_settings
from app.main import app

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(app, host=settings.host, port=settings.port)
