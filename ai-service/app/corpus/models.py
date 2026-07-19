"""Typed model matching records in the canonical SGK JSONL artifact."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class CorpusChunk(BaseModel):
    model_config = ConfigDict(extra="allow")

    chunkId: str
    documentId: str
    grade: Literal[10, 11, 12]
    book: str
    subject: str
    lessonNumber: int
    lessonTitle: str
    titleMayBeTruncated: StrictBool
    sourcePageId: str
    sourceFile: str
    sourceMarkdown: str
    sectionPath: list[str]
    sectionTitle: str
    # The canonical corpus has 12 records whose source pages are unknown (null).
    pageStart: int | None
    pageEnd: int | None
    contentTypes: list[str] = Field(min_length=1)
    text: str
    markdown: str
    embeddingTitle: str
    embeddingText: str
    sourceBlockIds: list[str] = Field(min_length=1)
    wordCount: int = Field(ge=0)
    charCount: int = Field(ge=0)
    containsPendingReview: StrictBool
    reviewIssueIds: list[str]
    ragEligible: StrictBool
    sourceMarkdownSha256: str
    chunkHash: str
    chunkingVersion: str

    @field_validator(
        "chunkId",
        "documentId",
        "book",
        "subject",
        "lessonTitle",
        "sourcePageId",
        "sourceFile",
        "sourceMarkdown",
        "sectionTitle",
        "text",
        "embeddingTitle",
        "embeddingText",
        "sourceMarkdownSha256",
        "chunkHash",
        "chunkingVersion",
    )
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value
