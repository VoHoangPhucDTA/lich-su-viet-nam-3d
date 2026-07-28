from dataclasses import dataclass
from types import SimpleNamespace

from google.genai import errors

from app.config import get_settings
from scripts.diagnose_gemini_embedding import _request_input, main


@dataclass
class MockEmbedding:
    values: list[float]


@dataclass
class MockResponse:
    embeddings: list[MockEmbedding]


class MockModels:
    def __init__(self, outcome: object) -> None:
        self.outcome = outcome
        self.calls: list[dict[str, object]] = []

    def embed_content(self, **kwargs: object) -> MockResponse:
        self.calls.append(kwargs)
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        assert isinstance(self.outcome, MockResponse)
        return self.outcome


class MockClient:
    def __init__(self, outcome: object) -> None:
        self.models = MockModels(outcome)
        self.closed = False

    def close(self) -> None:
        self.closed = True


def test_plain_single_and_multi_diagnostic_request_shapes() -> None:
    settings = SimpleNamespace()
    plain, plain_count, _ = _request_input("plain", 1, settings)
    single, single_count, _ = _request_input("single-content", 1, settings)
    multiple, multiple_count, _ = _request_input("multi-content", 1, settings)

    assert plain == "Hello world"
    assert plain_count == single_count == 1
    assert single.parts[0].text == "title: Test | text: Hello world"
    assert multiple_count == 3
    assert [item.parts[0].text for item in multiple] == [
        "Hello world",
        "Lịch sử Việt Nam",
        "Cách mạng tháng Tám",
    ]


def test_plain_diagnostic_reports_only_safe_metadata(monkeypatch, capsys) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "safe-test-key")
    monkeypatch.setenv("GEMINI_EMBEDDING_DIMENSION", "3")
    get_settings.cache_clear()
    client = MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])]))

    result = main(["--mode", "plain"], client_factory=lambda **_: client)
    output = capsys.readouterr().out

    assert result == 0
    assert '"status": "PASSED"' in output
    assert '"backend": "Gemini Developer API"' in output
    assert "safe-test-key" not in output
    assert client.models.calls[0]["contents"] == "Hello world"
    assert client.closed is True
    get_settings.cache_clear()


def test_diagnostic_reports_sdk_custom_base_url_as_boolean(monkeypatch, capsys) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "safe-test-key")
    monkeypatch.setenv("GEMINI_EMBEDDING_DIMENSION", "3")
    monkeypatch.setenv("GOOGLE_GEMINI_BASE_URL", "https://example.invalid")
    get_settings.cache_clear()
    client = MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])]))

    result = main(["--mode", "plain"], client_factory=lambda **_: client)
    output = capsys.readouterr().out

    assert result == 0
    assert '"customBaseUrlConfigured": true' in output
    assert "https://example.invalid" not in output
    get_settings.cache_clear()


def test_failed_diagnostic_preserves_details_without_secret(monkeypatch, capsys) -> None:
    secret = "AIza" + "z" * 32
    monkeypatch.setenv("GEMINI_API_KEY", secret)
    monkeypatch.setenv("GEMINI_EMBEDDING_DIMENSION", "3")
    get_settings.cache_clear()
    client = MockClient(
        errors.APIError(
            400,
            {
                "error": {
                    "status": "INVALID_ARGUMENT",
                    "message": f"bad {secret}",
                    "details": [{"reason": "bad shape"}],
                }
            },
        )
    )

    result = main(["--mode", "single-content"], client_factory=lambda **_: client)
    output = capsys.readouterr().out

    assert result == 2
    assert secret not in output
    assert "INVALID_ARGUMENT" in output
    assert "bad shape" in output
    assert '"requestItemCount": 1' in output
    get_settings.cache_clear()


def test_diagnostic_advances_past_invalid_key_without_printing_pool(
    monkeypatch, capsys
) -> None:
    first = "first-secret-key"
    second = "second-secret-key"
    monkeypatch.setenv("GEMINI_API_KEY", f"{first}, {second}")
    monkeypatch.setenv("GEMINI_EMBEDDING_DIMENSION", "3")
    get_settings.cache_clear()
    clients = iter(
        (
            MockClient(
                errors.APIError(
                    400,
                    {
                        "error": {
                            "status": "INVALID_ARGUMENT",
                            "details": [{"reason": "API_KEY_INVALID"}],
                        }
                    },
                )
            ),
            MockClient(MockResponse([MockEmbedding([1.0, 0.0, 0.0])])),
        )
    )

    result = main(["--mode", "plain"], client_factory=lambda **_: next(clients))
    output = capsys.readouterr().out

    assert result == 0
    assert '"apiKeyCount": 2' in output
    assert '"selectedKeyPosition": 2' in output
    assert first not in output
    assert second not in output
    get_settings.cache_clear()
