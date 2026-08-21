"""Typed contracts for the curated runtime factual guard."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FactValueType(str, Enum):
    YEAR = "YEAR"
    DATE = "DATE"
    PERSON = "PERSON"
    PLACE = "PLACE"
    COUNT = "COUNT"
    YEAR_RANGE = "YEAR_RANGE"


class ClaimLocation(str, Enum):
    STEM = "STEM"
    CORRECT_OPTION = "CORRECT_OPTION"
    EXPLANATION = "EXPLANATION"


class FactualDecision(str, Enum):
    PASS = "PASS"
    REJECT_REGENERATE = "REJECT_REGENERATE"
    CONTROLLED_FAILURE = "CONTROLLED_FAILURE"


class FactualReasonCode(str, Enum):
    FACT_CONTRADICTION = "FACT_CONTRADICTION"
    UNSUPPORTED_CLAIM = "UNSUPPORTED_CLAIM"
    SOURCE_CONFLICT = "SOURCE_CONFLICT"
    SOURCE_NOT_ELIGIBLE = "SOURCE_NOT_ELIGIBLE"
    ANSWER_EXPLANATION_MISMATCH = "ANSWER_EXPLANATION_MISMATCH"
    REGISTRY_CORPUS_MISMATCH = "REGISTRY_CORPUS_MISMATCH"
    VALIDATION_UNKNOWN = "VALIDATION_UNKNOWN"


class CriticalFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_id: str = Field(alias="factId", min_length=1)
    subject: str = Field(min_length=1)
    subject_aliases: list[str] = Field(alias="subjectAliases", min_length=1)
    relation: str = Field(min_length=1)
    value_type: FactValueType = Field(alias="valueType")
    canonical_value: str = Field(alias="canonicalValue", min_length=1)
    canonical_aliases: list[str] = Field(default_factory=list, alias="canonicalAliases")
    relation_anchors: list[str] = Field(alias="relationAnchors", min_length=1)
    source_chunk_ids: list[str] = Field(alias="sourceChunkIds", min_length=1)
    source_document_ids: list[str] = Field(alias="sourceDocumentIds", min_length=1)
    grade: Literal[10, 11, 12]
    lesson_number: int = Field(alias="lessonNumber", gt=0)
    lesson_title: str = Field(alias="lessonTitle", min_length=1)

    @field_validator(
        "fact_id",
        "subject",
        "relation",
        "canonical_value",
        "lesson_title",
    )
    @classmethod
    def reject_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class CriticalFactRegistry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_version: str = Field(alias="registryVersion", min_length=1)
    canonical_corpus_sha256: str = Field(
        alias="canonicalCorpusSha256", pattern=r"^[0-9a-f]{64}$"
    )
    facts: list[CriticalFact] = Field(min_length=1)


class ExtractedClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_id: str
    relation: str
    value_type: FactValueType
    normalized_value: str
    location: ClaimLocation


class FactualGuardResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: FactualDecision
    reason_codes: list[FactualReasonCode] = Field(default_factory=list)
    fact_ids_checked: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    covered_claim_count: int = Field(ge=0)
    unknown_claim_count: int = Field(ge=0)
