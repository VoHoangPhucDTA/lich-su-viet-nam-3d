"""Vectorstore domain models and errors."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.corpus.models import CorpusChunk
from app.embedding.models import EmbeddingManifest, EmbeddingRecord, utc_now_iso


class VectorstoreError(Exception):
    """Base class for vectorstore build errors."""


class ArtifactValidationError(VectorstoreError):
    """Raised when embedding artifacts cannot safely be indexed."""


class CollectionCompatibilityError(VectorstoreError):
    """Raised when an existing collection has an incompatible contract."""


class CollectionNotFoundError(VectorstoreError):
    """Raised when inspection targets a collection that does not exist."""


@dataclass(frozen=True)
class ValidatedEmbeddingArtifact:
    manifest: EmbeddingManifest
    records: list[EmbeddingRecord]
    chunks_by_id: dict[str, CorpusChunk]
    corpus_path: Path
    artifact_dir: Path


@dataclass(frozen=True)
class ChromaIndexRecord:
    id: str
    document: str
    embedding: list[float]
    metadata: dict[str, str | int | float | bool]


class ChromaIndexReport(BaseModel):
    collectionName: str
    persistDirectory: str
    embeddingModel: str
    dimension: int = Field(gt=0)
    inputRecords: int
    insertedOrUpdated: int
    collectionCountBefore: int
    collectionCountAfter: int
    duplicateIds: list[str] = Field(default_factory=list)
    dryRun: bool = False
    status: Literal["DRY_RUN", "COMPLETED"]
    createdAt: str = Field(default_factory=utc_now_iso)


class ChromaInspection(BaseModel):
    collectionName: str
    persistDirectory: str
    count: int
    metadata: dict[str, Any]
    configuration: dict[str, Any]
