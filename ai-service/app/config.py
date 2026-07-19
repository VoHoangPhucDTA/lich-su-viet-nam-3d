"""Typed environment configuration for the AI service."""

from functools import lru_cache
from pathlib import Path
import re
from typing import Literal

from pydantic import Field, field_validator, model_validator
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
    host: str = Field(default="127.0.0.1", validation_alias="AI_SERVICE_HOST")
    port: int = Field(default=8001, ge=1, le=65535, validation_alias="AI_SERVICE_PORT")
    log_level: str = "INFO"

    gemini_api_key: str = ""
    gemini_embedding_model: str = "gemini-embedding-2"
    gemini_embedding_dimension: int = Field(default=768, gt=0)
    gemini_embedding_batch_size: int = Field(default=8, gt=0)
    gemini_embedding_max_retries: int = Field(default=5, ge=0)
    gemini_embedding_retry_min_seconds: float = Field(default=1, ge=0)
    gemini_embedding_retry_max_seconds: float = Field(default=30, ge=0)
    gemini_generation_model: str = ""

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
