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
    assert settings.rag_candidate_multiplier == 3
    assert settings.rag_max_candidates == 30
    assert settings.rag_max_chunks_per_document == 2
    assert settings.rag_context_max_chars == 12000
    assert settings.rag_context_max_chunks == 5
    assert settings.rag_query_max_length == 1000
    assert settings.rag_retrieval_timeout_seconds == 30
    assert settings.gemini_embedding_timeout_seconds == 30
    assert settings.ai_request_deadline_seconds == 80
    assert settings.ai_gateway_read_timeout_seconds == 90
    assert settings.gemini_generation_temperature == 0.3
    assert settings.gemini_generation_max_output_tokens == 8192
    assert settings.gemini_generation_repair_attempts == 1
    assert settings.self_practice_model_enabled is False
    assert settings.self_practice_model == "gemini-3.5-flash-lite"
    assert settings.self_practice_model_rollout_percent == 0
    assert settings.self_practice_model_fallback_enabled is False
    assert settings.quiz_default_count == 5
    assert settings.quiz_max_count == 10
    assert settings.quiz_duplicate_similarity_threshold == 0.9
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
        {"rag_candidate_multiplier": 0},
        {"rag_context_max_chars": 0},
        {"rag_query_max_length": 0},
        {"rag_retrieval_timeout_seconds": 0},
        {"gemini_embedding_timeout_seconds": 0},
        {"ai_request_deadline_seconds": 0},
        {"ai_request_deadline_seconds": 90, "ai_gateway_read_timeout_seconds": 90},
        {"ai_min_provider_timeout_seconds": 80, "ai_request_deadline_seconds": 80},
        {"rag_default_top_k": 5, "rag_max_top_k": 4},
        {"rag_max_top_k": 10, "rag_max_candidates": 9},
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


def test_deterministic_provider_is_rejected_outside_test_or_e2e() -> None:
    with pytest.raises(ValidationError, match="permitted only"):
        Settings(_env_file=None, app_env="production", deterministic_e2e_provider=True)

    assert Settings(
        _env_file=None, app_env="e2e", deterministic_e2e_provider=True
    ).deterministic_e2e_provider


@pytest.mark.parametrize(
    "overrides",
    [
        {"self_practice_model_rollout_percent": -1},
        {"self_practice_model_rollout_percent": 101},
        {
            "self_practice_model_enabled": True,
            "self_practice_model_rollout_percent": 6,
        },
        {"self_practice_model_rollout_percent": 5},
        {"self_practice_model_enabled": True, "self_practice_model": " "},
        {"self_practice_model_fallback_enabled": True},
        {
            "self_practice_model_enabled": True,
            "self_practice_model_rollout_percent": 5,
            "self_practice_rollout_salt": " ",
        },
    ],
)
def test_config_rejects_unsafe_self_practice_rollout(
    overrides: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **overrides)
