"""Strict contracts for internal provenance validation."""

from pydantic import ConfigDict, Field, field_validator

from app.schemas.common import CamelModel, to_camel


class StrictModel(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )


class SourceIdentity(StrictModel):
    chunk_id: str = Field(min_length=1, max_length=255)
    chunk_hash: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")

    @field_validator("chunk_id")
    @classmethod
    def normalize_chunk_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("chunkId must not be blank")
        return normalized


class ProvenanceValidationRequest(StrictModel):
    corpus_sha256: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    collection_name: str = Field(min_length=3, max_length=512)
    embedding_model: str = Field(min_length=1, max_length=120)
    embedding_dimension: int = Field(gt=0)
    sources: list[SourceIdentity] = Field(min_length=1, max_length=30)


class SourceValidationResult(StrictModel):
    chunk_id: str
    chunk_hash: str | None = None
    exists: bool
    hash_matches: bool
    pending_review: bool
    document_id: str | None = None
    grade: int | None = None
    lesson_number: int | None = None
    lesson_title: str | None = None
    section_title: str | None = None
    page_start: int | None = None
    page_end: int | None = None


class ProvenanceValidationResponse(StrictModel):
    valid: bool
    corpus_matches: bool
    collection_matches: bool
    embedding_contract_matches: bool
    sources: list[SourceValidationResult]
    errors: list[str]


class CanonicalSourceSearchRequest(StrictModel):
    query: str = Field(min_length=1, max_length=1000)
    grade: int | None = Field(default=None, ge=10, le=12)
    lesson_number: int | None = Field(default=None, gt=0)
    document_id: str | None = Field(default=None, max_length=255)
    top_k: int = Field(default=10, gt=0, le=20)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized


class CanonicalSourceSearchResult(StrictModel):
    chunk_id: str
    chunk_hash: str
    document_id: str
    grade: int
    lesson_number: int
    lesson_title: str
    section_title: str
    page_start: int | None = None
    page_end: int | None = None
    excerpt: str
    distance: float
    pending_review: bool = False


class CanonicalSourceSearchResponse(StrictModel):
    results: list[CanonicalSourceSearchResult]
