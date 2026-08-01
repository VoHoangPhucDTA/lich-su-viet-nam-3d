import logging

from fastapi.testclient import TestClient

from app.config import Settings
from app.core.deadline import OperationDeadline
from app.e2e.deterministic import (
    E2E_CHUNK_HASH,
    E2E_CHUNK_ID,
    E2E_COLLECTION,
    E2E_CORPUS_SHA256,
    E2E_EMBEDDING_DIMENSION,
    E2E_EMBEDDING_MODEL,
    DeterministicGenerationProvider,
)
from app.embedding.fake import FakeEmbeddingProvider
from app.generation.schemas import GeneratedQuestionBatch
from app.main import create_app


def test_deterministic_provider_exercises_generation_and_provenance_contract() -> None:
    settings = Settings(
        _env_file=None,
        app_env="e2e",
        deterministic_e2e_provider=True,
        gemini_api_key="",
        ai_service_internal_token="test-internal-token",
        quiz_default_count=1,
    )
    app = create_app(settings)
    app.state.runtime_resources.start()
    client = TestClient(app)
    generated = client.post("/ai/quiz/generate", json={
        "query": "Cách mạng tháng Tám", "grade": 12, "lessonNumber": 6, "count": 3
    }, headers={"X-Internal-Service-Token": "test-internal-token"})
    assert generated.status_code == 200
    body = generated.json()
    assert len(body["questions"]) == 3
    assert body["metadata"]["generationModel"] == "deterministic-e2e-generation-v1"
    assert all(question["sourceChunkIds"] == [E2E_CHUNK_ID] for question in body["questions"])

    validated = client.post(
        "/ai/provenance/validate",
        headers={"X-Internal-Service-Token": "test-internal-token"},
        json={
            "corpusSha256": E2E_CORPUS_SHA256,
            "collectionName": E2E_COLLECTION,
            "embeddingModel": E2E_EMBEDDING_MODEL,
            "embeddingDimension": E2E_EMBEDDING_DIMENSION,
            "sources": [{"chunkId": E2E_CHUNK_ID, "chunkHash": E2E_CHUNK_HASH}],
        },
    )
    assert validated.status_code == 200
    assert validated.json()["valid"] is True
    app.state.runtime_resources.shutdown()


def test_deterministic_providers_accept_typed_contract_without_gemini() -> None:
    embedding_provider = FakeEmbeddingProvider(dimension=8)
    assert len(embedding_provider.embed_query("query")) == 8

    generated = DeterministicGenerationProvider().generate_structured(
        "GENERATION REQUEST\ncount: 1\ndifficulty: MEDIUM",
        deadline=OperationDeadline(5),
        timeout_seconds=1.25,
    )

    assert isinstance(generated, GeneratedQuestionBatch)
    assert len(generated.questions) == 1


def test_deterministic_app_rehearses_candidate_current_and_rollback_without_gemini(
    caplog,
) -> None:
    def invoke(rollout: int, payload: dict[str, object]) -> tuple[dict, str]:
        configured = Settings(
            _env_file=None,
            app_env="e2e",
            deterministic_e2e_provider=True,
            ai_service_internal_token="test-internal-token",
            self_practice_model_enabled=True,
            self_practice_model_rollout_percent=rollout,
        )
        app = create_app(configured)
        with (
            caplog.at_level(logging.INFO, logger="app.generation"),
            TestClient(app) as client,
        ):
            response = client.post(
                "/ai/quiz/generate",
                json=payload,
                headers={"X-Internal-Service-Token": "test-internal-token"},
            )
        assert response.status_code == 200
        assert "modelClass" not in response.json()
        routing_log = next(
            record.message
            for record in reversed(caplog.records)
            if "event=generation.routing" in record.message
        )
        caplog.clear()
        return response.json(), routing_log

    base: dict[str, object] = {
        "query": "Cách mạng tháng Tám",
        "count": 1,
        "generationUseCase": "SELF_PRACTICE",
        "canarySubject": "synthetic-subject",
    }
    _candidate_body, candidate_log = invoke(100, base)
    _admin_body, admin_log = invoke(100, {**base, "generationUseCase": "ADMIN_REVIEW"})
    _missing_body, missing_log = invoke(100, {**base, "canarySubject": None})
    _rollback_body, rollback_log = invoke(0, base)

    assert "modelClass=CANDIDATE" in candidate_log
    assert "modelClass=CURRENT" in admin_log
    assert "routingReason=MISSING_CANARY_SUBJECT" in missing_log
    assert "routingReason=ROLLOUT_ZERO" in rollback_log
