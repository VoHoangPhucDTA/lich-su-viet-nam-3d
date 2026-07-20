"""Typed API and domain contracts for grounded MCQ generation."""

from enum import Enum
from typing import Any, Literal

from pydantic import ConfigDict, Field, field_validator

from app.schemas.common import CamelModel, to_camel


PROMPT_VERSION = "grounded-mcq-v1"
SCHEMA_VERSION = "grounded-mcq-schema-v1"


class GenerationError(Exception):
    """Base generation-domain failure."""


class GenerationNotConfiguredError(GenerationError):
    pass


class GenerationTransientError(GenerationError):
    pass


class GenerationPermanentError(GenerationError):
    pass


class GenerationSafetyError(GenerationError):
    pass


class GenerationOutputError(GenerationError):
    pass


class InsufficientContextError(GenerationError):
    pass


class StrictCamelModel(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class Difficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class QuizOption(StrictCamelModel):
    id: Literal["A", "B", "C", "D"]
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("option text must not be blank")
        return value


class StyleExample(StrictCamelModel):
    question: str = Field(min_length=1)
    options: list[QuizOption] = Field(min_length=4, max_length=4)
    correct_option_id: Literal["A", "B", "C", "D"]
    explanation: str = Field(min_length=1)
    difficulty: Difficulty

    @field_validator("question", "explanation")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value


class GenerationRequest(StrictCamelModel):
    query: str = Field(min_length=1)
    grade: Literal[10, 11, 12] | None = None
    lesson_number: int | None = Field(default=None, gt=0)
    document_id: str | None = None
    difficulty: Difficulty = Difficulty.MEDIUM
    count: int | None = Field(default=None, gt=0)
    top_k: int | None = Field(default=None, gt=0)
    style_examples: list[StyleExample] = Field(default_factory=list)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value

    @field_validator("document_id")
    @classmethod
    def normalize_document_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("documentId must not be blank")
        return value


class GeneratedQuestion(StrictCamelModel):
    question: str = Field(min_length=1)
    options: list[QuizOption] = Field(min_length=4, max_length=4)
    correct_option_id: Literal["A", "B", "C", "D"]
    explanation: str = Field(min_length=1)
    difficulty: Difficulty
    source_chunk_ids: list[str] = Field(min_length=1)

    @field_validator("question", "explanation")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("generated text must not be blank")
        return value

    @field_validator("source_chunk_ids")
    @classmethod
    def normalize_source_ids(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError("sourceChunkIds must not contain blank values")
        return normalized


class GenerationSource(StrictCamelModel):
    chunk_id: str
    document_id: str
    grade: Literal[10, 11, 12]
    lesson_number: int
    lesson_title: str
    section_title: str
    page_start: int | None = None
    page_end: int | None = None


class GenerationMetadata(StrictCamelModel):
    requested_count: int
    generated_count: int
    retrieved_chunk_count: int
    generation_model: str
    embedding_model: str
    collection_name: str
    prompt_version: str = PROMPT_VERSION
    schema_version: str = SCHEMA_VERSION
    repair_attempts: int
    latency_ms: float


class GenerationResponse(StrictCamelModel):
    questions: list[GeneratedQuestion]
    sources: list[GenerationSource]
    metadata: GenerationMetadata
    warnings: list[str] = Field(default_factory=list)


class ValidationIssue(StrictCamelModel):
    code: str
    message: str
    question_index: int | None = None
    severity: Literal["ERROR", "WARNING"] = "ERROR"


class ValidationSummary(StrictCamelModel):
    status: Literal["PASSED", "PASSED_WITH_WARNINGS", "FAILED"]
    issues: list[ValidationIssue]


class GenerationBenchmarkCase(StrictCamelModel):
    case_id: str
    query: str
    grade: Literal[10, 11, 12]
    lesson_number: int = Field(gt=0)
    difficulty: Difficulty
    count: int = Field(gt=0)
    top_k: int = Field(gt=0)
    style_examples_fixture: str | None = None
    expected: dict[str, Any]
