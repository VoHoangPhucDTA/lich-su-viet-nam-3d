from dataclasses import dataclass
from typing import Any

import pytest
from google.genai import errors

from app.embedding.gemini import (
    GeminiEmbeddingProvider,
    build_content,
    build_contents,
    is_retryable_gemini_error,
)
from app.embedding.models import (
    EmbeddingResponseError,
    MissingGeminiApiKeyError,
    PermanentEmbeddingError,
)


@dataclass
class MockEmbedding:
    values: list[float] | None


@dataclass
class MockResponse:
    embeddings: list[MockEmbedding]


class MockModels:
    def __init__(self, response: MockResponse) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def embed_content(self, **kwargs: Any) -> MockResponse:
        self.calls.append(kwargs)
        return self.response


class SequenceModels(MockModels):
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = outcomes
        self.calls = []

    def embed_content(self, **kwargs: Any) -> MockResponse:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        assert isinstance(outcome, MockResponse)
        return outcome


class MockClient:
    def __init__(self, response: MockResponse) -> None:
        self.models = MockModels(response)
        self.closed = False

    def close(self) -> None:
        self.closed = True


def make_provider(client: MockClient, dimension: int = 3) -> GeminiEmbeddingProvider:
    return GeminiEmbeddingProvider(
        api_key="test-key",
        model="gemini-embedding-2",
        dimension=dimension,
        max_retries=0,
        client_factory=lambda **_: client,
    )


def test_provider_wraps_each_document_in_separate_content_and_preserves_order() -> None:
    client = MockClient(
        MockResponse([MockEmbedding([1.0, 0.0, 0.0]), MockEmbedding([0.0, 1.0, 0.0])])
    )
    provider = make_provider(client)

    vectors = provider.embed_documents(["first", "second"])

    assert vectors == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    contents = client.models.calls[0]["contents"]
    assert len(contents) == 2
    assert contents[0].parts[0].text == "first"
    assert contents[1].parts[0].text == "second"
    assert client.models.calls[0]["config"].output_dimensionality == 3


def test_provider_explicitly_selects_developer_api() -> None:
    client = MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])]))
    client_args: dict[str, Any] = {}

    def factory(**kwargs: Any) -> MockClient:
        client_args.update(kwargs)
        return client

    provider = GeminiEmbeddingProvider(
        api_key="test-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )
    provider.embed_documents(["first"])

    assert client_args == {"api_key": "test-key", "vertexai": False}


def test_request_builders_reject_empty_and_keep_one_content_per_input() -> None:
    with pytest.raises(ValueError, match="must not be blank"):
        build_content("  ")
    single = build_content("title: Test | text: Hello world")
    multiple = build_contents(["first", "second", "third"])
    assert single.parts[0].text == "title: Test | text: Hello world"
    assert [item.parts[0].text for item in multiple] == [
        "first",
        "second",
        "third",
    ]


def test_provider_rejects_wrong_embedding_count() -> None:
    provider = make_provider(
        MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])]))
    )
    with pytest.raises(EmbeddingResponseError, match="Expected 2"):
        provider.embed_documents(["first", "second"])


def test_provider_rejects_missing_embedding_values() -> None:
    client = MockClient(MockResponse([]))
    client.models.response = MockResponse([MockEmbedding(None)])
    provider = make_provider(client)

    with pytest.raises(EmbeddingResponseError, match="is empty"):
        provider.embed_documents(["first"])


def test_provider_rejects_embedding_dimension_mismatch() -> None:
    provider = make_provider(
        MockClient(MockResponse([MockEmbedding([1.0, 0.0])])),
        dimension=3,
    )

    with pytest.raises(EmbeddingResponseError, match="dimension 2, expected 3"):
        provider.embed_documents(["first"])


def test_provider_rejects_nan_vector() -> None:
    provider = make_provider(
        MockClient(MockResponse([MockEmbedding([1.0, float("nan"), 0.0])]))
    )
    with pytest.raises(EmbeddingResponseError, match="NaN or Infinity"):
        provider.embed_documents(["first"])


def test_api_key_is_checked_only_when_request_is_made() -> None:
    factory_called = False

    def factory(**_: object) -> None:
        nonlocal factory_called
        factory_called = True

    provider = GeminiEmbeddingProvider(
        api_key="",
        model="gemini-embedding-2",
        dimension=768,
        max_retries=0,
        client_factory=factory,
    )
    assert factory_called is False
    with pytest.raises(MissingGeminiApiKeyError):
        provider.embed_documents(["document"])
    assert factory_called is False


def test_provider_closes_lazy_client() -> None:
    client = MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])]))
    provider = make_provider(client)
    provider.embed_documents(["first"])
    provider.close()
    assert client.closed is True


def test_provider_retries_429_then_succeeds() -> None:
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [
            errors.APIError(429, {"error": {"message": "temporary"}}),
            MockResponse([MockEmbedding([1.0, 0.0, 0.0])]),
        ]
    )
    provider = GeminiEmbeddingProvider(
        api_key="test-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=1,
        retry_min_seconds=0,
        retry_max_seconds=0,
        client_factory=lambda **_: client,
    )

    assert provider.embed_documents(["first"]) == [[1.0, 0.0, 0.0]]
    assert len(client.models.calls) == 2


def test_provider_does_not_retry_invalid_request() -> None:
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [errors.APIError(400, {"error": {"message": "invalid"}})]
    )
    provider = make_provider(client)

    with pytest.raises(PermanentEmbeddingError, match="400") as caught:
        provider.embed_documents(["first"])
    assert caught.value.context["httpCode"] == 400
    assert caught.value.context["message"] == "invalid"
    assert len(client.models.calls) == 1


def test_provider_preserves_error_details_but_redacts_api_key() -> None:
    secret = "AIza" + "x" * 32
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [
            errors.APIError(
                400,
                {
                    "error": {
                        "status": "INVALID_ARGUMENT",
                        "message": f"bad request for {secret}",
                        "details": [{"reason": "bad content", "apiKey": secret}],
                    }
                },
            )
        ]
    )
    provider = GeminiEmbeddingProvider(
        api_key=secret,
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=lambda **_: client,
    )

    with pytest.raises(PermanentEmbeddingError) as caught:
        provider.embed_documents(["first"])

    serialized = str(caught.value.context)
    assert secret not in serialized
    assert caught.value.context["providerStatus"] == "INVALID_ARGUMENT"
    assert "bad content" in serialized


def test_provider_tries_next_key_only_for_api_key_invalid() -> None:
    invalid_client = MockClient(MockResponse([]))
    invalid_client.models = SequenceModels(
        [
            errors.APIError(
                400,
                {
                    "error": {
                        "status": "INVALID_ARGUMENT",
                        "message": "invalid key",
                        "details": [{"reason": "API_KEY_INVALID"}],
                    }
                },
            )
        ]
    )
    valid_client = MockClient(
        MockResponse([MockEmbedding([1.0, 0.0, 0.0])])
    )
    clients = iter((invalid_client, valid_client))
    factory_calls: list[dict[str, Any]] = []

    def factory(**kwargs: Any) -> MockClient:
        factory_calls.append(kwargs)
        return next(clients)

    provider = GeminiEmbeddingProvider(
        api_key="first-key, second-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )

    assert provider.embed_documents(["first"]) == [[1.0, 0.0, 0.0]]
    assert provider.embed_documents(["second"]) == [[1.0, 0.0, 0.0]]
    assert factory_calls == [
        {"api_key": "first-key", "vertexai": False},
        {"api_key": "second-key", "vertexai": False},
    ]
    assert invalid_client.closed is True
    assert len(factory_calls) == 2


def test_provider_tries_next_key_for_key_specific_permission_denial() -> None:
    denied_client = MockClient(MockResponse([]))
    denied_client.models = SequenceModels(
        [
            errors.APIError(
                403,
                {"error": {"status": "PERMISSION_DENIED", "message": "denied"}},
            )
        ]
    )
    valid_client = MockClient(
        MockResponse([MockEmbedding([1.0, 0.0, 0.0])])
    )
    clients = iter((denied_client, valid_client))
    provider = GeminiEmbeddingProvider(
        api_key="denied-key, valid-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=lambda **_: next(clients),
    )

    assert provider.embed_documents(["first"]) == [[1.0, 0.0, 0.0]]
    assert denied_client.closed is True


def test_provider_does_not_fail_over_for_non_credential_400() -> None:
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [errors.APIError(400, {"error": {"message": "bad content"}})]
    )
    factory_calls = 0

    def factory(**_: Any) -> MockClient:
        nonlocal factory_calls
        factory_calls += 1
        return client

    provider = GeminiEmbeddingProvider(
        api_key="first-key, second-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )

    with pytest.raises(PermanentEmbeddingError):
        provider.embed_documents(["first"])
    assert factory_calls == 1


@pytest.mark.parametrize("status_code", [429, 503])
def test_transient_errors_retry_without_switching_key(status_code: int) -> None:
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [errors.APIError(status_code, {"error": {"message": "temporary"}})]
    )
    factory_calls = 0

    def factory(**_: Any) -> MockClient:
        nonlocal factory_calls
        factory_calls += 1
        return client

    provider = GeminiEmbeddingProvider(
        api_key="first-key, second-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )

    with pytest.raises(PermanentEmbeddingError) as caught:
        provider.embed_documents(["first"])
    assert caught.value.context["httpCode"] == status_code
    assert factory_calls == 1


def test_all_invalid_keys_are_tried_once_without_looping() -> None:
    clients: list[MockClient] = []
    for _ in range(2):
        client = MockClient(MockResponse([]))
        client.models = SequenceModels(
            [
                errors.APIError(
                    400,
                    {
                        "error": {
                            "status": "INVALID_ARGUMENT",
                            "details": [{"reason": "API_KEY_INVALID"}],
                        }
                    },
                )
            ]
        )
        clients.append(client)
    iterator = iter(clients)
    factory_calls = 0

    def factory(**_: Any) -> MockClient:
        nonlocal factory_calls
        factory_calls += 1
        return next(iterator)

    provider = GeminiEmbeddingProvider(
        api_key="first-key, second-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )

    with pytest.raises(PermanentEmbeddingError):
        provider.embed_documents(["first"])
    assert factory_calls == 2


def test_unrelated_403_does_not_switch_key() -> None:
    client = MockClient(MockResponse([]))
    client.models = SequenceModels(
        [errors.APIError(403, {"error": {"message": "policy block"}})]
    )
    factory_calls = 0

    def factory(**_: Any) -> MockClient:
        nonlocal factory_calls
        factory_calls += 1
        return client

    provider = GeminiEmbeddingProvider(
        api_key="first-key, second-key",
        model="gemini-embedding-2",
        dimension=3,
        max_retries=0,
        client_factory=factory,
    )

    with pytest.raises(PermanentEmbeddingError):
        provider.embed_documents(["first"])
    assert factory_calls == 1


def test_retry_classifier_accepts_only_transient_api_statuses() -> None:
    assert is_retryable_gemini_error(
        errors.APIError(503, {"error": {"message": "temporary"}})
    )
    assert not is_retryable_gemini_error(
        errors.APIError(401, {"error": {"message": "unauthorized"}})
    )
