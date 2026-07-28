import json
import re

from fastapi.testclient import TestClient

from app.config import Settings
from app.embedding.checkpoint import sanitize_artifact_name
from app.main import create_app
from app.api.routes import health as health_route


def test_health_endpoint_without_external_clients(tmp_path) -> None:
    app = create_app(
        Settings(
            _env_file=None,
            chroma_persist_dir=tmp_path / "chroma",
            chroma_report_dir=tmp_path / "reports",
        )
    )

    response = TestClient(app).get("/ai/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "history-rag-ai-service",
        "environment": "development",
        "chromaReady": False,
        "retrievalReady": False,
        "generationReady": False,
        "geminiConfigured": False,
    }
    assert re.fullmatch(
        r"[0-9a-f-]{36}",
        response.headers["X-Request-ID"],
    )


def test_request_id_is_validated_and_echoed(tmp_path, caplog) -> None:
    client = TestClient(
        create_app(
            Settings(
                _env_file=None,
                chroma_persist_dir=tmp_path / "chroma",
                chroma_report_dir=tmp_path / "reports",
            )
        )
    )
    valid = client.get(
        "/ai/health",
        headers={"X-Request-ID": "spring-request_01"},
    )
    assert valid.headers["X-Request-ID"] == "spring-request_01"
    assert "requestId=spring-request_01" in caplog.text
    assert "X-Internal-Service-Token" not in caplog.text
    invalid = client.get(
        "/ai/health",
        headers={"X-Request-ID": "x" * 129},
    )
    assert invalid.headers["X-Request-ID"] != "x" * 129
    assert re.fullmatch(r"[0-9a-f-]{36}", invalid.headers["X-Request-ID"])


def test_deep_readiness_checks_collection_without_gemini(
    tmp_path,
    monkeypatch,
) -> None:
    settings = Settings(
        _env_file=None,
        chroma_persist_dir=tmp_path / "chroma",
        chroma_report_dir=tmp_path / "reports",
        embedding_output_dir=tmp_path / "embeddings",
    )
    artifact = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model,
        settings.gemini_embedding_dimension,
    )
    artifact.mkdir(parents=True)
    (artifact / "embedding_manifest.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "embeddingModel": settings.gemini_embedding_model,
                "dimension": settings.gemini_embedding_dimension,
                "corpusSha256": "a" * 64,
            }
        ),
        encoding="utf-8",
    )

    class Collection:
        metadata = {}
        configuration = {"hnsw": {"space": "cosine"}}

        def count(self):
            return 414

    class Client:
        def get_collection(self, name):
            return Collection()

    monkeypatch.setattr(
        health_route,
        "_expected_collection_metadata",
        lambda _: {},
    )
    monkeypatch.setattr(health_route, "create_persistent_client", lambda _: Client())
    monkeypatch.setattr(health_route, "collection_exists", lambda *_: True)
    monkeypatch.setattr(health_route, "get_collection", lambda client, name: client.get_collection(name))
    monkeypatch.setattr(health_route, "validate_collection_contract", lambda *args: None)
    monkeypatch.setattr(health_route, "close_persistent_client", lambda _: None)

    response = TestClient(create_app(settings)).get("/ai/health?deep=true")
    assert response.status_code == 200
    assert response.json()["status"] == "READY"
    assert response.json()["recordCount"] == 414
    assert response.json()["contractReady"] is True


def test_deep_readiness_returns_sanitized_503_when_collection_missing(
    tmp_path,
    monkeypatch,
) -> None:
    settings = Settings(
        _env_file=None,
        chroma_persist_dir=tmp_path / "chroma",
        chroma_report_dir=tmp_path / "reports",
        embedding_output_dir=tmp_path / "embeddings",
    )
    artifact = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model,
        settings.gemini_embedding_dimension,
    )
    artifact.mkdir(parents=True)
    (artifact / "embedding_manifest.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "embeddingModel": settings.gemini_embedding_model,
                "dimension": settings.gemini_embedding_dimension,
                "corpusSha256": "a" * 64,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        health_route,
        "_expected_collection_metadata",
        lambda _: {},
    )
    monkeypatch.setattr(
        health_route,
        "create_persistent_client",
        lambda _: object(),
    )
    monkeypatch.setattr(health_route, "collection_exists", lambda *_: False)
    monkeypatch.setattr(health_route, "close_persistent_client", lambda _: None)

    response = TestClient(create_app(settings)).get("/ai/health?deep=true")
    assert response.status_code == 503
    assert response.json()["status"] == "NOT_READY"
    assert response.json()["errorCode"] == "AI_COLLECTION_NOT_FOUND"
    assert "path" not in response.text.lower()


def test_health_reports_ready_from_lightweight_persisted_artifacts(tmp_path) -> None:
    persist_dir = tmp_path / "chroma"
    report_dir = tmp_path / "reports"
    persist_dir.mkdir()
    report_dir.mkdir()
    (persist_dir / "chroma.sqlite3").write_bytes(b"database-marker")
    (report_dir / "collection-name-index-report.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "collectionName": "collection-name",
                "inputRecords": 414,
                "collectionCountAfter": 414,
            }
        ),
        encoding="utf-8",
    )
    app = create_app(
        Settings(
            _env_file=None,
            chroma_persist_dir=persist_dir,
            chroma_report_dir=report_dir,
            chroma_collection_name="collection-name",
        )
    )

    response = TestClient(app).get("/ai/health")

    assert response.status_code == 200
    assert response.json()["chromaReady"] is True
    assert response.json()["retrievalReady"] is False


def test_retrieval_ready_requires_compatible_manifest_and_index_report(tmp_path) -> None:
    persist_dir = tmp_path / "chroma"
    report_dir = tmp_path / "reports"
    embedding_dir = tmp_path / "embeddings"
    artifact_dir = embedding_dir / "gemini-embedding-2-768"
    persist_dir.mkdir()
    report_dir.mkdir()
    artifact_dir.mkdir(parents=True)
    (persist_dir / "chroma.sqlite3").write_bytes(b"database-marker")
    (report_dir / "collection-name-index-report.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "collectionName": "collection-name",
                "inputRecords": 414,
                "collectionCountAfter": 414,
                "embeddingModel": "gemini-embedding-2",
                "dimension": 768,
            }
        ),
        encoding="utf-8",
    )
    (artifact_dir / "embedding_manifest.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "corpusSha256": "a" * 64,
                "embeddingModel": "gemini-embedding-2",
                "dimension": 768,
                "formatterVersion": "gemini-retrieval-document-v1",
                "eligibleRecords": 414,
                "successfulRecords": 414,
            }
        ),
        encoding="utf-8",
    )
    configured = Settings(
        _env_file=None,
        gemini_api_key="configured",
        embedding_output_dir=embedding_dir,
        chroma_persist_dir=persist_dir,
        chroma_report_dir=report_dir,
        chroma_collection_name="collection-name",
    )

    response = TestClient(create_app(configured)).get("/ai/health")

    assert response.json()["retrievalReady"] is True
    assert response.json()["generationReady"] is False
