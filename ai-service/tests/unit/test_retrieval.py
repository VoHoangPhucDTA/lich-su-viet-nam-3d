import math
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.embedding.formatter import QUERY_FORMATTER_VERSION, RetrievalFormatter
from app.embedding.checkpoint import sanitize_artifact_name
from app.main import create_app
from app.retrieval.context_builder import build_fact_context
from app.retrieval.filters import build_chroma_where, candidate_matches_filters
from app.retrieval.models import (
    RawChromaCandidate,
    RetrievalEvaluationTrace,
    RetrievalFilters,
    RetrievalNotReadyError,
    RetrievalRequest,
    RetrievalResult,
)
from app.retrieval.retriever import ChromaRetriever
from app.retrieval.service import RetrievalService, diversify_candidates

INTERNAL_HEADERS = {"X-Internal-Service-Token": "internal-test-token"}


class FakeProvider:
    def __init__(self, vector: list[float]) -> None:
        self.vector = vector
        self.queries: list[str] = []
        self.closed = False

    def embed_query(self, query: str) -> list[float]:
        self.queries.append(query)
        return self.vector

    def embed_documents(self, documents: list[str]) -> list[list[float]]:
        return [self.vector for _ in documents]

    def close(self) -> None:
        self.closed = True


class FakeRetriever:
    def __init__(self, candidates: list[RawChromaCandidate]) -> None:
        self.candidates = candidates
        self.calls: list[tuple[list[float], RetrievalFilters, int]] = []

    def retrieve(
        self,
        vector: list[float],
        filters: RetrievalFilters,
        candidate_count: int,
    ) -> list[RawChromaCandidate]:
        self.calls.append((vector, filters, candidate_count))
        return [
            candidate
            for candidate in self.candidates
            if candidate_matches_filters(candidate, filters)
        ]


def candidate(
    chunk_id: str,
    *,
    document_id: str = "doc-1",
    grade: int = 12,
    lesson: int = 6,
    distance: float = 0.1,
    text: str = "Nội dung lịch sử.",
) -> RawChromaCandidate:
    return RawChromaCandidate(
        chunk_id=chunk_id,
        document_id=document_id,
        grade=grade,
        lesson_number=lesson,
        lesson_title="Cách mạng tháng Tám",
        section_title="Nguyên nhân thắng lợi",
        section_path="Nguyên nhân thắng lợi",
        page_start=None,
        page_end=None,
        content_types="knowledge",
        text=text,
        distance=distance,
        chunk_hash="a" * 64,
    )


def settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "ai_service_internal_token": "internal-test-token",
        "gemini_embedding_dimension": 3,
        "chroma_persist_dir": tmp_path / "chroma",
        "chroma_report_dir": tmp_path / "reports",
        "embedding_output_dir": tmp_path / "embeddings",
        "embedding_checkpoint_dir": tmp_path / "checkpoints",
    }
    values.update(overrides)
    configured = Settings(_env_file=None, **values)
    artifact = configured.embedding_output_dir / sanitize_artifact_name(
        configured.gemini_embedding_model, configured.gemini_embedding_dimension
    )
    artifact.mkdir(parents=True, exist_ok=True)
    (artifact / "embedding_manifest.json").write_text(json.dumps({
        "status": "COMPLETED", "corpusSha256": "c" * 64,
        "formatterVersion": "gemini-retrieval-document-v1",
    }), encoding="utf-8")
    return configured


def test_request_validation_and_query_formatter() -> None:
    with pytest.raises(ValidationError):
        RetrievalRequest(query="  ")
    with pytest.raises(ValidationError):
        RetrievalRequest(query="x", grade=9)
    with pytest.raises(ValidationError):
        RetrievalRequest(query="x", lessonNumber=0)
    with pytest.raises(ValidationError):
        RetrievalRequest(query="x", documentId=" ")
    request = RetrievalRequest(query="  nguyên nhân thắng lợi ", topK=3)
    assert request.query == "nguyên nhân thắng lợi"
    assert RetrievalFormatter().format_query(request.query) == (
        "task: search result | query: nguyên nhân thắng lợi"
    )
    assert QUERY_FORMATTER_VERSION == "gemini-retrieval-query-v1"


def test_filter_builder_for_grade_lesson_and_document() -> None:
    filters = RetrievalFilters(grade=12, lessonNumber=6, documentId="doc-1")
    assert build_chroma_where(filters) == {
        "$and": [
            {"grade": {"$eq": 12}},
            {"lessonNumber": {"$eq": 6}},
            {"documentId": {"$eq": "doc-1"}},
        ]
    }
    assert candidate_matches_filters(candidate("c1"), filters)
    assert not candidate_matches_filters(candidate("c2", lesson=7), filters)
    assert build_chroma_where(RetrievalFilters()) is None


def test_retrieval_validates_query_length_top_k_and_vector(tmp_path: Path) -> None:
    configured = settings(
        tmp_path,
        rag_query_max_length=5,
        rag_default_top_k=3,
        rag_max_top_k=3,
    )
    provider = FakeProvider([1.0, 0.0, 0.0])
    service = RetrievalService(
        settings=configured,
        provider=provider,
        retriever=FakeRetriever([]),  # type: ignore[arg-type]
    )
    with pytest.raises(ValueError, match="maximum length"):
        service.retrieve(RetrievalRequest(query="123456"))
    with pytest.raises(ValueError, match="topK"):
        service.retrieve(RetrievalRequest(query="ok", topK=4))
    provider.vector = [1.0, 0.0]
    with pytest.raises(Exception, match="dimension"):
        service.retrieve(RetrievalRequest(query="ok"))


def test_raw_candidate_parser_preserves_pending_for_internal_evaluation() -> None:
    metadata = {
        "documentId": "doc",
        "grade": 12,
        "lessonNumber": 6,
        "lessonTitle": "Bài 6",
        "sectionTitle": "Mục",
        "sectionPath": "Mục",
        "contentTypes": "knowledge",
        "chunkHash": "a" * 64,
        "containsPendingReview": False,
    }
    parsed = ChromaRetriever._parse_candidate("chunk", "text", metadata, 0.25)
    assert parsed is not None
    assert parsed.page_start is None and parsed.page_end is None
    pending = dict(metadata, containsPendingReview=True)
    parsed_pending = ChromaRetriever._parse_candidate(
        "chunk", "text", pending, 0.2
    )
    assert parsed_pending is not None
    assert parsed_pending.contains_pending_review is True
    assert ChromaRetriever._parse_candidate("chunk", "text", metadata, math.nan) is None


def test_retriever_traces_pending_candidate_but_excludes_it_publicly(
    tmp_path: Path,
    monkeypatch,
) -> None:
    metadata = {
        "documentId": "doc",
        "grade": 12,
        "lessonNumber": 6,
        "lessonTitle": "Bài 6",
        "sectionTitle": "Mục",
        "sectionPath": "Mục",
        "contentTypes": "knowledge",
        "chunkHash": "a" * 64,
    }

    class Collection:
        name = "collection"
        metadata = {
            "embeddingModel": "model",
            "embeddingDimension": 3,
        }
        configuration = {"hnsw": {"space": "cosine"}}

        def count(self):
            return 2

        def query(self, **_):
            return {
                "ids": [["pending", "safe"]],
                "documents": [["pending text", "safe text"]],
                "metadatas": [[
                    dict(metadata, containsPendingReview=True),
                    dict(metadata, containsPendingReview=False),
                ]],
                "distances": [[0.1, 0.2]],
            }

    class Client:
        def list_collections(self):
            return [Collection()]

        def get_collection(self, name):
            assert name == "collection"
            return Collection()

    persist = tmp_path / "chroma"
    persist.mkdir()
    (persist / "chroma.sqlite3").touch()
    monkeypatch.setattr(
        "app.retrieval.retriever.close_persistent_client",
        lambda _: None,
    )
    trace = RetrievalEvaluationTrace()
    retriever = ChromaRetriever(
        persist_dir=persist,
        collection_name="collection",
        expected_metadata={
            "embeddingModel": "model",
            "embeddingDimension": 3,
        },
        distance_metric="cosine",
        client_factory=lambda _: Client(),
    )
    candidates = retriever.retrieve(
        [1.0, 0.0, 0.0],
        RetrievalFilters(),
        2,
        evaluation_trace=trace,
    )
    assert [candidate.chunk_id for candidate in candidates] == ["safe"]
    assert trace.raw_candidate_chunk_ids == ["pending", "safe"]
    assert trace.pending_review_candidate_ids == ["pending"]
    assert trace.collection_metadata_matched is True
    assert trace.collection_distance_metric_matched is True


def test_deduplicate_diversity_and_stable_distance_order() -> None:
    values = [
        candidate("c1", document_id="doc-a", distance=0.1),
        candidate("c1", document_id="doc-a", distance=0.1),
        candidate("c2", document_id="doc-a", distance=0.2),
        candidate("c3", document_id="doc-b", distance=0.3),
        candidate("c4", document_id="doc-a", distance=0.4),
    ]
    selected = diversify_candidates(values, top_k=4, max_per_document=1)
    assert [item.chunk_id for item in selected] == ["c1", "c3", "c2", "c4"]
    assert len({item.chunk_id for item in selected}) == 4


def test_fact_context_format_budget_and_source_order() -> None:
    results = [
        RetrievalResult(rank=index, **candidate(f"c{index}", text="Một câu. " * 20).model_dump())
        for index in (1, 2)
    ]
    context = build_fact_context(results, max_chars=260, max_chunks=2)
    assert len(context.text) <= 260
    assert context.text.startswith("[SOURCE 1]")
    assert context.source_chunk_ids == ["c1"]
    assert context.included_chunks == 1
    assert context.truncated is True
    assert "pages: unknown" in context.text


def test_service_returns_raw_distance_and_no_vectors(tmp_path: Path) -> None:
    provider = FakeProvider([1.0, 0.0, 0.0])
    retriever = FakeRetriever(
        [candidate("c1", distance=0.1), candidate("c2", distance=0.2)]
    )
    service = RetrievalService(
        settings=settings(tmp_path),
        provider=provider,
        retriever=retriever,  # type: ignore[arg-type]
    )
    response = service.retrieve(
        RetrievalRequest(query="nguyên nhân", grade=12, lessonNumber=6, topK=2)
    )
    dumped = response.model_dump(by_alias=True)
    assert [result.distance for result in response.results] == [0.1, 0.2]
    assert response.fact_context.source_chunk_ids == ["c1", "c2"]
    assert "vector" not in str(dumped).lower()
    assert retriever.calls[0][2] == 6


def test_debug_api_validation_and_safe_not_ready_mapping(
    tmp_path: Path, monkeypatch
) -> None:
    class NotReadyService:
        def retrieve(self, request: RetrievalRequest):
            raise RetrievalNotReadyError("secret internal path")

        def close(self) -> None:
            return None

    monkeypatch.setattr(
        "app.api.routes.retrieval.create_retrieval_service",
        lambda _: NotReadyService(),
    )
    app = create_app(settings(tmp_path))
    client = TestClient(app)

    assert client.post(
        "/ai/retrieval/debug",
        json={"query": ""},
        headers=INTERNAL_HEADERS,
    ).status_code == 422
    response = client.post(
        "/ai/retrieval/debug",
        json={"query": "valid"},
        headers=INTERNAL_HEADERS,
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "Retrieval index is not ready"}
    assert "secret internal path" not in response.text


def test_retrieval_debug_route_requires_internal_token(tmp_path: Path) -> None:
    client = TestClient(create_app(settings(tmp_path)))
    path = "/ai/retrieval/debug"
    assert client.post(path, json={"query": "valid"}).status_code == 401
    assert client.post(
        path,
        json={"query": "valid"},
        headers={"X-Internal-Service-Token": "wrong"},
    ).status_code == 401


def test_debug_api_hides_unexpected_errors(tmp_path: Path, monkeypatch) -> None:
    class BrokenService:
        def retrieve(self, request: RetrievalRequest):
            raise RuntimeError("AIza-hidden-secret")

        def close(self) -> None:
            return None

    monkeypatch.setattr(
        "app.api.routes.retrieval.create_retrieval_service",
        lambda _: BrokenService(),
    )
    response = TestClient(create_app(settings(tmp_path))).post(
        "/ai/retrieval/debug",
        json={"query": "valid"},
        headers=INTERNAL_HEADERS,
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "Unexpected retrieval failure"}
    assert "AIza-hidden-secret" not in response.text
