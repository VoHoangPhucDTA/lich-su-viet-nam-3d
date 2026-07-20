"""Typed contracts for retrieval, Fact Context, and evaluation."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CamelModel


class RetrievalError(Exception):
    """Base error for read-only retrieval operations."""


class RetrievalNotReadyError(RetrievalError):
    """Raised when the production collection is unavailable or incompatible."""


class RetrievalProviderError(RetrievalError):
    """Raised when query embedding cannot be produced."""


class RetrievalFilters(CamelModel):
    grade: Literal[10, 11, 12] | None = None
    lesson_number: int | None = Field(default=None, gt=0)
    document_id: str | None = None

    @field_validator("document_id")
    @classmethod
    def normalize_document_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("documentId must not be blank")
        return normalized


class RetrievalRequest(CamelModel):
    query: str
    grade: Literal[10, 11, 12] | None = None
    lesson_number: int | None = Field(default=None, gt=0)
    document_id: str | None = None
    top_k: int | None = Field(default=None, gt=0)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized

    @field_validator("document_id")
    @classmethod
    def normalize_request_document_id(cls, value: str | None) -> str | None:
        return RetrievalFilters.normalize_document_id(value)

    def filters(self) -> RetrievalFilters:
        return RetrievalFilters(
            grade=self.grade,
            lessonNumber=self.lesson_number,
            documentId=self.document_id,
        )


class RawChromaCandidate(BaseModel):
    chunk_id: str
    document_id: str
    grade: Literal[10, 11, 12]
    lesson_number: int = Field(gt=0)
    lesson_title: str
    section_title: str
    section_path: str
    page_start: int | None = None
    page_end: int | None = None
    content_types: str
    text: str
    distance: float
    chunk_hash: str
    contains_pending_review: bool = False


class RetrievalResult(CamelModel):
    rank: int = Field(gt=0)
    chunk_id: str
    document_id: str
    grade: Literal[10, 11, 12]
    lesson_number: int = Field(gt=0)
    lesson_title: str
    section_title: str
    section_path: str
    page_start: int | None = None
    page_end: int | None = None
    content_types: str
    text: str
    distance: float
    chunk_hash: str


class FactContext(CamelModel):
    text: str
    source_chunk_ids: list[str]
    included_chunks: int = Field(ge=0)
    truncated: bool
    character_count: int = Field(ge=0)


class RetrievalMetadata(CamelModel):
    embedding_model: str
    embedding_dimension: int
    query_formatter_version: str
    collection_name: str
    distance_metric: str


class RetrievalResponse(CamelModel):
    query: str
    filters: RetrievalFilters
    top_k: int
    candidate_count: int
    result_count: int
    results: list[RetrievalResult]
    fact_context: FactContext
    metadata: RetrievalMetadata


class SourceEvidence(CamelModel):
    chunk_ids: list[str] = Field(min_length=1)
    note: str


class BenchmarkRecord(CamelModel):
    query_id: str
    query: str
    category: Literal[
        "EXACT_SECTION",
        "PARAPHRASE",
        "NAMED_ENTITY",
        "DATE_EVENT",
        "CAUSE",
        "CONSEQUENCE",
        "SIGNIFICANCE",
        "COMPARISON",
        "AMBIGUOUS_WITH_FILTER",
    ]
    grade: Literal[10, 11, 12]
    lesson_number: int = Field(gt=0)
    filters: RetrievalFilters
    expected_chunk_ids: list[str] = Field(min_length=1)
    expected_document_ids: list[str] = Field(min_length=1)
    expected_section_keywords: list[str] = Field(default_factory=list)
    source_evidence: SourceEvidence


class EvaluationQueryResult(CamelModel):
    query_id: str
    grade: int
    category: str
    expected_chunk_ids: list[str]
    expected_document_ids: list[str]
    result_chunk_ids: list[str]
    result_document_ids: list[str]
    result_lessons: list[int]
    result_sections: list[str]
    distances: list[float]
    filter_compliant: bool
    pending_review_leakage: bool
    duplicate_results: bool
    latency_ms: float
    error: str | None = None


class EvaluationReport(CamelModel):
    status: Literal["COMPLETED", "COMPLETED_WITH_ERRORS"]
    query_count: int
    completed_queries: int
    failed_queries: int
    configuration: dict[str, Any]
    corpus_identity: dict[str, Any]
    distribution_by_grade: dict[str, int]
    distribution_by_category: dict[str, int]
    metrics: dict[str, float]
    query_results: list[EvaluationQueryResult]
