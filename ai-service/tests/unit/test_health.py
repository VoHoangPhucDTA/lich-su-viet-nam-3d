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
