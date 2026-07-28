"""Application-owned AI service graph and controlled resource lifecycle."""

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.config import Settings
from app.embedding.base import EmbeddingProvider
from app.embedding.gemini import GeminiEmbeddingProvider
from app.generation.base import GenerationProvider
from app.generation.gemini import GeminiGenerationProvider
from app.generation.service import GenerationService
from app.retrieval.models import RetrievalNotReadyError
from app.retrieval.retriever import ChromaRetriever
from app.retrieval.service import (
    RetrievalService,
    RetrievalServiceContract,
    _expected_collection_metadata,
)
from app.vectorstore.chroma_client import (
    close_persistent_client,
    collection_exists,
    create_persistent_client,
    get_collection,
    validate_collection_contract,
)

runtime_logger = logging.getLogger("app.runtime")


class RuntimeState(str, Enum):
    INITIALIZING = "INITIALIZING"
    READY = "READY"
    NOT_READY = "NOT_READY"
    CLOSING = "CLOSING"
    CLOSED = "CLOSED"


@dataclass
class RuntimeCounters:
    settings_loads: int = 1
    manifest_reads: int = 0
    persistent_client_constructions: int = 0
    collection_opens: int = 0
    embedding_provider_constructions: int = 0
    generation_provider_constructions: int = 0
    service_graph_constructions: int = 0
    shutdowns: int = 0
    global_cache_clears: int = 0


@dataclass(frozen=True)
class RuntimeFactories:
    client_factory: Callable[[Any], Any] = create_persistent_client
    client_closer: Callable[[Any], None] = close_persistent_client
    embedding_provider_factory: Callable[[Settings], EmbeddingProvider] | None = None
    generation_provider_factory: Callable[[Settings], GenerationProvider] | None = None


def _default_embedding_provider(settings: Settings) -> GeminiEmbeddingProvider:
    return GeminiEmbeddingProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_embedding_model,
        dimension=settings.gemini_embedding_dimension,
        max_retries=settings.gemini_embedding_max_retries,
        retry_min_seconds=settings.gemini_embedding_retry_min_seconds,
        retry_max_seconds=settings.gemini_embedding_retry_max_seconds,
        timeout_seconds=settings.gemini_embedding_timeout_seconds,
    )


def _default_generation_provider(settings: Settings) -> GeminiGenerationProvider:
    return GeminiGenerationProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_generation_model,
        temperature=settings.gemini_generation_temperature,
        max_output_tokens=settings.gemini_generation_max_output_tokens,
        max_retries=settings.gemini_generation_max_retries,
        timeout_seconds=settings.gemini_generation_timeout_seconds,
    )


class _ThreadLocalProviderPool:
    """One mutable SDK wrapper per worker thread; no request state is shared."""

    def __init__(
        self,
        factory: Callable[[Settings], Any],
        settings: Settings,
        on_create: Callable[[], None],
    ) -> None:
        self._factory = factory
        self._settings = settings
        self._on_create = on_create
        self._local = threading.local()
        self._instances: list[Any] = []
        self._lock = threading.Lock()
        self._closed = False

    def instance(self) -> Any:
        if self._closed:
            raise RetrievalNotReadyError("Provider pool is closed")
        value = getattr(self._local, "value", None)
        if value is not None:
            return value
        value = self._factory(self._settings)
        with self._lock:
            if self._closed:
                value.close()
                raise RetrievalNotReadyError("Provider pool is closed")
            self._instances.append(value)
            self._on_create()
        self._local.value = value
        return value

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            instances = list(self._instances)
            self._instances.clear()
        for instance in instances:
            instance.close()


class ThreadLocalEmbeddingProvider:
    def __init__(self, pool: _ThreadLocalProviderPool) -> None:
        self._pool = pool

    def embed_documents(self, documents: list[str], **kwargs):
        return self._pool.instance().embed_documents(documents, **kwargs)

    def embed_query(self, query: str, **kwargs):
        return self._pool.instance().embed_query(query, **kwargs)

    def close(self) -> None:
        self._pool.close()


class ThreadLocalGenerationProvider:
    def __init__(self, pool: _ThreadLocalProviderPool, model: str) -> None:
        self._pool = pool
        self.model = model

    def generate_structured(self, prompt: str, **kwargs):
        return self._pool.instance().generate_structured(prompt, **kwargs)

    def close(self) -> None:
        self._pool.close()


class AiRuntimeResources:
    """Exactly one resource container owned by one FastAPI app instance."""

    def __init__(
        self,
        settings: Settings,
        factories: RuntimeFactories | None = None,
    ) -> None:
        self.settings = settings
        self.factories = factories or RuntimeFactories()
        self.state = RuntimeState.INITIALIZING
        self.error_code: str | None = None
        self.expected_collection_metadata: (
            dict[str, str | int | float | bool] | None
        ) = None
        self.chroma_client: Any | None = None
        self.collection: Any | None = None
        self.retrieval_service: RetrievalServiceContract | None = None
        self.generation_service: GenerationService | None = None
        self.counters = RuntimeCounters()
        self._state_lock = threading.RLock()
        self._shutdown_complete = False

    @property
    def ready(self) -> bool:
        return self.state == RuntimeState.READY

    def _mark_provider(self, kind: str) -> None:
        with self._state_lock:
            if kind == "embedding":
                self.counters.embedding_provider_constructions += 1
            else:
                self.counters.generation_provider_constructions += 1

    def start(self) -> None:
        with self._state_lock:
            if self.state != RuntimeState.INITIALIZING:
                return
        try:
            if self.settings.deterministic_e2e_provider:
                from app.e2e.deterministic import (
                    DeterministicGenerationProvider,
                    DeterministicRetrievalService,
                )

                deterministic_retrieval = DeterministicRetrievalService()
                deterministic_generation = GenerationService(
                    settings=self.settings,
                    retrieval_service=deterministic_retrieval,
                    provider=DeterministicGenerationProvider(),
                )
                self.retrieval_service = deterministic_retrieval
                self.generation_service = deterministic_generation
                self.counters.service_graph_constructions = 1
            else:
                self.counters.manifest_reads += 1
                expected = _expected_collection_metadata(self.settings)
                self.expected_collection_metadata = expected
                self.chroma_client = self.factories.client_factory(
                    self.settings.chroma_persist_dir
                )
                self.counters.persistent_client_constructions += 1
                if not collection_exists(
                    self.chroma_client, self.settings.chroma_collection_name
                ):
                    raise RetrievalNotReadyError("Retrieval collection does not exist")
                self.collection = get_collection(
                    self.chroma_client, self.settings.chroma_collection_name
                )
                self.counters.collection_opens += 1
                validate_collection_contract(
                    self.collection,
                    expected,
                    self.settings.chroma_distance_metric,
                )
                if self.collection.count() <= 0:
                    raise RetrievalNotReadyError("Retrieval collection is empty")

                embedding_factory = (
                    self.factories.embedding_provider_factory
                    or _default_embedding_provider
                )
                generation_factory = (
                    self.factories.generation_provider_factory
                    or _default_generation_provider
                )
                embedding_pool = _ThreadLocalProviderPool(
                    embedding_factory,
                    self.settings,
                    lambda: self._mark_provider("embedding"),
                )
                generation_pool = _ThreadLocalProviderPool(
                    generation_factory,
                    self.settings,
                    lambda: self._mark_provider("generation"),
                )
                retriever = ChromaRetriever(
                    persist_dir=self.settings.chroma_persist_dir,
                    collection_name=self.settings.chroma_collection_name,
                    expected_metadata=expected,
                    distance_metric=self.settings.chroma_distance_metric,
                    client=self.chroma_client,
                    collection=self.collection,
                    owns_client=False,
                )
                retrieval = RetrievalService(
                    settings=self.settings,
                    provider=ThreadLocalEmbeddingProvider(embedding_pool),
                    retriever=retriever,
                    collection_metadata=expected,
                )
                generation = GenerationService(
                    settings=self.settings,
                    retrieval_service=retrieval,
                    provider=ThreadLocalGenerationProvider(
                        generation_pool, self.settings.gemini_generation_model
                    ),
                )
                self.retrieval_service = retrieval
                self.generation_service = generation
                self.counters.service_graph_constructions = 1
            with self._state_lock:
                self.state = RuntimeState.READY
                self.error_code = None
            runtime_logger.info(
                "event=runtime.startup state=READY collection=%s",
                self.settings.chroma_collection_name,
            )
        except Exception as exc:
            # Startup owns any partially-created client. Release it here so a
            # failed lifespan never leaks SQLite handles or lets shutdown stop
            # the same client twice.
            partial_client = self.chroma_client
            self.chroma_client = None
            if partial_client is not None:
                try:
                    self.factories.client_closer(partial_client)
                except Exception:
                    runtime_logger.exception(
                        "event=runtime.startup_partial_cleanup_failed"
                    )
            with self._state_lock:
                self.state = RuntimeState.NOT_READY
                self.error_code = self._startup_error_code(exc)
            runtime_logger.warning(
                "event=runtime.startup state=NOT_READY errorCode=%s exceptionClass=%s",
                self.error_code,
                type(exc).__name__,
            )

    @staticmethod
    def _startup_error_code(exc: Exception) -> str:
        message = str(exc).casefold()
        if "manifest" in message or "artifact" in message:
            return "AI_EMBEDDING_CONTRACT_MISMATCH"
        if "empty" in message:
            return "AI_COLLECTION_EMPTY"
        if "collection" in message:
            return "AI_COLLECTION_NOT_READY"
        return "AI_RUNTIME_NOT_READY"

    def require_ready(self) -> None:
        if not self.ready:
            raise RetrievalNotReadyError(self.error_code or "AI_RUNTIME_NOT_READY")

    def require_retrieval_service(self) -> RetrievalServiceContract:
        self.require_ready()
        service = self.retrieval_service
        if service is None:
            raise RetrievalNotReadyError("AI_RUNTIME_NOT_READY")
        return service

    def require_generation_service(self) -> GenerationService:
        self.require_ready()
        service = self.generation_service
        if service is None:
            raise RetrievalNotReadyError("AI_RUNTIME_NOT_READY")
        return service

    def deep_readiness(self) -> tuple[bool, int | None, str | None]:
        if self.settings.deterministic_e2e_provider and self.ready:
            return True, 1, None
        if not self.ready or self.collection is None:
            return False, None, self.error_code or "AI_RUNTIME_NOT_READY"
        try:
            validate_collection_contract(
                self.collection,
                self.expected_collection_metadata or {},
                self.settings.chroma_distance_metric,
            )
            count = self.collection.count()
            if count <= 0:
                with self._state_lock:
                    self.state = RuntimeState.NOT_READY
                    self.error_code = "AI_COLLECTION_EMPTY"
                return False, count, self.error_code
            return True, count, None
        except Exception:
            with self._state_lock:
                self.state = RuntimeState.NOT_READY
                self.error_code = "AI_RUNTIME_NOT_READY"
            return False, None, self.error_code

    def shutdown(self) -> None:
        with self._state_lock:
            if self._shutdown_complete:
                return
            self.state = RuntimeState.CLOSING
            self._shutdown_complete = True
        try:
            if self.generation_service is not None:
                self.generation_service.close()
            elif self.retrieval_service is not None:
                self.retrieval_service.close()
            if self.chroma_client is not None:
                self.factories.client_closer(self.chroma_client)
        finally:
            with self._state_lock:
                self.counters.shutdowns += 1
                self.state = RuntimeState.CLOSED
            runtime_logger.info("event=runtime.shutdown state=CLOSED")
