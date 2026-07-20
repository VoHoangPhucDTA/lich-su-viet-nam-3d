from pathlib import Path
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.config import Settings
from app.generation.evaluation import GenerationCache
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import GenerationRequest, GenerationSafetyError
from app.generation.service import GenerationService
from app.generation.schemas import GeneratedQuestionBatch
from tests.unit.test_generation import StubRetrieval, configured, question, retrieval_response
from app.generation.fake import FakeGenerationProvider


class FakeModels:
    def __init__(self, outcome) -> None:
        self.outcome = outcome
        self.config = None

    def generate_content(self, **kwargs):
        self.config = kwargs["config"]
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class FakeClient:
    def __init__(self, outcome) -> None:
        self.models = FakeModels(outcome)
        self.closed = False

    def close(self) -> None:
        self.closed = True


def response(*, finish_reason: str = "STOP"):
    raw = GeneratedQuestionBatch(questions=[question()]).model_dump_json(by_alias=True)
    return SimpleNamespace(
        text=raw,
        candidates=[SimpleNamespace(finish_reason=finish_reason)],
        prompt_feedback=None,
    )


def provider(client_factory, api_key: str = "key-one") -> GeminiGenerationProvider:
    return GeminiGenerationProvider(
        api_key=api_key,
        model="gemini-2.5-flash",
        temperature=0.3,
        max_output_tokens=8192,
        max_retries=0,
        timeout_seconds=60,
        client_factory=client_factory,
    )


def test_provider_uses_official_structured_json_config() -> None:
    client = FakeClient(response())
    value = provider(lambda **_: client).generate_structured("prompt")
    assert value.questions[0].correct_option_id == "A"
    assert client.models.config.response_mime_type == "application/json"
    assert client.models.config.response_json_schema == GeneratedQuestionBatch.model_json_schema(
        by_alias=True
    )
    assert client.models.config.temperature == 0.3


def test_provider_maps_safety_finish_reason() -> None:
    client = FakeClient(response(finish_reason="SAFETY"))
    with pytest.raises(GenerationSafetyError):
        provider(lambda **_: client).generate_structured("prompt")


def test_provider_rotates_only_credential_failure() -> None:
    clients = [
        FakeClient(
            errors.ClientError(
                403,
                {"error": {"message": "project denied", "status": "PERMISSION_DENIED"}},
            )
        ),
        FakeClient(response()),
    ]
    used_keys = []

    def factory(**kwargs):
        used_keys.append(kwargs["api_key"])
        return clients[len(used_keys) - 1]

    value = provider(factory, "key-one,key-two").generate_structured("prompt")
    assert value.questions
    assert used_keys == ["key-one", "key-two"]
    assert clients[0].closed


def test_generation_cache_identity_invalidates_all_semantic_inputs(tmp_path: Path) -> None:
    retrieval = retrieval_response()
    base_request = GenerationRequest(query="query", count=1)
    base = GenerationCache.identity(
        base_request, retrieval, model="model", temperature=0.3
    )
    assert base != GenerationCache.identity(
        GenerationRequest(query="changed", count=1),
        retrieval,
        model="model",
        temperature=0.3,
    )
    assert base != GenerationCache.identity(
        base_request, retrieval, model="other", temperature=0.3
    )
    assert base != GenerationCache.identity(
        base_request, retrieval, model="model", temperature=0.4
    )
    changed = retrieval.model_copy(deep=True)
    changed.results[0].chunk_hash = "b" * 64
    assert base != GenerationCache.identity(
        base_request, changed, model="model", temperature=0.3
    )
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval),  # type: ignore[arg-type]
        provider=FakeGenerationProvider([GeneratedQuestionBatch(questions=[question()])]),
    )
    generated = service.generate(base_request)
    cache = GenerationCache(tmp_path / "cache")
    cache.set(base, generated)
    assert cache.get(base) == generated
    cache_text = (tmp_path / "cache" / f"{base}.json").read_text(encoding="utf-8")
    assert "apiKey" not in cache_text
    assert "Authorization" not in cache_text
