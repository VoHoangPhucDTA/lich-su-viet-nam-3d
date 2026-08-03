"""Embedding artifact models and domain exceptions."""

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

EmbeddingManifestStatus = Literal[
    "DRY_RUN",
    "IN_PROGRESS",
    "PARTIAL",
    "PARTIAL_WITH_ERRORS",
    "COMPLETED",
    "COMPLETED_WITH_ERRORS",
    "FAILED",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class EmbeddingError(Exception):
    """Base error for embedding operations."""


class EmbeddingResponseError(EmbeddingError):
    """Raised when provider output violates the embedding contract."""


class PermanentEmbeddingError(EmbeddingError):
    """Raised after provider-level retry/failover policy is exhausted."""

    def __init__(self, message: str, *, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.context = context or {}


class MissingGeminiApiKeyError(PermanentEmbeddingError):
    """Raised only when a Gemini request is attempted without a key."""


class CheckpointCorruptionError(EmbeddingError):
    """Raised for malformed checkpoint data other than a truncated tail."""


class EmbeddingRecord(BaseModel):
    chunkId: str
    chunkHash: str
    documentId: str
    embeddingModel: str
    dimension: int = Field(gt=0)
    formatterVersion: str
    vector: list[float]
    createdAt: str = Field(default_factory=utc_now_iso)

    def resume_key(self) -> tuple[str, str, str, int, str]:
        return (
            self.chunkId,
            self.chunkHash,
            self.embeddingModel,
            self.dimension,
            self.formatterVersion,
        )


class EmbeddingFailure(BaseModel):
    chunkId: str
    chunkHash: str
    documentId: str
    embeddingModel: str
    dimension: int
    formatterVersion: str
    errorType: str
    message: str
    exceptionClass: str | None = None
    httpCode: int | None = None
    providerStatus: str | None = None
    providerDetails: Any | None = None
    requestStage: str | None = None
    batchSize: int | None = None
    batchChunkIds: list[str] = Field(default_factory=list)
    createdAt: str = Field(default_factory=utc_now_iso)


class EmbeddingManifest(BaseModel):
    corpusSha256: str
    embeddingModel: str
    dimension: int
    formatterVersion: str
    totalCorpusRecords: int
    eligibleRecords: int
    pendingReviewSkipped: int
    selectedRecords: int
    alreadyCompleted: int = 0
    newlyEmbedded: int = 0
    successfulRecords: int = 0
    attemptedRecords: int = 0
    unattemptedRecords: int = 0
    remainingRecords: int = 0
    unresolvedFailedRecords: int = 0
    failedRecords: int = 0
    truncatedTailRecovered: bool = False
    dryRun: bool = False
    status: EmbeddingManifestStatus = "IN_PROGRESS"
    updatedAt: str = Field(default_factory=utc_now_iso)
