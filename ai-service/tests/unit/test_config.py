from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_config_loads_defaults_without_api_key() -> None:
    settings = Settings(_env_file=None)

    assert settings.app_env == "development"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8001
    assert settings.sgk_chunks_path.is_absolute()
    assert settings.sgk_chunks_path.as_posix().endswith(
        "ai-service/data/corpus/sgk_chunks.jsonl"
    )
    assert settings.gemini_embedding_model == "gemini-embedding-2"
    assert settings.gemini_embedding_dimension == 768
    assert settings.gemini_embedding_batch_size == 8
    assert settings.gemini_configured is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"gemini_embedding_dimension": 0},
        {"gemini_embedding_batch_size": 0},
        {"gemini_embedding_max_retries": -1},
        {"chroma_upsert_batch_size": 0},
        {"chroma_collection_name": " "},
        {"chroma_distance_metric": "unsupported"},
        {
            "gemini_embedding_retry_min_seconds": 10,
            "gemini_embedding_retry_max_seconds": 1,
        },
    ],
)
def test_config_rejects_invalid_embedding_values(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)


def test_chroma_relative_path_resolves_from_ai_service_root() -> None:
    settings = Settings(
        _env_file=None,
        chroma_persist_dir=Path("custom/chroma"),
    )
    assert settings.chroma_persist_dir.is_absolute()
    assert settings.chroma_persist_dir.as_posix().endswith(
        "ai-service/custom/chroma"
    )


def test_config_parses_comma_separated_gemini_key_pool() -> None:
    settings = Settings(
        _env_file=None,
        gemini_api_key=" key-one, key-two, ,key-one ",
    )

    assert settings.gemini_configured is True
    assert settings.gemini_api_keys == ("key-one", "key-two")
