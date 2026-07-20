import os

import pytest

from app.config import Settings
from app.retrieval.models import RetrievalRequest
from app.retrieval.service import create_retrieval_service


@pytest.mark.integration
def test_production_retrieval_smoke() -> None:
    if os.getenv("RUN_PRODUCTION_RETRIEVAL_SMOKE") != "1":
        pytest.skip("set RUN_PRODUCTION_RETRIEVAL_SMOKE=1 for production retrieval")
    settings = Settings()
    if not settings.gemini_configured:
        pytest.skip("GEMINI_API_KEY is not configured")
    if not (settings.chroma_persist_dir / "chroma.sqlite3").is_file():
        pytest.skip("production Chroma persistence is unavailable")

    service = create_retrieval_service(settings)
    try:
        response = service.retrieve(
            RetrievalRequest(
                query="Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945",
                grade=12,
                lessonNumber=6,
                topK=5,
            )
        )
    finally:
        service.close()

    assert response.results
    assert all(result.grade == 12 for result in response.results)
    assert all(result.lesson_number == 6 for result in response.results)
    assert len({result.chunk_id for result in response.results}) == len(
        response.results
    )
    assert response.fact_context.source_chunk_ids == [
        result.chunk_id for result in response.results
    ]
