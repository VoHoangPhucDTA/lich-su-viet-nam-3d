"""Local-only evidence contract for the controlled TiDB Release E.

This module never connects to TiDB, TiDB Cloud, Flyway, or Docker.  It builds
and validates canonical backup/restore evidence from explicit operator inputs.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Mapping, Sequence


BACKUP_SCHEMA = "lsvn3d.release-e.backup-evidence.v1"
RESTORE_SCHEMA = "lsvn3d.release-e.restore-evidence.v1"
EXPECTED_CLUSTER_ID = "10427158774816979902"
EXPECTED_DISPLAY_NAME = "lichsuvn3d"
EXPECTED_TARGET_IDENTITY = "main"
EXPECTED_DATABASE = "lichsuvn"
EXPECTED_BACKUP_TYPE = "automatic_snapshot"
EXPECTED_BACKUP_STATE = "SUCCEEDED"
EXPECTED_RESTORE_STATE = "ACTIVE"
EXPECTED_RESTORE_REGION = "Singapore / ap-southeast-1"
EXPECTED_TIDB_SEMANTIC_VERSION = "8.5.3"
EXPECTED_TIDB_SQL_COMPAT_VERSION = "8.0.11"
EXPECTED_TIDB_SQL_SERVER_SUFFIX = "serverless"
TIDB_CLOUD_ENGINE_VERSION_REGEX = re.compile(
    r"^v(?P<version>[0-9]+\.[0-9]+\.[0-9]+)$"
)
TIDB_SQL_SERVER_VERSION_REGEX = re.compile(
    rf"^{re.escape(EXPECTED_TIDB_SQL_COMPAT_VERSION)}-TiDB-v"
    rf"(?P<version>[0-9]+\.[0-9]+\.[0-9]+)-"
    rf"{re.escape(EXPECTED_TIDB_SQL_SERVER_SUFFIX)}$"
)
TECHNICAL_BRANCH_ID_REGEX = re.compile(r"^bran-[A-Za-z0-9][A-Za-z0-9_-]{5,127}$")
SHA256_REGEX = re.compile(r"^[0-9a-f]{64}$")
RFC3339_UTC_REGEX = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$"
)
MAX_EVIDENCE_BYTES = 1024 * 1024

BACKUP_EVIDENCE_KEYS = frozenset(
    {
        "schema", "generated_at_utc", "source_cluster_id",
        "source_display_name", "target_identity", "database",
        "backup_type", "backup_time_utc", "backup_state",
        "expires_at_utc", "capture_path_basename", "capture_sha256",
        "production_identity_evidence_sha256", "backup_identity",
        "backup_id_source",
    }
)

RESTORE_EVIDENCE_KEYS = frozenset(
    {
        "schema", "generated_at_utc", "source_backup_evidence_sha256",
        "source_cluster_id", "source_database", "restore_cluster_id",
        "restore_display_name", "restore_project_id", "restore_state",
        "restore_region", "restore_engine_version", "restore_database",
        "restore_created_at_utc", "restore_capture_path_basename",
        "restore_capture_sha256", "restore_identity_evidence_sha256",
        "restore_prefix_match", "production_prefix_rejected",
        "rehearsal_prefix_rejected", "flyway_current_version",
        "flyway_validate_passed", "failed_migration_count",
        "v42_history_row_count", "check_support_enabled", "users_total",
        "historical_events_total", "event_media_total", "active_admin_count",
        "production_not_overwritten", "validated_at_utc",
    }
)

BACKUP_IDENTITY_KEYS = (
    "source_cluster_id", "database", "backup_type", "backup_time_utc",
    "expires_at_utc", "capture_sha256",
)


class EvidenceContractError(ValueError):
    """A sanitized, stable Release E evidence blocker."""

    def __init__(self, blocker: str, reason: str) -> None:
        self.blocker = blocker
        self.reason = reason
        super().__init__(f"{blocker}: {reason}")


class EngineVersionContractError(ValueError):
    """Raised when a raw engine value does not match its authenticated source."""


def parse_tidb_cloud_engine_version(value: Any) -> str:
    """Validate raw TiDB Cloud CLI/API metadata before semantic comparison."""
    if not isinstance(value, str):
        raise EngineVersionContractError("TiDB Cloud engine version must be a string")
    match = TIDB_CLOUD_ENGINE_VERSION_REGEX.fullmatch(value)
    if not match or match.group("version") != EXPECTED_TIDB_SEMANTIC_VERSION:
        raise EngineVersionContractError(
            "TiDB Cloud engine version is not canonical v8.5.3"
        )
    return match.group("version")


def parse_tidb_sql_server_version(value: Any) -> str:
    """Validate the exact SQL VERSION() TiDB Serverless structure, then semver."""
    if not isinstance(value, str):
        raise EngineVersionContractError("SQL VERSION() value must be a string")
    match = TIDB_SQL_SERVER_VERSION_REGEX.fullmatch(value)
    if not match or match.group("version") != EXPECTED_TIDB_SEMANTIC_VERSION:
        raise EngineVersionContractError(
            "SQL VERSION() is not the approved TiDB v8.5.3 Serverless form"
        )
    return match.group("version")


def _backup_error(reason: str) -> EvidenceContractError:
    return EvidenceContractError("BLOCKED_PRODUCTION_BACKUP_EVIDENCE", reason)


def _restore_error(reason: str) -> EvidenceContractError:
    return EvidenceContractError("BLOCKED_PRODUCTION_RESTORE_EVIDENCE", reason)


def canonical_json_bytes(value: Mapping[str, Any], *, trailing_newline: bool) -> bytes:
    """Serialize UTF-8 JSON with sorted keys and compact separators.

    Deterministic identity hashes omit the trailing newline.  Stored evidence
    files include exactly one LF after the canonical JSON object.
    """
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if trailing_newline:
        text += "\n"
    return text.encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path, *, error_factory=_backup_error) -> str:
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise error_factory("capture or identity file missing")
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise error_factory("capture or identity file unreadable") from exc
    return digest.hexdigest()


def _parse_utc(value: Any, field: str, error_factory) -> datetime:
    if not isinstance(value, str) or not RFC3339_UTC_REGEX.fullmatch(value):
        raise error_factory(f"{field} must be strict RFC3339 UTC")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise error_factory(f"{field} must be strict RFC3339 UTC") from exc
    return parsed.astimezone(timezone.utc)


def _now_utc(now_utc: datetime | None) -> datetime:
    value = now_utc or datetime.now(timezone.utc)
    if value.tzinfo is None:
        raise ValueError("now_utc must be timezone-aware")
    return value.astimezone(timezone.utc)


def _require_lower_sha(value: Any, field: str, error_factory) -> str:
    if not isinstance(value, str) or not SHA256_REGEX.fullmatch(value):
        raise error_factory(f"{field} must be lowercase SHA-256")
    return value


def _reject_duplicate_keys(pairs):
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _load_canonical_json(path: Path, keys: frozenset[str], error_factory) -> tuple[dict[str, Any], bytes]:
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise error_factory("file missing")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise error_factory("file unreadable") from exc
    if not raw or len(raw) > MAX_EVIDENCE_BYTES:
        raise error_factory("file empty or too large")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise error_factory("schema JSON is invalid") from exc
    if not isinstance(value, dict) or set(value) != keys:
        raise error_factory("schema mismatch")
    if raw != canonical_json_bytes(value, trailing_newline=True):
        raise error_factory("evidence JSON is not canonical")
    return value, raw


def verify_detached_sha256(
    evidence_path: Path,
    detached_path: Path,
    *,
    error_factory=_backup_error,
) -> str:
    """Verify one lowercase digest, optionally followed by two spaces + basename."""
    evidence_path = Path(evidence_path)
    detached_path = Path(detached_path)
    if not evidence_path.is_file() or evidence_path.is_symlink():
        raise error_factory("file missing")
    if not detached_path.is_file() or detached_path.is_symlink():
        raise error_factory("detached SHA file missing")
    try:
        raw = detached_path.read_bytes()
        text = raw.decode("ascii")
    except (OSError, UnicodeDecodeError) as exc:
        raise error_factory("detached SHA file malformed") from exc
    if "\r" in text or text.count("\n") > 1:
        raise error_factory("detached SHA file malformed")
    match = re.fullmatch(r"([0-9a-f]{64})(?:  ([A-Za-z0-9][A-Za-z0-9._-]*))?\n?", text)
    if not match:
        raise error_factory("detached SHA file malformed")
    if match.group(2) is not None and match.group(2) != evidence_path.name:
        raise error_factory("detached SHA filename mismatch")
    actual = sha256_file(evidence_path, error_factory=error_factory)
    if match.group(1) != actual:
        raise error_factory("detached SHA mismatch")
    return actual


def verify_restore_identity_evidence(
    evidence_path: Path, detached_path: Path
) -> str:
    """Verify the exact bytes of independently validated restore identity evidence."""
    return verify_detached_sha256(
        evidence_path, detached_path, error_factory=_restore_error
    )


def deterministic_backup_identity(value: Mapping[str, Any]) -> str:
    identity = {key: value[key] for key in BACKUP_IDENTITY_KEYS}
    return sha256_bytes(canonical_json_bytes(identity, trailing_newline=False))


def validate_backup_evidence(
    evidence_path: Path,
    detached_path: Path,
    *,
    capture_path: Path,
    production_identity_evidence_sha256: str,
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    file_sha = verify_detached_sha256(evidence_path, detached_path, error_factory=_backup_error)
    value, _ = _load_canonical_json(evidence_path, BACKUP_EVIDENCE_KEYS, _backup_error)
    expected_identity_sha = _require_lower_sha(
        production_identity_evidence_sha256,
        "production identity evidence SHA",
        _backup_error,
    )
    capture_sha = sha256_file(capture_path, error_factory=_backup_error)
    if value["schema"] != BACKUP_SCHEMA:
        raise _backup_error("schema mismatch")
    if value["source_cluster_id"] != EXPECTED_CLUSTER_ID:
        raise _backup_error("wrong source cluster")
    if value["source_display_name"] != EXPECTED_DISPLAY_NAME:
        raise _backup_error("wrong source display name")
    if value["target_identity"] != EXPECTED_TARGET_IDENTITY:
        raise _backup_error("wrong target identity")
    if value["database"] != EXPECTED_DATABASE:
        raise _backup_error("wrong database")
    if value["backup_type"] != EXPECTED_BACKUP_TYPE:
        raise _backup_error("unsupported backup type")
    if value["backup_state"] != EXPECTED_BACKUP_STATE:
        raise _backup_error("backup state is not SUCCEEDED")
    if value["backup_id_source"] != "deterministic_capture_binding":
        raise _backup_error("backup identity source mismatch")
    if value["capture_path_basename"] != Path(capture_path).name:
        raise _backup_error("capture basename mismatch")
    if _require_lower_sha(value["capture_sha256"], "capture SHA", _backup_error) != capture_sha:
        raise _backup_error("capture SHA mismatch")
    if _require_lower_sha(
        value["production_identity_evidence_sha256"],
        "production identity evidence SHA",
        _backup_error,
    ) != expected_identity_sha:
        raise _backup_error("production identity SHA mismatch")
    generated = _parse_utc(value["generated_at_utc"], "generated_at_utc", _backup_error)
    backup_time = _parse_utc(value["backup_time_utc"], "backup_time_utc", _backup_error)
    expires = _parse_utc(value["expires_at_utc"], "expires_at_utc", _backup_error)
    now = _now_utc(now_utc)
    if generated > now:
        raise _backup_error("evidence generated in the future")
    if backup_time > now:
        raise _backup_error("backup time is in the future")
    if expires <= backup_time:
        raise _backup_error("expiration is not later than backup time")
    if now >= expires:
        raise _backup_error("backup expired")
    expected_identity = deterministic_backup_identity(value)
    if _require_lower_sha(value["backup_identity"], "backup identity", _backup_error) != expected_identity:
        raise _backup_error("capture binding mismatch")
    return {"evidence": value, "evidence_sha256": file_sha}


def _require_bool(value: Any, field: str) -> bool:
    if type(value) is not bool:
        raise _restore_error(f"{field} must be boolean")
    return value


def _require_count(value: Any, field: str) -> int:
    if type(value) is not int or value < 0:
        raise _restore_error(f"{field} must be a non-negative integer")
    return value


def validate_restore_evidence(
    evidence_path: Path,
    detached_path: Path,
    *,
    capture_path: Path,
    source_backup_evidence_sha256: str,
    restore_identity_evidence_sha256: str,
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    file_sha = verify_detached_sha256(evidence_path, detached_path, error_factory=_restore_error)
    value, _ = _load_canonical_json(evidence_path, RESTORE_EVIDENCE_KEYS, _restore_error)
    expected_backup_sha = _require_lower_sha(
        source_backup_evidence_sha256, "source backup evidence SHA", _restore_error
    )
    expected_identity_sha = _require_lower_sha(
        restore_identity_evidence_sha256, "restore identity evidence SHA", _restore_error
    )
    capture_sha = sha256_file(capture_path, error_factory=_restore_error)
    if value["schema"] != RESTORE_SCHEMA:
        raise _restore_error("schema mismatch")
    if value["source_cluster_id"] != EXPECTED_CLUSTER_ID:
        raise _restore_error("wrong source cluster")
    if value["source_database"] != EXPECTED_DATABASE:
        raise _restore_error("wrong source database")
    restore_cluster = value["restore_cluster_id"]
    if not isinstance(restore_cluster, str) or not restore_cluster:
        raise _restore_error("restore cluster ID missing")
    if restore_cluster == EXPECTED_CLUSTER_ID:
        raise _restore_error("restore cluster equals production")
    if TECHNICAL_BRANCH_ID_REGEX.fullmatch(restore_cluster):
        raise _restore_error("restore target is a rehearsal branch")
    if not isinstance(value["restore_display_name"], str) or not value["restore_display_name"]:
        raise _restore_error("restore display name missing")
    if not isinstance(value["restore_project_id"], str) or not value["restore_project_id"]:
        raise _restore_error("restore project ID missing")
    if value["restore_state"] != EXPECTED_RESTORE_STATE:
        raise _restore_error("restore target is not ACTIVE")
    if value["restore_region"] != EXPECTED_RESTORE_REGION:
        raise _restore_error("wrong restore region")
    try:
        parse_tidb_cloud_engine_version(value["restore_engine_version"])
    except EngineVersionContractError as exc:
        raise _restore_error("wrong restore engine version") from exc
    if value["restore_database"] != EXPECTED_DATABASE:
        raise _restore_error("wrong restore database")
    if value["restore_capture_path_basename"] != Path(capture_path).name:
        raise _restore_error("restore capture basename mismatch")
    if _require_lower_sha(value["restore_capture_sha256"], "restore capture SHA", _restore_error) != capture_sha:
        raise _restore_error("restore capture SHA mismatch")
    if _require_lower_sha(value["source_backup_evidence_sha256"], "source backup evidence SHA", _restore_error) != expected_backup_sha:
        raise _restore_error("source backup binding mismatch")
    if _require_lower_sha(value["restore_identity_evidence_sha256"], "restore identity evidence SHA", _restore_error) != expected_identity_sha:
        raise _restore_error("restore identity binding mismatch")
    required_true = (
        "restore_prefix_match", "production_prefix_rejected",
        "rehearsal_prefix_rejected", "flyway_validate_passed",
        "check_support_enabled", "production_not_overwritten",
    )
    for field in required_true:
        if not _require_bool(value[field], field):
            raise _restore_error(f"{field} must be true")
    if value["flyway_current_version"] != "41":
        raise _restore_error("restored Flyway version is not V41")
    if _require_count(value["failed_migration_count"], "failed_migration_count") != 0:
        raise _restore_error("failed migration count is nonzero")
    if _require_count(value["v42_history_row_count"], "v42_history_row_count") != 0:
        raise _restore_error("V42 history row is present")
    for field in ("users_total", "historical_events_total", "event_media_total", "active_admin_count"):
        _require_count(value[field], field)
    generated = _parse_utc(value["generated_at_utc"], "generated_at_utc", _restore_error)
    created = _parse_utc(value["restore_created_at_utc"], "restore_created_at_utc", _restore_error)
    validated = _parse_utc(value["validated_at_utc"], "validated_at_utc", _restore_error)
    now = _now_utc(now_utc)
    if generated > now or validated > now:
        raise _restore_error("restore evidence timestamp is in the future")
    if validated < created:
        raise _restore_error("validation predates restore creation")
    if generated < validated:
        raise _restore_error("evidence generation predates validation")
    return {"evidence": value, "evidence_sha256": file_sha}


def build_backup_evidence(
    *, generated_at_utc: str, source_cluster_id: str, source_display_name: str,
    target_identity: str, database: str, backup_type: str, backup_time_utc: str,
    backup_state: str, expires_at_utc: str, capture_path: Path,
    production_identity_evidence_sha256: str,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "schema": BACKUP_SCHEMA,
        "generated_at_utc": generated_at_utc,
        "source_cluster_id": source_cluster_id,
        "source_display_name": source_display_name,
        "target_identity": target_identity,
        "database": database,
        "backup_type": backup_type,
        "backup_time_utc": backup_time_utc,
        "backup_state": backup_state,
        "expires_at_utc": expires_at_utc,
        "capture_path_basename": Path(capture_path).name,
        "capture_sha256": sha256_file(capture_path),
        "production_identity_evidence_sha256": production_identity_evidence_sha256,
        "backup_identity": "",
        "backup_id_source": "deterministic_capture_binding",
    }
    value["backup_identity"] = deterministic_backup_identity(value)
    return value


def build_restore_evidence(**values: Any) -> dict[str, Any]:
    capture_path = Path(values.pop("capture_path"))
    value = {"schema": RESTORE_SCHEMA, **values}
    value["restore_capture_path_basename"] = capture_path.name
    value["restore_capture_sha256"] = sha256_file(capture_path, error_factory=_restore_error)
    return value


def _outside_repository(path: Path, repo_root: Path) -> None:
    resolved = Path(path).resolve()
    root = Path(repo_root).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        return
    raise EvidenceContractError("BLOCKED_RELEASE_E_EVIDENCE_OUTPUT", "output must be outside repository")


def write_evidence(
    value: Mapping[str, Any], evidence_path: Path, detached_path: Path, *, repo_root: Path
) -> str:
    evidence_path = Path(evidence_path)
    detached_path = Path(detached_path)
    _outside_repository(evidence_path, repo_root)
    _outside_repository(detached_path, repo_root)
    if evidence_path.exists() or detached_path.exists():
        raise EvidenceContractError("BLOCKED_RELEASE_E_EVIDENCE_OUTPUT", "refusing to overwrite output")
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    detached_path.parent.mkdir(parents=True, exist_ok=True)
    body = canonical_json_bytes(value, trailing_newline=True)
    digest = sha256_bytes(body)
    created: list[Path] = []
    try:
        fd = os.open(str(evidence_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created.append(evidence_path)
        with os.fdopen(fd, "wb") as handle:
            handle.write(body)
        detached = f"{digest}  {evidence_path.name}\n".encode("ascii")
        fd = os.open(str(detached_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created.append(detached_path)
        with os.fdopen(fd, "wb") as handle:
            handle.write(detached)
    except OSError:
        for path in reversed(created):
            try:
                path.unlink()
            except OSError:
                pass
        raise
    return digest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local Release E evidence utility")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    sub = parser.add_subparsers(dest="command", required=True)
    validate_backup = sub.add_parser("validate-backup")
    validate_backup.add_argument("--evidence", type=Path, required=True)
    validate_backup.add_argument("--detached-sha", type=Path, required=True)
    validate_backup.add_argument("--capture", type=Path, required=True)
    validate_backup.add_argument("--production-identity-sha256", required=True)
    validate_restore = sub.add_parser("validate-restore")
    validate_restore.add_argument("--evidence", type=Path, required=True)
    validate_restore.add_argument("--detached-sha", type=Path, required=True)
    validate_restore.add_argument("--capture", type=Path, required=True)
    validate_restore.add_argument("--source-backup-sha256", required=True)
    validate_restore.add_argument("--restore-identity-sha256", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "validate-backup":
            result = validate_backup_evidence(
                args.evidence, args.detached_sha, capture_path=args.capture,
                production_identity_evidence_sha256=args.production_identity_sha256,
            )
        else:
            result = validate_restore_evidence(
                args.evidence, args.detached_sha, capture_path=args.capture,
                source_backup_evidence_sha256=args.source_backup_sha256,
                restore_identity_evidence_sha256=args.restore_identity_sha256,
            )
        print(json.dumps({"valid": True, "evidence_sha256": result["evidence_sha256"]}, sort_keys=True))
        return 0
    except EvidenceContractError as exc:
        print(str(exc), file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
