from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.core.runtime import AiRuntimeResources
from app.generation.models import GenerationRequest
from app.main import create_app
from app.provenance.models import CanonicalSourceSearchResult
from app.retrieval.models import RetrievalRequest
from app.schemas.common import HealthResponse

TOKEN = "internal-test-token-with-enough-entropy"


def configured(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        deterministic_e2e_provider=True,
        ai_service_internal_token=TOKEN,
        gemini_generation_model="deterministic-e2e-generation-v1",
        chroma_persist_dir=tmp_path / "chroma",
        chroma_report_dir=tmp_path / "reports",
    )


def test_internal_snake_case_construction_keeps_camel_case_wire_aliases() -> None:
    health = HealthResponse(
        status="READY",
        service="history-rag-ai-service",
        environment="test",
        chroma_ready=True,
        retrieval_ready=True,
        generation_ready=True,
        gemini_configured=False,
        record_count=414,
        contract_ready=True,
    ).model_dump(by_alias=True, exclude_none=True)
    assert health["chromaReady"] is True
    assert health["recordCount"] == 414
    assert "chroma_ready" not in health

    source = CanonicalSourceSearchResult(
        chunk_id="chunk-1",
        chunk_hash="a" * 64,
        document_id="doc-1",
        grade=12,
        lesson_number=6,
        lesson_title="Lesson",
        section_title="Section",
        excerpt="Excerpt",
        distance=0.1,
    ).model_dump(by_alias=True)
    assert source["chunkId"] == "chunk-1"
    assert source["lessonNumber"] == 6
    assert source["pendingReview"] is False

    generation = GenerationRequest(
        query="event",
        lesson_number=6,
        top_k=5,
    ).model_dump(by_alias=True)
    retrieval = RetrievalRequest(
        query="event",
        lesson_number=6,
        top_k=5,
    ).model_dump(by_alias=True)
    assert generation["lessonNumber"] == retrieval["lessonNumber"] == 6
    assert generation["topK"] == retrieval["topK"] == 5


def test_openapi_paths_methods_models_and_internal_token_header_are_stable(
    tmp_path: Path,
) -> None:
    schema = create_app(configured(tmp_path)).openapi()
    contracts = {
        ("/ai/quiz/generate", "post"): "GenerationResponse",
        ("/ai/retrieval/debug", "post"): "RetrievalResponse",
        ("/ai/provenance/validate", "post"): "ProvenanceValidationResponse",
        ("/ai/provenance/sources/search", "post"): "CanonicalSourceSearchResponse",
        ("/ai/health", "get"): "HealthResponse",
    }

    for (path, method), model_name in contracts.items():
        operation = schema["paths"][path][method]
        response_schema = operation["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert response_schema["$ref"].endswith(f"/{model_name}")
        header_names = {
            parameter["name"]
            for parameter in operation.get("parameters", [])
            if parameter["in"] == "header"
        }
        if path == "/ai/health":
            assert "X-Internal-Service-Token" not in header_names
        else:
            assert "X-Internal-Service-Token" in header_names


def test_closed_runtime_fails_ai_routes_closed_but_keeps_health_contract(
    tmp_path: Path,
) -> None:
    settings = configured(tmp_path)
    resources = AiRuntimeResources(settings)
    resources.start()
    resources.shutdown()
    app = create_app(settings, runtime_factory=lambda _settings: resources)
    headers = {"X-Internal-Service-Token": TOKEN}
    requests = [
        ("/ai/quiz/generate", {"query": "valid"}),
        ("/ai/retrieval/debug", {"query": "valid"}),
        (
            "/ai/provenance/validate",
            {
                "corpusSha256": "a" * 64,
                "collectionName": "history_rag_e2e_fixture_v1",
                "embeddingModel": "deterministic-e2e-embedding-v1",
                "embeddingDimension": 8,
                "sources": [{"chunkId": "chunk", "chunkHash": "b" * 64}],
            },
        ),
        ("/ai/provenance/sources/search", {"query": "valid"}),
    ]

    with TestClient(app) as client:
        for path, payload in requests:
            response = client.post(path, json=payload, headers=headers)
            assert response.status_code == 503
            assert response.json() == {"detail": "AI runtime is not ready"}
        assert client.get("/ai/health").status_code == 200
        assert client.get("/ai/health?deep=true").status_code == 503
