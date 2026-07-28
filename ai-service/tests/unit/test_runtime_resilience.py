from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core.deadline import (
    ClientDisconnectedError,
    OperationDeadline,
    OperationDeadlineExceeded,
)
from app.generation.gemini import GeminiGenerationProvider
from app.embedding.gemini import GeminiEmbeddingProvider
from app.generation.models import GenerationOutputError, GenerationRequest
from app.generation.service import GenerationService
from app.main import create_app
from app.retrieval.models import (
    RawChromaCandidate,
    RetrievalFilters,
    RetrievalNotReadyError,
    RetrievalRequest,
    RetrievalSafetyError,
)
from app.retrieval.retriever import ChromaRetriever
from app.retrieval.service import RetrievalService
from tests.unit.test_generation import configured, retrieval_response
from tests.unit.test_retrieval import FakeProvider, candidate, settings


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.advance(seconds)


def test_deadline_is_monotonic_clamped_and_deterministic() -> None:
    clock = FakeClock()
    deadline = OperationDeadline(5, clock=clock, sleeper=clock.sleep)
    assert deadline.expired is False
    assert deadline.remaining_seconds() == 5
    assert deadline.clamp_timeout(9) == 5
    clock.advance(5)
    assert deadline.expired is True
    assert deadline.remaining_seconds() == 0
    with pytest.raises(OperationDeadlineExceeded):
        deadline.raise_if_expired("generation")
    with pytest.raises(ValueError):
        OperationDeadline(0)


def test_backoff_is_clamped_and_stops_before_another_attempt() -> None:
    clock = FakeClock()
    deadline = OperationDeadline(0.5, clock=clock, sleeper=clock.sleep)
    with pytest.raises(OperationDeadlineExceeded):
        deadline.sleep_within_budget(5, stage="generation")
    assert clock.sleeps == [0.5]
    assert deadline.expired


def test_retrieval_stops_when_embedding_consumes_stage_budget(tmp_path: Path) -> None:
    configured_settings = settings(tmp_path, rag_retrieval_timeout_seconds=2)
    clock = FakeClock()

    class SlowProvider(FakeProvider):
        def embed_query(self, query, **kwargs):
            assert kwargs["timeout_seconds"] <= 2
            clock.advance(2)
            return super().embed_query(query)

    class ForbiddenRetriever:
        def retrieve(self, *_args, **_kwargs):
            raise AssertionError("Chroma must not run after retrieval timeout")

    service = RetrievalService(
        settings=configured_settings,
        provider=SlowProvider([1.0, 0.0, 0.0]),
        retriever=ForbiddenRetriever(),  # type: ignore[arg-type]
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        service.retrieve(
            RetrievalRequest(query="valid"),
            deadline=OperationDeadline(10, clock=clock, sleeper=clock.sleep),
        )
    assert caught.value.code == "RETRIEVAL_TIMEOUT"


def test_retrieval_disconnect_prevents_embedding_and_chroma(tmp_path: Path) -> None:
    provider = FakeProvider([1.0, 0.0, 0.0])
    service = RetrievalService(
        settings=settings(tmp_path),
        provider=provider,
        retriever=SimpleNamespace(
            retrieve=lambda *_args, **_kwargs: pytest.fail("unexpected query")
        ),  # type: ignore[arg-type]
    )
    with pytest.raises(ClientDisconnectedError):
        service.retrieve(
            RetrievalRequest(query="valid"),
            is_cancelled=lambda: True,
        )
    assert provider.queries == []


def test_embedding_timeout_is_stable_and_prevents_chroma(tmp_path: Path) -> None:
    class TimedOutProvider(FakeProvider):
        def embed_query(self, _query, **_kwargs):
            raise OperationDeadlineExceeded(
                "query_embedding", "EMBEDDING_TIMEOUT"
            )

    service = RetrievalService(
        settings=settings(tmp_path),
        provider=TimedOutProvider([1.0, 0.0, 0.0]),
        retriever=SimpleNamespace(
            retrieve=lambda *_args, **_kwargs: pytest.fail("unexpected query")
        ),  # type: ignore[arg-type]
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        service.retrieve(RetrievalRequest(query="valid"))
    assert caught.value.code == "EMBEDDING_TIMEOUT"


def test_embedding_sdk_timeout_is_clamped_to_remaining_budget() -> None:
    captured = {}

    class Models:
        def embed_content(self, **_kwargs):
            return SimpleNamespace(
                embeddings=[SimpleNamespace(values=[1.0, 0.0, 0.0])]
            )

    class Client:
        models = Models()

        def close(self):
            return None

    def factory(**kwargs):
        captured.update(kwargs)
        return Client()

    provider = GeminiEmbeddingProvider(
        api_key="test-key",
        model="model",
        dimension=3,
        max_retries=0,
        timeout_seconds=30,
        client_factory=factory,
    )
    assert provider.embed_query(
        "valid",
        deadline=OperationDeadline(1),
        timeout_seconds=30,
    ) == [1.0, 0.0, 0.0]
    assert 0 < captured["http_options"].timeout <= 1000


def test_retrieval_stops_after_chroma_or_post_processing_deadline(
    tmp_path: Path, monkeypatch
) -> None:
    configured_settings = settings(tmp_path, rag_retrieval_timeout_seconds=1)
    clock = FakeClock()

    class SlowRetriever:
        def retrieve(self, *_args, **_kwargs):
            clock.advance(1)
            return []

    service = RetrievalService(
        settings=configured_settings,
        provider=FakeProvider([1.0, 0.0, 0.0]),
        retriever=SlowRetriever(),  # type: ignore[arg-type]
    )
    with pytest.raises(OperationDeadlineExceeded) as chroma_timeout:
        service.retrieve(
            RetrievalRequest(query="valid"),
            deadline=OperationDeadline(10, clock=clock, sleeper=clock.sleep),
        )
    assert chroma_timeout.value.code == "RETRIEVAL_TIMEOUT"

    clock = FakeClock()

    class FastRetriever:
        def retrieve(self, *_args, **_kwargs):
            return [candidate("safe")]

    service = RetrievalService(
        settings=configured_settings,
        provider=FakeProvider([1.0, 0.0, 0.0]),
        retriever=FastRetriever(),  # type: ignore[arg-type]
    )
    original = __import__(
        "app.retrieval.service", fromlist=["diversify_candidates"]
    ).diversify_candidates

    def slow_diversify(*args, **kwargs):
        result = original(*args, **kwargs)
        clock.advance(1)
        return result

    monkeypatch.setattr(
        "app.retrieval.service.diversify_candidates", slow_diversify
    )
    with pytest.raises(OperationDeadlineExceeded) as post_timeout:
        service.retrieve(
            RetrievalRequest(query="valid"),
            deadline=OperationDeadline(10, clock=clock, sleeper=clock.sleep),
        )
    assert post_timeout.value.code == "RETRIEVAL_TIMEOUT"


def _retriever(tmp_path: Path, collection) -> ChromaRetriever:
    persist = tmp_path / "chroma"
    persist.mkdir(exist_ok=True)
    (persist / "chroma.sqlite3").touch()

    class Client:
        def list_collections(self):
            return [collection]

        def get_collection(self, name):
            assert name == "collection"
            return collection

    return ChromaRetriever(
        persist_dir=persist,
        collection_name="collection",
        expected_metadata={"embeddingModel": "model"},
        distance_metric="cosine",
        client_factory=lambda _: Client(),
    )


def test_empty_collection_never_calls_query(tmp_path: Path, monkeypatch) -> None:
    class Collection:
        name = "collection"
        metadata = {"embeddingModel": "model"}
        configuration = {"hnsw": {"space": "cosine"}}

        def count(self):
            return 0

        def query(self, **_kwargs):
            raise AssertionError("query must not be called with n_results=0")

    monkeypatch.setattr(
        "app.retrieval.retriever.close_persistent_client", lambda _: None
    )
    assert _retriever(tmp_path, Collection()).retrieve(
        [1.0, 0.0, 0.0], RetrievalFilters(), 5
    ) == []


def test_collection_count_failure_is_sanitized_not_ready(
    tmp_path: Path, monkeypatch
) -> None:
    class Collection:
        name = "collection"
        metadata = {"embeddingModel": "model"}
        configuration = {"hnsw": {"space": "cosine"}}

        def count(self):
            raise RuntimeError("secret database path")

    monkeypatch.setattr(
        "app.retrieval.retriever.close_persistent_client", lambda _: None
    )
    with pytest.raises(RetrievalNotReadyError) as caught:
        _retriever(tmp_path, Collection()).retrieve(
            [1.0, 0.0, 0.0], RetrievalFilters(), 5
        )
    assert "secret database path" not in str(caught.value)


def test_pending_review_at_selection_boundary_fails_closed(tmp_path: Path) -> None:
    pending = candidate("pending").model_copy(
        update={"contains_pending_review": True}
    )

    class LeakingRetriever:
        def retrieve(self, *_args, **_kwargs) -> list[RawChromaCandidate]:
            return [pending]

    service = RetrievalService(
        settings=settings(tmp_path),
        provider=FakeProvider([1.0, 0.0, 0.0]),
        retriever=LeakingRetriever(),  # type: ignore[arg-type]
    )
    with pytest.raises(RetrievalSafetyError, match="PENDING_REVIEW"):
        service.retrieve(RetrievalRequest(query="valid"))


def test_filter_ineligible_candidate_at_selection_boundary_fails_closed(
    tmp_path: Path,
) -> None:
    class LeakingRetriever:
        def retrieve(self, *_args, **_kwargs):
            return [candidate("wrong-grade", grade=10)]

    service = RetrievalService(
        settings=settings(tmp_path),
        provider=FakeProvider([1.0, 0.0, 0.0]),
        retriever=LeakingRetriever(),  # type: ignore[arg-type]
    )
    with pytest.raises(RetrievalSafetyError) as caught:
        service.retrieve(RetrievalRequest(query="valid", grade=12))
    assert caught.value.code == "PRODUCTION_ELIGIBILITY_VIOLATION"


def test_generation_clamps_timeout_and_stops_before_repair(tmp_path: Path) -> None:
    clock = FakeClock()

    class Provider:
        model = "fake"

        def __init__(self) -> None:
            self.calls: list[float] = []

        def generate_structured(self, _prompt, *, timeout_seconds, **_kwargs):
            self.calls.append(timeout_seconds)
            clock.advance(1)
            raise GenerationOutputError("invalid")

        def close(self):
            return None

    provider = Provider()
    service = GenerationService(
        settings=configured(tmp_path, ai_request_deadline_seconds=1),
        retrieval_service=SimpleNamespace(close=lambda: None),  # type: ignore[arg-type]
        provider=provider,  # type: ignore[arg-type]
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        service.generate(
            GenerationRequest(query="valid", count=1),
            retrieval_response=retrieval_response(),
            deadline=OperationDeadline(1, clock=clock, sleeper=clock.sleep),
        )
    assert caught.value.code == "REPAIR_TIMEOUT"
    assert provider.calls == [1]


def test_disconnect_before_repair_prevents_second_provider_call(tmp_path: Path) -> None:
    class Provider:
        model = "fake"

        def __init__(self):
            self.calls = 0

        def generate_structured(self, _prompt, **_kwargs):
            self.calls += 1
            raise GenerationOutputError("invalid")

        def close(self):
            return None

    checks = 0

    def disconnected() -> bool:
        nonlocal checks
        checks += 1
        return checks >= 4

    provider = Provider()
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=SimpleNamespace(close=lambda: None),  # type: ignore[arg-type]
        provider=provider,  # type: ignore[arg-type]
    )
    with pytest.raises(ClientDisconnectedError):
        service.generate(
            GenerationRequest(query="valid", count=1),
            retrieval_response=retrieval_response(),
            is_cancelled=disconnected,
        )
    assert provider.calls == 1


def test_pending_retrieval_failure_never_calls_generation(tmp_path: Path) -> None:
    class UnsafeRetrieval:
        def retrieve(self, *_args, **_kwargs):
            raise RetrievalSafetyError("PENDING_REVIEW_SELECTION_VIOLATION")

        def close(self):
            return None

    class ForbiddenProvider:
        model = "fake"

        def generate_structured(self, *_args, **_kwargs):
            raise AssertionError("generation must not run")

        def close(self):
            return None

    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=UnsafeRetrieval(),  # type: ignore[arg-type]
        provider=ForbiddenProvider(),  # type: ignore[arg-type]
    )
    with pytest.raises(RetrievalSafetyError):
        service.generate(GenerationRequest(query="valid", count=1))


def test_generation_provider_timeout_is_stable_and_no_extra_retry(monkeypatch) -> None:
    clock = FakeClock()
    calls = 0

    class Models:
        def generate_content(self, **_kwargs):
            nonlocal calls
            calls += 1
            raise httpx.ReadTimeout("provider detail")

    class Client:
        models = Models()

        def close(self):
            return None

    monkeypatch.setattr(
        "app.generation.gemini.wait_random_exponential",
        lambda **_kwargs: (lambda _state: 5),
    )
    provider = GeminiGenerationProvider(
        api_key="test-key",
        model="model",
        temperature=0.3,
        max_output_tokens=100,
        max_retries=2,
        timeout_seconds=60,
        client_factory=lambda **_kwargs: Client(),
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        provider.generate_structured(
            "hidden prompt",
            deadline=OperationDeadline(0.5, clock=clock, sleeper=clock.sleep),
        )
    assert caught.value.code == "GENERATION_TIMEOUT"
    assert calls == 1


def test_generation_provider_timeout_after_one_retry_is_stable(monkeypatch) -> None:
    calls = 0

    class Models:
        def generate_content(self, **_kwargs):
            nonlocal calls
            calls += 1
            raise httpx.ReadTimeout("provider detail")

    class Client:
        models = Models()

        def close(self):
            return None

    monkeypatch.setattr(
        "app.generation.gemini.wait_random_exponential",
        lambda **_kwargs: (lambda _state: 0),
    )
    provider = GeminiGenerationProvider(
        api_key="test-key",
        model="model",
        temperature=0.3,
        max_output_tokens=100,
        max_retries=1,
        timeout_seconds=60,
        client_factory=lambda **_kwargs: Client(),
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        provider.generate_structured(
            "hidden prompt",
            deadline=OperationDeadline(10),
        )
    assert caught.value.code == "GENERATION_TIMEOUT"
    assert calls == 2


def test_repair_provider_timeout_uses_repair_code() -> None:
    class Models:
        def generate_content(self, **_kwargs):
            raise httpx.ReadTimeout("provider detail")

    class Client:
        models = Models()

        def close(self):
            return None

    provider = GeminiGenerationProvider(
        api_key="test-key",
        model="model",
        temperature=0.3,
        max_output_tokens=100,
        max_retries=0,
        timeout_seconds=60,
        client_factory=lambda **_kwargs: Client(),
    )
    with pytest.raises(OperationDeadlineExceeded) as caught:
        provider.generate_structured(
            "hidden repair prompt",
            deadline=OperationDeadline(10),
            stage="repair",
        )
    assert caught.value.code == "REPAIR_TIMEOUT"


def test_fastapi_maps_deadline_to_sanitized_504(
    tmp_path: Path, monkeypatch, caplog
) -> None:
    class TimedOutService:
        def generate(self, _request, **_kwargs):
            raise OperationDeadlineExceeded("generation")

        def close(self):
            return None

    monkeypatch.setattr(
        "app.api.routes.generation.create_generation_service",
        lambda _: TimedOutService(),
    )
    response = TestClient(create_app(configured(tmp_path))).post(
        "/ai/quiz/generate",
        json={"query": "valid"},
        headers={
            "X-Internal-Service-Token": "internal-test-token",
            "X-Request-ID": "deadline-test",
        },
    )
    assert response.status_code == 504
    assert response.json() == {"detail": "GENERATION_TIMEOUT"}
    assert response.headers["X-Request-ID"] == "deadline-test"
    assert "errorCode=GENERATION_TIMEOUT" in caplog.text
    assert "valid" not in caplog.text


def test_retrieval_debug_maps_deadline_to_sanitized_504(
    tmp_path: Path, monkeypatch
) -> None:
    class TimedOutService:
        def retrieve(self, _request, **_kwargs):
            raise OperationDeadlineExceeded(
                "query_embedding", "EMBEDDING_TIMEOUT"
            )

        def close(self):
            return None

    monkeypatch.setattr(
        "app.api.routes.retrieval.create_retrieval_service",
        lambda _: TimedOutService(),
    )
    response = TestClient(create_app(settings(tmp_path))).post(
        "/ai/retrieval/debug",
        json={"query": "valid"},
        headers={"X-Internal-Service-Token": "internal-test-token"},
    )
    assert response.status_code == 504
    assert response.json() == {"detail": "EMBEDDING_TIMEOUT"}


def test_chroma_lifecycle_global_cache_risk_is_deterministically_instrumented(
    tmp_path: Path, monkeypatch
) -> None:
    """Goal 14D reproduction: RISK_CONFIRMED_BY_GLOBAL_STATE, not race fixed."""

    import threading

    barrier = threading.Barrier(2)
    peer_closed = threading.Event()
    cache_clear_calls: list[int] = []
    stopped: list[int] = []

    class Collection:
        name = "collection"
        metadata = {"embeddingModel": "model"}
        configuration = {"hnsw": {"space": "cosine"}}

        def __init__(self, identity: int):
            self.identity = identity

        def count(self):
            return 1

        def query(self, **_kwargs):
            barrier.wait(timeout=2)
            if self.identity == 1:
                assert peer_closed.wait(timeout=2)
            return {
                "ids": [["safe"]],
                "documents": [["local text"]],
                "metadatas": [[{
                    "documentId": "doc",
                    "grade": 12,
                    "lessonNumber": 1,
                    "lessonTitle": "lesson",
                    "sectionTitle": "section",
                    "sectionPath": "section",
                    "contentTypes": "knowledge",
                    "chunkHash": "a" * 64,
                    "containsPendingReview": False,
                }]],
                "distances": [[0.1]],
            }

    class Client:
        def __init__(self, identity: int):
            self.identity = identity
            def stop():
                stopped.append(identity)
                if identity == 2:
                    peer_closed.set()
            self._system = SimpleNamespace(stop=stop)

        def list_collections(self):
            return [Collection(self.identity)]

        def get_collection(self, name):
            assert name == "collection"
            return Collection(self.identity)

    next_id = iter((1, 2))
    monkeypatch.setattr(
        "app.vectorstore.chroma_client.SharedSystemClient.clear_system_cache",
        lambda: cache_clear_calls.append(1),
    )
    persist = tmp_path / "chroma-race-reproduction"
    persist.mkdir()
    (persist / "chroma.sqlite3").touch()

    def run_one():
        retriever = ChromaRetriever(
            persist_dir=persist,
            collection_name="collection",
            expected_metadata={"embeddingModel": "model"},
            distance_metric="cosine",
            client_factory=lambda _: Client(next(next_id)),
        )
        return retriever.retrieve([1.0, 0.0, 0.0], RetrievalFilters(), 1)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: run_one(), range(2)))
    assert [len(result) for result in results] == [1, 1]
    assert len(stopped) == 2
    assert len(cache_clear_calls) == 2
