"""Typed contracts for retrieval, Fact Context, and evaluation."""

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CamelModel

FilterMode = Literal["GRADE_AND_LESSON", "GRADE_ONLY", "FILTER_OFF"]
BenchmarkRole = Literal["DEVELOPMENT_AUTHORED", "HELD_OUT_EXTERNAL"]


class RetrievalError(Exception):
    """Base error for read-only retrieval operations."""


class RetrievalNotReadyError(RetrievalError):
    """Raised when the production collection is unavailable or incompatible."""


class RetrievalProviderError(RetrievalError):
    """Raised when query embedding cannot be produced."""


class RetrievalSafetyError(RetrievalError):
    """Raised when a production-selection invariant is violated."""

    def __init__(self, code: str = "RETRIEVAL_SAFETY_VIOLATION") -> None:
        self.code = code
        super().__init__(code)


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
    corpus_sha256: str
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
    benchmark_role: Literal["DEVELOPMENT_AUTHORED"] = "DEVELOPMENT_AUTHORED"
    authoring_protocol: Literal[
        "ENGINEERING_AUTHORED_FROM_CANONICAL_EVIDENCE"
    ] = "ENGINEERING_AUTHORED_FROM_CANONICAL_EVIDENCE"
    independent_ground_truth: Literal[False] = False

    @field_validator("query_id", "query")
    @classmethod
    def reject_blank_benchmark_strings(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class HeldOutBenchmarkRecord(CamelModel):
    benchmark_case_id: str
    query: str
    grade: Literal[10, 11, 12]
    lesson_number: int | None = Field(default=None, gt=0)
    category: str
    relevant_chunk_ids: list[str] = Field(min_length=1)
    relevance_judgment_version: str
    query_author_pseudonym: str
    relevance_reviewer_pseudonym: str
    query_author_viewed_chunk_content: Literal[False]
    benchmark_role: Literal["HELD_OUT_EXTERNAL"]
    synthetic_schema_example: bool = False

    @field_validator(
        "benchmark_case_id",
        "query",
        "category",
        "relevance_judgment_version",
        "query_author_pseudonym",
        "relevance_reviewer_pseudonym",
    )
    @classmethod
    def reject_blank_held_out_strings(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized

    @field_validator("relevant_chunk_ids")
    @classmethod
    def reject_duplicate_relevant_chunks(
        cls, value: list[str]
    ) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("relevantChunkIds must be unique")
        return value


@dataclass
class RetrievalEvaluationTrace:
    """Internal-only measurement state; never serialized by retrieval routes."""

    raw_candidate_chunk_ids: list[str] = field(default_factory=list)
    pending_review_candidate_ids: list[str] = field(default_factory=list)
    filtered_candidate_chunk_ids: list[str] = field(default_factory=list)
    embedding_contract_matched: bool | None = None
    collection_metadata_matched: bool | None = None
    collection_distance_metric_matched: bool | None = None
    query_embedding_latency_ms: float | None = None
    chroma_query_latency_ms: float | None = None
    post_processing_latency_ms: float | None = None

    def reset(self) -> None:
        self.raw_candidate_chunk_ids.clear()
        self.pending_review_candidate_ids.clear()
        self.filtered_candidate_chunk_ids.clear()
        self.embedding_contract_matched = None
        self.collection_metadata_matched = None
        self.collection_distance_metric_matched = None
        self.query_embedding_latency_ms = None
        self.chroma_query_latency_ms = None
        self.post_processing_latency_ms = None


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
    filter_mode: FilterMode = "GRADE_AND_LESSON"
    requested_top_k: int = Field(default=5, gt=0)
    returned_result_count: int = Field(default=0, ge=0)
    effective_k: int = Field(default=0, ge=0)
    eligible_pool_size_before_top_k: int | None = Field(default=None, ge=0)
    effective_pool_size_after_filters: int | None = Field(default=None, ge=0)
    section_keyword_coverage_at_k: float | None = Field(
        default=None, ge=0, le=1
    )
    cache_lookup_latency_ms: float | None = Field(default=None, ge=0)
    query_embedding_latency_ms: float | None = Field(default=None, ge=0)
    chroma_query_latency_ms: float | None = Field(default=None, ge=0)
    post_processing_latency_ms: float | None = Field(default=None, ge=0)
    embedding_contract_matched: bool | None = None
    collection_metadata_matched: bool | None = None
    collection_distance_metric_matched: bool | None = None
    error: str | None = None


class EvaluationReport(CamelModel):
    report_schema_version: Literal["retrieval-evaluation-v2"]
    status: Literal["COMPLETED", "COMPLETED_WITH_ERRORS"]
    evaluation_mode: Literal[
        "OFFLINE_CACHE_REPLAY",
        "LIVE_NO_CACHE",
        "LIVE_CACHE_FILL",
        "MIXED",
        "SYNTHETIC_TEST_DATA",
    ]
    benchmark_role: BenchmarkRole
    authoring_protocol: str
    independent_ground_truth: bool
    filter_mode: str
    metric_population: dict[str, str]
    query_count: int
    completed_queries: int
    failed_queries: int
    cache_hits: int
    cache_misses: int
    cache_mode: Literal["CACHE_REPLAY", "LIVE", "MIXED", "UNKNOWN"]
    configuration: dict[str, Any]
    corpus_identity: dict[str, Any]
    distribution_by_grade: dict[str, int]
    distribution_by_category: dict[str, int]
    metrics: dict[str, Any]
    strata: dict[str, Any]
    metric_availability: dict[str, str]
    query_results: list[EvaluationQueryResult]
