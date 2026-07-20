import os

import pytest

from app.config import Settings
from app.generation.models import GenerationRequest
from app.generation.service import create_generation_service


@pytest.mark.integration
def test_production_generation_smoke() -> None:
    if os.getenv("RUN_PRODUCTION_GENERATION_SMOKE") != "1":
        pytest.skip("set RUN_PRODUCTION_GENERATION_SMOKE=1 for production generation")
    settings = Settings()
    if not settings.gemini_configured or not settings.gemini_generation_model.strip():
        pytest.skip("generation model/key is not configured")
    if not (settings.chroma_persist_dir / "chroma.sqlite3").is_file():
        pytest.skip("production retrieval is unavailable")
    service = create_generation_service(settings)
    try:
        response = service.generate(
            GenerationRequest(
                query="Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945",
                grade=12,
                lessonNumber=6,
                difficulty="MEDIUM",
                count=1,
                topK=5,
            )
        )
    finally:
        service.close()
    assert response.metadata.generated_count == 1
    assert len(response.questions[0].options) == 4
    assert response.questions[0].source_chunk_ids
