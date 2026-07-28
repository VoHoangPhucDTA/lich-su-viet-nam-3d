import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.config import Settings
from app.dependencies import get_retrieval_service
from app.embedding.checkpoint import sanitize_artifact_name
from app.main import create_app
from app.retrieval.service import _expected_collection_metadata
from app.vectorstore.chroma_client import close_persistent_client, create_collection, create_persistent_client
from tests.chroma_utils import reset_chroma_system_cache_for_tests

TOKEN = "internal-test-token-with-enough-entropy"


def configured_settings(tmp_path: Path) -> Settings:
    settings = Settings(
        _env_file=None,
        ai_service_internal_token=TOKEN,
        gemini_embedding_dimension=3,
        embedding_output_dir=tmp_path / "embeddings",
        embedding_checkpoint_dir=tmp_path / "checkpoints",
        chroma_persist_dir=tmp_path / "chroma",
        chroma_report_dir=tmp_path / "reports",
        sgk_chunks_path=tmp_path / "chunks.jsonl",
    )
    artifact = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model, settings.gemini_embedding_dimension
    )
    artifact.mkdir(parents=True)
    (artifact / "embedding_manifest.json").write_text(
        json.dumps(
            {
                "status": "COMPLETED",
                "corpusSha256": "a" * 64,
                "formatterVersion": "gemini-retrieval-document-v1",
            }
        ),
        encoding="utf-8",
    )
    client = create_persistent_client(settings.chroma_persist_dir)
    collection = create_collection(
        client,
        name=settings.chroma_collection_name,
        metadata=_expected_collection_metadata(settings),
        distance_metric=settings.chroma_distance_metric,
    )
    collection.add(
        ids=["chunk-valid", "chunk-pending"],
        embeddings=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        documents=["secret textbook content", "pending secret content"],
        metadatas=[
            {
                "chunkHash": "b" * 64,
                "containsPendingReview": False,
                "documentId": "doc-1",
                "grade": 12,
                "lessonNumber": 6,
                "lessonTitle": "Lesson",
                "sectionTitle": "Section",
                "pageStart": 1,
                "pageEnd": 2,
            },
            {
                "chunkHash": "c" * 64,
                "containsPendingReview": True,
                "documentId": "doc-1",
                "grade": 12,
                "lessonNumber": 6,
                "lessonTitle": "Lesson",
                "sectionTitle": "Pending",
                "pageStart": 3,
                "pageEnd": 3,
            },
        ],
    )
    close_persistent_client(client)
    reset_chroma_system_cache_for_tests()
    return settings


def payload(**overrides):
    value = {
        "corpusSha256": "a" * 64,
        "collectionName": "sgk_kntt_history_gemini_v1",
        "embeddingModel": "gemini-embedding-2",
        "embeddingDimension": 3,
        "sources": [{"chunkId": "chunk-valid", "chunkHash": "b" * 64}],
    }
    value.update(overrides)
    return value


def test_internal_auth_is_required_and_invalid_token_is_rejected(tmp_path: Path) -> None:
    client = TestClient(create_app(configured_settings(tmp_path)))
    assert client.post("/ai/provenance/validate", json=payload()).status_code == 401
    assert (
        client.post(
            "/ai/provenance/validate", json=payload(), headers={"X-Internal-Service-Token": "wrong"}
        ).status_code
        == 401
    )


def test_valid_identity_returns_only_metadata_flags(tmp_path: Path) -> None:
    with TestClient(create_app(configured_settings(tmp_path))) as client:
        response = client.post(
            "/ai/provenance/validate", json=payload(), headers={"X-Internal-Service-Token": TOKEN}
        )
    assert response.status_code == 200
    assert response.json()["valid"] is True
    source = response.json()["sources"][0]
    assert source["chunkId"] == "chunk-valid" and source["hashMatches"] is True
    assert source["documentId"] == "doc-1" and source["lessonNumber"] == 6
    serialized = response.text.lower()
    assert "vector" not in serialized and "documents" not in serialized
    assert "secret textbook content" not in serialized


def test_missing_changed_pending_duplicate_and_identity_mismatches_fail(tmp_path: Path) -> None:
    app = create_app(configured_settings(tmp_path))
    headers = {"X-Internal-Service-Token": TOKEN}
    sources = [
        {"chunkId": "missing", "chunkHash": "d" * 64},
        {"chunkId": "chunk-valid", "chunkHash": "e" * 64},
        {"chunkId": "chunk-pending", "chunkHash": "c" * 64},
        {"chunkId": "chunk-pending", "chunkHash": "c" * 64},
    ]
    with TestClient(app) as client:
        response = client.post(
            "/ai/provenance/validate",
            json=payload(
                corpusSha256="f" * 64,
                collectionName="other_collection",
                embeddingDimension=768,
                sources=sources,
            ),
            headers=headers,
        )
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is False
    assert set(body["errors"]) == {
        "CORPUS_MISMATCH",
        "COLLECTION_MISMATCH",
        "EMBEDDING_CONTRACT_MISMATCH",
        "DUPLICATE_SOURCE_ID",
        "SOURCE_MISSING",
        "SOURCE_CHANGED",
        "SOURCE_NOT_ELIGIBLE",
    }


def test_canonical_source_search_is_internal_bounded_and_metadata_only(tmp_path: Path, monkeypatch) -> None:
    settings = configured_settings(tmp_path)
    captured = {}

    class FakeService:
        def retrieve(self, request):
            captured["request"] = request
            return SimpleNamespace(
                results=[
                    SimpleNamespace(
                        chunk_id="chunk-valid",
                        chunk_hash="b" * 64,
                        document_id="doc-1",
                        grade=12,
                        lesson_number=6,
                        lesson_title="Lesson",
                        section_title="Section",
                        page_start=1,
                        page_end=2,
                        text="x" * 900,
                        distance=0.125,
                    )
                ]
            )

        def close(self):
            captured["closed"] = True

    app = create_app(settings)
    app.dependency_overrides[get_retrieval_service] = lambda: FakeService()
    path = "/ai/provenance/sources/search"
    with TestClient(app) as client:
        assert client.post(path, json={"query": "event", "grade": 12, "lessonNumber": 6}).status_code == 401
        response = client.post(
            path,
            json={"query": " event ", "grade": 12, "lessonNumber": 6, "topK": 10},
            headers={"X-Internal-Service-Token": TOKEN},
        )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert len(result["excerpt"]) == 600 and result["pendingReview"] is False
    assert "vector" not in response.text.lower() and "path" not in response.text.lower()
    assert captured["request"].grade == 12 and captured["request"].lesson_number == 6
    assert "closed" not in captured
