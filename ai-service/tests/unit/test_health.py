import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


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
        "geminiConfigured": False,
    }


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
