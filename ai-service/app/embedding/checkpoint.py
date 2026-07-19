"""Atomic embedding artifacts and resume checkpoint management."""

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.embedding.models import (
    CheckpointCorruptionError,
    EmbeddingFailure,
    EmbeddingManifest,
    EmbeddingRecord,
    utc_now_iso,
)

logger = logging.getLogger(__name__)


def sanitize_artifact_name(model: str, dimension: int) -> str:
    safe_model = re.sub(r"[^A-Za-z0-9._-]+", "-", model).strip("-._")
    if not safe_model:
        raise ValueError("Embedding model does not contain a safe path component")
    return f"{safe_model}-{dimension}"


@dataclass
class LoadedRecords:
    records: dict[str, EmbeddingRecord]
    truncated_tail_recovered: bool = False


class EmbeddingArtifactStore:
    def __init__(
        self,
        output_root: Path,
        checkpoint_root: Path,
        model: str,
        dimension: int,
    ) -> None:
        artifact_name = sanitize_artifact_name(model, dimension)
        self.output_dir = output_root / artifact_name
        self.checkpoint_dir = checkpoint_root / artifact_name
        self.records_path = self.output_dir / "embedding_records.jsonl"
        self.manifest_path = self.output_dir / "embedding_manifest.json"
        self.failures_path = self.output_dir / "embedding_failures.jsonl"
        self.state_path = self.checkpoint_dir / "checkpoint_state.json"

    @staticmethod
    def _atomic_write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)

    def load_records(self) -> LoadedRecords:
        if not self.records_path.is_file():
            return LoadedRecords(records={})
        raw = self.records_path.read_bytes()
        lines = raw.splitlines(keepends=True)
        records: dict[str, EmbeddingRecord] = {}
        truncated = False
        for index, raw_line in enumerate(lines, start=1):
            if not raw_line.strip():
                continue
            try:
                value: Any = json.loads(raw_line.decode("utf-8"))
                record = EmbeddingRecord.model_validate(value)
            except (UnicodeDecodeError, json.JSONDecodeError, ValidationError) as exc:
                is_last = index == len(lines)
                lacks_newline = not raw_line.endswith((b"\n", b"\r"))
                if is_last and lacks_newline:
                    truncated = True
                    logger.warning(
                        "Detected and ignored a truncated final embedding record"
                    )
                    break
                raise CheckpointCorruptionError(
                    f"Invalid embedding record at line {index}: {exc}"
                ) from exc
            records[record.chunkId] = record
        return LoadedRecords(records=records, truncated_tail_recovered=truncated)

    def write_records(self, records: dict[str, EmbeddingRecord]) -> None:
        content = "".join(
            record.model_dump_json() + "\n" for record in records.values()
        )
        self._atomic_write(self.records_path, content)

    def load_failures(self) -> dict[str, EmbeddingFailure]:
        if not self.failures_path.is_file():
            return {}
        failures: dict[str, EmbeddingFailure] = {}
        with self.failures_path.open("r", encoding="utf-8") as source:
            for line_number, line in enumerate(source, start=1):
                if not line.strip():
                    continue
                try:
                    failure = EmbeddingFailure.model_validate_json(line)
                except ValidationError as exc:
                    raise CheckpointCorruptionError(
                        f"Invalid embedding failure at line {line_number}: {exc}"
                    ) from exc
                failures[failure.chunkId] = failure
        return failures

    def write_failures(self, failures: list[EmbeddingFailure]) -> None:
        content = "".join(failure.model_dump_json() + "\n" for failure in failures)
        self._atomic_write(self.failures_path, content)

    def write_manifest(self, manifest: EmbeddingManifest) -> None:
        manifest.updatedAt = utc_now_iso()
        content = json.dumps(
            manifest.model_dump(), ensure_ascii=False, indent=2
        ) + "\n"
        self._atomic_write(self.manifest_path, content)
        state = {
            "embeddingModel": manifest.embeddingModel,
            "dimension": manifest.dimension,
            "formatterVersion": manifest.formatterVersion,
            "status": manifest.status,
            "alreadyCompleted": manifest.alreadyCompleted,
            "newlyEmbedded": manifest.newlyEmbedded,
            "successfulRecords": manifest.successfulRecords,
            "attemptedRecords": manifest.attemptedRecords,
            "unattemptedRecords": manifest.unattemptedRecords,
            "remainingRecords": manifest.remainingRecords,
            "unresolvedFailedRecords": manifest.unresolvedFailedRecords,
            "failedRecords": manifest.failedRecords,
            "updatedAt": manifest.updatedAt,
        }
        self._atomic_write(
            self.state_path,
            json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        )
