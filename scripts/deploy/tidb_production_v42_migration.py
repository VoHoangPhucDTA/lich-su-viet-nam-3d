"""Fail-closed Flyway V41 -> V42 runner for the production TiDB base instance.

This runner is dedicated to the production cluster:

  * base cluster id:        10427158774816979902
  * instance display name:  lichsuvn3d
  * target identity:        main
  * database:               lichsuvn
  * engine:                 TiDB Serverless v8.5.3

It is intentionally NOT committed by the historical V37 -> V41 runner
``scripts/deploy/tidb_production_migration.py`` (which remains untouched)
and NOT reused by the branch-rehearsal tooling
``scripts/deploy/tidb_rehearsal_v42_*.py``.

The runner never offers repair / baseline / clean, never executes an
importer, never imports Flyway history, never edits SQL, and never
writes to any environment other than the verified production base.
Credentials reach Docker through stdin only; the shared gateway
hostname is permitted but is never the sole proof of identity.
"""

from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

# Reuse only stable primitives from the historical V37 -> V41 production
# runner.  Anything structural to the V41 -> V42 transition is re-defined
# and kept behind narrow compatibility tests.
if __package__:
    from . import tidb_production_migration as base  # type: ignore[attr-defined]  # noqa: E402
    from . import tidb_release_e_v42_evidence as release_e_evidence  # noqa: E402
else:
    import tidb_production_migration as base  # noqa: E402
    import tidb_release_e_v42_evidence as release_e_evidence  # noqa: E402


# ============================================================================
# V42 production constants (immutable, fail-closed)
# ============================================================================

TARGET_VERSION = "42"
EXPECTED_CURRENT_VERSION = "41"
EXPECTED_PENDING_VERSIONS = ("42",)
EXPECTED_DATABASE = "lichsuvn"
EXPECTED_PRODUCTION_CLUSTER_ID = "10427158774816979902"
EXPECTED_DISPLAY_NAME = "lichsuvn3d"
EXPECTED_TARGET_IDENTITY = "main"
EXPECTED_FLYWAY_VERSION = "11.14.1"
EXPECTED_TIDB_SEMANTIC_VERSION = release_e_evidence.EXPECTED_TIDB_SEMANTIC_VERSION

USER_PREFIX_REGEX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$")
TIDB_SERVERLESS_HOST_REGEX = re.compile(
    r"^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.tidbcloud\.com$"
)

# Reject any child branch -- the parent cluster ID is shared with the
# rehearsal branch which lives at bran-3uewl2rhirehfg67jczif3bet4.
TECHNICAL_BRANCH_ID_REGEX = re.compile(r"^bran-[A-Za-z0-9][A-Za-z0-9_-]{5,127}$")

# Reject the rehearsal fixture userPrefix.  This is the only prefix
# baked into the rehearsal tooling (''scripts/deploy/tidb_rehearsal_v42_orchestrate.py'');
# using the same prefix on the production base would defeat both
# isolation guarantees simultaneously.
REHEARSAL_FIXTURE_PREFIX = "3c7ghU483VQ9Ynn"

MANIFEST_NAME = "tidb-production-v42.sha256"
APPROVED_FLYWAY_IMAGE_DIGEST = (
    "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d"
)
APPROVED_MYSQL_IMAGE_DIGEST = (
    "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964"
)

# Approved expected SHA-256 of V42__add_managed_event_image_storage.sql as
# it currently sits on disk.  Runtime manifest verification enforces this
# invariant instead of an import-time byte-pin (which would break on any
# whitespace-only edit of the manifest file).
EXPECTED_V42_SQL_SHA = (
    "e24949201f5d291e57b04472b3cda1d65811b26ea6a899a550f38ab70ff15a43"
)
EXPECTED_V42_SQL_FILE = "V42__add_managed_event_image_storage.sql"

APPROVED_V42_MIGRATION_RELEASE_COMMIT = (
    "f74b7b5e51e0a5f399bac96accacaf6ebfac071e"
)
POSTFLIGHT_LINEAGE_ALLOWED_PATHS = frozenset(
    {
        "docs/admin/TIDB_PRODUCTION_V42_RUNBOOK.md",
        "scripts/deploy/test_tidb_production_v42_migration.py",
        "scripts/deploy/tidb_production_v42_migration.py",
        "scripts/deploy/tidb_rehearsal_v42_orchestrate.py",
    }
)
POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS = (
    "TARGET_VERSION",
    "EXPECTED_CURRENT_VERSION",
    "EXPECTED_PENDING_VERSIONS",
    "EXPECTED_DATABASE",
    "EXPECTED_PRODUCTION_CLUSTER_ID",
    "EXPECTED_DISPLAY_NAME",
    "EXPECTED_TARGET_IDENTITY",
    "EXPECTED_FLYWAY_VERSION",
    "APPROVED_FLYWAY_IMAGE_DIGEST",
    "APPROVED_MYSQL_IMAGE_DIGEST",
    "EXPECTED_V42_SQL_SHA",
    "EXPECTED_V42_SQL_FILE",
)
POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS = (
    "_env",
    "_credentials",
    "validate_target",
    "_target_from_environment_and_evidence",
    "run_flyway_v42",
    "validate_flyway_migrate_for_v42",
    "run_flyway_migrate_after_evidence_gate",
    "run_preflight",
    "run_migrate",
)
POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS = frozenset(
    {
        "constant:APPROVED_V42_MIGRATION_RELEASE_COMMIT",
        "constant:MANAGED_STORAGE_COLUMNS",
        "constant:MANAGED_STORAGE_COLUMN_CONTRACT",
        "constant:MANAGED_STORAGE_COLUMN_SQL",
        "constant:POSTFLIGHT_LINEAGE_ALLOWED_PATHS",
        "constant:POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS",
        "constant:POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS",
        "constant:POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS",
        "function:_git_bytes",
        "function:_git_result",
        "function:_load_exact_json_artifact",
        "function:_parse_failure_timestamp",
        "function:_parser",
        "function:_python_protected_contract",
        "function:_python_runner_symbol_contract",
        "function:_require_exact_lower_commit",
        "function:_validate_postflight_changed_paths",
        "function:_validated_managed_storage_column_contract",
        "function:build_standalone_postflight_evidence_payload",
        "function:load_and_validate_v42_failure_inspection",
        "function:main",
        "function:metadata_sql_v42_postflight_extras",
        "function:run_postflight",
        "function:validate_postflight_release_lineage",
        "function:validate_release_e_postflight_evidence",
    }
)


# V42 schema footprint in the exact source order from
# V42__add_managed_event_image_storage.sql.  Keep the ordered contract so a
# duplicate cannot be silently hidden by the set used for result comparison.
def _validated_managed_storage_column_contract(
    columns: Sequence[str],
) -> tuple[str, ...]:
    values = tuple(columns)
    if len(values) != 18:
        raise ValueError("V42 managed-storage column contract must contain exactly 18 names")
    if len(set(values)) != len(values):
        raise ValueError("V42 managed-storage column contract contains a duplicate name")
    if any(not re.fullmatch(r"[a-z][a-z0-9_]*", value) for value in values):
        raise ValueError("V42 managed-storage column contract contains an invalid name")
    return values


MANAGED_STORAGE_COLUMN_CONTRACT = _validated_managed_storage_column_contract(
    (
        "managed_asset_id", "storage_provider", "storage_public_id",
        "storage_asset_id", "storage_original_url", "storage_version",
        "storage_mime_type", "storage_format", "storage_byte_size",
        "storage_sha256", "storage_width", "storage_height",
        "uploaded_by", "uploaded_at", "storage_state",
        "upload_token", "upload_started_at", "upload_expires_at",
    )
)
MANAGED_STORAGE_COLUMNS = frozenset(MANAGED_STORAGE_COLUMN_CONTRACT)
MANAGED_STORAGE_COLUMN_SQL = ",".join(
    f"'{column}'" for column in MANAGED_STORAGE_COLUMN_CONTRACT
)
V42_EVENT_MEDIA_INDEXES = frozenset(
    {
        "uk_event_media_managed_asset",
        "uk_event_media_storage_identity",
        "idx_event_media_managed_read",
        "idx_event_media_upload_expiry",
    }
)
V42_EVENT_MEDIA_FK = "fk_event_media_uploaded_by"
V42_CLEANUP_TABLE = "event_media_storage_cleanup_tasks"
V42_CLEANUP_CONSTRAINTS = frozenset(
    {
        "chk_event_media_cleanup_operation",
        "chk_event_media_cleanup_status",
        "chk_event_media_cleanup_attempts",
    }
)
ALL_V42_CHECK_CONSTRAINTS = frozenset(
    {
        "chk_event_media_storage_state",
        "chk_event_media_storage_byte_size",
        "chk_event_media_storage_dimensions",
        "chk_event_media_cleanup_operation",
        "chk_event_media_cleanup_status",
        "chk_event_media_cleanup_attempts",
    }
)

IDENTITY_EVIDENCE_KEYS = frozenset(
    {
        "source", "state", "cluster_id", "display_name",
        "target_identity", "host", "database",
        "user_prefix", "engine_version", "collected_at",
    }
)
APPROVED_IDENTITY_SOURCES = frozenset(
    {"ticloud", "tidb-cloud-console", "tidb-cloud-api"}
)
APPROVED_IDENTITY_STATES = frozenset({"AVAILABLE", "ACTIVE", "RUNNING"})

# Release checkout must include the new runner + its manifest.
RELEASE_CHECK_PATHS = (
    "backend/src/main/resources/db/migration",
    "scripts/deploy/tidb_production_migration.py",
    "scripts/deploy/tidb_production_v42_migration.py",
    "scripts/deploy/tidb-production-v42.sha256",
    "scripts/deploy/run-tidb-production-migration.ps1",
    "scripts/deploy/run-tidb-production-migration.cmd",
)

# Bounded counts required by preflight and postflight (the contract
# required by the production V42 plan).
V42_BOUNDED_COUNTS = (
    "users_total",
    "historical_events_total",
    "event_media_total",
    "active_admin_count",
)

V42_PREFLIGHT_METADATA_KEYS = frozenset(
    {
        "server_version",
        "version_comment",
        "database",
        "global_time_zone",
        "session_time_zone",
        "character_set_database",
        "collation_database",
        "sql_mode",
        "active_admin_count",
        "failed_migration_count",
        "users_total",
        "events_total",
        "user_roles_total",
        "roles_total",
        "role_code_counts",
        "role_assignment_counts",
        "admin_role_assignment_count",
        "event_status_counts",
        "user_status_counts",
        "historical_events_total",
        "event_media_total",
        "session_user",
        "session_user_prefix_verified",
        "v42_managed_columns",
        "v42_media_indexes",
        "v42_fk_event_media_uploaded_by",
        "v42_cleanup_table",
        "v42_cleanup_constraints",
        "v42_check_constraints",
        "v42_tidb_check_constraints",
        "tidb_enable_check_constraint",
        "v42_success_rows",
        "v42_history_checksum",
        "v42_history_present",
    }
)

V42_PREFLIGHT_ABSENT_SCHEMA_VALUES = {
    "v42_managed_columns": "",
    "v42_media_indexes": "",
    "v42_fk_event_media_uploaded_by": "0",
    "v42_cleanup_table": "0",
    "v42_cleanup_constraints": "",
    "v42_check_constraints": "",
    "v42_tidb_check_constraints": "",
    "v42_success_rows": "0",
    "v42_history_checksum": "",
    "v42_history_present": "0",
}


# ============================================================================
# Errors
# ============================================================================


class ProductionRunnerError(base.MigrationGuardError):
    """Raised whenever the production V42 contract cannot be proven."""


# ============================================================================
# Helpers
# ============================================================================


def _to_set(value: str) -> set[str]:
    return {item for item in (value or "").split(",") if item}


def _migration_paths_v42(repo_root: Path) -> tuple[Path, Path]:
    """Return ``(migration_dir, v42_manifest_path)`` independent of base.

    The historical V37 -> V41 runner binds ``base._migration_paths`` to
    ``tidb-production-v41.sha256``; the V42 runner ignores that and uses
    ``tidb-production-v42.sha256``.  All V42-side manifest verification
    MUST go through this helper so the V41 bound cannot silently pollute
    the V42 transition.
    """
    return (
        repo_root / "backend" / "src" / "main" / "resources" / "db" / "migration",
        repo_root / "scripts" / "deploy" / MANIFEST_NAME,
    )


def _parse_manifest_entries(manifest: Path) -> list[tuple[str, str]]:
    """Parse ``hash  filename`` lines from the production V42 manifest.

    Skips empty lines and ``#``-prefixed comments; rejects any line whose
    shape is not exactly ``sha256 filename`` (no ``*`` wildcard, no
    directory portion), so a future edit cannot smuggle in extra fields
    that would change the manifest's effective set.
    """
    try:
        text = manifest.read_text(encoding="utf-8")
    except OSError as exc:
        raise ProductionRunnerError(
            f"production manifest {manifest.name} cannot be read"
        ) from exc
    entries: list[tuple[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 2)
        if len(parts) != 2:
            raise ProductionRunnerError(
                f"production manifest line is malformed: {raw!r}"
            )
        digest, filename = parts[0].lower(), parts[1].strip()
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ProductionRunnerError(
                f"production manifest entry sha256 is malformed: {digest!r}"
            )
        if not filename.endswith(".sql") or "/" in filename or "\\" in filename:
            raise ProductionRunnerError(
                f"production manifest entry filename must end with .sql "
                f"and have no directory portion: {filename!r}"
            )
        entries.append((digest, filename))
    return entries


def _file_sha256(path: Path) -> str:
    # Hash SQL independently of checkout newline conversion (CRLF -> LF),
    # matching the established V37->V41 base contract
    # (``base._canonical_sql_bytes``) and the V42 rehearsal runner.  The
    # committed manifests record LF (Git blob) hashes, so hashing raw
    # Windows working-tree bytes would drift for every CRLF checkout.
    return hashlib.sha256(base._canonical_sql_bytes(path)).hexdigest()


def _host(value: Any) -> str:
    value = str(value).strip().lower()
    if not TIDB_SERVERLESS_HOST_REGEX.fullmatch(value):
        raise ProductionRunnerError("host is not a TiDB Cloud gateway endpoint")
    return value


def _user_prefix(value: Any) -> str:
    value = str(value).strip()
    if not USER_PREFIX_REGEX.fullmatch(value):
        raise ProductionRunnerError(f"user prefix is malformed: {value!r}")
    return value


def _env(name: str, *, secret: bool = False) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        raise ProductionRunnerError(f"required environment variable {name} is missing")
    return base._require_secret(value, name) if secret else value.strip()


def _credentials(prefix: str) -> tuple[str, str]:
    return _env(f"{prefix}_USER", secret=True), _env(f"{prefix}_PASSWORD", secret=True)


def _require_exact_lower_commit(value: Any, field: str) -> str:
    """Require an explicit, unabbreviated lowercase Git object name."""
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ProductionRunnerError(
            f"{field} must be an exact lowercase 40-hex Git commit"
        )
    return value


def _git_result(repo_root: Path, arguments: Sequence[str]) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            ["git", "-C", str(repo_root), *arguments],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            env=base._sanitized_child_environment(),
        )
    except OSError as exc:
        raise ProductionRunnerError("cannot inspect postflight release lineage") from exc


def _git_bytes(repo_root: Path, arguments: Sequence[str], label: str) -> bytes:
    result = _git_result(repo_root, arguments)
    if result.returncode != 0:
        raise ProductionRunnerError(f"cannot verify {label}")
    return result.stdout


def _python_protected_contract(source: bytes) -> dict[str, str]:
    try:
        tree = ast.parse(source.decode("utf-8"))
    except (UnicodeDecodeError, SyntaxError) as exc:
        raise ProductionRunnerError("production V42 runner cannot be parsed") from exc
    contract: dict[str, str] = {}
    wanted_constants = set(POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS)
    wanted_functions = set(POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in wanted_functions:
            contract[f"function:{node.name}"] = ast.dump(node, include_attributes=False)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in wanted_constants:
                    contract[f"constant:{target.id}"] = ast.dump(
                        node.value, include_attributes=False
                    )
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id in wanted_constants and node.value is not None:
                contract[f"constant:{node.target.id}"] = ast.dump(
                    node.value, include_attributes=False
                )
    expected = {
        *(f"constant:{name}" for name in POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS),
        *(f"function:{name}" for name in POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS),
    }
    missing = sorted(expected - set(contract))
    if missing:
        raise ProductionRunnerError(
            "production V42 runner is missing protected lineage contracts: "
            + ", ".join(missing)
        )
    return contract


def _python_runner_symbol_contract(source: bytes) -> dict[str, str]:
    """Snapshot every top-level function and uppercase contract assignment."""
    try:
        tree = ast.parse(source.decode("utf-8"))
    except (UnicodeDecodeError, SyntaxError) as exc:
        raise ProductionRunnerError("production V42 runner cannot be parsed") from exc
    contract: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            contract[f"function:{node.name}"] = ast.dump(node, include_attributes=False)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.isupper():
                    contract[f"constant:{target.id}"] = ast.dump(
                        node.value, include_attributes=False
                    )
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id.isupper() and node.value is not None:
                contract[f"constant:{node.target.id}"] = ast.dump(
                    node.value, include_attributes=False
                )
    return contract


def _validate_postflight_changed_paths(changed_paths: Sequence[str]) -> None:
    unexpected = sorted(set(changed_paths) - POSTFLIGHT_LINEAGE_ALLOWED_PATHS)
    if unexpected:
        raise ProductionRunnerError(
            "postflight lineage contains a non-allowlisted path: " + ", ".join(unexpected)
        )


def validate_postflight_release_lineage(
    repo_root: Path,
    *,
    checkout_commit: str,
    migration_release_commit: str,
) -> dict[str, Any]:
    """Prove that only reviewed checker-safe paths changed after migration."""
    checkout_commit = _require_exact_lower_commit(checkout_commit, "checkout commit")
    migration_release_commit = _require_exact_lower_commit(
        migration_release_commit, "migration release commit"
    )
    if migration_release_commit != APPROVED_V42_MIGRATION_RELEASE_COMMIT:
        raise ProductionRunnerError("migration release commit is not the approved V42 execution")

    ancestor = _git_result(
        repo_root,
        ["merge-base", "--is-ancestor", migration_release_commit, checkout_commit],
    )
    if ancestor.returncode == 1:
        raise ProductionRunnerError("migration release commit is not an ancestor of checkout")
    if ancestor.returncode != 0:
        raise ProductionRunnerError("cannot verify migration release ancestry")

    changed_raw = _git_bytes(
        repo_root,
        [
            "diff", "--name-only", "--diff-filter=ACDMRTUXB",
            f"{migration_release_commit}..{checkout_commit}",
        ],
        "postflight changed-path allowlist",
    )
    try:
        changed_paths = tuple(
            line for line in changed_raw.decode("utf-8").splitlines() if line
        )
    except UnicodeDecodeError as exc:
        raise ProductionRunnerError("postflight changed paths are not UTF-8") from exc
    _validate_postflight_changed_paths(changed_paths)

    immutable_paths = (
        "backend/src/main/resources/db/migration/",
        f"scripts/deploy/{MANIFEST_NAME}",
    )
    immutable = _git_result(
        repo_root,
        ["diff", "--quiet", migration_release_commit, checkout_commit, "--", *immutable_paths],
    )
    if immutable.returncode == 1:
        raise ProductionRunnerError("migration SQL or V42 manifest changed after migration")
    if immutable.returncode != 0:
        raise ProductionRunnerError("cannot verify migration SQL and manifest immutability")

    runner_path = "scripts/deploy/tidb_production_v42_migration.py"
    migration_runner = _git_bytes(
        repo_root, ["show", f"{migration_release_commit}:{runner_path}"],
        "migration-release runner contract",
    )
    protected_contract = _python_protected_contract(migration_runner)
    migration_symbols = _python_runner_symbol_contract(migration_runner)
    lineage_raw = _git_bytes(
        repo_root,
        ["rev-list", "--parents", "--reverse", f"{migration_release_commit}..{checkout_commit}"],
        "postflight commit lineage",
    )
    try:
        lineage_rows = [line.split() for line in lineage_raw.decode("ascii").splitlines()]
    except UnicodeDecodeError as exc:
        raise ProductionRunnerError("postflight commit lineage is malformed") from exc
    for row in lineage_rows:
        if len(row) != 2 or not all(re.fullmatch(r"[0-9a-f]{40}", item) for item in row):
            raise ProductionRunnerError("postflight lineage must be linear and full-SHA bound")
        commit = row[0]
        commit_paths_raw = _git_bytes(
            repo_root,
            ["diff-tree", "--no-commit-id", "--name-only", "-r", commit],
            f"changed paths for postflight commit {commit}",
        )
        try:
            commit_paths = tuple(
                path for path in commit_paths_raw.decode("utf-8").splitlines() if path
            )
        except UnicodeDecodeError as exc:
            raise ProductionRunnerError("postflight commit paths are not UTF-8") from exc
        _validate_postflight_changed_paths(commit_paths)
        if runner_path in commit_paths:
            commit_runner = _git_bytes(
                repo_root, ["show", f"{commit}:{runner_path}"],
                f"protected runner contract at {commit}",
            )
            if _python_protected_contract(commit_runner) != protected_contract:
                raise ProductionRunnerError(
                    "credential, target, confirmation, or migration execution semantics changed"
                )
            commit_symbols = _python_runner_symbol_contract(commit_runner)
            changed_symbols = {
                key
                for key in set(migration_symbols) | set(commit_symbols)
                if migration_symbols.get(key) != commit_symbols.get(key)
            }
            unexpected_symbols = sorted(
                changed_symbols - POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS
            )
            if unexpected_symbols:
                raise ProductionRunnerError(
                    "production runner contains a non-allowlisted postflight change: "
                    + ", ".join(unexpected_symbols)
                )
    return {
        "migration_release_commit": migration_release_commit,
        "checkout_commit": checkout_commit,
        "changed_paths": list(changed_paths),
    }


def validate_release_e_evidence(
    *, production_identity_evidence_sha256: str,
) -> dict[str, Any]:
    """Validate the local backup/restore chain before any Flyway command.

    Every environment value names an existing local file.  There is no
    acknowledgement-string fallback.  The validator is deliberately called
    again immediately before ``migrate`` so expiration or byte changes after
    preflight fail closed.
    """
    backup = release_e_evidence.validate_backup_evidence(
        Path(_env("TIDB_PRODUCTION_BACKUP_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_BACKUP_EVIDENCE_SHA256")),
        capture_path=Path(_env("TIDB_PRODUCTION_BACKUP_CAPTURE")),
        production_identity_evidence_sha256=production_identity_evidence_sha256.lower(),
    )
    restore_identity_sha = release_e_evidence.verify_restore_identity_evidence(
        Path(_env("TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE_SHA256")),
    )
    restore = release_e_evidence.validate_restore_evidence(
        Path(_env("TIDB_PRODUCTION_RESTORE_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_RESTORE_EVIDENCE_SHA256")),
        capture_path=Path(_env("TIDB_PRODUCTION_RESTORE_CAPTURE")),
        source_backup_evidence_sha256=backup["evidence_sha256"],
        restore_identity_evidence_sha256=restore_identity_sha,
    )
    return {"backup": backup, "restore": restore}


def validate_release_e_postflight_evidence(
    *,
    production_identity_evidence_sha256: str,
    migration_installed_at_utc: datetime,
) -> dict[str, Any]:
    """Validate immutable backup/restore evidence at the completed write time.

    This exception is read-only and postflight-only.  The ordinary validator
    continues to use the current clock for preflight and migrate.
    """
    if migration_installed_at_utc.tzinfo is None:
        raise ProductionRunnerError("migration installed time must be timezone-aware")
    migration_time = migration_installed_at_utc.astimezone(timezone.utc)
    backup = release_e_evidence.validate_backup_evidence(
        Path(_env("TIDB_PRODUCTION_BACKUP_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_BACKUP_EVIDENCE_SHA256")),
        capture_path=Path(_env("TIDB_PRODUCTION_BACKUP_CAPTURE")),
        production_identity_evidence_sha256=production_identity_evidence_sha256.lower(),
        now_utc=migration_time,
    )
    restore_identity_sha = release_e_evidence.verify_restore_identity_evidence(
        Path(_env("TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE_SHA256")),
    )
    restore = release_e_evidence.validate_restore_evidence(
        Path(_env("TIDB_PRODUCTION_RESTORE_EVIDENCE")),
        Path(_env("TIDB_PRODUCTION_RESTORE_EVIDENCE_SHA256")),
        capture_path=Path(_env("TIDB_PRODUCTION_RESTORE_CAPTURE")),
        source_backup_evidence_sha256=backup["evidence_sha256"],
        restore_identity_evidence_sha256=restore_identity_sha,
        now_utc=migration_time,
    )
    return {"backup": backup, "restore": restore}


def validate_operational_approval_gates(
    *, two_active_admins: bool, backends_drained: bool,
    single_migration_owner: bool, maintenance_window: bool,
    rollback_owner: bool, runtime_security_verified: bool,
    execute_migrate: bool,
) -> None:
    """Validate non-evidence gates without accepting evidence acknowledgements."""
    gates = {
        "two active Admins": two_active_admins,
        "backends drained": backends_drained,
        "single migration owner": single_migration_owner,
        "maintenance window": maintenance_window,
        "rollback owner": rollback_owner,
        "runtime security verified": runtime_security_verified,
        "execute migrate": execute_migrate,
    }
    missing = [name for name, accepted in gates.items() if not accepted]
    if missing:
        raise ProductionRunnerError(
            "required approval gates are missing: " + ", ".join(missing)
        )


# ============================================================================
# Identity evidence (production-only, child-branch-free)
# ============================================================================


def load_identity_evidence(path: Path, detached_sha256: str) -> dict[str, str]:
    """Load operator-supplied TiDB Cloud production metadata."""
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise ProductionRunnerError("approved production identity evidence is missing")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", detached_sha256 or ""):
        raise ProductionRunnerError("identity evidence detached SHA-256 is invalid")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ProductionRunnerError("identity evidence cannot be read") from exc
    if len(raw) > 64 * 1024:
        raise ProductionRunnerError("identity evidence is too large")
    if hashlib.sha256(raw).hexdigest().lower() != detached_sha256.lower():
        raise ProductionRunnerError(
            "identity evidence detached SHA-256 does not match the file"
        )

    def reject_duplicate_keys(pairs):
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ProductionRunnerError("identity evidence has duplicate keys")
            result[key] = value
        return result

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionRunnerError("identity evidence is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping) or set(value) != IDENTITY_EVIDENCE_KEYS:
        raise ProductionRunnerError("identity evidence has an invalid shape")
    if any(not isinstance(value[key], str) or not value[key] for key in IDENTITY_EVIDENCE_KEYS):
        raise ProductionRunnerError("identity evidence has an empty or non-string field")
    if value["source"].lower() not in APPROVED_IDENTITY_SOURCES:
        raise ProductionRunnerError(
            "identity evidence source is not an approved TiDB Cloud metadata source"
        )
    if value["state"].upper() not in APPROVED_IDENTITY_STATES:
        raise ProductionRunnerError(
            "identity evidence state is not AVAILABLE / ACTIVE / RUNNING"
        )
    if value["cluster_id"] != EXPECTED_PRODUCTION_CLUSTER_ID:
        raise ProductionRunnerError(
            "identity evidence cluster_id is not the approved production base"
        )
    if value["display_name"] != EXPECTED_DISPLAY_NAME:
        raise ProductionRunnerError(
            f"identity evidence display_name must be exactly {EXPECTED_DISPLAY_NAME}"
        )
    if value["target_identity"] != EXPECTED_TARGET_IDENTITY:
        raise ProductionRunnerError(
            f"identity evidence target_identity must be exactly {EXPECTED_TARGET_IDENTITY}"
        )
    if value["database"] != EXPECTED_DATABASE:
        raise ProductionRunnerError(
            f"identity evidence database must be exactly {EXPECTED_DATABASE}"
        )
    value["user_prefix"] = _user_prefix(value["user_prefix"])
    value["host"] = _host(value["host"])
    try:
        release_e_evidence.parse_tidb_cloud_engine_version(value["engine_version"])
    except release_e_evidence.EngineVersionContractError as exc:
        raise ProductionRunnerError(
            "identity evidence engine_version is not canonical TiDB Cloud v8.5.3"
        ) from exc
    return {key: str(value[key]) for key in IDENTITY_EVIDENCE_KEYS}


def validate_user_prefix_binding(*, identity: Mapping[str, str], session_user: str) -> None:
    """Require CURRENT_USER() to be bound to production prefix, reject rehearsal prefix."""
    if not isinstance(session_user, str) or not session_user:
        raise ProductionRunnerError("CURRENT_USER() is missing from preflight metadata")
    account = session_user.split("@", 1)[0]
    if not re.fullmatch(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", account):
        raise ProductionRunnerError(
            f"CURRENT_USER() account part is malformed: {account!r}"
        )
    prod_prefix = identity["user_prefix"].casefold()
    forbidden_prefix = REHEARSAL_FIXTURE_PREFIX.casefold()
    bound_ok = (
        account.casefold().startswith(prod_prefix + ".")
        or account.casefold().startswith(prod_prefix + "_")
    )
    forbidden_hit = (
        account.casefold().startswith(forbidden_prefix + ".")
        or account.casefold().startswith(forbidden_prefix + "_")
    )
    if forbidden_hit:
        raise ProductionRunnerError(
            f"CURRENT_USER()={account!r} appears bound to the rehearsal fixture prefix "
            f"{REHEARSAL_FIXTURE_PREFIX!r}; refusing to use it for production"
        )
    if not bound_ok:
        raise ProductionRunnerError(
            f"CURRENT_USER()={account!r} is not bound to production userPrefix {prod_prefix!r}"
        )


# ============================================================================
# Production target identity contract (overrides V37 -> V41 validator)
# ============================================================================


def validate_target(
    *,
    host: str,
    port: int,
    database: str,
    display_name: str,
    cluster_id: str,
    target_identity: str,
    user_prefix: str,
    confirmation: str,
) -> dict[str, Any]:
    host_clean = _host(host)
    parsed_port = base._parse_port(port)
    if parsed_port != 4000:
        raise ProductionRunnerError("production TiDB port must be 4000")
    if database.strip() != EXPECTED_DATABASE:
        raise ProductionRunnerError(f"database must be exactly {EXPECTED_DATABASE}")
    if cluster_id.strip() != EXPECTED_PRODUCTION_CLUSTER_ID:
        raise ProductionRunnerError(
            f"cluster_id must be exactly the approved production base "
            f"{EXPECTED_PRODUCTION_CLUSTER_ID}"
        )
    if display_name.strip() != EXPECTED_DISPLAY_NAME:
        raise ProductionRunnerError(
            f"display_name must be exactly {EXPECTED_DISPLAY_NAME}"
        )
    if target_identity.strip() != EXPECTED_TARGET_IDENTITY:
        raise ProductionRunnerError(
            "the production V42 runner accepts only the exact target identity 'main'"
        )
    if (
        TECHNICAL_BRANCH_ID_REGEX.fullmatch(cluster_id)
        or TECHNICAL_BRANCH_ID_REGEX.fullmatch(display_name)
        or TECHNICAL_BRANCH_ID_REGEX.fullmatch(target_identity)
    ):
        raise ProductionRunnerError(
            "production runner rejects technical bran-* identifiers"
        )
    user_prefix_clean = _user_prefix(user_prefix)
    if user_prefix_clean.casefold() == REHEARSAL_FIXTURE_PREFIX.casefold():
        raise ProductionRunnerError(
            "production userPrefix collides with the rehearsal fixture prefix; refusing"
        )
    if user_prefix_clean.startswith(REHEARSAL_FIXTURE_PREFIX):
        raise ProductionRunnerError(
            "production userPrefix must not have rehearsal fixture prefix as a prefix"
        )
    confirmation_clean = confirmation.strip()
    expected = (
        f"{EXPECTED_TARGET_IDENTITY}@{host_clean}/{EXPECTED_DATABASE}:"
        f"{EXPECTED_CURRENT_VERSION}->{TARGET_VERSION}"
    )
    if confirmation_clean != expected:
        raise ProductionRunnerError(
            f"typed target confirmation does not match {expected!r}"
        )
    if re.search(r"\b37\s*->\s*41\b", confirmation_clean):
        raise ProductionRunnerError(
            "V37 -> V41 confirmations are not accepted by this runner"
        )
    return {
        "host": host_clean,
        "port": parsed_port,
        "database": EXPECTED_DATABASE,
        "cluster_id": EXPECTED_PRODUCTION_CLUSTER_ID,
        "display_name": EXPECTED_DISPLAY_NAME,
        "target_identity": EXPECTED_TARGET_IDENTITY,
        "user_prefix": user_prefix_clean,
        "confirmation": expected,
    }


def _target_from_environment_and_evidence(
    *, identity: Mapping[str, str], confirmation: str
) -> dict[str, Any]:
    return validate_target(
        host=_env("TIDB_PRODUCTION_HOST"),
        port=int(os.environ.get("TIDB_PRODUCTION_PORT", "4000")),
        database=_env("TIDB_PRODUCTION_DATABASE"),
        display_name=identity["display_name"],
        cluster_id=identity["cluster_id"],
        target_identity=identity["target_identity"],
        user_prefix=identity["user_prefix"],
        confirmation=confirmation,
    )


def validate_identity_to_target(
    *, identity: Mapping[str, str], target: Mapping[str, Any]
) -> None:
    for key in ("host", "database", "cluster_id", "display_name",
                "target_identity", "user_prefix"):
        if str(identity[key]) != str(target[key]):
            raise ProductionRunnerError(
                f"identity evidence does not match target {key} binding"
            )


# ============================================================================
# Source-specific engine version contracts
# ============================================================================


def validate_sql_server_version(value: Any) -> str:
    """Validate the complete raw SQL VERSION() form for TiDB v8.5.3."""
    try:
        return release_e_evidence.parse_tidb_sql_server_version(value)
    except release_e_evidence.EngineVersionContractError as exc:
        raise ProductionRunnerError(
            "server_version is not the approved TiDB v8.5.3 SQL VERSION() form"
        ) from exc


def validate_database_metadata_v42(metadata: Mapping[str, str]) -> None:
    """Apply the strict V42 SQL engine contract before shared metadata checks."""
    validate_sql_server_version(metadata.get("server_version", ""))
    base.validate_database_metadata(metadata)


# ============================================================================
# Flyway state validators (V41 -> V42 transition)
# ============================================================================


def validate_flyway_info_for_v42(info: Mapping[str, Any]) -> dict[str, Any]:
    return base.validate_flyway_info(
        info,
        expected_current=EXPECTED_CURRENT_VERSION,
        expected_pending=EXPECTED_PENDING_VERSIONS,
        expected_database=EXPECTED_DATABASE,
        expected_flyway_version=EXPECTED_FLYWAY_VERSION,
    )


def run_flyway_v42(
    *,
    migration_dir: Path,
    operation: str,
    config: str,
    image_ref: str,
    secrets: Sequence[str],
    executor: Callable[[Sequence[str], str], base.CommandResult],
) -> Mapping[str, Any]:
    """Run one allowlisted Flyway operation with the explicit V42 CLI target."""
    return base.run_flyway(
        migration_dir=migration_dir,
        operation=operation,
        config=config,
        image_ref=image_ref,
        target_version=TARGET_VERSION,
        secrets=secrets,
        executor=executor,
    )


def validate_flyway_migrate_for_v42(result: Mapping[str, Any]) -> None:
    if str(result.get("initialSchemaVersion") or "") != EXPECTED_CURRENT_VERSION:
        raise ProductionRunnerError(
            f"Flyway migrate started from an unexpected version; expected {EXPECTED_CURRENT_VERSION}"
        )
    if str(result.get("targetSchemaVersion") or "") != TARGET_VERSION:
        raise ProductionRunnerError(
            f"Flyway migrate did not target {TARGET_VERSION}"
        )
    if int(result.get("migrationsExecuted") or -1) != len(EXPECTED_PENDING_VERSIONS):
        raise ProductionRunnerError(
            f"Flyway did not execute exactly {EXPECTED_PENDING_VERSIONS}"
        )
    migrations = result.get("migrations")
    if not isinstance(migrations, list):
        raise ProductionRunnerError("Flyway migrate did not contain a migrations list")
    if any(not isinstance(item, Mapping) for item in migrations):
        raise ProductionRunnerError("Flyway migrate contained a malformed entry")
    versions = [
        str(item.get("version"))
        for item in migrations
        if item.get("version") is not None
    ]
    if versions != list(EXPECTED_PENDING_VERSIONS):
        raise ProductionRunnerError(
            f"Flyway executed unexpected migration versions: {versions!r}"
        )
    base._validate_flyway_envelope(
        result,
        operation="migrate",
        expected_database=EXPECTED_DATABASE,
        expected_flyway_version=EXPECTED_FLYWAY_VERSION,
    )


# ============================================================================
# V42 metadata SQL (extends base.build_metadata_sql)
# ============================================================================


def metadata_sql_v42_postflight_extras() -> str:
    """Extra read-only SELECTs verifying V42 schema footprint + preflight identity binding."""
    # INFORMATION_SCHEMA may render integer display widths with or without the
    # historical ``(20)`` / ``(11)`` suffix.  Those pairs are semantically
    # identical; every other type, nullability or default drift is rejected.
    definition_predicates = (
        "LOWER(data_type)='char' AND LOWER(column_type)='char(36)' "
        "AND is_nullable='YES' AND column_default IS NULL "
        "AND LOWER(character_set_name)='ascii' AND LOWER(collation_name)='ascii_bin'",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(32)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(255)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(255)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(1000)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='bigint' AND LOWER(column_type) IN ('bigint','bigint(20)') "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(100)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(16)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='bigint' AND LOWER(column_type) IN ('bigint','bigint(20)') "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='char' AND LOWER(column_type)='char(64)' "
        "AND is_nullable='YES' AND column_default IS NULL "
        "AND LOWER(character_set_name)='ascii' AND LOWER(collation_name)='ascii_bin'",
        "LOWER(data_type)='int' AND LOWER(column_type) IN ('int','int(11)') "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='int' AND LOWER(column_type) IN ('int','int(11)') "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='binary' AND LOWER(column_type)='binary(16)' "
        "AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='datetime' AND LOWER(column_type)='datetime(6)' "
        "AND datetime_precision=6 AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='varchar' AND LOWER(column_type)='varchar(24)' "
        "AND is_nullable='NO' AND column_default IS NOT NULL "
        "AND HEX(CAST(column_default AS CHAR))='554E4D414E41474544'",
        "LOWER(data_type)='char' AND LOWER(column_type)='char(36)' "
        "AND is_nullable='YES' AND column_default IS NULL "
        "AND LOWER(character_set_name)='ascii' AND LOWER(collation_name)='ascii_bin'",
        "LOWER(data_type)='datetime' AND LOWER(column_type)='datetime(6)' "
        "AND datetime_precision=6 AND is_nullable='YES' AND column_default IS NULL",
        "LOWER(data_type)='datetime' AND LOWER(column_type)='datetime(6)' "
        "AND datetime_precision=6 AND is_nullable='YES' AND column_default IS NULL",
    )
    if len(definition_predicates) != len(MANAGED_STORAGE_COLUMN_CONTRACT):
        raise ProductionRunnerError(
            "V42 managed-storage definition contract does not match its name contract"
        )
    definition_sql = " OR ".join(
        f"(column_name='{column}' AND {predicate})"
        for column, predicate in zip(
            MANAGED_STORAGE_COLUMN_CONTRACT, definition_predicates, strict=True
        )
    )
    expected_count = len(MANAGED_STORAGE_COLUMN_CONTRACT)
    expected_source_order_hex = (
        ",".join(MANAGED_STORAGE_COLUMN_CONTRACT).encode("ascii").hex().upper()
    )
    return (
        "SELECT 'session_user', CURRENT_USER();\n"
        # Exactly 18 managed-storage columns on event_media, with their
        # migration-defined types, nullability and defaults.
        "SELECT 'v42_managed_columns', COALESCE("
        "(SELECT CASE WHEN COUNT(*)=0 THEN '' "
        f"WHEN COUNT(*)<>{expected_count} "
        f"OR COUNT(DISTINCT column_name)<>{expected_count} "
        "OR HEX(GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ','))"
        f"<>'{expected_source_order_hex}' "
        "OR COALESCE(SUM(CASE WHEN ("
        f"{definition_sql}"
        f") THEN 1 ELSE 0 END),0)<>{expected_count} "
        "THEN '__invalid_v42_managed_column_contract__' "
        "ELSE GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',') END "
        "FROM information_schema.columns "
        "WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND column_name IN ("
        f"{MANAGED_STORAGE_COLUMN_SQL})), '') AS v;\n"
        # 4 indexes on event_media.
        "SELECT 'v42_media_indexes', COALESCE("
        "(SELECT GROUP_CONCAT(index_name ORDER BY index_name SEPARATOR ',') "
        "FROM information_schema.statistics "
        "WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND index_name IN ("
        "'uk_event_media_managed_asset','uk_event_media_storage_identity',"
        "'idx_event_media_managed_read','idx_event_media_upload_expiry')), '') AS v;\n"
        # FK presence.
        f"SELECT 'v42_fk_event_media_uploaded_by', ("
        f"SELECT MAX(CASE WHEN constraint_name='{V42_EVENT_MEDIA_FK}' THEN 1 ELSE 0 END) "
        f"FROM information_schema.table_constraints "
        f"WHERE constraint_schema=DATABASE() AND table_name='event_media'"
        f") AS v;\n"
        # cleanup_tasks table presence.
        f"SELECT 'v42_cleanup_table', COUNT(*) FROM information_schema.tables "
        f"WHERE table_schema=DATABASE() AND table_name='{V42_CLEANUP_TABLE}';\n"
        # 3 cleanup-task CHECK constraints.
        "SELECT 'v42_cleanup_constraints', COALESCE("
        "(SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') "
        "FROM information_schema.table_constraints "
        "WHERE constraint_schema=DATABASE() "
        "AND table_name='event_media_storage_cleanup_tasks' "
        "AND constraint_name IN ("
        "'chk_event_media_cleanup_operation','chk_event_media_cleanup_status',"
        "'chk_event_media_cleanup_attempts')), '') AS v;\n"
        # 6 CHECK constraints in information_schema.CHECK_CONSTRAINTS
        "SELECT 'v42_check_constraints', COALESCE("
        "(SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') "
        "FROM information_schema.CHECK_CONSTRAINTS "
        "WHERE constraint_schema=DATABASE() "
        "AND constraint_name IN ("
        "'chk_event_media_storage_state','chk_event_media_storage_byte_size',"
        "'chk_event_media_storage_dimensions','chk_event_media_cleanup_operation',"
        "'chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')), '') AS v;\n"
        # 6 CHECK constraints in information_schema.TIDB_CHECK_CONSTRAINTS
        "SELECT 'v42_tidb_check_constraints', COALESCE("
        "(SELECT GROUP_CONCAT(CONSTRAINT_NAME ORDER BY CONSTRAINT_NAME SEPARATOR ',') "
        "FROM information_schema.TIDB_CHECK_CONSTRAINTS "
        "WHERE CONSTRAINT_SCHEMA=DATABASE() "
        "AND CONSTRAINT_NAME IN ("
        "'chk_event_media_storage_state','chk_event_media_storage_byte_size',"
        "'chk_event_media_storage_dimensions','chk_event_media_cleanup_operation',"
        "'chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')), '') AS v;\n"
        # TiDB CHECK engine flag (must remain '1').
        "SELECT 'tidb_enable_check_constraint', @@global.tidb_enable_check_constraint;\n"
        # Exactly one successful V42 row.
        "SELECT 'v42_success_rows', COUNT(*) "
        "FROM flyway_schema_history WHERE version='42' AND success=1;\n"
        # Flyway V42 history checksum (sanitised integer).
        "SELECT 'v42_history_checksum', COALESCE("
        "(SELECT CAST(checksum AS CHAR) "
        "FROM flyway_schema_history WHERE version='42' AND success=1 "
        "ORDER BY installed_rank DESC LIMIT 1),'') AS v;\n"
        # event_media bounded count.
        "SELECT 'event_media_total', (SELECT COUNT(*) FROM event_media);\n"
    )


def bounded_metadata_sql_v42() -> str:
    """Return the exact four-row, aggregate-only Release E baseline query."""
    return (
        "SELECT 'users_total', COUNT(*) FROM users;\n"
        "SELECT 'historical_events_total', COUNT(*) FROM historical_events;\n"
        "SELECT 'event_media_total', COUNT(*) FROM event_media;\n"
        "SELECT 'active_admin_count', COUNT(DISTINCT u.id) "
        "FROM users u JOIN user_roles ur ON ur.user_id=u.id "
        "JOIN roles r ON r.id=ur.role_id "
        "WHERE u.status='active' AND r.code='admin';\n"
    )


def parse_bounded_metadata_counts(output: str) -> dict[str, str]:
    """Parse one complete four-metric key/value result, without defaults."""
    metadata = base.parse_mysql_metadata(output)
    observed = frozenset(metadata)
    expected = frozenset(V42_BOUNDED_COUNTS)
    if observed != expected:
        missing = sorted(expected - observed)
        unexpected = sorted(observed - expected)
        raise ProductionRunnerError(
            "bounded metadata keys do not match the Release E contract: "
            f"missing={missing}, unexpected={unexpected}"
        )
    for key in V42_BOUNDED_COUNTS:
        value = metadata[key]
        if not re.fullmatch(r"0|[1-9][0-9]*", value):
            raise ProductionRunnerError(
                f"bounded metadata value is not a non-negative integer for {key}"
            )
    return {key: metadata[key] for key in V42_BOUNDED_COUNTS}


def merge_bounded_metadata_counts(
    metadata: Mapping[str, str], bounded: Mapping[str, str]
) -> dict[str, str]:
    """Cross-check the dedicated baseline against shared operational counts."""
    shared_keys = {
        "users_total": "users_total",
        "historical_events_total": "events_total",
        "event_media_total": "event_media_total",
        "active_admin_count": "active_admin_count",
    }
    for bounded_key, shared_key in shared_keys.items():
        if metadata.get(shared_key) != bounded.get(bounded_key):
            raise ProductionRunnerError(
                f"bounded metadata disagrees with shared metadata for {bounded_key}"
            )
    merged = dict(metadata)
    merged.update(bounded)
    return merged


def validate_v42_postflight_extras(
    extra_metadata: Mapping[str, str], before: Mapping[str, str]
) -> None:
    observed_cols = _to_set(extra_metadata.get("v42_managed_columns", ""))
    if observed_cols != MANAGED_STORAGE_COLUMNS:
        raise ProductionRunnerError(
            f"V42 audit failed: event_media managed-storage columns "
            f"({sorted(observed_cols)}) do not match expected "
            f"({sorted(MANAGED_STORAGE_COLUMNS)})"
        )
    observed_idx = _to_set(extra_metadata.get("v42_media_indexes", ""))
    if observed_idx != V42_EVENT_MEDIA_INDEXES:
        raise ProductionRunnerError(
            f"V42 audit failed: event_media indexes {sorted(observed_idx)} != "
            f"{sorted(V42_EVENT_MEDIA_INDEXES)}"
        )
    if extra_metadata.get("v42_fk_event_media_uploaded_by") != "1":
        raise ProductionRunnerError(
            f"V42 audit failed: {V42_EVENT_MEDIA_FK} missing"
        )
    if extra_metadata.get("v42_cleanup_table") != "1":
        raise ProductionRunnerError(
            f"V42 audit failed: {V42_CLEANUP_TABLE} missing"
        )
    observed_ck = _to_set(extra_metadata.get("v42_cleanup_constraints", ""))
    if observed_ck != V42_CLEANUP_CONSTRAINTS:
        raise ProductionRunnerError(
            f"V42 audit failed: cleanup-task CHECK constraints {sorted(observed_ck)} != "
            f"{sorted(V42_CLEANUP_CONSTRAINTS)}"
        )
    observed_chk = _to_set(extra_metadata.get("v42_check_constraints", ""))
    if observed_chk != ALL_V42_CHECK_CONSTRAINTS:
        raise ProductionRunnerError(
            f"V42 audit failed: information_schema.CHECK_CONSTRAINTS set "
            f"{sorted(observed_chk)} != {sorted(ALL_V42_CHECK_CONSTRAINTS)}"
        )
    observed_tidb = _to_set(extra_metadata.get("v42_tidb_check_constraints", ""))
    if observed_tidb != ALL_V42_CHECK_CONSTRAINTS:
        raise ProductionRunnerError(
            f"V42 audit failed: information_schema.TIDB_CHECK_CONSTRAINTS set "
            f"{sorted(observed_tidb)} != {sorted(ALL_V42_CHECK_CONSTRAINTS)}"
        )
    if extra_metadata.get("tidb_enable_check_constraint") != "1":
        raise ProductionRunnerError(
            "@@global.tidb_enable_check_constraint is not '1'; CHECK enforcement is disabled"
        )
    if extra_metadata.get("v42_success_rows") != "1":
        raise ProductionRunnerError(
            "Flyway history does not contain exactly one successful V42 row"
        )
    observed_checksum = (extra_metadata.get("v42_history_checksum") or "").strip()
    if not re.fullmatch(r"-?\d+", observed_checksum):
        raise ProductionRunnerError(
            "Flyway V42 history checksum is missing or not numeric"
        )
    for key in V42_BOUNDED_COUNTS:
        if before.get(key) != extra_metadata.get(key):
            raise ProductionRunnerError(
                f"bounded count changed after migration for {key}: "
                f"{before.get(key)!r} -> {extra_metadata.get(key)!r}"
            )


# ============================================================================
# Preflight / postflight drivers (V42-specific)
# ============================================================================


def _verify_manifest_immutable(repo_root: Path) -> list[tuple[str, str]]:
    """Verify the production V42 manifest matches the on-disk V1..V42
    SQL files exactly.  Returns the verified ``(sha256, filename)`` list.

    Detects:
      - missing or extra ``V\\d+__*.sql`` files in either direction
      - per-file hash drift between manifest digest and on-disk sha256
      - V42-entry SHA-256 mismatch with the approved expected SHA
      - any Flyway callback file present in the migration directory
    """
    migration_dir, manifest = _migration_paths_v42(repo_root)
    if not migration_dir.is_dir():
        raise ProductionRunnerError(f"migration directory missing: {migration_dir}")
    if not manifest.is_file():
        raise ProductionRunnerError(
            f"production manifest {MANIFEST_NAME} missing"
        )
    entries = _parse_manifest_entries(manifest)
    on_disk = {
        p.name
        for p in sorted(migration_dir.iterdir())
        if p.is_file() and base.VERSIONED_MIGRATION_NAME.fullmatch(p.name)
    }
    manifest_files = {name for _, name in entries}
    missing = sorted(on_disk - manifest_files)
    extra = sorted(manifest_files - on_disk)
    if missing or extra:
        raise ProductionRunnerError(
            f"production manifest set does not match on-disk V*.sql files: "
            f"missing_from_manifest={missing}, extra_in_manifest={extra}"
        )
    by_name = {name: digest for digest, name in entries}
    for name in sorted(by_name):
        path = migration_dir / name
        actual = _file_sha256(path)
        if actual != by_name[name]:
            raise ProductionRunnerError(
                f"production manifest entry {name} hash drift: "
                f"expected={by_name[name]}, actual={actual}"
            )
    if EXPECTED_V42_SQL_FILE not in by_name:
        raise ProductionRunnerError(
            f"production manifest does not contain the V42 entry {EXPECTED_V42_SQL_FILE}"
        )
    if by_name[EXPECTED_V42_SQL_FILE] != EXPECTED_V42_SQL_SHA:
        raise ProductionRunnerError(
            f"production manifest V42 entry SHA-256 mismatch: "
            f"expected={EXPECTED_V42_SQL_SHA}, actual={by_name[EXPECTED_V42_SQL_FILE]}"
        )
    callbacks = base.find_flyway_callbacks(migration_dir)
    if callbacks:
        raise ProductionRunnerError(
            f"Flyway callbacks are not allowed: "
            f"{', '.join(str(p) for p in callbacks)}"
        )
    # Preserve manifest order (V1..V42).  Do NOT lexicographically re-sort
    # because callers depend on V1 being first and V42 being last.
    return entries


def run_metadata_query(
    *,
    target: Mapping[str, Any],
    user: str,
    password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult],
    postflight: bool,
) -> dict[str, str]:
    images = base.verify_docker_images()
    sql = (
        base.build_metadata_sql(postflight=postflight)
        + metadata_sql_v42_postflight_extras()
    )
    payload = base.build_mysql_payload(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=user,
        password=password,
        sql=sql,
    )
    command = base.build_mysql_command(image_ref=images[base.MYSQL_CLIENT_IMAGE])
    result = base.run_external(command, payload, secrets=(user, password), executor=executor)
    return base.parse_mysql_metadata(result.stdout)


def run_bounded_metadata_query(
    *,
    target: Mapping[str, Any],
    user: str,
    password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult],
) -> dict[str, str]:
    """Run the exact four-metric baseline after all preceding gates pass."""
    images = base.verify_docker_images()
    bounded_payload = base.build_mysql_payload(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=user,
        password=password,
        sql=bounded_metadata_sql_v42(),
    )
    command = base.build_mysql_command(image_ref=images[base.MYSQL_CLIENT_IMAGE])
    bounded_result = base.run_external(
        command,
        bounded_payload,
        secrets=(user, password),
        executor=executor,
    )
    return parse_bounded_metadata_counts(bounded_result.stdout)


def run_preflight(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    production_identity_evidence_sha256: str,
    read_user: str,
    read_password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
    validate_release_e_evidence(
        production_identity_evidence_sha256=production_identity_evidence_sha256
    )
    _verify_manifest_immutable(repo_root)
    migration_dir, manifest = _migration_paths_v42(repo_root)
    images = base.verify_docker_images()
    config = base.build_flyway_config(
        host=target["host"], port=target["port"], database=target["database"],
        user=read_user, password=read_password,
    )
    secrets = (read_user, read_password)
    with base.canonical_migration_directory(
        migration_dir, manifest_path=manifest,
        expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
    ) as flyway_dir:
        info = run_flyway_v42(
            migration_dir=flyway_dir, operation="info", config=config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
        )
        info_state = validate_flyway_info_for_v42(info)
        base.validate_flyway_validate(
            run_flyway_v42(
                migration_dir=flyway_dir, operation="validate", config=config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=False,
    )
    validate_database_metadata_v42(metadata)
    validate_user_prefix_binding(identity=identity, session_user=metadata.get("session_user", ""))
    metadata = merge_bounded_metadata_counts(
        metadata,
        run_bounded_metadata_query(
            target=target,
            user=read_user,
            password=read_password,
            executor=executor,
        ),
    )
    metadata["session_user_prefix_verified"] = "1"
    metadata["v42_history_present"] = "0"
    return {"flyway": info_state, "metadata": metadata}


def run_flyway_migrate_after_evidence_gate(
    *, production_identity_evidence_sha256: str, migration_dir: Path,
    config: str, image_ref: str, secrets: Sequence[str],
    executor: Callable[[Sequence[str], str], base.CommandResult],
) -> Mapping[str, Any]:
    """Revalidate the complete evidence chain immediately before migrate."""
    validate_release_e_evidence(
        production_identity_evidence_sha256=production_identity_evidence_sha256
    )
    return run_flyway_v42(
        migration_dir=migration_dir, operation="migrate", config=config,
        image_ref=image_ref, secrets=secrets, executor=executor,
    )


def run_migrate(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    production_identity_evidence_sha256: str,
    read_user: str,
    read_password: str,
    migrate_user: str,
    migrate_password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
    pre = run_preflight(
        repo_root=repo_root, target=target, identity=identity,
        production_identity_evidence_sha256=production_identity_evidence_sha256,
        read_user=read_user, read_password=read_password, executor=executor,
    )
    if migrate_user.casefold() == read_user.casefold():
        raise ProductionRunnerError(
            "production migrate account must differ from the read account"
        )
    validate_user_prefix_binding(identity=identity, session_user=migrate_user)
    images = base.verify_docker_images()
    migrate_config = base.build_flyway_config(
        host=target["host"], port=target["port"], database=target["database"],
        user=migrate_user, password=migrate_password,
    )
    post_config = base.build_flyway_config(
        host=target["host"], port=target["port"], database=target["database"],
        user=read_user, password=read_password,
    )
    migrate_secrets = (migrate_user, migrate_password)
    read_secrets = (read_user, read_password)
    migration_dir, manifest = _migration_paths_v42(repo_root)
    with base.canonical_migration_directory(
        migration_dir, manifest_path=manifest,
        expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
    ) as flyway_dir:
        info_pre = run_flyway_v42(
            migration_dir=flyway_dir, operation="info", config=migrate_config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets, executor=executor,
        )
        validate_flyway_info_for_v42(info_pre)
        base.validate_flyway_validate(
            run_flyway_v42(
                migration_dir=flyway_dir, operation="validate", config=migrate_config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets, executor=executor,
            )
        )
        migrate_result = run_flyway_migrate_after_evidence_gate(
            production_identity_evidence_sha256=production_identity_evidence_sha256,
            migration_dir=flyway_dir, config=migrate_config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets,
            executor=executor,
        )
        validate_flyway_migrate_for_v42(migrate_result)
        info_post = run_flyway_v42(
            migration_dir=flyway_dir, operation="info", config=post_config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=read_secrets, executor=executor,
        )
        post_state = base.validate_flyway_info(
            info_post,
            expected_current=TARGET_VERSION,
            expected_pending=(),
            expected_database=EXPECTED_DATABASE,
            expected_flyway_version=EXPECTED_FLYWAY_VERSION,
        )
        base.validate_flyway_validate(
            run_flyway_v42(
                migration_dir=flyway_dir, operation="validate", config=post_config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=read_secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=True,
    )
    validate_database_metadata_v42(metadata)
    base.validate_postflight_metadata(metadata, pre["metadata"])
    metadata = merge_bounded_metadata_counts(
        metadata,
        run_bounded_metadata_query(
            target=target,
            user=read_user,
            password=read_password,
            executor=executor,
        ),
    )
    validate_v42_postflight_extras(
        metadata,
        before={
            "users_total": pre["metadata"].get("users_total", ""),
            "historical_events_total": pre["metadata"].get(
                "historical_events_total", ""
            ),
            "event_media_total": pre["metadata"].get("event_media_total", ""),
            "active_admin_count": pre["metadata"].get("active_admin_count", ""),
        },
    )
    return {"flyway": post_state, "metadata": metadata, "pre": pre}


def run_postflight(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    production_identity_evidence_sha256: str,
    read_user: str,
    read_password: str,
    before_evidence: Mapping[str, Any],
    migration_installed_at_utc: datetime,
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
    validate_release_e_postflight_evidence(
        production_identity_evidence_sha256=production_identity_evidence_sha256,
        migration_installed_at_utc=migration_installed_at_utc,
    )
    _verify_manifest_immutable(repo_root)
    migration_dir, manifest = _migration_paths_v42(repo_root)
    images = base.verify_docker_images()
    config = base.build_flyway_config(
        host=target["host"], port=target["port"], database=target["database"],
        user=read_user, password=read_password,
    )
    secrets = (read_user, read_password)
    with base.canonical_migration_directory(
        migration_dir, manifest_path=manifest,
        expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
    ) as flyway_dir:
        info = run_flyway_v42(
            migration_dir=flyway_dir, operation="info", config=config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
        )
        post_state = base.validate_flyway_info(
            info,
            expected_current=TARGET_VERSION,
            expected_pending=(),
            expected_database=EXPECTED_DATABASE,
            expected_flyway_version=EXPECTED_FLYWAY_VERSION,
        )
        base.validate_flyway_validate(
            run_flyway_v42(
                migration_dir=flyway_dir, operation="validate", config=config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=True,
    )
    expected_metadata_keys = frozenset(
        re.findall(
            r"(?m)^SELECT '([a-z][a-z0-9_]*)',",
            base.build_metadata_sql(postflight=True)
            + metadata_sql_v42_postflight_extras(),
        )
    )
    observed_metadata_keys = frozenset(metadata)
    if observed_metadata_keys != expected_metadata_keys:
        raise ProductionRunnerError(
            "postflight metadata keys do not match the generated read-only query: "
            f"missing={sorted(expected_metadata_keys - observed_metadata_keys)}, "
            f"unexpected={sorted(observed_metadata_keys - expected_metadata_keys)}"
        )
    managed_column_rows = (
        metadata.get("v42_managed_columns", "").split(",")
        if metadata.get("v42_managed_columns", "")
        else []
    )
    if any(
        not re.fullmatch(r"[a-z][a-z0-9_]*", row)
        for row in managed_column_rows
    ):
        raise ProductionRunnerError(
            "V42 managed-storage metadata contains a malformed column name"
        )
    if len(managed_column_rows) != len(set(managed_column_rows)):
        raise ProductionRunnerError(
            "V42 managed-storage metadata contains a duplicate column row"
        )
    validate_database_metadata_v42(metadata)
    base.validate_postflight_metadata(metadata, before_evidence["metadata"])
    metadata = merge_bounded_metadata_counts(
        metadata,
        run_bounded_metadata_query(
            target=target,
            user=read_user,
            password=read_password,
            executor=executor,
        ),
    )
    validate_v42_postflight_extras(
        metadata,
        before={
            "users_total": before_evidence["metadata"].get("users_total", ""),
            "historical_events_total": before_evidence["metadata"].get(
                "historical_events_total", ""
            ),
            "event_media_total": before_evidence["metadata"].get("event_media_total", ""),
            "active_admin_count": before_evidence["metadata"].get("active_admin_count", ""),
        },
    )
    return {"flyway": post_state, "metadata": metadata}


def local_check(repo_root: Path) -> dict[str, Any]:
    """Manifest set + V42-entry SHA verification only.  No remote connection."""
    entries = _verify_manifest_immutable(repo_root)
    _, manifest = _migration_paths_v42(repo_root)
    by_name = {name: digest for digest, name in entries}
    return {
        "manifest": str(manifest),
        "manifest_sha256": _file_sha256(manifest),
        "migration_count": len(entries),
        "first_migration": entries[0][1],
        "last_migration": entries[-1][1],
        "target_version": TARGET_VERSION,
        "current_version": EXPECTED_CURRENT_VERSION,
        "transition": f"{EXPECTED_CURRENT_VERSION}->{TARGET_VERSION}",
        "v42_entry_sha256_match": (
            by_name.get(EXPECTED_V42_SQL_FILE) == EXPECTED_V42_SQL_SHA
        ),
    }


# ============================================================================
# Evidence driver (shared with base shape, but uses our pinned wrapper)
# ============================================================================


def build_evidence_payload(
    *, mode: str, target: Mapping[str, Any], release_commit: str,
    flyway: Mapping[str, Any], metadata: Mapping[str, str],
) -> dict[str, Any]:
    return base.build_evidence(
        mode=mode, target=target,
        release_commit=release_commit, flyway=flyway, metadata=metadata,
    )


def build_standalone_postflight_evidence_payload(
    *,
    target: Mapping[str, Any],
    checkout_commit: str,
    migration_release_commit: str,
    preflight_file_sha256: str,
    preflight_evidence_sha256: str,
    failure_inspection_file_sha256: str,
    flyway: Mapping[str, Any],
    metadata: Mapping[str, str],
) -> dict[str, Any]:
    """Preserve the independently verified execution lineage in new evidence."""
    payload = build_evidence_payload(
        mode="postflight", target=target, release_commit=checkout_commit,
        flyway=flyway, metadata=metadata,
    )
    payload.pop("evidence_sha256")
    payload["release_lineage"] = {
        "checkout_commit": checkout_commit,
        "migration_release_commit": migration_release_commit,
        "preflight_file_sha256": preflight_file_sha256,
        "preflight_evidence_sha256": preflight_evidence_sha256,
        "failure_inspection_file_sha256": failure_inspection_file_sha256,
        "migrate_attempt_count": 1,
    }
    payload["evidence_sha256"] = base._evidence_sha256(payload)
    return payload


def _read_v42_preflight_evidence(
    path: Path,
    expected_file_sha256: str,
) -> Mapping[str, Any]:
    """Read only the exact preflight artifact emitted by this V42 runner.

    ``base._read_evidence`` intentionally remains bound to historical Release D
    (V37 with V38-V41 pending).  Release E has a separate loader so neither
    release can fall back to, or broaden into, the other release's state.
    """
    path = Path(path)
    if path.suffix.lower() != ".json" or not path.is_file() or path.is_symlink():
        raise ProductionRunnerError("V42 preflight evidence file is missing or invalid")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_file_sha256 or ""):
        raise ProductionRunnerError(
            "V42 preflight evidence file SHA-256 is missing or invalid"
        )
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ProductionRunnerError("V42 preflight evidence cannot be read") from exc
    if len(raw) > base.MAX_EVIDENCE_BYTES:
        raise ProductionRunnerError("V42 preflight evidence is too large")
    if not hmac.compare_digest(
        hashlib.sha256(raw).hexdigest(), expected_file_sha256.lower()
    ):
        raise ProductionRunnerError(
            "V42 preflight evidence file SHA-256 does not match the stored bytes"
        )

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ProductionRunnerError(
                    "V42 preflight evidence contains duplicate keys"
                )
            result[key] = value
        return result

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionRunnerError(
            "V42 preflight evidence is not valid JSON"
        ) from exc
    if not isinstance(value, Mapping):
        raise ProductionRunnerError("V42 preflight evidence has an invalid shape")
    expected_keys = {
        "format_version",
        "mode",
        "target",
        "release_commit",
        "created_at",
        "flyway",
        "metadata",
        "evidence_sha256",
    }
    if set(value) != expected_keys or value.get("mode") != "preflight":
        raise ProductionRunnerError(
            "V42 before evidence must be an exact preflight artifact"
        )
    base.validate_evidence_integrity(value)

    expected_flyway = {
        "current_version": EXPECTED_CURRENT_VERSION,
        "pending_versions": list(EXPECTED_PENDING_VERSIONS),
        "database": EXPECTED_DATABASE,
        "flyway_version": EXPECTED_FLYWAY_VERSION,
    }
    flyway = value.get("flyway")
    if not isinstance(flyway, Mapping) or dict(flyway) != expected_flyway:
        raise ProductionRunnerError(
            "V42 preflight evidence Flyway state is not exactly V41 with V42 pending"
        )

    metadata = value.get("metadata")
    if not isinstance(metadata, Mapping) or set(metadata) != V42_PREFLIGHT_METADATA_KEYS:
        raise ProductionRunnerError(
            "V42 preflight evidence metadata shape is not approved"
        )
    validate_database_metadata_v42(metadata)
    if not str(metadata.get("session_user", "")).strip():
        raise ProductionRunnerError("V42 preflight evidence has no SQL session identity")
    if metadata.get("session_user_prefix_verified") != "1":
        raise ProductionRunnerError(
            "V42 preflight evidence does not prove the production user prefix"
        )
    if metadata.get("tidb_enable_check_constraint") != "1":
        raise ProductionRunnerError(
            "V42 preflight evidence does not prove CHECK support"
        )
    for key, expected in V42_PREFLIGHT_ABSENT_SCHEMA_VALUES.items():
        if metadata.get(key) != expected:
            raise ProductionRunnerError(
                f"V42 preflight evidence has an unsafe pre-migration value for {key}"
            )
    bounded = {key: str(metadata[key]) for key in V42_BOUNDED_COUNTS}
    for key, count in bounded.items():
        if not re.fullmatch(r"0|[1-9][0-9]*", count):
            raise ProductionRunnerError(
                f"V42 preflight evidence has an invalid bounded count for {key}"
            )
    merge_bounded_metadata_counts(metadata, bounded)
    return value


def load_and_validate_v42_preflight_evidence(
    path: Path,
    expected_file_sha256: str,
    *,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    expected_release_commit: str,
) -> Mapping[str, Any]:
    """Load and bind one Release E artifact to the verified checkout/target."""
    evidence = _read_v42_preflight_evidence(path, expected_file_sha256)
    validate_identity_to_target(identity=identity, target=target)
    base.validate_evidence_binding(
        evidence,
        target=target,
        expected_release_commit=expected_release_commit,
    )
    metadata = evidence["metadata"]
    assert isinstance(metadata, Mapping)
    validate_user_prefix_binding(
        identity=identity,
        session_user=str(metadata["session_user"]),
    )
    return evidence


def _load_exact_json_artifact(
    path: Path,
    expected_file_sha256: str,
    detached_sha256_path: Path,
    *,
    label: str,
) -> Mapping[str, Any]:
    path = Path(path)
    detached_sha256_path = Path(detached_sha256_path)
    if path.suffix.lower() != ".json" or not path.is_file() or path.is_symlink():
        raise ProductionRunnerError(f"{label} file is missing or invalid")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_file_sha256 or ""):
        raise ProductionRunnerError(f"{label} SHA-256 must be exact lowercase hex")
    if not detached_sha256_path.is_file() or detached_sha256_path.is_symlink():
        raise ProductionRunnerError(f"{label} detached SHA-256 file is missing")
    try:
        raw = path.read_bytes()
        detached = detached_sha256_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ProductionRunnerError(f"{label} cannot be read") from exc
    if len(raw) > base.MAX_EVIDENCE_BYTES:
        raise ProductionRunnerError(f"{label} is too large")
    actual = hashlib.sha256(raw).hexdigest()
    if not hmac.compare_digest(actual, expected_file_sha256):
        raise ProductionRunnerError(f"{label} file SHA-256 mismatch")
    detached_match = re.fullmatch(
        rf"{re.escape(expected_file_sha256)}  {re.escape(path.name)}\r?\n?",
        detached,
    )
    if not detached_match:
        raise ProductionRunnerError(f"{label} detached SHA-256 mismatch")

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                raise ProductionRunnerError(f"{label} contains duplicate keys")
            value[key] = item
        return value

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionRunnerError(f"{label} is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise ProductionRunnerError(f"{label} has an invalid shape")
    return value


def _parse_failure_timestamp(value: Any, field: str, *, flyway_local: bool = False) -> datetime:
    if not isinstance(value, str):
        raise ProductionRunnerError(f"failure inspection {field} is invalid")
    try:
        if flyway_local:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}", value):
                raise ValueError
            parsed = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        else:
            if not re.fullmatch(
                r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z", value
            ):
                raise ValueError
            parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ProductionRunnerError(f"failure inspection {field} is invalid") from exc
    return parsed.astimezone(timezone.utc)


def load_and_validate_v42_failure_inspection(
    path: Path,
    expected_file_sha256: str,
    detached_sha256_path: Path,
    *,
    target: Mapping[str, Any],
    migration_release_commit: str,
    preflight_evidence: Mapping[str, Any],
) -> dict[str, Any]:
    """Bind the retained no-retry inspection to the exact V42 execution."""
    migration_release_commit = _require_exact_lower_commit(
        migration_release_commit, "migration release commit"
    )
    value = _load_exact_json_artifact(
        path, expected_file_sha256, detached_sha256_path,
        label="V42 failure inspection",
    )
    if set(value) != {
        "classification", "release_commit", "target", "migrate_mode",
        "postflight", "schema", "postflight_blocker",
    }:
        raise ProductionRunnerError("V42 failure inspection top-level shape is invalid")
    if value.get("classification") != "BLOCKED_PRODUCTION_POSTFLIGHT":
        raise ProductionRunnerError("V42 failure inspection classification is invalid")
    if value.get("release_commit") != migration_release_commit:
        raise ProductionRunnerError("failure inspection release commit binding mismatch")

    artifact_target = value.get("target")
    expected_target = {
        "cluster_id": EXPECTED_PRODUCTION_CLUSTER_ID,
        "target_identity": EXPECTED_TARGET_IDENTITY,
        "host": target["host"],
        "port": int(target["port"]),
        "database": EXPECTED_DATABASE,
    }
    if not isinstance(artifact_target, Mapping) or dict(artifact_target) != expected_target:
        raise ProductionRunnerError("failure inspection production target binding mismatch")

    migrate = value.get("migrate_mode")
    expected_migrate_values = {
        "attempt_count": 1,
        "exit_code": 2,
        "migrate_contract_validation": "passed before postflight schema validation",
        "applied_version": TARGET_VERSION,
        "description": "add managed event image storage",
        "flyway_checksum": "-769202000",
    }
    if not isinstance(migrate, Mapping) or set(migrate) != {
        *expected_migrate_values,
        "started_at_utc", "ended_at_utc", "installed_on",
    }:
        raise ProductionRunnerError("failure inspection migrate execution shape is invalid")
    for key, expected in expected_migrate_values.items():
        if migrate.get(key) != expected:
            raise ProductionRunnerError(f"failure inspection migrate value {key} is invalid")
    started = _parse_failure_timestamp(migrate["started_at_utc"], "started_at_utc")
    installed = _parse_failure_timestamp(
        migrate["installed_on"], "installed_on", flyway_local=True
    )
    ended = _parse_failure_timestamp(migrate["ended_at_utc"], "ended_at_utc")
    if not started < installed < ended:
        raise ProductionRunnerError("failure inspection migration timestamps are unsafe")

    postflight = value.get("postflight")
    expected_postflight_scalars = {
        "database": EXPECTED_DATABASE,
        "server_version": "8.0.11-TiDB-v8.5.3-serverless",
        "sentinel": "1",
        "check_support": "1",
        "flyway_current": TARGET_VERSION,
        "v42_success_rows": "1",
        "failed_count": "0",
        "above_v42_count": "0",
        "flyway_info_and_validate": "passed before schema-contract validation",
        "cleanup_task_total": "0",
    }
    if not isinstance(postflight, Mapping) or set(postflight) != {
        *expected_postflight_scalars, "bounded_counts"
    }:
        raise ProductionRunnerError("failure inspection postflight shape is invalid")
    for key, expected in expected_postflight_scalars.items():
        if postflight.get(key) != expected:
            raise ProductionRunnerError(f"failure inspection postflight value {key} is invalid")
    before_metadata = preflight_evidence.get("metadata")
    if not isinstance(before_metadata, Mapping):
        raise ProductionRunnerError("preflight metadata is missing from artifact binding")
    expected_counts = {key: str(before_metadata[key]) for key in V42_BOUNDED_COUNTS}
    if postflight.get("bounded_counts") != expected_counts:
        raise ProductionRunnerError("failure inspection does not bind to preflight counts")

    schema = value.get("schema")
    expected_schema = {
        "actual_event_media_managed_columns": list(MANAGED_STORAGE_COLUMN_CONTRACT),
        "event_media_indexes": [
            "uk_event_media_managed_asset", "uk_event_media_storage_identity",
            "idx_event_media_managed_read", "idx_event_media_upload_expiry",
        ],
        "event_media_foreign_key": V42_EVENT_MEDIA_FK,
        "cleanup_table": V42_CLEANUP_TABLE,
        "cleanup_indexes": [
            "PRIMARY", "uk_event_media_cleanup_identity", "idx_event_media_cleanup_claim",
        ],
        "check_constraints": [
            "chk_event_media_storage_state", "chk_event_media_storage_byte_size",
            "chk_event_media_storage_dimensions", "chk_event_media_cleanup_operation",
            "chk_event_media_cleanup_status", "chk_event_media_cleanup_attempts",
        ],
        "check_constraints_present_in_both_tidb_metadata_views": True,
    }
    if not isinstance(schema, Mapping) or dict(schema) != expected_schema:
        raise ProductionRunnerError("failure inspection V42 schema proof is invalid")
    expected_blocker = {
        "observed_sql_column": "upload_expires_at",
        "incorrect_runner_expected_column": "storage_expires_at",
        "message": (
            "The committed postflight checker filters for storage_expires_at while V42 SQL "
            "creates upload_expires_at. No retry, repair, or manual schema change was performed."
        ),
    }
    if value.get("postflight_blocker") != expected_blocker:
        raise ProductionRunnerError("failure inspection does not match the known old checker")
    return {
        "artifact": value,
        "file_sha256": expected_file_sha256,
        "migration_started_at_utc": started,
        "migration_installed_at_utc": installed,
        "migration_ended_at_utc": ended,
    }


# ============================================================================
# Argument parser + main
# ============================================================================


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fail-closed TiDB production V42 migration runner"
    )
    parser.add_argument("--mode", choices=("local-check", "preflight", "migrate", "postflight"), default="local-check")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--expected-release-commit")
    parser.add_argument("--expected-migration-release-commit")
    parser.add_argument("--confirm-target")
    parser.add_argument("--identity-evidence", type=Path)
    parser.add_argument("--identity-evidence-sha256")
    parser.add_argument("--two-active-admins", action="store_true")
    parser.add_argument("--backends-drained", action="store_true")
    parser.add_argument("--single-migration-owner", action="store_true")
    parser.add_argument("--maintenance-window", action="store_true")
    parser.add_argument("--rollback-owner", action="store_true")
    parser.add_argument("--runtime-security-verified", action="store_true")
    parser.add_argument("--execute-migrate", action="store_true")
    parser.add_argument("--risk-accepted-minimal", action="store_true")
    parser.add_argument("--evidence-file", type=Path)
    parser.add_argument("--before-evidence", type=Path)
    parser.add_argument("--before-evidence-sha256")
    parser.add_argument("--failure-inspection", type=Path)
    parser.add_argument("--failure-inspection-sha256")
    parser.add_argument("--failure-inspection-detached-sha256", type=Path)
    return parser


def _print(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        repo_root = args.repo_root.resolve()
        postflight_only = (
            args.expected_migration_release_commit,
            args.failure_inspection,
            args.failure_inspection_sha256,
            args.failure_inspection_detached_sha256,
        )
        if args.mode == "postflight":
            if not all(postflight_only):
                raise ProductionRunnerError(
                    "standalone postflight requires migration-release and failure-inspection bindings"
                )
            if args.execute_migrate or args.risk_accepted_minimal:
                raise ProductionRunnerError(
                    "standalone postflight rejects migrate authorization flags"
                )
        elif any(value is not None for value in postflight_only):
            raise ProductionRunnerError(
                "postflight migration-release and failure-inspection arguments are postflight-only"
            )
        if args.mode == "local-check":
            _print(local_check(repo_root))
            return 0
        if not args.expected_release_commit:
            raise ProductionRunnerError("--expected-release-commit is required outside local-check")
        checkout_commit = _require_exact_lower_commit(
            args.expected_release_commit, "checkout commit"
        )
        if not args.identity_evidence or not args.identity_evidence_sha256:
            raise ProductionRunnerError(
                "--identity-evidence and --identity-evidence-sha256 are required"
            )
        identity = load_identity_evidence(args.identity_evidence, args.identity_evidence_sha256)
        # Identity evidence is pure local input and must fail before even local
        # subprocess checks when its authenticated source value is invalid.
        base.verify_release_checkout(repo_root, checkout_commit)
        base.validate_local_docker_environment()
        if args.mode == "migrate":
            # The approved identity/backup/restore chain precedes confirmation,
            # retained-artifact consumption, and all database credentials.
            validate_release_e_evidence(
                production_identity_evidence_sha256=args.identity_evidence_sha256
            )
        if not args.confirm_target:
            raise ProductionRunnerError("--confirm-target is required")
        target = _target_from_environment_and_evidence(
            identity=identity, confirmation=args.confirm_target,
        )
        validate_identity_to_target(identity=identity, target=target)
        before_evidence = None
        raw: Mapping[str, Any] | None = None
        failure_inspection: dict[str, Any] | None = None
        if args.mode in ("migrate", "postflight"):
            if not args.before_evidence or not args.before_evidence_sha256:
                raise ProductionRunnerError(
                    f"--before-evidence and --before-evidence-sha256 are required for {args.mode}"
                )
            artifact_release_commit = (
                args.expected_migration_release_commit
                if args.mode == "postflight"
                else checkout_commit
            )
            assert artifact_release_commit is not None
            if args.mode == "postflight":
                migration_release_commit = _require_exact_lower_commit(
                    artifact_release_commit, "migration release commit"
                )
                validate_postflight_release_lineage(
                    repo_root,
                    checkout_commit=checkout_commit,
                    migration_release_commit=migration_release_commit,
                )
            raw = load_and_validate_v42_preflight_evidence(
                args.before_evidence,
                args.before_evidence_sha256,
                target=target,
                identity=identity,
                expected_release_commit=artifact_release_commit,
            )
            if args.mode == "migrate":
                validate_release_e_evidence(
                    production_identity_evidence_sha256=args.identity_evidence_sha256
                )
            else:
                assert args.failure_inspection is not None
                assert args.failure_inspection_sha256 is not None
                assert args.failure_inspection_detached_sha256 is not None
                failure_inspection = load_and_validate_v42_failure_inspection(
                    args.failure_inspection,
                    args.failure_inspection_sha256,
                    args.failure_inspection_detached_sha256,
                    target=target,
                    migration_release_commit=artifact_release_commit,
                    preflight_evidence=raw,
                )
                validate_release_e_postflight_evidence(
                    production_identity_evidence_sha256=args.identity_evidence_sha256,
                    migration_installed_at_utc=failure_inspection[
                        "migration_installed_at_utc"
                    ],
                )
            before_evidence = {"flyway": raw.get("flyway"), "metadata": raw.get("metadata")}
            if args.mode == "migrate":
                validate_operational_approval_gates(
                    two_active_admins=args.two_active_admins,
                    backends_drained=args.backends_drained,
                    single_migration_owner=args.single_migration_owner,
                    maintenance_window=args.maintenance_window,
                    rollback_owner=args.rollback_owner,
                    runtime_security_verified=args.runtime_security_verified,
                    execute_migrate=args.execute_migrate,
                )
        read_user, read_password = _credentials("TIDB_PRODUCTION_READ")
        if args.mode == "preflight":
            result = run_preflight(
                repo_root=repo_root, target=target, identity=identity,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                read_user=read_user, read_password=read_password,
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_evidence_payload(
                        mode="preflight", target=target,
                        release_commit=checkout_commit,
                        flyway=result["flyway"], metadata=result["metadata"],
                    ),
                )
            _print({
                "mode": "preflight",
                "target": {
                    "target_identity": target["target_identity"],
                    "display_name": target["display_name"],
                    "host": target["host"],
                    "database": target["database"],
                    "user_prefix": target["user_prefix"],
                },
                "flyway": result["flyway"],
                "bounded_counts": {
                    k: result["metadata"][k]
                    for k in V42_BOUNDED_COUNTS
                    if k in result["metadata"]
                },
            })
            return 0
        if args.mode == "migrate":
            base.validate_risk_accepted_minimal_gate(
                risk_accepted_minimal=args.risk_accepted_minimal,
                backends_drained=args.backends_drained,
                runtime_security_verified=args.runtime_security_verified,
                execute_migrate=args.execute_migrate,
            )
            # Complete live read-account gates before migration credentials are
            # inspected.  run_migrate repeats preflight once more before the
            # bounded write, so the retained artifact never substitutes for
            # current identity, Flyway, validation, or baseline checks.
            run_preflight(
                repo_root=repo_root,
                target=target,
                identity=identity,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                read_user=read_user,
                read_password=read_password,
            )
            latest_target = _target_from_environment_and_evidence(
                identity=identity,
                confirmation=args.confirm_target,
            )
            validate_identity_to_target(identity=identity, target=latest_target)
            load_and_validate_v42_preflight_evidence(
                args.before_evidence,
                args.before_evidence_sha256,
                target=latest_target,
                identity=identity,
                expected_release_commit=checkout_commit,
            )
            validate_release_e_evidence(
                production_identity_evidence_sha256=args.identity_evidence_sha256
            )
            migrate_user, migrate_password = _credentials("TIDB_PRODUCTION_MIGRATE")
            result = run_migrate(
                repo_root=repo_root, target=target, identity=identity,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                read_user=read_user, read_password=read_password,
                migrate_user=migrate_user, migrate_password=migrate_password,
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_evidence_payload(
                        mode="postflight", target=target,
                        release_commit=checkout_commit,
                        flyway=result["flyway"], metadata=result["metadata"],
                    ),
                )
            _print({
                "mode": "migrate",
                "target": {
                    "target_identity": target["target_identity"],
                    "display_name": target["display_name"],
                    "host": target["host"],
                    "database": target["database"],
                    "user_prefix": target["user_prefix"],
                },
                "executed": list(EXPECTED_PENDING_VERSIONS),
                "flyway": result["flyway"],
                "bounded_counts": {
                    k: result["metadata"][k]
                    for k in V42_BOUNDED_COUNTS
                    if k in result["metadata"]
                },
            })
            return 0
        if args.mode == "postflight":
            assert before_evidence is not None
            assert raw is not None
            assert failure_inspection is not None
            assert args.expected_migration_release_commit is not None
            result = run_postflight(
                repo_root=repo_root, target=target, identity=identity,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                read_user=read_user, read_password=read_password,
                before_evidence=before_evidence,
                migration_installed_at_utc=failure_inspection[
                    "migration_installed_at_utc"
                ],
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_standalone_postflight_evidence_payload(
                        target=target,
                        checkout_commit=checkout_commit,
                        migration_release_commit=args.expected_migration_release_commit,
                        preflight_file_sha256=args.before_evidence_sha256,
                        preflight_evidence_sha256=str(raw["evidence_sha256"]),
                        failure_inspection_file_sha256=args.failure_inspection_sha256,
                        flyway=result["flyway"], metadata=result["metadata"],
                    ),
                )
            _print({
                "mode": "postflight",
                "target": {
                    "target_identity": target["target_identity"],
                    "display_name": target["display_name"],
                    "host": target["host"],
                    "database": target["database"],
                    "user_prefix": target["user_prefix"],
                },
                "flyway": result["flyway"],
                "bounded_counts": {
                    k: result["metadata"][k]
                    for k in V42_BOUNDED_COUNTS
                    if k in result["metadata"]
                },
            })
            return 0
        raise ProductionRunnerError(f"unsupported mode {args.mode}")
    except release_e_evidence.EvidenceContractError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (base.MigrationGuardError, ProductionRunnerError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"BLOCKED_PRODUCTION_V42: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
