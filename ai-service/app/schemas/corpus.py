"""Schemas exposed by corpus validation workflows."""

from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel


class InvalidRecord(CamelModel):
    line_number: int = Field(ge=1)
    errors: list[str]


class CorpusValidationReport(CamelModel):
    total_records: int = 0
    eligible_records: int = 0
    pending_review_records: int = 0
    duplicate_chunk_ids: list[str] = Field(default_factory=list)
    invalid_records: list[InvalidRecord] = Field(default_factory=list)
    status: Literal["PASSED", "FAILED"] = "PASSED"
