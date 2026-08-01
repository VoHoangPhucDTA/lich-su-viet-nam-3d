"""Typed environment configuration for the AI service."""

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


def parse_gemini_api_keys(value: str) -> tuple[str, ...]:
    """Parse a comma-separated key pool without exposing key values."""
    return tuple(dict.fromkeys(part.strip() for part in value.split(",") if part.strip()))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: str = "development"
    deterministic_e2e_provider: bool = Field(
        default=False, validation_alias="AI_DETERMINISTIC_E2E_PROVIDER"
    )
    host: str = Field(default="127.0.0.1", validation_alias="AI_SERVICE_HOST")
    port: int = Field(default=8001, ge=1, le=65535, validation_alias="AI_SERVICE_PORT")
    log_level: str = "INFO"
    ai_service_internal_token: SecretStr = Field(
        default=SecretStr(""), validation_alias="AI_SERVICE_INTERNAL_TOKEN"
    )

    gemini_api_key: str = ""
    gemini_embedding_model: str = "gemini-embedding-2"
    gemini_embedding_dimension: int = Field(default=768, gt=0)
    gemini_embedding_batch_size: int = Field(default=8, gt=0)
    gemini_embedding_max_retries: int = Field(default=5, ge=0)
    gemini_embedding_retry_min_seconds: float = Field(default=1, ge=0)
    gemini_embedding_retry_max_seconds: float = Field(default=30, ge=0)
    gemini_embedding_timeout_seconds: float = Field(default=30, gt=0)
    gemini_generation_model: str = ""
    gemini_generation_temperature: float = Field(default=0.3, ge=0, le=2)
    gemini_generation_max_output_tokens: int = Field(default=8192, gt=0)
    gemini_generation_max_retries: int = Field(default=3, ge=0)
    gemini_generation_repair_attempts: int = Field(default=1, ge=0)
    gemini_generation_timeout_seconds: float = Field(default=60, gt=0)
    self_practice_model_enabled: bool = Field(
        default=False, validation_alias="AI_SELF_PRACTICE_MODEL_ENABLED"
    )
    self_practice_model: str = Field(
        default="gemini-3.5-flash-lite",
        validation_alias="AI_SELF_PRACTICE_MODEL",
    )
    self_practice_model_rollout_percent: int = Field(
        default=0,
        ge=0,
        le=100,
        validation_alias="AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT",
    )
    self_practice_model_fallback_enabled: bool = Field(
        default=False,
        validation_alias="AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED",
    )
    self_practice_provider_max_retries: int = Field(
        default=1,
        ge=0,
        le=1,
        validation_alias="AI_SELF_PRACTICE_PROVIDER_MAX_RETRIES",
    )
    self_practice_provider_retry_base_delay_seconds: float = Field(
        default=0.25,
        ge=0,
        validation_alias="AI_SELF_PRACTICE_PROVIDER_RETRY_BASE_DELAY_SECONDS",
    )
    self_practice_provider_retry_max_delay_seconds: float = Field(
        default=0.5,
        ge=0,
        validation_alias="AI_SELF_PRACTICE_PROVIDER_RETRY_MAX_DELAY_SECONDS",
    )
    self_practice_provider_total_budget_seconds: float = Field(
        default=20,
        gt=0,
        le=20,
        validation_alias="AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS",
    )
    self_practice_rollout_salt: str = Field(
        default="self-practice-v1",
        validation_alias="AI_SELF_PRACTICE_ROLLOUT_SALT",
    )
    ai_request_deadline_seconds: float = Field(default=80, gt=0)
    ai_gateway_read_timeout_seconds: float = Field(default=90, gt=0)
    ai_min_provider_timeout_seconds: float = Field(default=0.05, gt=0)

    embedding_output_dir: Path = Path("./storage/embeddings")
    embedding_checkpoint_dir: Path = Path("./storage/checkpoints")

    chroma_persist_dir: Path = Path("./storage/chroma")
    chroma_collection_name: str = "sgk_kntt_history_gemini_v1"
    chroma_distance_metric: Literal["cosine", "l2", "ip"] = "cosine"
    chroma_upsert_batch_size: int = Field(default=50, gt=0)
    chroma_report_dir: Path = Path("./storage/chroma-reports")

    sgk_chunks_path: Path = Path("./data/corpus/sgk_chunks.jsonl")
    rag_include_pending_review: bool = False
    rag_default_top_k: int = Field(default=5, ge=1)
    rag_max_top_k: int = Field(default=10, ge=1)
    rag_candidate_multiplier: int = Field(default=3, gt=0)
    rag_max_candidates: int = Field(default=30, gt=0)
    rag_max_chunks_per_document: int = Field(default=2, gt=0)
    rag_context_max_chars: int = Field(default=12000, gt=0)
    rag_context_max_chunks: int = Field(default=5, gt=0)
    rag_query_max_length: int = Field(default=1000, gt=0)
    rag_retrieval_timeout_seconds: float = Field(default=30, gt=0)

    quiz_default_count: int = Field(default=5, ge=1)
    quiz_max_count: int = Field(default=10, ge=1)
    quiz_max_style_examples: int = Field(default=3, ge=0)
    quiz_max_style_example_chars: int = Field(default=12000, gt=0)
    quiz_max_question_length: int = Field(default=500, gt=0)
    quiz_max_option_length: int = Field(default=300, gt=0)
    quiz_max_explanation_length: int = Field(default=1500, gt=0)
    quiz_duplicate_similarity_threshold: float = Field(default=0.9, ge=0, le=1)
    quiz_allow_pending_review: bool = False

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_keys)

    @property
    def gemini_api_keys(self) -> tuple[str, ...]:
        return parse_gemini_api_keys(self.gemini_api_key)

    @field_validator(
        "embedding_output_dir",
        "embedding_checkpoint_dir",
        "chroma_persist_dir",
        "chroma_report_dir",
        "sgk_chunks_path",
        mode="after",
    )
    @classmethod
    def resolve_service_relative_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (SERVICE_ROOT / value).resolve()

    @field_validator("chroma_collection_name")
    @classmethod
    def validate_collection_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("CHROMA_COLLECTION_NAME must not be blank")
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,510}[a-z0-9]", name):
            raise ValueError("CHROMA_COLLECTION_NAME violates Chroma naming rules")
        if ".." in name:
            raise ValueError("CHROMA_COLLECTION_NAME must not contain '..'")
        return name

    @model_validator(mode="after")
    def validate_retry_window(self) -> "Settings":
        if (
            self.gemini_embedding_retry_max_seconds
            < self.gemini_embedding_retry_min_seconds
        ):
            raise ValueError(
                "GEMINI_EMBEDDING_RETRY_MAX_SECONDS must be greater than or equal "
                "to GEMINI_EMBEDDING_RETRY_MIN_SECONDS"
            )
        return self

    @model_validator(mode="after")
    def validate_runtime_budget(self) -> "Settings":
        if self.ai_request_deadline_seconds >= self.ai_gateway_read_timeout_seconds:
            raise ValueError(
                "AI_REQUEST_DEADLINE_SECONDS must be less than "
                "AI_GATEWAY_READ_TIMEOUT_SECONDS"
            )
        if self.ai_min_provider_timeout_seconds >= self.ai_request_deadline_seconds:
            raise ValueError(
                "AI_MIN_PROVIDER_TIMEOUT_SECONDS must be less than "
                "AI_REQUEST_DEADLINE_SECONDS"
            )
        return self

    @model_validator(mode="after")
    def validate_self_practice_rollout(self) -> "Settings":
        candidate_model = self.self_practice_model.strip()
        rollout_salt = self.self_practice_rollout_salt.strip()
        if self.self_practice_model_rollout_percent not in {0, 5, 25, 50, 100}:
            raise ValueError(
                "AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT must be one of 0, 5, 25, 50, 100"
            )
        if self.self_practice_model_rollout_percent > 0 and not self.self_practice_model_enabled:
            raise ValueError(
                "AI_SELF_PRACTICE_MODEL_ENABLED must be true when rollout is greater than 0"
            )
        if self.self_practice_model_enabled and not candidate_model:
            raise ValueError("AI_SELF_PRACTICE_MODEL must not be blank when enabled")
        if self.self_practice_model_fallback_enabled:
            raise ValueError(
                "AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED is not supported during initial rollout"
            )
        if (
            self.self_practice_provider_retry_max_delay_seconds
            < self.self_practice_provider_retry_base_delay_seconds
        ):
            raise ValueError(
                "AI_SELF_PRACTICE_PROVIDER_RETRY_MAX_DELAY_SECONDS must be >= "
                "AI_SELF_PRACTICE_PROVIDER_RETRY_BASE_DELAY_SECONDS"
            )
        if (
            self.self_practice_provider_total_budget_seconds
            <= self.self_practice_provider_retry_max_delay_seconds
            + self.ai_min_provider_timeout_seconds
        ):
            raise ValueError(
                "AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS must leave "
                "time for a provider attempt after the maximum retry delay"
            )
        if (
            self.self_practice_model_enabled
            and self.self_practice_model_rollout_percent > 0
            and not rollout_salt
        ):
            raise ValueError("AI_SELF_PRACTICE_ROLLOUT_SALT must not be blank during rollout")
        self.self_practice_model = candidate_model
        self.self_practice_rollout_salt = rollout_salt
        return self

    @model_validator(mode="after")
    def validate_retrieval_limits(self) -> "Settings":
        if self.rag_max_top_k < self.rag_default_top_k:
            raise ValueError("RAG_MAX_TOP_K must be >= RAG_DEFAULT_TOP_K")
        if self.rag_max_candidates < self.rag_max_top_k:
            raise ValueError("RAG_MAX_CANDIDATES must be >= RAG_MAX_TOP_K")
        return self

    @model_validator(mode="after")
    def validate_quiz_limits(self) -> "Settings":
        if self.quiz_max_count < self.quiz_default_count:
            raise ValueError("QUIZ_MAX_COUNT must be >= QUIZ_DEFAULT_COUNT")
        return self

    @model_validator(mode="after")
    def guard_deterministic_e2e_provider(self) -> "Settings":
        if self.deterministic_e2e_provider and self.app_env.casefold() not in {"test", "e2e"}:
            raise ValueError(
                "AI_DETERMINISTIC_E2E_PROVIDER is permitted only when APP_ENV is test or e2e"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
