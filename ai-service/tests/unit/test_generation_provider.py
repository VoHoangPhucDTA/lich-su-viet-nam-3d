from pathlib import Path
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.generation.evaluation import GenerationCache
from app.generation.fake import FakeGenerationProvider
from app.generation.gemini import GeminiGenerationProvider
from app.generation.models import (
    GenerationOutputError,
    GenerationPermanentError,
    GenerationRequest,
    GenerationSafetyError,
)
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationService
from tests.unit.test_generation import StubRetrieval, configured, question, retrieval_response


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


def test_provider_rejects_response_without_candidate() -> None:
    client = FakeClient(
        SimpleNamespace(text=None, candidates=[], prompt_feedback=None)
    )

    with pytest.raises(GenerationOutputError, match="GENERATION_FINISH_NO_CANDIDATE"):
        provider(lambda **_: client).generate_structured("prompt")


def test_provider_rejects_response_without_text_and_keeps_typed_raw_output() -> None:
    client = FakeClient(
        SimpleNamespace(
            text=None,
            candidates=[SimpleNamespace(finish_reason="STOP")],
            prompt_feedback=None,
        )
    )

    with pytest.raises(GenerationOutputError) as caught:
        provider(lambda **_: client).generate_structured("prompt")

    assert caught.value.raw_output == ""


def test_provider_passes_timeout_to_sdk_in_milliseconds() -> None:
    client = FakeClient(response())
    factory_kwargs = {}

    def factory(**kwargs):
        factory_kwargs.update(kwargs)
        return client

    provider(factory).generate_structured("prompt", timeout_seconds=1.25)

    assert factory_kwargs["http_options"].timeout == 1250


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


def test_generation_error_does_not_expose_api_key() -> None:
    secret = "AIza" + "x" * 32
    client = FakeClient(
        errors.ClientError(
            400,
            {"error": {"message": f"bad request for {secret}"}},
        )
    )

    with pytest.raises(GenerationPermanentError) as caught:
        provider(lambda **_: client, secret).generate_structured("prompt")

    assert secret not in str(caught.value)


def test_generation_cache_identity_covers_declared_semantic_inputs(
    tmp_path: Path,
) -> None:
    retrieval = retrieval_response()
    base_request = GenerationRequest(query="query", count=1)

    def identity(
        request=base_request,
        retrieved=retrieval,
        **overrides,
    ):
        values = {
            "model": "model",
            "temperature": 0.3,
            "max_output_tokens": 8192,
            "repair_attempts": 1,
            "provider_mode": "production",
            "prompt_version": "prompt-v1",
            "schema_version": "schema-v1",
        }
        values.update(overrides)
        return GenerationCache.identity(request, retrieved, **values)

    base = identity()
    assert base != identity(request=GenerationRequest(query="changed", count=1))
    assert base != identity(model="other")
    assert base != identity(temperature=0.4)
    assert base != identity(max_output_tokens=4096)
    assert base != identity(repair_attempts=2)
    assert base != identity(provider_mode="deterministic")
    assert base != identity(prompt_version="prompt-v2")
    assert base != identity(schema_version="schema-v2")
    with_style = GenerationRequest(
        query="query",
        count=1,
        styleExamples=[
            {
                "question": "Mẫu khác",
                "options": [
                    {"id": "A", "text": "A"},
                    {"id": "B", "text": "B"},
                    {"id": "C", "text": "C"},
                    {"id": "D", "text": "D"},
                ],
                "correctOptionId": "A",
                "explanation": "Giải thích",
                "difficulty": "MEDIUM",
            }
        ],
    )
    assert base != identity(request=with_style)
    changed = retrieval.model_copy(deep=True)
    changed.results[0].chunk_hash = "b" * 64
    assert base != identity(retrieved=changed)
    changed_context = retrieval.model_copy(deep=True)
    changed_context.fact_context.text += "\nchanged"
    assert base != identity(retrieved=changed_context)
    # Correlation IDs, log level, and secrets are intentionally not inputs.
    assert base == identity()
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
