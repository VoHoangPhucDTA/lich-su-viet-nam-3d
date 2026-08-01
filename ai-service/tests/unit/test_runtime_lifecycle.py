import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient

from app.core.runtime import (
    AiRuntimeResources,
    RuntimeFactories,
    RuntimeState,
)
from app.generation.models import GenerationRequest
from app.generation.service import RoutedGenerationService
from app.main import create_app
from app.retrieval.models import RetrievalNotReadyError, RetrievalRequest
from app.vectorstore.models import CollectionCompatibilityError
from tests.unit.test_retrieval import candidate, settings


class FakeCollection:
    name = "sgk_kntt_history_gemini_v1"
    metadata: ClassVar[dict[str, object]] = {}
    configuration: ClassVar[dict[str, object]] = {"hnsw": {"space": "cosine"}}

    def __init__(self) -> None:
        self.query_calls = 0
        self.fail_next_query = False
        self.fail_count = False

    def count(self) -> int:
        if self.fail_count:
            raise RuntimeError("count unavailable")
        return 1

    def query(self, **_kwargs):
        self.query_calls += 1
        if self.fail_next_query:
            self.fail_next_query = False
            raise RuntimeError("transient query failure")
        item = candidate("chunk-shared")
        metadata = {
            "documentId": item.document_id,
            "grade": item.grade,
            "lessonNumber": item.lesson_number,
            "lessonTitle": item.lesson_title,
            "sectionTitle": item.section_title,
            "sectionPath": item.section_path,
            "pageStart": item.page_start,
            "pageEnd": item.page_end,
            "contentTypes": item.content_types,
            "chunkHash": item.chunk_hash,
            "containsPendingReview": False,
        }
        return {
            "ids": [[item.chunk_id]],
            "documents": [[item.text]],
            "metadatas": [[metadata]],
            "distances": [[item.distance]],
        }


class FakeClient:
    def __init__(self, collection: FakeCollection) -> None:
        self.collection = collection
        self.closed = False

    def list_collections(self):
        return [self.collection]

    def get_collection(self, name: str):
        assert name == self.collection.name
        return self.collection


class FakeProvider:
    def __init__(self, kind: str, counts: dict[str, int]) -> None:
        self.kind = kind
        self.counts = counts
        self.closed = False

    def embed_query(self, _query: str, **_kwargs):
        return [1.0, 0.0, 0.0]

    def generate_structured(self, _prompt: str, **_kwargs):
        raise AssertionError("generation provider is not used by retrieval tests")

    def close(self):
        self.closed = True


def make_runtime(tmp_path: Path, monkeypatch, *, collection_present: bool = True):
    configured = settings(tmp_path, gemini_api_key="test-key", gemini_generation_model="test-model")
    collection = FakeCollection()
    counters = {"clients": 0, "opens": 0, "closes": 0, "providers": 0}
    clients: list[FakeClient] = []

    def client_factory(_path):
        counters["clients"] += 1
        client = FakeClient(collection)
        clients.append(client)
        return client

    def closer(client):
        counters["closes"] += 1
        client.closed = True

    def provider_factory(_settings):
        counters["providers"] += 1
        return FakeProvider("embedding", counters)

    factories = RuntimeFactories(
        client_factory=client_factory,
        client_closer=closer,
        embedding_provider_factory=provider_factory,
        generation_provider_factory=provider_factory,
    )
    import app.core.runtime as runtime

    expected = {
        "corpusSha256": "c" * 64,
        "embeddingModel": configured.gemini_embedding_model,
        "embeddingDimension": 3,
        "formatterVersion": "gemini-retrieval-document-v1",
        "chunkingVersion": "structure-v2",
        "distanceMetric": "cosine",
        "sourceType": "sgk-kntt-history",
    }
    monkeypatch.setattr(runtime, "_expected_collection_metadata", lambda _settings: expected)
    monkeypatch.setattr(
        runtime,
        "collection_exists",
        lambda client, name: collection_present
        and any(item.name == name for item in client.list_collections()),
    )
    monkeypatch.setattr(
        runtime,
        "get_collection",
        lambda client, name: (
            counters.__setitem__("opens", counters["opens"] + 1) or client.get_collection(name)
        ),
    )
    monkeypatch.setattr(runtime, "validate_collection_contract", lambda *_args: None)
    return configured, AiRuntimeResources(configured, factories), counters, clients, collection


def test_lifespan_owns_one_graph_and_shutdown_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    configured, resources, counters, clients, _collection = make_runtime(tmp_path, monkeypatch)
    app = create_app(configured, runtime_factory=lambda _settings: resources)
    with TestClient(app):
        assert resources.state is RuntimeState.READY
        assert resources.counters.service_graph_constructions == 1
        assert resources.counters.persistent_client_constructions == 1
        assert resources.counters.collection_opens == 1
    resources.shutdown()
    assert resources.state is RuntimeState.CLOSED
    assert resources.counters.shutdowns == 1
    assert counters["closes"] == 1
    assert clients[0].closed


def test_runtime_owns_independent_current_and_candidate_provider_pools(
    tmp_path: Path, monkeypatch
) -> None:
    _configured, resources, counters, _clients, _collection = make_runtime(
        tmp_path, monkeypatch
    )
    resources.factories = RuntimeFactories(
        client_factory=resources.factories.client_factory,
        client_closer=resources.factories.client_closer,
        embedding_provider_factory=resources.factories.embedding_provider_factory,
        generation_provider_factory=lambda _settings: FakeProvider("current", counters),
        candidate_generation_provider_factory=lambda _settings: FakeProvider(
            "candidate", counters
        ),
    )

    resources.start()

    router = resources.require_generation_service()
    assert isinstance(router, RoutedGenerationService)
    with pytest.raises(AssertionError):
        router.current_service.provider.generate_structured("prompt")
    with pytest.raises(AssertionError):
        router.candidate_service.provider.generate_structured("prompt")
    assert resources.counters.current_generation_provider_constructions == 1
    assert resources.counters.candidate_generation_provider_constructions == 1
    assert resources.counters.generation_provider_constructions == 2
    resources.shutdown()


def test_require_service_helpers_fail_closed_and_return_ready_services(
    tmp_path: Path,
) -> None:
    configured = settings(
        tmp_path,
        app_env="test",
        deterministic_e2e_provider=True,
        gemini_generation_model="deterministic-e2e-generation-v1",
    )
    resources = AiRuntimeResources(configured)

    with pytest.raises(RetrievalNotReadyError, match="AI_RUNTIME_NOT_READY"):
        resources.require_retrieval_service()
    with pytest.raises(RetrievalNotReadyError, match="AI_RUNTIME_NOT_READY"):
        resources.require_generation_service()

    resources.start()
    assert resources.require_retrieval_service() is resources.retrieval_service
    assert resources.require_generation_service() is resources.generation_service

    resources.shutdown()
    with pytest.raises(RetrievalNotReadyError, match="AI_RUNTIME_NOT_READY"):
        resources.require_retrieval_service()


def test_one_shared_graph_handles_100_sequential_requests(tmp_path: Path, monkeypatch) -> None:
    configured, resources, counters, _clients, collection = make_runtime(tmp_path, monkeypatch)
    resources.start()
    assert resources.ready
    service = resources.retrieval_service

    def run(index: int):
        response = service.retrieve(RetrievalRequest(query=f"topic-{index}", topK=1))
        return response.query, response.results[0].chunk_id

    result = [run(index) for index in range(100)]
    assert result == [(f"topic-{index}", "chunk-shared") for index in range(100)]
    assert resources.counters.persistent_client_constructions == 1
    assert resources.counters.collection_opens == 1
    assert resources.counters.service_graph_constructions == 1
    assert resources.counters.global_cache_clears == 0
    assert counters["closes"] == 0
    assert collection.query_calls == 100
    resources.shutdown()
    resources.shutdown()
    assert counters["closes"] == 1


@pytest.mark.parametrize("workers", [2, 8, 32])
def test_parallel_retrieval_has_deterministic_isolated_responses(
    tmp_path: Path, monkeypatch, workers: int
) -> None:
    _configured, resources, counters, _clients, collection = make_runtime(tmp_path, monkeypatch)
    resources.start()

    def run(index: int):
        response = resources.retrieval_service.retrieve(
            RetrievalRequest(query=f"parallel-{workers}-{index}", topK=1)
        )
        return response.query, response.results[0].chunk_id

    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(run, range(workers)))
    assert results == [(f"parallel-{workers}-{index}", "chunk-shared") for index in range(workers)]
    assert resources.counters.persistent_client_constructions == 1
    assert resources.counters.collection_opens == 1
    assert resources.counters.global_cache_clears == 0
    assert counters["closes"] == 0
    assert collection.query_calls == workers
    assert 1 <= resources.counters.embedding_provider_constructions <= workers
    resources.shutdown()


def test_startup_failure_is_not_ready_and_closes_partial_client(tmp_path: Path, monkeypatch) -> None:
    _configured, resources, counters, _clients, _collection = make_runtime(
        tmp_path, monkeypatch, collection_present=False
    )
    resources.start()
    assert resources.state is RuntimeState.NOT_READY
    assert resources.error_code == "AI_COLLECTION_NOT_READY"
    assert counters["closes"] == 1
    assert resources.chroma_client is None


@pytest.mark.parametrize(
    ("failure", "expected_code", "client_closes"),
    [
        ("manifest_missing", "AI_EMBEDDING_CONTRACT_MISMATCH", 0),
        ("manifest_invalid", "AI_EMBEDDING_CONTRACT_MISMATCH", 0),
        ("client_factory", "AI_RUNTIME_NOT_READY", 0),
        ("collection_open", "AI_RUNTIME_NOT_READY", 1),
        ("metadata_mismatch", "AI_COLLECTION_NOT_READY", 1),
    ],
)
def test_startup_failure_matrix_is_fail_closed(
    tmp_path: Path,
    monkeypatch,
    failure: str,
    expected_code: str,
    client_closes: int,
) -> None:
    import app.core.runtime as runtime

    _configured, resources, counters, _clients, _collection = make_runtime(tmp_path, monkeypatch)
    if failure.startswith("manifest"):
        monkeypatch.setattr(
            runtime,
            "_expected_collection_metadata",
            lambda _settings: (_ for _ in ()).throw(
                RetrievalNotReadyError(f"Embedding {failure.replace('_', ' ')}")
            ),
        )
    elif failure == "client_factory":
        resources.factories = RuntimeFactories(
            client_factory=lambda _path: (_ for _ in ()).throw(RuntimeError("client unavailable")),
            client_closer=resources.factories.client_closer,
        )
    elif failure == "collection_open":
        monkeypatch.setattr(
            runtime,
            "get_collection",
            lambda *_args: (_ for _ in ()).throw(RuntimeError("open unavailable")),
        )
    else:
        monkeypatch.setattr(
            runtime,
            "validate_collection_contract",
            lambda *_args: (_ for _ in ()).throw(
                CollectionCompatibilityError("Collection metadata mismatch")
            ),
        )
    resources.start()
    assert resources.state is RuntimeState.NOT_READY
    assert resources.error_code == expected_code
    assert counters["closes"] == client_closes


def test_two_app_resources_shutdown_without_cross_instance_invalidation(tmp_path: Path, monkeypatch) -> None:
    configured_a, resources_a, counters_a, _clients_a, _collection_a = make_runtime(
        tmp_path / "a", monkeypatch
    )
    configured_b, resources_b, counters_b, _clients_b, _collection_b = make_runtime(
        tmp_path / "b", monkeypatch
    )
    resources_a.start()
    resources_b.start()
    resources_a.shutdown()
    assert resources_b.ready
    assert resources_b.retrieval_service.retrieve(RetrievalRequest(query="b", topK=1)).result_count == 1
    assert counters_a["closes"] == 1
    assert counters_b["closes"] == 0
    resources_b.shutdown()


def test_deterministic_generation_isolated_across_parallel_requests(tmp_path: Path) -> None:
    configured = settings(
        tmp_path,
        app_env="test",
        deterministic_e2e_provider=True,
        gemini_generation_model="deterministic-e2e-generation-v1",
    )
    resources = AiRuntimeResources(configured)
    resources.start()
    assert resources.ready

    def run(index: int):
        response = resources.generation_service.generate(
            GenerationRequest(
                query=f"topic-{index}",
                difficulty="EASY" if index % 2 else "HARD",
                count=(index % 3) + 1,
            )
        )
        return len(response.questions), response.questions[0].source_chunk_ids

    with ThreadPoolExecutor(max_workers=16) as executor:
        results = list(executor.map(run, range(32)))
    assert [item[0] for item in results] == [(index % 3) + 1 for index in range(32)]
    assert all(item[1] == ["e2e-history-chunk-001"] for item in results)
    resources.shutdown()
    assert resources.state is RuntimeState.CLOSED


def test_readiness_retrieval_and_generation_can_run_concurrently(tmp_path: Path) -> None:
    configured = settings(
        tmp_path,
        app_env="test",
        deterministic_e2e_provider=True,
        gemini_generation_model="deterministic-e2e-generation-v1",
    )
    resources = AiRuntimeResources(configured)
    resources.start()
    barrier = threading.Barrier(3)

    def readiness():
        barrier.wait(timeout=2)
        return resources.deep_readiness()

    def retrieval():
        barrier.wait(timeout=2)
        return resources.retrieval_service.retrieve(
            RetrievalRequest(query="concurrent retrieval", topK=1)
        ).result_count

    def generation():
        barrier.wait(timeout=2)
        return len(
            resources.generation_service.generate(
                GenerationRequest(query="concurrent generation", count=1)
            ).questions
        )

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(readiness),
            executor.submit(retrieval),
            executor.submit(generation),
        ]
        results = [future.result() for future in futures]
    assert results == [(True, 1, None), 1, 1]
    assert resources.ready
    assert resources.counters.global_cache_clears == 0
    resources.shutdown()


def test_transient_query_failure_does_not_close_shared_runtime(tmp_path: Path, monkeypatch) -> None:
    _configured, resources, counters, _clients, collection = make_runtime(tmp_path, monkeypatch)
    resources.start()
    collection.fail_next_query = True
    with pytest.raises(RuntimeError, match="transient query failure"):
        resources.retrieval_service.retrieve(RetrievalRequest(query="first", topK=1))
    assert resources.ready
    assert counters["closes"] == 0
    assert resources.retrieval_service.retrieve(RetrievalRequest(query="second", topK=1)).result_count == 1
    resources.shutdown()


def test_deep_readiness_failure_marks_runtime_not_ready_and_closed_route_is_503(
    tmp_path: Path, monkeypatch
) -> None:
    configured, resources, _counters, _clients, collection = make_runtime(tmp_path, monkeypatch)
    resources.start()
    collection.fail_count = True
    assert resources.deep_readiness() == (False, None, "AI_RUNTIME_NOT_READY")
    assert resources.state is RuntimeState.NOT_READY
    resources.shutdown()

    app = create_app(configured, runtime_factory=lambda _settings: resources)
    with TestClient(app) as client:
        response = client.post(
            "/ai/retrieval/debug",
            json={"query": "after-close"},
            headers={"X-Internal-Service-Token": "internal-test-token"},
        )
    assert response.status_code == 503
    assert response.json() == {"detail": "AI runtime is not ready"}


def test_production_code_has_no_test_cache_reset_caller() -> None:
    app_root = Path(__file__).resolve().parents[2] / "app"
    assert all(
        "clear_system_cache" not in path.read_text(encoding="utf-8") for path in app_root.rglob("*.py")
    )
