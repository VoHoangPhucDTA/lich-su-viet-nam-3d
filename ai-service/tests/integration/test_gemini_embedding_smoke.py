import os

import pytest

from app.embedding.gemini import GeminiEmbeddingProvider


@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY"),
    reason="GEMINI_API_KEY is not configured",
)
def test_gemini_embedding_smoke() -> None:
    provider = GeminiEmbeddingProvider(
        api_key=os.environ["GEMINI_API_KEY"],
        model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2"),
        dimension=int(os.getenv("GEMINI_EMBEDDING_DIMENSION", "768")),
        max_retries=1,
    )
    try:
        vectors = provider.embed_documents(
            ["title: Lịch sử Việt Nam | text: Cách mạng tháng Tám năm 1945."]
        )
    finally:
        provider.close()
    assert len(vectors) == 1
    assert len(vectors[0]) == provider.dimension
