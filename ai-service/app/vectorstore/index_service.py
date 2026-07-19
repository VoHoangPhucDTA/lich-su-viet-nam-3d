"""Idempotent Chroma index build and inspection service."""

import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from app.vectorstore.artifact_validator import EmbeddingArtifactValidator
from app.vectorstore.chroma_client import (
    close_persistent_client,
    collection_exists,
    create_collection,
    create_persistent_client,
    get_collection,
    validate_collection_contract,
)
from app.vectorstore.metadata_mapper import map_chroma_metadata
from app.vectorstore.models import (
    ChromaIndexRecord,
    ChromaIndexReport,
    ChromaInspection,
    CollectionCompatibilityError,
    CollectionNotFoundError,
    ValidatedEmbeddingArtifact,
)

T = TypeVar("T")


def partition_batches(values: list[T], size: int) -> list[list[T]]:
    if size <= 0:
        raise ValueError("batch size must be positive")
    return [values[index : index + size] for index in range(0, len(values), size)]


def build_collection_metadata(
    artifact: ValidatedEmbeddingArtifact, distance_metric: str
) -> dict[str, str | int | float | bool]:
    chunking_versions = {
        artifact.chunks_by_id[record.chunkId].chunkingVersion
        for record in artifact.records
    }
    if len(chunking_versions) != 1:
        raise CollectionCompatibilityError(
            f"Expected one chunking version, found {sorted(chunking_versions)}"
        )
    return {
        "corpusSha256": artifact.manifest.corpusSha256,
        "embeddingModel": artifact.manifest.embeddingModel,
        "embeddingDimension": artifact.manifest.dimension,
        "formatterVersion": artifact.manifest.formatterVersion,
        "chunkingVersion": next(iter(chunking_versions)),
        "distanceMetric": distance_metric,
        "sourceType": "sgk-kntt-history",
    }


def map_index_records(
    artifact: ValidatedEmbeddingArtifact,
) -> list[ChromaIndexRecord]:
    return [
        ChromaIndexRecord(
            id=record.chunkId,
            document=artifact.chunks_by_id[record.chunkId].text,
            embedding=record.vector,
            metadata=map_chroma_metadata(
                artifact.chunks_by_id[record.chunkId], record
            ),
        )
        for record in artifact.records
    ]


class ChromaIndexService:
    def __init__(
        self,
        *,
        validator: EmbeddingArtifactValidator,
        persist_dir: Path,
        report_dir: Path,
        collection_name: str,
        distance_metric: str,
        batch_size: int,
        client_factory: Callable[[Path], Any] = create_persistent_client,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self.validator = validator
        self.persist_dir = persist_dir
        self.report_dir = report_dir
        self.collection_name = collection_name
        self.distance_metric = distance_metric
        self.batch_size = batch_size
        self.client_factory = client_factory

    @property
    def report_path(self) -> Path:
        return self.report_dir / f"{self.collection_name}-index-report.json"

    @staticmethod
    def _atomic_write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)

    def _write_report(self, report: ChromaIndexReport) -> None:
        self._atomic_write(
            self.report_path,
            json.dumps(report.model_dump(), ensure_ascii=False, indent=2) + "\n",
        )

    def build(
        self,
        *,
        dry_run: bool = False,
        limit: int | None = None,
        recreate: bool = False,
    ) -> ChromaIndexReport:
        if limit is not None and limit <= 0:
            raise ValueError("limit must be positive")
        artifact = self.validator.validate()
        all_records = map_index_records(artifact)
        selected = all_records if limit is None else all_records[:limit]
        duplicate_ids = sorted(
            record.id
            for record in selected
            if sum(item.id == record.id for item in selected) > 1
        )
        if dry_run:
            return ChromaIndexReport(
                collectionName=self.collection_name,
                persistDirectory=str(self.persist_dir),
                embeddingModel=artifact.manifest.embeddingModel,
                dimension=artifact.manifest.dimension,
                inputRecords=len(selected),
                insertedOrUpdated=0,
                collectionCountBefore=0,
                collectionCountAfter=0,
                duplicateIds=sorted(set(duplicate_ids)),
                dryRun=True,
                status="DRY_RUN",
            )

        client = self.client_factory(self.persist_dir)
        try:
            exists = collection_exists(client, self.collection_name)
            count_before = 0
            if exists:
                existing = get_collection(client, self.collection_name)
                count_before = existing.count()
                if recreate:
                    client.delete_collection(name=self.collection_name)
                    exists = False
                else:
                    expected_metadata = build_collection_metadata(
                        artifact, self.distance_metric
                    )
                    validate_collection_contract(
                        existing, expected_metadata, self.distance_metric
                    )
                    if limit is None:
                        existing_ids = set(existing.get(include=[])["ids"])
                        input_ids = {record.id for record in all_records}
                        extra_ids = existing_ids - input_ids
                        if extra_ids:
                            raise CollectionCompatibilityError(
                                f"Collection contains {len(extra_ids)} IDs outside the artifact"
                            )

            if not exists:
                collection = create_collection(
                    client,
                    name=self.collection_name,
                    metadata=build_collection_metadata(artifact, self.distance_metric),
                    distance_metric=self.distance_metric,
                )
            else:
                collection = get_collection(client, self.collection_name)

            for batch in partition_batches(selected, self.batch_size):
                collection.upsert(
                    ids=[record.id for record in batch],
                    documents=[record.document for record in batch],
                    embeddings=[record.embedding for record in batch],
                    metadatas=[record.metadata for record in batch],
                )

            count_after = collection.count()
            indexed_ids = set(
                collection.get(ids=[record.id for record in selected], include=[])[
                    "ids"
                ]
            )
            selected_ids = {record.id for record in selected}
            if indexed_ids != selected_ids:
                raise CollectionCompatibilityError(
                    "Post-upsert validation did not find every selected chunk ID"
                )
            if limit is None and count_after != len(all_records):
                raise CollectionCompatibilityError(
                    f"Full collection count {count_after} does not match artifact count "
                    f"{len(all_records)}"
                )

            report = ChromaIndexReport(
                collectionName=self.collection_name,
                persistDirectory=str(self.persist_dir),
                embeddingModel=artifact.manifest.embeddingModel,
                dimension=artifact.manifest.dimension,
                inputRecords=len(selected),
                insertedOrUpdated=len(selected),
                collectionCountBefore=count_before,
                collectionCountAfter=count_after,
                duplicateIds=sorted(set(duplicate_ids)),
                status="COMPLETED",
            )
            self._write_report(report)
            return report
        finally:
            close_persistent_client(client)

    def inspect(self) -> ChromaInspection:
        if not (self.persist_dir / "chroma.sqlite3").is_file():
            raise CollectionNotFoundError(
                f"Chroma persistent database does not exist: {self.persist_dir}"
            )
        client = self.client_factory(self.persist_dir)
        try:
            if not collection_exists(client, self.collection_name):
                raise CollectionNotFoundError(
                    f"Chroma collection does not exist: {self.collection_name}"
                )
            collection = get_collection(client, self.collection_name)
            return ChromaInspection(
                collectionName=self.collection_name,
                persistDirectory=str(self.persist_dir),
                count=collection.count(),
                metadata=collection.metadata or {},
                configuration=collection.configuration or {},
            )
        finally:
            close_persistent_client(client)
