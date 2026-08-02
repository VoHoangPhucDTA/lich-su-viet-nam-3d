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
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
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
EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256 = (
    "c444960cdb59d6a2654a1a2665365992de2c958436ece5063698b4ac07624987"
)
POSTFLIGHT_LINEAGE_ALLOWED_PATHS = frozenset(
    {
        "docs/admin/TIDB_PRODUCTION_V42_RUNBOOK.md",
        "scripts/deploy/tidb_production_migration.py",
        "scripts/deploy/test_tidb_production_migration.py",
        "scripts/deploy/test_tidb_production_v42_migration.py",
        "scripts/deploy/test_tidb_rehearsal_v42_migration.py",
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
        "constant:EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256",
        "constant:MANAGED_STORAGE_COLUMNS",
        "constant:MANAGED_STORAGE_COLUMN_CONTRACT",
        "constant:MANAGED_STORAGE_COLUMN_SQL",
        "constant:POSTFLIGHT_LINEAGE_ALLOWED_PATHS",
        "constant:POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS",
        "constant:POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS",
        "constant:POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS",
        "constant:V42_CHECK_CONTRACT",
        "constant:V42_CHECK_METADATA_FIELD_ALIASES",
        "constant:V42_CLEANUP_COLUMN_CONTRACT",
        "constant:V42_CLEANUP_INDEX_CONTRACT",
        "constant:V42_EVENT_MEDIA_FK_CONTRACT",
        "constant:V42_EVENT_MEDIA_INDEX_CONTRACT",
        "constant:V42_FLYWAY_HISTORY_CONTRACT",
        "constant:V42_POSTFLIGHT_EVIDENCE_SCHEMA",
        "function:_check_metadata_sql",
        "function:_validate_check_metadata_sql_contract",
        "function:_cleanup_column_metadata_sql",
        "function:_expected_postflight_verification_summary",
        "function:_git_bytes",
        "function:_git_result",
        "function:_has_redundant_outer_parentheses",
        "function:_index_metadata_sql",
        "function:_load_exact_json_artifact",
        "function:_metadata_hex_field_sql",
        "function:_metadata_structured_select",
        "function:_normalise_check_expression",
        "function:_normalise_metadata_default",
        "function:_normalise_metadata_extra",
        "function:_parse_failure_timestamp",
        "function:_validate_postflight_shared_runner_blob",
        "function:_parse_metadata_record",
        "function:_parse_postflight_timestamp",
        "function:_parser",
        "function:_postflight_duplicate_key_guard",
        "function:_python_protected_contract",
        "function:_python_runner_symbol_contract",
        "function:_require_exact_lower_commit",
        "function:_session_account_matches_prefix",
        "function:_validate_check_constraints",
        "function:_validate_cleanup_table",
        "function:_validate_event_media_fk",
        "function:_validate_index_record",
        "function:_validate_postflight_changed_paths",
        "function:_validate_v42_history",
        "function:_validated_managed_storage_column_contract",
        "function:build_standalone_postflight_evidence_payload",
        "function:load_and_validate_v42_failure_inspection",
        "function:load_and_validate_v42_postflight_evidence",
        "function:main",
        "function:metadata_sql_v42_postflight_extras",
        "function:local_check",
        "function:run_postflight",
        "function:validate_postflight_release_lineage",
        "function:validate_postflight_user_prefix_binding",
        "function:validate_release_e_postflight_evidence",
        "function:validate_v42_postflight_extras",
        "function:write_and_reload_v42_postflight_evidence",
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

# Complete V42 migration-delta contracts, reviewed against
# V42__add_managed_event_image_storage.sql.  The focused source-contract tests
# below the runner keep these values bound to the immutable migration bytes.
V42_EVENT_MEDIA_INDEX_CONTRACT = (
    ("uk_event_media_managed_asset", False, ("managed_asset_id",)),
    (
        "uk_event_media_storage_identity", False,
        ("storage_provider", "storage_public_id"),
    ),
    (
        "idx_event_media_managed_read", True,
        ("event_id", "storage_state", "status", "is_thumbnail", "sort_order", "id"),
    ),
    (
        "idx_event_media_upload_expiry", True,
        ("storage_state", "upload_expires_at", "id"),
    ),
)
V42_EVENT_MEDIA_FK_CONTRACT = (
    V42_EVENT_MEDIA_FK,
    "event_media",
    ("uploaded_by",),
    "users",
    ("id",),
    "RESTRICT",
    "SET NULL",
)
V42_CLEANUP_COLUMN_CONTRACT = (
    ("id", "bigint", ("bigint", "bigint(20)"), "NO", None, None, None, None, "auto_increment"),
    ("provider", "varchar", ("varchar(32)",), "NO", None, "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("public_id", "varchar", ("varchar(255)",), "NO", None, "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("provider_asset_id", "varchar", ("varchar(255)",), "YES", None, "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("operation", "varchar", ("varchar(24)",), "NO", None, "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("task_status", "varchar", ("varchar(24)",), "NO", "PENDING", "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("attempts", "int", ("int", "int(11)"), "NO", "0", None, None, None, ""),
    ("next_attempt_at", "datetime", ("datetime(6)",), "NO", None, None, None, "6", ""),
    ("claim_token", "char", ("char(36)",), "YES", None, "ascii", "ascii_bin", None, ""),
    ("claim_expires_at", "datetime", ("datetime(6)",), "YES", None, None, None, "6", ""),
    ("last_error_code", "varchar", ("varchar(64)",), "YES", None, "utf8mb4", "utf8mb4_0900_ai_ci", None, ""),
    ("created_at", "datetime", ("datetime(6)",), "NO", "CURRENT_TIMESTAMP(6)", None, None, "6", "DEFAULT_GENERATED"),
    ("updated_at", "datetime", ("datetime(6)",), "NO", "CURRENT_TIMESTAMP(6)", None, None, "6", "DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)"),
)
V42_CLEANUP_INDEX_CONTRACT = (
    ("PRIMARY", False, ("id",)),
    (
        "uk_event_media_cleanup_identity", False,
        ("provider", "public_id", "operation"),
    ),
    (
        "idx_event_media_cleanup_claim", True,
        ("task_status", "next_attempt_at", "claim_expires_at", "id"),
    ),
)
V42_CHECK_CONTRACT = (
    (
        "chk_event_media_storage_state", "event_media",
        "storage_state IN ('UNMANAGED','UPLOADING','READY','DELETE_PENDING','DELETE_FAILED')",
    ),
    (
        "chk_event_media_storage_byte_size", "event_media",
        "storage_byte_size IS NULL OR storage_byte_size > 0",
    ),
    (
        "chk_event_media_storage_dimensions", "event_media",
        "(storage_width IS NULL AND storage_height IS NULL) OR "
        "(storage_width IS NOT NULL AND storage_height IS NOT NULL "
        "AND storage_width > 0 AND storage_height > 0)",
    ),
    (
        "chk_event_media_cleanup_operation", V42_CLEANUP_TABLE,
        "operation IN ('DELETE')",
    ),
    (
        "chk_event_media_cleanup_status", V42_CLEANUP_TABLE,
        "task_status IN ('PENDING','CLAIMED','COMPLETED','FAILED')",
    ),
    (
        "chk_event_media_cleanup_attempts", V42_CLEANUP_TABLE,
        "attempts >= 0",
    ),
)
V42_CHECK_METADATA_FIELD_ALIASES = (
    "row_count",
    "check_schema_values",
    "check_table_values",
    "check_constraint_names",
    "check_clause_values",
    "check_enforcement_values",
)
V42_METADATA_CAPABILITY_OBJECTS = (
    "COLUMNS",
    "TABLES",
    "STATISTICS",
    "TABLE_CONSTRAINTS",
    "CHECK_CONSTRAINTS",
    "TIDB_CHECK_CONSTRAINTS",
    "KEY_COLUMN_USAGE",
    "REFERENTIAL_CONSTRAINTS",
)
V42_METADATA_REQUIRED_COLUMNS = {
    "COLUMNS": frozenset(
        {
            "TABLE_SCHEMA", "TABLE_NAME", "COLUMN_NAME", "ORDINAL_POSITION",
            "DATA_TYPE", "COLUMN_TYPE", "IS_NULLABLE", "COLUMN_DEFAULT",
            "CHARACTER_SET_NAME", "COLLATION_NAME", "DATETIME_PRECISION", "EXTRA",
        }
    ),
    "TABLES": frozenset(
        {"TABLE_SCHEMA", "TABLE_NAME", "TABLE_TYPE", "ENGINE", "TABLE_COLLATION"}
    ),
    "STATISTICS": frozenset(
        {
            "TABLE_SCHEMA", "TABLE_NAME", "INDEX_NAME", "NON_UNIQUE",
            "SEQ_IN_INDEX", "COLUMN_NAME", "INDEX_TYPE",
        }
    ),
    # TiDB Serverless v8.5.3 exposes this view but neither CHECK rows nor
    # ENFORCED.  Its core shape remains inventoried; active CHECK ownership is
    # cross-bound between CHECK_CONSTRAINTS and TIDB_CHECK_CONSTRAINTS.
    "TABLE_CONSTRAINTS": frozenset(
        {"CONSTRAINT_SCHEMA", "CONSTRAINT_NAME", "TABLE_NAME", "CONSTRAINT_TYPE"}
    ),
    "CHECK_CONSTRAINTS": frozenset(
        {"CONSTRAINT_SCHEMA", "CONSTRAINT_NAME", "CHECK_CLAUSE"}
    ),
    "TIDB_CHECK_CONSTRAINTS": frozenset(
        {"CONSTRAINT_SCHEMA", "CONSTRAINT_NAME", "TABLE_NAME", "CHECK_CLAUSE"}
    ),
    "KEY_COLUMN_USAGE": frozenset(
        {
            "CONSTRAINT_SCHEMA", "CONSTRAINT_NAME", "TABLE_SCHEMA", "TABLE_NAME",
            "COLUMN_NAME", "ORDINAL_POSITION", "REFERENCED_TABLE_SCHEMA",
            "REFERENCED_TABLE_NAME", "REFERENCED_COLUMN_NAME",
        }
    ),
    "REFERENTIAL_CONSTRAINTS": frozenset(
        {
            "CONSTRAINT_SCHEMA", "CONSTRAINT_NAME", "UNIQUE_CONSTRAINT_SCHEMA",
            "UNIQUE_CONSTRAINT_NAME", "TABLE_NAME", "REFERENCED_TABLE_NAME",
            "UPDATE_RULE", "DELETE_RULE",
        }
    ),
}
V42_METADATA_ENFORCEMENT_SOURCES = (
    "TABLE_CONSTRAINTS",
    "CHECK_CONSTRAINTS",
    "TIDB_CHECK_CONSTRAINTS",
)
V42_SHOW_CREATE_TABLES = ("event_media", V42_CLEANUP_TABLE)


@dataclass(frozen=True)
class MetadataCapabilityModel:
    columns: Mapping[str, frozenset[str]]
    enforcement_sources: tuple[str, ...]
    enforcement_strategy: str

V42_FLYWAY_HISTORY_CONTRACT = {
    "version": TARGET_VERSION,
    "description": "add managed event image storage",
    "script": EXPECTED_V42_SQL_FILE,
    "checksum": "-769202000",
    "success": "1",
}
V42_POSTFLIGHT_EVIDENCE_SCHEMA = "lsvn3d.release-e.v42.postflight-evidence.v1"

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


def _validate_postflight_shared_runner_blob(source: bytes) -> None:
    if not re.fullmatch(r"[0-9a-f]{64}", EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256):
        raise ProductionRunnerError("approved shared Docker runner hash is malformed")
    actual_sha256 = hashlib.sha256(source).hexdigest()
    if not hmac.compare_digest(
        actual_sha256, EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256
    ):
        raise ProductionRunnerError(
            "shared production runner does not match the approved Docker contract"
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
    shared_runner_path = "scripts/deploy/tidb_production_migration.py"
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
        if shared_runner_path in commit_paths:
            commit_shared_runner = _git_bytes(
                repo_root, ["show", f"{commit}:{shared_runner_path}"],
                f"shared Docker runner contract at {commit}",
            )
            _validate_postflight_shared_runner_blob(commit_shared_runner)
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
# TiDB metadata capability contract
# ============================================================================


_TIDB_V853_OBSERVED_METADATA_COLUMNS = {
    "COLUMNS": "TABLE_CATALOG TABLE_SCHEMA TABLE_NAME COLUMN_NAME ORDINAL_POSITION COLUMN_DEFAULT IS_NULLABLE DATA_TYPE CHARACTER_MAXIMUM_LENGTH CHARACTER_OCTET_LENGTH NUMERIC_PRECISION NUMERIC_SCALE DATETIME_PRECISION CHARACTER_SET_NAME COLLATION_NAME COLUMN_TYPE COLUMN_KEY EXTRA PRIVILEGES COLUMN_COMMENT GENERATION_EXPRESSION",
    "TABLES": "TABLE_CATALOG TABLE_SCHEMA TABLE_NAME TABLE_TYPE ENGINE VERSION ROW_FORMAT TABLE_ROWS AVG_ROW_LENGTH DATA_LENGTH MAX_DATA_LENGTH INDEX_LENGTH DATA_FREE AUTO_INCREMENT CREATE_TIME UPDATE_TIME CHECK_TIME TABLE_COLLATION CHECKSUM CREATE_OPTIONS TABLE_COMMENT TIDB_TABLE_ID TIDB_ROW_ID_SHARDING_INFO TIDB_PK_TYPE TIDB_PLACEMENT_POLICY_NAME TIDB_STORAGE_CLASS",
    "STATISTICS": "TABLE_CATALOG TABLE_SCHEMA TABLE_NAME NON_UNIQUE INDEX_SCHEMA INDEX_NAME SEQ_IN_INDEX COLUMN_NAME COLLATION CARDINALITY SUB_PART PACKED NULLABLE INDEX_TYPE COMMENT INDEX_COMMENT IS_VISIBLE EXPRESSION",
    "TABLE_CONSTRAINTS": "CONSTRAINT_CATALOG CONSTRAINT_SCHEMA CONSTRAINT_NAME TABLE_SCHEMA TABLE_NAME CONSTRAINT_TYPE",
    "CHECK_CONSTRAINTS": "CONSTRAINT_CATALOG CONSTRAINT_SCHEMA CONSTRAINT_NAME CHECK_CLAUSE",
    "TIDB_CHECK_CONSTRAINTS": "CONSTRAINT_CATALOG CONSTRAINT_SCHEMA CONSTRAINT_NAME CHECK_CLAUSE TABLE_NAME TABLE_ID",
    "KEY_COLUMN_USAGE": "CONSTRAINT_CATALOG CONSTRAINT_SCHEMA CONSTRAINT_NAME TABLE_CATALOG TABLE_SCHEMA TABLE_NAME COLUMN_NAME ORDINAL_POSITION POSITION_IN_UNIQUE_CONSTRAINT REFERENCED_TABLE_SCHEMA REFERENCED_TABLE_NAME REFERENCED_COLUMN_NAME",
    "REFERENTIAL_CONSTRAINTS": "CONSTRAINT_CATALOG CONSTRAINT_SCHEMA CONSTRAINT_NAME UNIQUE_CONSTRAINT_CATALOG UNIQUE_CONSTRAINT_SCHEMA UNIQUE_CONSTRAINT_NAME MATCH_OPTION UPDATE_RULE DELETE_RULE TABLE_NAME REFERENCED_TABLE_NAME",
}


def metadata_capability_sql_v42() -> str:
    """Return the single bounded information_schema.columns capability probe."""
    names = ",".join(f"'{name}'" for name in V42_METADATA_CAPABILITY_OBJECTS)
    return (
        "SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE "
        "FROM information_schema.columns "
        "WHERE LOWER(TABLE_SCHEMA)='information_schema' "
        f"AND UPPER(TABLE_NAME) IN ({names}) "
        "ORDER BY UPPER(TABLE_NAME),ORDINAL_POSITION,COLUMN_NAME;\n"
    )


def validate_metadata_capabilities(
    columns: Mapping[str, frozenset[str]],
) -> MetadataCapabilityModel:
    if set(columns) != set(V42_METADATA_CAPABILITY_OBJECTS):
        raise ProductionRunnerError("TiDB metadata capability table set is not exact")
    normalised: dict[str, frozenset[str]] = {}
    for table in V42_METADATA_CAPABILITY_OBJECTS:
        observed = columns.get(table)
        if not isinstance(observed, frozenset) or not observed:
            raise ProductionRunnerError(
                f"TiDB metadata capability table is missing: {table}"
            )
        if any(not re.fullmatch(r"[A-Z][A-Z0-9_]*", value) for value in observed):
            raise ProductionRunnerError(
                f"TiDB metadata capability column is malformed for {table}"
            )
        missing = V42_METADATA_REQUIRED_COLUMNS[table] - observed
        if missing:
            raise ProductionRunnerError(
                f"TiDB metadata capability is missing required columns for {table}: "
                f"{sorted(missing)}"
            )
        normalised[table] = observed
    enforcement_sources = tuple(
        table
        for table in V42_METADATA_ENFORCEMENT_SOURCES
        if "ENFORCED" in normalised[table]
    )
    return MetadataCapabilityModel(
        columns=normalised,
        enforcement_sources=enforcement_sources,
        enforcement_strategy="direct" if enforcement_sources else "show_create",
    )


def observed_tidb_v853_metadata_capabilities() -> MetadataCapabilityModel:
    return validate_metadata_capabilities(
        {
            table: frozenset(value.split())
            for table, value in _TIDB_V853_OBSERVED_METADATA_COLUMNS.items()
        }
    )


def parse_metadata_capability_rows(output: str) -> MetadataCapabilityModel:
    rows: dict[str, list[tuple[int, str]]] = {
        table: [] for table in V42_METADATA_CAPABILITY_OBJECTS
    }
    seen: set[tuple[str, str]] = set()
    previous: tuple[str, int, str] | None = None
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != 6:
            raise ProductionRunnerError("TiDB metadata capability row is malformed")
        raw_table, raw_column, raw_ordinal, data_type, column_type, nullable = parts
        table = raw_table.upper()
        column = raw_column.upper()
        if table not in rows or not re.fullmatch(r"[A-Z][A-Z0-9_]*", column):
            raise ProductionRunnerError("TiDB metadata capability row is unexpected")
        if not re.fullmatch(r"[1-9][0-9]*", raw_ordinal):
            raise ProductionRunnerError("TiDB metadata capability ordinal is malformed")
        if (
            not data_type.strip()
            or not column_type.strip()
            or nullable.upper() not in {"YES", "NO"}
        ):
            raise ProductionRunnerError("TiDB metadata capability type shape is malformed")
        key = (table, column)
        if key in seen:
            raise ProductionRunnerError("TiDB metadata capability row is duplicated")
        seen.add(key)
        ordinal = int(raw_ordinal)
        ordering = (table, ordinal, column)
        if previous is not None and ordering <= previous:
            raise ProductionRunnerError("TiDB metadata capability ordering is invalid")
        previous = ordering
        rows[table].append((ordinal, column))
    return validate_metadata_capabilities(
        {
            table: frozenset(column for _ordinal, column in values)
            for table, values in rows.items()
        }
    )


# ============================================================================
# V42 metadata SQL (extends base.build_metadata_sql)
# ============================================================================


def _metadata_hex_field_sql(expression: str) -> str:
    """Encode a nullable SQL scalar without delimiter ambiguity."""
    return (
        f"HEX(IF(({expression}) IS NULL,'~',"
        f"CONCAT('=',CAST(({expression}) AS CHAR))))"
    )


def _metadata_structured_select(
    key: str, fields: Sequence[str], source_sql: str
) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_]*", key):
        raise ProductionRunnerError("structured metadata key is invalid")
    encoded = ",".join(_metadata_hex_field_sql(field) for field in fields)
    return f"SELECT '{key}', CONCAT_WS(':',{encoded}) {source_sql};\n"


def _index_metadata_sql(*, key: str, table: str, index: str) -> str:
    for label, value in (("table", table), ("index", index)):
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", value):
            raise ProductionRunnerError(f"V42 {label} contract contains an invalid name")
    source = (
        "FROM (SELECT COUNT(*) row_count,COUNT(DISTINCT seq_in_index) sequence_count,"
        "GROUP_CONCAT(DISTINCT table_name) table_names,"
        "GROUP_CONCAT(DISTINCT index_name) index_names,"
        "GROUP_CONCAT(DISTINCT CAST(non_unique AS CHAR)) non_unique_values,"
        "GROUP_CONCAT(DISTINCT index_type) index_types,"
        "GROUP_CONCAT(CAST(seq_in_index AS CHAR) ORDER BY seq_in_index SEPARATOR ',') sequences,"
        "GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') columns "
        "FROM information_schema.statistics WHERE table_schema=DATABASE() "
        f"AND table_name='{table}' AND index_name='{index}') contract"
    )
    return _metadata_structured_select(
        key,
        (
            "row_count", "sequence_count", "table_names", "index_names",
            "non_unique_values", "index_types", "sequences", "columns",
        ),
        source,
    )


def _cleanup_column_metadata_sql(column: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_]*", column):
        raise ProductionRunnerError("V42 cleanup column contract contains an invalid name")
    source = (
        "FROM (SELECT COUNT(*) row_count,MIN(table_name) table_name,"
        "MIN(column_name) column_name,MIN(ordinal_position) ordinal_position,"
        "MIN(data_type) data_type,MIN(column_type) column_type,"
        "MIN(is_nullable) is_nullable,MIN(CAST(column_default AS CHAR)) column_default,"
        "MIN(character_set_name) character_set_name,MIN(collation_name) collation_name,"
        "MIN(CAST(datetime_precision AS CHAR)) datetime_precision,MIN(extra) extra "
        "FROM information_schema.columns WHERE table_schema=DATABASE() "
        f"AND table_name='{V42_CLEANUP_TABLE}' AND column_name='{column}') contract"
    )
    return _metadata_structured_select(
        f"v42_cleanup_column_{column}",
        (
            "row_count", "table_name", "column_name", "ordinal_position", "data_type",
            "column_type", "is_nullable", "column_default", "character_set_name",
            "collation_name", "datetime_precision", "extra",
        ),
        source,
    )


def _check_metadata_sql(
    *, key: str, constraint: str, table: str, tidb_view: bool,
    capabilities: MetadataCapabilityModel,
) -> str:
    for label, value in (("constraint", constraint), ("table", table)):
        if not re.fullmatch(r"[a-z][a-z0-9_]*", value):
            raise ProductionRunnerError(
                f"V42 CHECK {label} contract contains an invalid name"
            )
    if tidb_view:
        enforcement_expression = (
            "GROUP_CONCAT(DISTINCT tcc.ENFORCED)"
            if "TIDB_CHECK_CONSTRAINTS" in capabilities.enforcement_sources
            else "GROUP_CONCAT(NULL)"
        )
        source = (
            "FROM (SELECT COUNT(*) AS row_count,"
            "GROUP_CONCAT(DISTINCT tcc.CONSTRAINT_SCHEMA) AS check_schema_values,"
            "GROUP_CONCAT(DISTINCT tcc.TABLE_NAME) AS check_table_values,"
            "GROUP_CONCAT(DISTINCT tcc.CONSTRAINT_NAME) AS check_constraint_names,"
            "GROUP_CONCAT(tcc.CHECK_CLAUSE ORDER BY tcc.CONSTRAINT_NAME SEPARATOR '') "
            "AS check_clause_values,"
            f"{enforcement_expression} AS check_enforcement_values "
            "FROM information_schema.TIDB_CHECK_CONSTRAINTS tcc "
            "WHERE tcc.CONSTRAINT_SCHEMA=DATABASE() "
            f"AND tcc.TABLE_NAME='{table}' AND tcc.CONSTRAINT_NAME='{constraint}') contract"
        )
    else:
        standard_sources = tuple(
            source
            for source in ("CHECK_CONSTRAINTS", "TABLE_CONSTRAINTS")
            if source in capabilities.enforcement_sources
        )
        join_table_constraints = "TABLE_CONSTRAINTS" in standard_sources
        if len(standard_sources) == 2:
            enforcement_expression = (
                "GROUP_CONCAT(DISTINCT CONCAT_WS(',',cc.ENFORCED,tc.ENFORCED) "
                "ORDER BY cc.CONSTRAINT_NAME SEPARATOR ',')"
            )
        elif standard_sources == ("CHECK_CONSTRAINTS",):
            enforcement_expression = "GROUP_CONCAT(DISTINCT cc.ENFORCED)"
        elif standard_sources == ("TABLE_CONSTRAINTS",):
            enforcement_expression = "GROUP_CONCAT(DISTINCT tc.ENFORCED)"
        else:
            enforcement_expression = "GROUP_CONCAT(NULL)"
        table_expression = (
            "GROUP_CONCAT(DISTINCT tc.TABLE_NAME)"
            if join_table_constraints
            else "GROUP_CONCAT(NULL)"
        )
        join_sql = (
            "JOIN information_schema.TABLE_CONSTRAINTS tc "
            "ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA "
            "AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME "
            "AND tc.CONSTRAINT_TYPE='CHECK' "
            f"AND tc.TABLE_NAME='{table}' "
            if join_table_constraints
            else ""
        )
        source = (
            "FROM (SELECT COUNT(*) AS row_count,"
            "GROUP_CONCAT(DISTINCT cc.CONSTRAINT_SCHEMA) AS check_schema_values,"
            f"{table_expression} AS check_table_values,"
            "GROUP_CONCAT(DISTINCT cc.CONSTRAINT_NAME) AS check_constraint_names,"
            "GROUP_CONCAT(cc.CHECK_CLAUSE ORDER BY cc.CONSTRAINT_NAME SEPARATOR '') "
            "AS check_clause_values,"
            f"{enforcement_expression} AS check_enforcement_values "
            "FROM information_schema.CHECK_CONSTRAINTS cc "
            f"{join_sql}"
            "WHERE cc.CONSTRAINT_SCHEMA=DATABASE() "
            f"AND cc.CONSTRAINT_NAME='{constraint}') contract"
        )
    return _metadata_structured_select(
        key, V42_CHECK_METADATA_FIELD_ALIASES, source
    )


def _validate_check_metadata_sql_contract(
    sql: str, capabilities: MetadataCapabilityModel | None = None,
) -> dict[str, Any]:
    """Fail closed on the final generated CHECK-metadata SELECT structure."""
    if not isinstance(sql, str) or not sql:
        raise ProductionRunnerError("V42 CHECK metadata SQL is missing")
    model = capabilities or observed_tidb_v853_metadata_capabilities()
    expected: list[str] = []
    for constraint, table, _expression in V42_CHECK_CONTRACT:
        expected.extend(
            (
                _check_metadata_sql(
                    key=f"v42_check_{constraint}", constraint=constraint,
                    table=table, tidb_view=False, capabilities=model,
                ).rstrip(";\n"),
                _check_metadata_sql(
                    key=f"v42_tidb_check_{constraint}", constraint=constraint,
                    table=table, tidb_view=True, capabilities=model,
                ).rstrip(";\n"),
            )
        )
    statements = [
        line[:-1]
        for line in sql.splitlines()
        if line.startswith("SELECT 'v42_check_")
        or line.startswith("SELECT 'v42_tidb_check_")
        if line.endswith(";")
    ]
    if statements != expected:
        raise ProductionRunnerError("V42 CHECK metadata statement set is not exact")
    for statement in statements:
        if statement.count("(") != statement.count(")"):
            raise ProductionRunnerError("V42 CHECK metadata parentheses are unbalanced")
        for alias in V42_CHECK_METADATA_FIELD_ALIASES:
            if statement.count(f" AS {alias}") != 1:
                raise ProductionRunnerError(
                    "V42 CHECK metadata aliases do not match the parser contract"
                )
    if re.search(
        r"(?i)\s(?:schemas|tables|names|clauses|enforced_values)(?:,|\s+FROM)",
        "\n".join(statements),
    ):
        raise ProductionRunnerError("V42 CHECK metadata contains an unsafe legacy alias")
    for source in V42_METADATA_ENFORCEMENT_SOURCES:
        if "ENFORCED" not in model.columns[source]:
            alias = {
                "TABLE_CONSTRAINTS": "tc",
                "CHECK_CONSTRAINTS": "cc",
                "TIDB_CHECK_CONSTRAINTS": "tcc",
            }[source]
            if re.search(rf"(?i)\b{alias}\.ENFORCED\b", "\n".join(statements)):
                raise ProductionRunnerError(
                    f"V42 CHECK SQL references unsupported {source}.ENFORCED"
                )
    return {
        "statement_count": len(statements),
        "aliases": list(V42_CHECK_METADATA_FIELD_ALIASES),
        "constraint_count": len(V42_CHECK_CONTRACT),
        "view_count": 2,
        "enforcement_strategy": model.enforcement_strategy,
    }


def metadata_sql_v42_postflight_extras(
    capabilities: MetadataCapabilityModel | None = None,
) -> str:
    """Extra read-only SELECTs verifying V42 schema footprint + preflight identity binding."""
    model = capabilities or observed_tidb_v853_metadata_capabilities()
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
    sql = (
        "SELECT 'session_user', CURRENT_USER();\n"
        "SELECT 'session_login_user', USER();\n"
        "SELECT 'postflight_identity_sentinel', 1;\n"
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
        # TiDB CHECK engine flag (must remain '1').
        "SELECT 'tidb_enable_check_constraint', @@global.tidb_enable_check_constraint;\n"
        "SELECT 'v42_above_rows', COUNT(*) FROM flyway_schema_history "
        "WHERE version IS NOT NULL AND installed_rank>(SELECT COALESCE(MAX(installed_rank),0) "
        "FROM flyway_schema_history WHERE version='42');\n"
        # event_media bounded count.
        "SELECT 'event_media_total', (SELECT COUNT(*) FROM event_media);\n"
    )
    for name, _non_unique, _columns in V42_EVENT_MEDIA_INDEX_CONTRACT:
        sql += _index_metadata_sql(
            key=f"v42_event_media_index_{name}", table="event_media", index=name
        )
    fk_source = (
        "FROM (SELECT COUNT(*) row_count,COUNT(DISTINCT kcu.ORDINAL_POSITION) sequence_count,"
        "GROUP_CONCAT(DISTINCT kcu.CONSTRAINT_NAME) names,"
        "GROUP_CONCAT(DISTINCT kcu.TABLE_NAME) source_tables,"
        "GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ',') source_columns,"
        "GROUP_CONCAT(DISTINCT kcu.REFERENCED_TABLE_NAME) referenced_tables,"
        "GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ',') referenced_columns,"
        "GROUP_CONCAT(DISTINCT rc.UPDATE_RULE) update_rules,"
        "GROUP_CONCAT(DISTINCT rc.DELETE_RULE) delete_rules "
        "FROM information_schema.KEY_COLUMN_USAGE kcu "
        "JOIN information_schema.REFERENTIAL_CONSTRAINTS rc "
        "ON rc.CONSTRAINT_SCHEMA=kcu.CONSTRAINT_SCHEMA "
        "AND rc.CONSTRAINT_NAME=kcu.CONSTRAINT_NAME "
        "WHERE kcu.CONSTRAINT_SCHEMA=DATABASE() AND kcu.TABLE_NAME='event_media' "
        f"AND kcu.CONSTRAINT_NAME='{V42_EVENT_MEDIA_FK}') contract"
    )
    sql += _metadata_structured_select(
        "v42_event_media_fk_uploaded_by",
        (
            "row_count", "sequence_count", "names", "source_tables", "source_columns",
            "referenced_tables", "referenced_columns", "update_rules", "delete_rules",
        ),
        fk_source,
    )
    cleanup_table_source = (
        "FROM (SELECT COUNT(*) row_count,MIN(TABLE_NAME) table_name,"
        "MIN(TABLE_TYPE) table_type,MIN(ENGINE) engine,MIN(TABLE_COLLATION) table_collation "
        "FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() "
        f"AND TABLE_NAME='{V42_CLEANUP_TABLE}') contract"
    )
    sql += _metadata_structured_select(
        "v42_cleanup_table_contract",
        ("row_count", "table_name", "table_type", "engine", "table_collation"),
        cleanup_table_source,
    )
    for column, *_definition in V42_CLEANUP_COLUMN_CONTRACT:
        sql += _cleanup_column_metadata_sql(column)
    sql += (
        "SELECT 'v42_cleanup_column_count', COUNT(*) FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='{V42_CLEANUP_TABLE}';\n"
    )
    for name, _non_unique, _columns in V42_CLEANUP_INDEX_CONTRACT:
        sql += _index_metadata_sql(
            key=f"v42_cleanup_index_{name.lower()}",
            table=V42_CLEANUP_TABLE,
            index=name,
        )
    sql += (
        "SELECT 'v42_cleanup_index_count', COUNT(DISTINCT INDEX_NAME) "
        "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() "
        f"AND TABLE_NAME='{V42_CLEANUP_TABLE}';\n"
        "SELECT 'v42_cleanup_check_count', COUNT(*) "
        "FROM information_schema.TIDB_CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() "
        f"AND TABLE_NAME='{V42_CLEANUP_TABLE}';\n"
        "SELECT 'v42_cleanup_foreign_keys', COUNT(*) "
        "FROM information_schema.REFERENTIAL_CONSTRAINTS "
        f"WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='{V42_CLEANUP_TABLE}';\n"
        f"SELECT 'v42_cleanup_initial_rows', COUNT(*) FROM {V42_CLEANUP_TABLE};\n"
    )
    for name, table, _expression in V42_CHECK_CONTRACT:
        sql += _check_metadata_sql(
            key=f"v42_check_{name}", constraint=name, table=table,
            tidb_view=False, capabilities=model,
        )
        sql += _check_metadata_sql(
            key=f"v42_tidb_check_{name}", constraint=name, table=table,
            tidb_view=True, capabilities=model,
        )
    history_source = (
        "FROM (SELECT COUNT(*) row_count,"
        "GROUP_CONCAT(DISTINCT version) versions,"
        "GROUP_CONCAT(DISTINCT description) descriptions,"
        "GROUP_CONCAT(DISTINCT script) scripts,"
        "GROUP_CONCAT(DISTINCT CAST(checksum AS CHAR)) checksums,"
        "GROUP_CONCAT(DISTINCT CAST(success AS CHAR)) success_values "
        "FROM flyway_schema_history WHERE version='42') contract"
    )
    sql += _metadata_structured_select(
        "v42_history_contract",
        (
            "row_count", "versions", "descriptions", "scripts", "checksums",
            "success_values",
        ),
        history_source,
    )
    _validate_check_metadata_sql_contract(sql, model)
    return sql


def validate_generated_metadata_sql_compatibility(
    capabilities: MetadataCapabilityModel | None = None,
) -> dict[str, Any]:
    """Build every SQL path against one reviewed, immutable capability model."""
    model = capabilities or observed_tidb_v853_metadata_capabilities()
    capability_sql = metadata_capability_sql_v42()
    if "SELECT *" in capability_sql.upper():
        raise ProductionRunnerError("metadata capability probe may not use SELECT *")
    if capability_sql.count("information_schema.columns") != 1:
        raise ProductionRunnerError("metadata capability probe surface is not exact")
    for table in V42_METADATA_CAPABILITY_OBJECTS:
        if f"'{table}'" not in capability_sql:
            raise ProductionRunnerError(
                f"metadata capability probe omits reviewed object {table}"
            )
    base._read_only_sql_statements(capability_sql)
    generated = (
        base.build_metadata_sql(postflight=True)
        + metadata_sql_v42_postflight_extras(model)
    )
    base._read_only_sql_statements(generated)
    keys = re.findall(r"(?m)^SELECT '([a-z][a-z0-9_]*)',", generated)
    if len(keys) != len(set(keys)):
        raise ProductionRunnerError("generated metadata output key is duplicated")
    check_contract = _validate_check_metadata_sql_contract(generated, model)
    for table, required in V42_METADATA_REQUIRED_COLUMNS.items():
        if not required.issubset(model.columns[table]):
            raise ProductionRunnerError(
                f"generated SQL capability model is incomplete for {table}"
            )
    if "TABLE_CONSTRAINTS" not in model.enforcement_sources:
        if re.search(r"(?i)\btc\.ENFORCED\b", generated):
            raise ProductionRunnerError(
                "generated SQL references absent TABLE_CONSTRAINTS.ENFORCED"
            )
        if "JOIN information_schema.TABLE_CONSTRAINTS tc" in generated:
            raise ProductionRunnerError(
                "generated CHECK SQL depends on unavailable TiDB TABLE_CONSTRAINTS rows"
            )
    return {
        "capability_object_count": len(V42_METADATA_CAPABILITY_OBJECTS),
        "capability_query_count": 1,
        "metadata_statement_count": len(
            [statement for statement in generated.split(";\n") if statement]
        ),
        "output_key_count": len(keys),
        "check_statement_count": check_contract["statement_count"],
        "enforcement_strategy": model.enforcement_strategy,
        "unsupported_reference_count": 0,
    }


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


def _parse_metadata_record(
    value: str | None, *, key: str, fields: Sequence[str]
) -> tuple[str | None, ...]:
    expected_fields = tuple(fields)
    if (
        not expected_fields
        or len(set(expected_fields)) != len(expected_fields)
        or any(
            not re.fullmatch(r"[a-z][a-z0-9_]*", field)
            for field in expected_fields
        )
    ):
        raise ProductionRunnerError(f"V42 structured metadata field contract is invalid for {key}")
    if not isinstance(value, str) or not value:
        raise ProductionRunnerError(f"V42 structured metadata is missing for {key}")
    tokens = value.split(":")
    if len(tokens) != len(expected_fields) or any(
        not re.fullmatch(r"[0-9A-Fa-f]+", token) for token in tokens
    ):
        raise ProductionRunnerError(f"V42 structured metadata is malformed for {key}")
    decoded_fields: list[str | None] = []
    for token in tokens:
        try:
            decoded = bytes.fromhex(token).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ProductionRunnerError(
                f"V42 structured metadata is malformed for {key}"
            ) from exc
        if decoded == "~":
            decoded_fields.append(None)
        elif decoded.startswith("="):
            decoded_fields.append(decoded[1:])
        else:
            raise ProductionRunnerError(f"V42 structured metadata is malformed for {key}")
    return tuple(decoded_fields)


def _validate_index_record(
    metadata: Mapping[str, str], *, key: str, table: str,
    name: str, non_unique: bool, columns: Sequence[str],
) -> dict[str, Any]:
    record = _parse_metadata_record(
        metadata.get(key),
        key=key,
        fields=(
            "row_count", "sequence_count", "table_names", "index_names",
            "non_unique_values", "index_types", "sequences", "columns",
        ),
    )
    expected_count = str(len(columns))
    expected_sequences = ",".join(str(value) for value in range(1, len(columns) + 1))
    expected = (
        expected_count, expected_count, table, name, "1" if non_unique else "0",
        "BTREE", expected_sequences, ",".join(columns),
    )
    observed = tuple(value.upper() if index == 5 and value is not None else value
                     for index, value in enumerate(record))
    if observed != expected:
        raise ProductionRunnerError(f"V42 index contract mismatch for {name}")
    return {
        "name": name,
        "table": table,
        "columns": list(columns),
        "unique": not non_unique,
        "index_type": "BTREE",
    }


def _validate_event_media_fk(metadata: Mapping[str, str]) -> dict[str, Any]:
    key = "v42_event_media_fk_uploaded_by"
    record = _parse_metadata_record(
        metadata.get(key),
        key=key,
        fields=(
            "row_count", "sequence_count", "names", "source_tables",
            "source_columns", "referenced_tables", "referenced_columns",
            "update_rules", "delete_rules",
        ),
    )
    name, table, source_columns, referenced_table, referenced_columns, update, delete = (
        V42_EVENT_MEDIA_FK_CONTRACT
    )
    update_observed = "RESTRICT" if record[7] == "NO ACTION" else record[7]
    expected = (
        str(len(source_columns)), str(len(source_columns)), name, table,
        ",".join(source_columns), referenced_table, ",".join(referenced_columns),
        update, delete,
    )
    observed = (*record[:7], update_observed, record[8])
    if observed != expected:
        raise ProductionRunnerError(f"V42 foreign-key contract mismatch for {name}")
    return {
        "name": name,
        "source_table": table,
        "source_columns": list(source_columns),
        "referenced_table": referenced_table,
        "referenced_columns": list(referenced_columns),
        "update_rule": update,
        "delete_rule": delete,
    }


def _normalise_metadata_default(value: str | None) -> str | None:
    if value is None:
        return None
    return re.sub(r"\s+", " ", value.strip()).upper()


def _normalise_metadata_extra(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _validate_cleanup_table(metadata: Mapping[str, str]) -> dict[str, Any]:
    table_record = _parse_metadata_record(
        metadata.get("v42_cleanup_table_contract"),
        key="v42_cleanup_table_contract",
        fields=("row_count", "table_name", "table_type", "engine", "table_collation"),
    )
    table_observed = tuple(
        value.upper() if index in (2, 3) and value is not None else value
        for index, value in enumerate(table_record)
    )
    if table_observed != (
        "1", V42_CLEANUP_TABLE, "BASE TABLE", "INNODB", "utf8mb4_0900_ai_ci"
    ):
        raise ProductionRunnerError("V42 cleanup-table identity contract mismatch")
    if metadata.get("v42_cleanup_column_count") != str(
        len(V42_CLEANUP_COLUMN_CONTRACT)
    ):
        raise ProductionRunnerError("V42 cleanup-table column set is not exact")

    for ordinal, definition in enumerate(V42_CLEANUP_COLUMN_CONTRACT, start=1):
        (
            name, data_type, column_types, nullable, default, charset, collation,
            precision, extra,
        ) = definition
        key = f"v42_cleanup_column_{name}"
        record = _parse_metadata_record(
            metadata.get(key),
            key=key,
            fields=(
                "row_count", "table_name", "column_name", "ordinal_position",
                "data_type", "column_type", "is_nullable", "column_default",
                "character_set_name", "collation_name", "datetime_precision",
                "extra",
            ),
        )
        if record[0] != "1" or record[1] != V42_CLEANUP_TABLE or record[2] != name:
            raise ProductionRunnerError(f"V42 cleanup column identity mismatch for {name}")
        if record[3] != str(ordinal):
            raise ProductionRunnerError(f"V42 cleanup column order mismatch for {name}")
        if (record[4] or "").casefold() != data_type:
            raise ProductionRunnerError(f"V42 cleanup column data type mismatch for {name}")
        if (record[5] or "").casefold() not in column_types:
            raise ProductionRunnerError(f"V42 cleanup column type mismatch for {name}")
        if record[6] != nullable:
            raise ProductionRunnerError(f"V42 cleanup column nullability mismatch for {name}")
        if _normalise_metadata_default(record[7]) != _normalise_metadata_default(default):
            raise ProductionRunnerError(f"V42 cleanup column default mismatch for {name}")
        if (record[8] or None) != charset or (record[9] or None) != collation:
            raise ProductionRunnerError(f"V42 cleanup column charset contract mismatch for {name}")
        if (record[10] or None) != precision:
            raise ProductionRunnerError(f"V42 cleanup column precision mismatch for {name}")
        if _normalise_metadata_extra(record[11]) != _normalise_metadata_extra(extra):
            raise ProductionRunnerError(f"V42 cleanup column extra attributes mismatch for {name}")

    indexes = []
    for name, non_unique, columns in V42_CLEANUP_INDEX_CONTRACT:
        indexes.append(
            _validate_index_record(
                metadata,
                key=f"v42_cleanup_index_{name.lower()}",
                table=V42_CLEANUP_TABLE,
                name=name,
                non_unique=non_unique,
                columns=columns,
            )
        )
    if metadata.get("v42_cleanup_index_count") != str(len(V42_CLEANUP_INDEX_CONTRACT)):
        raise ProductionRunnerError("V42 cleanup-table index set is not exact")
    if metadata.get("v42_cleanup_check_count") != str(len(V42_CLEANUP_CONSTRAINTS)):
        raise ProductionRunnerError("V42 cleanup-table CHECK set is not exact")
    if metadata.get("v42_cleanup_foreign_keys") != "0":
        raise ProductionRunnerError("V42 cleanup table must have exactly zero foreign keys")
    if metadata.get("v42_cleanup_initial_rows") != "0":
        raise ProductionRunnerError("V42 cleanup table initial row count must be zero")
    return {
        "name": V42_CLEANUP_TABLE,
        "columns": [definition[0] for definition in V42_CLEANUP_COLUMN_CONTRACT],
        "indexes": indexes,
        "foreign_key_count": 0,
        "initial_row_count": 0,
    }


def _has_redundant_outer_parentheses(expression: str) -> bool:
    if len(expression) < 2 or expression[0] != "(" or expression[-1] != ")":
        return False
    depth = 0
    quoted = False
    index = 0
    while index < len(expression):
        char = expression[index]
        if char == "'":
            if quoted and index + 1 < len(expression) and expression[index + 1] == "'":
                index += 2
                continue
            quoted = not quoted
        elif not quoted:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and index != len(expression) - 1:
                    return False
                if depth < 0:
                    return False
        index += 1
    return not quoted and depth == 0


def _normalise_check_expression(expression: str) -> str:
    if not isinstance(expression, str) or not expression.strip():
        raise ProductionRunnerError("V42 CHECK expression metadata is missing")
    result: list[str] = []
    quoted = False
    index = 0
    text = expression.strip()
    while index < len(text):
        char = text[index]
        if char == "'":
            result.append(char)
            if quoted and index + 1 < len(text) and text[index + 1] == "'":
                result.append("'")
                index += 2
                continue
            quoted = not quoted
        elif quoted:
            result.append(char)
        elif char == "`":
            pass
        elif char.isspace():
            pass
        else:
            result.append(char.casefold())
        index += 1
    if quoted:
        raise ProductionRunnerError("V42 CHECK expression metadata is malformed")
    normalised = "".join(result)
    normalised = re.sub(r"_utf8mb4(?=')", "", normalised)
    while _has_redundant_outer_parentheses(normalised):
        normalised = normalised[1:-1]
    return normalised


def v42_show_create_sql() -> str:
    return (
        "SHOW CREATE TABLE `event_media`;\n"
        f"SHOW CREATE TABLE `{V42_CLEANUP_TABLE}`;\n"
    )


def _build_v42_show_create_payload(
    *, host: str, port: int, database: str, user: str, password: str,
) -> str:
    """Build a stdin-only payload for the two reviewed SHOW CREATE statements."""
    host = base._require_text(host, "host")
    database = base._require_text(database, "database")
    user = base._require_text(user, "database user")
    password = base._require_secret(password, "database password")
    sql = v42_show_create_sql()
    if sql != (
        "SHOW CREATE TABLE `event_media`;\n"
        "SHOW CREATE TABLE `event_media_storage_cleanup_tasks`;\n"
    ):
        raise ProductionRunnerError("V42 SHOW CREATE SQL is not the reviewed exact query")
    if base.SQL_MARKER in password:
        raise ProductionRunnerError("reserved SQL payload marker was supplied")
    config = "\n".join(
        (
            "[client]",
            f"host={host}",
            f"port={base._parse_port(port)}",
            f"user={base._escape_mysql_option(user)}",
            f"password={base._escape_mysql_option(password)}",
            f"database={database}",
            "ssl-mode=VERIFY_IDENTITY",
            f"ssl-ca={base.MYSQL_CA_BUNDLE}",
            "tls-version=TLSv1.2,TLSv1.3",
            "",
        )
    )
    return config + base.SQL_MARKER + "\n" + sql


def _build_v42_show_create_command(*, image_ref: str) -> list[str]:
    """Reuse the trusted resolver while preserving escaped one-row DDL output."""
    command = base.build_mysql_command(image_ref=image_ref)
    raw_client = (
        'mysql --defaults-extra-file="$c" --connect-timeout=15 '
        '--batch --raw --skip-column-names < "$q"'
    )
    escaped_client = (
        'mysql --defaults-extra-file="$c" --connect-timeout=15 '
        '--batch --skip-column-names < "$q"'
    )
    if len(command) < 2 or command[-1].count(raw_client) != 1:
        raise ProductionRunnerError("trusted MySQL command contract changed")
    command[-1] = command[-1].replace(raw_client, escaped_client)
    return command


def _extract_show_create_check_expression(ddl: str, constraint: str) -> str:
    marker = re.compile(
        r"CONSTRAINT\s+`?" + re.escape(constraint) + r"`?\s+CHECK\s*\(",
        re.IGNORECASE,
    )
    matches = list(marker.finditer(ddl))
    if len(matches) != 1:
        raise ProductionRunnerError(
            f"SHOW CREATE CHECK declaration is missing or duplicated for {constraint}"
        )
    start = matches[0].end() - 1
    depth = 0
    quoted: str | None = None
    index = start
    while index < len(ddl):
        char = ddl[index]
        if quoted is not None:
            if char == quoted:
                if index + 1 < len(ddl) and ddl[index + 1] == quoted:
                    index += 2
                    continue
                quoted = None
        elif char in "'\"`":
            quoted = char
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                suffix = ddl[index + 1:]
                suffix_match = re.match(
                    r"\s*(?:(NOT\s+)?ENFORCED)?\s*"
                    r"(?=,\\n|\\n\)|,\s*CONSTRAINT|\))",
                    suffix,
                    re.IGNORECASE,
                )
                if suffix_match is None:
                    raise ProductionRunnerError(
                        f"SHOW CREATE CHECK terminator is ambiguous for {constraint}"
                    )
                if suffix_match.group(1):
                    raise ProductionRunnerError(
                        f"SHOW CREATE reports NOT ENFORCED for {constraint}"
                    )
                return ddl[start + 1:index]
            if depth < 0:
                break
        index += 1
    raise ProductionRunnerError(
        f"SHOW CREATE CHECK expression is malformed for {constraint}"
    )


def parse_v42_show_create_output(output: str) -> dict[str, str]:
    ddls: dict[str, str] = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 1)
        if (
            len(parts) != 2
            or parts[0] not in V42_SHOW_CREATE_TABLES
            or parts[0] in ddls
        ):
            raise ProductionRunnerError("V42 SHOW CREATE output row is unexpected")
        ddls[parts[0]] = parts[1]
    if set(ddls) != set(V42_SHOW_CREATE_TABLES):
        raise ProductionRunnerError("V42 SHOW CREATE table set is not exact")
    expected_by_table = {
        table: {name for name, owner, _expression in V42_CHECK_CONTRACT if owner == table}
        for table in V42_SHOW_CREATE_TABLES
    }
    for table, ddl in ddls.items():
        observed_names = {
            match.group(1)
            for match in re.finditer(
                r"CONSTRAINT\s+`?([A-Za-z][A-Za-z0-9_]*)`?\s+CHECK\s*\(",
                ddl,
                re.IGNORECASE,
            )
        }
        if observed_names != expected_by_table[table]:
            raise ProductionRunnerError(
                f"V42 SHOW CREATE CHECK set is not exact for {table}"
            )
    proof: dict[str, str] = {}
    for name, table, expected_expression in V42_CHECK_CONTRACT:
        expression = _extract_show_create_check_expression(ddls[table], name)
        if _normalise_check_expression(expression) != _normalise_check_expression(
            expected_expression
        ):
            raise ProductionRunnerError(
                f"SHOW CREATE CHECK expression mismatch for {name}"
            )
        proof[f"v42_show_create_check_{name}"] = _encode_metadata_record(
            ("1", table, name, expression, "0")
        )
    return proof


def _encode_metadata_record(values: Sequence[str | None]) -> str:
    return ":".join(
        ("~" if value is None else f"={value}").encode("utf-8").hex().upper()
        for value in values
    )


def _runtime_capability_model(metadata: Mapping[str, str]) -> MetadataCapabilityModel:
    strategy = metadata.get("v42_metadata_capability_strategy")
    raw_sources = metadata.get("v42_metadata_enforcement_sources")
    if strategy not in {"direct", "show_create"} or raw_sources is None:
        raise ProductionRunnerError("V42 runtime metadata capability binding is missing")
    sources = tuple(value for value in raw_sources.split(",") if value)
    if (
        len(set(sources)) != len(sources)
        or any(value not in V42_METADATA_ENFORCEMENT_SOURCES for value in sources)
        or sources != tuple(
            value for value in V42_METADATA_ENFORCEMENT_SOURCES if value in sources
        )
    ):
        raise ProductionRunnerError("V42 runtime enforcement source set is invalid")
    if (strategy == "direct") != bool(sources):
        raise ProductionRunnerError("V42 runtime enforcement strategy is inconsistent")
    columns = {
        table: set(value.split())
        for table, value in _TIDB_V853_OBSERVED_METADATA_COLUMNS.items()
    }
    for source in sources:
        columns[source].add("ENFORCED")
    return validate_metadata_capabilities(
        {table: frozenset(values) for table, values in columns.items()}
    )


def _validate_check_constraints(
    metadata: Mapping[str, str],
    capabilities: MetadataCapabilityModel | None = None,
) -> dict[str, Any]:
    model = capabilities or _runtime_capability_model(metadata)
    names = []
    for name, table, expression in V42_CHECK_CONTRACT:
        standard_key = f"v42_check_{name}"
        tidb_key = f"v42_tidb_check_{name}"
        standard = _parse_metadata_record(
            metadata.get(standard_key),
            key=standard_key,
            fields=V42_CHECK_METADATA_FIELD_ALIASES,
        )
        tidb = _parse_metadata_record(
            metadata.get(tidb_key),
            key=tidb_key,
            fields=V42_CHECK_METADATA_FIELD_ALIASES,
        )
        expected_standard_table = (
            table if "TABLE_CONSTRAINTS" in model.enforcement_sources else None
        )
        if standard[:4] != ("1", EXPECTED_DATABASE, expected_standard_table, name):
            raise ProductionRunnerError(f"V42 CHECK ownership mismatch for {name}")
        if tidb[:4] != ("1", EXPECTED_DATABASE, table, name):
            raise ProductionRunnerError(f"V42 TiDB CHECK ownership mismatch for {name}")
        expected_expression = _normalise_check_expression(expression)
        standard_expression = _normalise_check_expression(standard[4] or "")
        tidb_expression = _normalise_check_expression(tidb[4] or "")
        if standard_expression != expected_expression or tidb_expression != expected_expression:
            raise ProductionRunnerError(f"V42 CHECK expression mismatch for {name}")
        if standard_expression != tidb_expression:
            raise ProductionRunnerError(f"V42 CHECK metadata views disagree for {name}")
        direct_values: list[str] = []
        for value in (standard[5], tidb[5]):
            if value:
                direct_values.extend(part for part in value.split(",") if part)
        if model.enforcement_strategy == "direct":
            if len(direct_values) != len(model.enforcement_sources):
                raise ProductionRunnerError(
                    f"V42 CHECK enforcement source count mismatch for {name}"
                )
            normalised_enforcement = {value.casefold() for value in direct_values}
            if normalised_enforcement != {"yes"} and normalised_enforcement != {"1"} \
                    and normalised_enforcement != {"true"}:
                raise ProductionRunnerError(
                    f"V42 CHECK enforcement sources disagree or are not enforced for {name}"
                )
        else:
            if direct_values:
                raise ProductionRunnerError(
                    f"V42 CHECK invented direct enforcement metadata for {name}"
                )
            show_key = f"v42_show_create_check_{name}"
            show = _parse_metadata_record(
                metadata.get(show_key),
                key=show_key,
                fields=(
                    "row_count", "table_name", "constraint_name",
                    "check_clause", "not_enforced",
                ),
            )
            if show[:3] != ("1", table, name) or show[4] != "0":
                raise ProductionRunnerError(
                    f"CHECK_ENFORCEMENT_UNPROVABLE for {name}"
                )
            if _normalise_check_expression(show[3] or "") != expected_expression:
                raise ProductionRunnerError(
                    f"SHOW CREATE CHECK expression mismatch for {name}"
                )
        names.append(name)
    return {
        "names": names,
        "count": len(names),
        "enforced": True,
        "cross_view_verified": True,
    }


def _validate_v42_history(metadata: Mapping[str, str]) -> dict[str, Any]:
    key = "v42_history_contract"
    record = _parse_metadata_record(
        metadata.get(key),
        key=key,
        fields=(
            "row_count", "versions", "descriptions", "scripts", "checksums",
            "success_values",
        ),
    )
    expected = (
        "1", V42_FLYWAY_HISTORY_CONTRACT["version"],
        V42_FLYWAY_HISTORY_CONTRACT["description"],
        V42_FLYWAY_HISTORY_CONTRACT["script"],
        V42_FLYWAY_HISTORY_CONTRACT["checksum"],
        V42_FLYWAY_HISTORY_CONTRACT["success"],
    )
    if record != expected:
        raise ProductionRunnerError("Flyway V42 history row does not match the exact contract")
    if metadata.get("failed_migration_count") != "0":
        raise ProductionRunnerError("Flyway history contains a failed migration")
    if metadata.get("v42_above_rows") != "0":
        raise ProductionRunnerError("Flyway history contains a migration above V42")
    return {
        "version": TARGET_VERSION,
        "description": V42_FLYWAY_HISTORY_CONTRACT["description"],
        "script": EXPECTED_V42_SQL_FILE,
        "checksum": V42_FLYWAY_HISTORY_CONTRACT["checksum"],
        "success": True,
        "row_count": 1,
        "above_v42_count": 0,
    }


def _session_account_matches_prefix(session_user: str, prefix: str) -> bool:
    if not isinstance(session_user, str) or not session_user or session_user.count("@") != 1:
        return False
    account, host = session_user.split("@", 1)
    if not host or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", account):
        return False
    account_folded = account.casefold()
    prefix_folded = prefix.casefold()
    return account_folded.startswith(prefix_folded + ".") or account_folded.startswith(
        prefix_folded + "_"
    )


def validate_postflight_user_prefix_binding(
    *, identity: Mapping[str, str], session_user: str, login_user: str
) -> None:
    """Validate live production SQL identities without echoing account names."""
    production_prefix = identity.get("user_prefix", "")
    if not USER_PREFIX_REGEX.fullmatch(production_prefix):
        raise ProductionRunnerError("postflight production user-prefix evidence is invalid")
    for value in (session_user, login_user):
        if _session_account_matches_prefix(value, REHEARSAL_FIXTURE_PREFIX):
            raise ProductionRunnerError(
                "postflight SQL session is bound to a prohibited non-production prefix"
            )
        if not _session_account_matches_prefix(value, production_prefix):
            raise ProductionRunnerError(
                "postflight SQL session is not bound to the approved production prefix"
            )


def validate_v42_postflight_extras(
    extra_metadata: Mapping[str, str], before: Mapping[str, str],
    capabilities: MetadataCapabilityModel | None = None,
) -> dict[str, Any]:
    observed_cols = _to_set(extra_metadata.get("v42_managed_columns", ""))
    if observed_cols != MANAGED_STORAGE_COLUMNS:
        raise ProductionRunnerError(
            f"V42 audit failed: event_media managed-storage columns "
            f"({sorted(observed_cols)}) do not match expected "
            f"({sorted(MANAGED_STORAGE_COLUMNS)})"
        )
    event_indexes = []
    for name, non_unique, columns in V42_EVENT_MEDIA_INDEX_CONTRACT:
        event_indexes.append(
            _validate_index_record(
                extra_metadata,
                key=f"v42_event_media_index_{name}",
                table="event_media",
                name=name,
                non_unique=non_unique,
                columns=columns,
            )
        )
    foreign_key = _validate_event_media_fk(extra_metadata)
    cleanup_table = _validate_cleanup_table(extra_metadata)
    checks = _validate_check_constraints(extra_metadata, capabilities)
    if extra_metadata.get("tidb_enable_check_constraint") != "1":
        raise ProductionRunnerError(
            "@@global.tidb_enable_check_constraint is not '1'; CHECK enforcement is disabled"
        )
    history = _validate_v42_history(extra_metadata)
    for key in V42_BOUNDED_COUNTS:
        if before.get(key) != extra_metadata.get(key):
            raise ProductionRunnerError(
                f"bounded count changed after migration for {key}: "
                f"{before.get(key)!r} -> {extra_metadata.get(key)!r}"
            )
    return {
        "event_media_columns": {
            "count": len(MANAGED_STORAGE_COLUMN_CONTRACT),
            "names": list(MANAGED_STORAGE_COLUMN_CONTRACT),
        },
        "event_media_indexes": event_indexes,
        "event_media_foreign_key": foreign_key,
        "cleanup_table": cleanup_table,
        "check_constraints": checks,
        "flyway_history": history,
    }


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


def run_metadata_capability_query(
    *,
    target: Mapping[str, Any],
    user: str,
    password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult],
    image_ref: str | None = None,
) -> MetadataCapabilityModel:
    """Probe the eight reviewed metadata objects once, before complex SQL."""
    if image_ref is None:
        image_ref = base.verify_docker_images()[base.MYSQL_CLIENT_IMAGE]
    payload = base.build_mysql_payload(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=user,
        password=password,
        sql=metadata_capability_sql_v42(),
    )
    result = base.run_external(
        base.build_mysql_command(image_ref=image_ref),
        payload,
        secrets=(user, password),
        executor=executor,
    )
    return parse_metadata_capability_rows(result.stdout)


def run_v42_show_create_query(
    *,
    target: Mapping[str, Any],
    user: str,
    password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult],
    image_ref: str,
) -> dict[str, str]:
    payload = _build_v42_show_create_payload(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=user,
        password=password,
    )
    result = base.run_external(
        _build_v42_show_create_command(image_ref=image_ref),
        payload,
        secrets=(user, password),
        executor=executor,
    )
    return parse_v42_show_create_output(result.stdout)


def run_metadata_query(
    *,
    target: Mapping[str, Any],
    user: str,
    password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult],
    postflight: bool,
    capabilities: MetadataCapabilityModel | None = None,
    mysql_image_ref: str | None = None,
) -> dict[str, str]:
    if mysql_image_ref is None:
        mysql_image_ref = base.verify_docker_images()[base.MYSQL_CLIENT_IMAGE]
    model = capabilities
    if postflight and model is None:
        model = run_metadata_capability_query(
            target=target,
            user=user,
            password=password,
            executor=executor,
            image_ref=mysql_image_ref,
        )
    sql_model = model or observed_tidb_v853_metadata_capabilities()
    sql = (
        base.build_metadata_sql(postflight=postflight)
        + metadata_sql_v42_postflight_extras(sql_model)
    )
    payload = base.build_mysql_payload(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=user,
        password=password,
        sql=sql,
    )
    command = base.build_mysql_command(image_ref=mysql_image_ref)
    result = base.run_external(command, payload, secrets=(user, password), executor=executor)
    metadata = base.parse_mysql_metadata(result.stdout)
    if postflight:
        assert model is not None
        metadata["v42_metadata_capability_strategy"] = model.enforcement_strategy
        metadata["v42_metadata_enforcement_sources"] = ",".join(
            model.enforcement_sources
        )
        if model.enforcement_strategy == "show_create":
            metadata.update(
                run_v42_show_create_query(
                    target=target,
                    user=user,
                    password=password,
                    executor=executor,
                    image_ref=mysql_image_ref,
                )
            )
    return metadata


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
    capabilities = run_metadata_capability_query(
        target=target,
        user=read_user,
        password=read_password,
        executor=executor,
        image_ref=images[base.MYSQL_CLIENT_IMAGE],
    )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=True, capabilities=capabilities,
        mysql_image_ref=images[base.MYSQL_CLIENT_IMAGE],
    )
    generated_sql = (
        base.build_metadata_sql(postflight=True)
        + metadata_sql_v42_postflight_extras(capabilities)
    )
    runtime_keys = {
        "v42_metadata_capability_strategy",
        "v42_metadata_enforcement_sources",
    }
    if capabilities.enforcement_strategy == "show_create":
        runtime_keys.update(
            f"v42_show_create_check_{name}"
            for name, _table, _expression in V42_CHECK_CONTRACT
        )
    expected_metadata_keys = frozenset(
        re.findall(r"(?m)^SELECT '([a-z][a-z0-9_]*)',", generated_sql)
    ).union(
        runtime_keys
    )
    observed_metadata_keys = frozenset(metadata)
    if observed_metadata_keys != expected_metadata_keys:
        raise ProductionRunnerError(
            "postflight metadata keys do not match the generated read-only query: "
            f"missing={sorted(expected_metadata_keys - observed_metadata_keys)}, "
            f"unexpected={sorted(observed_metadata_keys - expected_metadata_keys)}"
        )
    # Bind both SQL identities immediately after parsing the live result.  This
    # deliberately precedes every Flyway or schema acceptance in standalone
    # postflight and never echoes the complete account in an error.
    validate_postflight_user_prefix_binding(
        identity=identity,
        session_user=metadata.get("session_user", ""),
        login_user=metadata.get("session_login_user", ""),
    )
    if metadata.get("postflight_identity_sentinel") != "1":
        raise ProductionRunnerError("postflight SQL identity sentinel is invalid")
    validate_database_metadata_v42(metadata)
    if metadata.get("tidb_enable_check_constraint") != "1":
        raise ProductionRunnerError(
            "@@global.tidb_enable_check_constraint is not '1'; CHECK enforcement is disabled"
        )

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
    verification = validate_v42_postflight_extras(
        metadata,
        before={
            "users_total": before_evidence["metadata"].get("users_total", ""),
            "historical_events_total": before_evidence["metadata"].get(
                "historical_events_total", ""
            ),
            "event_media_total": before_evidence["metadata"].get("event_media_total", ""),
            "active_admin_count": before_evidence["metadata"].get("active_admin_count", ""),
        },
        capabilities=capabilities,
    )
    verification["production_user_prefix_verified"] = True
    return {"flyway": post_state, "metadata": metadata, "verification": verification}


def local_check(repo_root: Path) -> dict[str, Any]:
    """Manifest set + V42-entry SHA verification only.  No remote connection."""
    entries = _verify_manifest_immutable(repo_root)
    _, manifest = _migration_paths_v42(repo_root)
    by_name = {name: digest for digest, name in entries}
    capabilities = observed_tidb_v853_metadata_capabilities()
    check_sql_contract = _validate_check_metadata_sql_contract(
        metadata_sql_v42_postflight_extras(capabilities), capabilities
    )
    return {
        "manifest": str(manifest),
        "manifest_sha256": _file_sha256(manifest),
        "migration_count": len(entries),
        "first_migration": entries[0][1],
        "last_migration": entries[-1][1],
        "target_version": TARGET_VERSION,
        "current_version": EXPECTED_CURRENT_VERSION,
        "transition": f"{EXPECTED_CURRENT_VERSION}->{TARGET_VERSION}",
        "check_metadata_sql_contract": check_sql_contract,
        "metadata_sql_compatibility": validate_generated_metadata_sql_compatibility(
            capabilities
        ),
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
    production_identity_evidence_sha256: str,
    backup_evidence_sha256: str,
    restore_evidence_sha256: str,
    preflight_file_sha256: str,
    preflight_evidence_sha256: str,
    failure_inspection_file_sha256: str,
    migration_installed_at_utc: datetime,
    flyway: Mapping[str, Any],
    metadata: Mapping[str, str],
    verification: Mapping[str, Any],
    postflight_timestamp_utc: str | None = None,
) -> dict[str, Any]:
    """Build the bounded, standalone-only V42 postflight evidence schema."""
    checkout_commit = _require_exact_lower_commit(checkout_commit, "checkout commit")
    migration_release_commit = _require_exact_lower_commit(
        migration_release_commit, "migration release commit"
    )
    hashes = {
        "production_identity_evidence_sha256": production_identity_evidence_sha256,
        "backup_evidence_sha256": backup_evidence_sha256,
        "restore_evidence_sha256": restore_evidence_sha256,
        "preflight_file_sha256": preflight_file_sha256,
        "preflight_evidence_sha256": preflight_evidence_sha256,
        "failure_inspection_file_sha256": failure_inspection_file_sha256,
    }
    for label, value in hashes.items():
        if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ProductionRunnerError(f"postflight {label} is not lowercase SHA-256")
    expected_verification = _expected_postflight_verification_summary()
    if dict(verification) != expected_verification:
        raise ProductionRunnerError("postflight verification summary is incomplete")
    bounded_counts = {key: str(metadata[key]) for key in V42_BOUNDED_COUNTS}
    if any(not re.fullmatch(r"0|[1-9][0-9]*", value) for value in bounded_counts.values()):
        raise ProductionRunnerError("postflight bounded counts are malformed")
    if postflight_timestamp_utc is None:
        postflight_timestamp_utc = datetime.now(timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
    if migration_installed_at_utc.tzinfo is None:
        raise ProductionRunnerError("migration installed time must be timezone-aware")
    installed_at_utc = migration_installed_at_utc.astimezone(timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )
    payload: dict[str, Any] = {
        "schema": V42_POSTFLIGHT_EVIDENCE_SCHEMA,
        "mode": "postflight",
        "postflight_timestamp_utc": postflight_timestamp_utc,
        "production_identity": {
            "cluster_id": EXPECTED_PRODUCTION_CLUSTER_ID,
            "display_name": EXPECTED_DISPLAY_NAME,
            "target_identity": EXPECTED_TARGET_IDENTITY,
            "database": EXPECTED_DATABASE,
            "identity_evidence_sha256": production_identity_evidence_sha256,
            "live_user_prefix_verified": True,
        },
        "retained_evidence": hashes,
        "migration_execution": {
            "historical_migrate_attempt_count": 1,
            "postflight_migrate_call_count": 0,
            "installed_at_utc": installed_at_utc,
        },
        "flyway": {
            "current_version": str(flyway.get("current_version", "")),
            "pending_versions": list(flyway.get("pending_versions", [])),
            "database": str(flyway.get("database", "")),
            "flyway_version": str(flyway.get("flyway_version", "")),
            "state": "Success",
            "validate_success": True,
        },
        "verification": expected_verification,
        "bounded_counts": bounded_counts,
    }
    payload["release_lineage"] = {
        "checkout_commit": checkout_commit,
        "migration_release_commit": migration_release_commit,
        "linear": True,
    }
    payload["evidence_sha256"] = base._evidence_sha256(payload)
    return payload


def _expected_postflight_verification_summary() -> dict[str, Any]:
    def index_summary(table: str, contract) -> list[dict[str, Any]]:
        return [
            {
                "name": name,
                "table": table,
                "columns": list(columns),
                "unique": not non_unique,
                "index_type": "BTREE",
            }
            for name, non_unique, columns in contract
        ]

    name, table, source_columns, referenced_table, referenced_columns, update, delete = (
        V42_EVENT_MEDIA_FK_CONTRACT
    )
    return {
        "production_user_prefix_verified": True,
        "event_media_columns": {
            "count": len(MANAGED_STORAGE_COLUMN_CONTRACT),
            "names": list(MANAGED_STORAGE_COLUMN_CONTRACT),
        },
        "event_media_indexes": index_summary(
            "event_media", V42_EVENT_MEDIA_INDEX_CONTRACT
        ),
        "event_media_foreign_key": {
            "name": name,
            "source_table": table,
            "source_columns": list(source_columns),
            "referenced_table": referenced_table,
            "referenced_columns": list(referenced_columns),
            "update_rule": update,
            "delete_rule": delete,
        },
        "cleanup_table": {
            "name": V42_CLEANUP_TABLE,
            "columns": [definition[0] for definition in V42_CLEANUP_COLUMN_CONTRACT],
            "indexes": index_summary(V42_CLEANUP_TABLE, V42_CLEANUP_INDEX_CONTRACT),
            "foreign_key_count": 0,
            "initial_row_count": 0,
        },
        "check_constraints": {
            "names": [name for name, _table, _expression in V42_CHECK_CONTRACT],
            "count": len(V42_CHECK_CONTRACT),
            "enforced": True,
            "cross_view_verified": True,
        },
        "flyway_history": {
            "version": TARGET_VERSION,
            "description": V42_FLYWAY_HISTORY_CONTRACT["description"],
            "script": EXPECTED_V42_SQL_FILE,
            "checksum": V42_FLYWAY_HISTORY_CONTRACT["checksum"],
            "success": True,
            "row_count": 1,
            "above_v42_count": 0,
        },
    }


def _parse_postflight_timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value
    ):
        raise ProductionRunnerError("postflight evidence timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ProductionRunnerError("postflight evidence timestamp is invalid") from exc
    return parsed.astimezone(timezone.utc)


def _postflight_duplicate_key_guard(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ProductionRunnerError("postflight evidence contains duplicate JSON keys")
        result[key] = value
    return result


def load_and_validate_v42_postflight_evidence(
    path: Path,
    detached_sha256_path: Path,
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    expected_checkout_commit: str,
    expected_migration_release_commit: str,
    expected_identity_evidence_sha256: str,
    expected_backup_evidence_sha256: str,
    expected_restore_evidence_sha256: str,
    expected_preflight_file_sha256: str,
    expected_preflight_evidence_sha256: str,
    expected_failure_inspection_file_sha256: str,
    expected_bounded_counts: Mapping[str, str],
    expected_migration_installed_at_utc: datetime,
) -> dict[str, Any]:
    """Strictly reload the committed standalone postflight evidence schema."""
    path = Path(path)
    detached_sha256_path = Path(detached_sha256_path)
    if path.suffix.lower() != ".json" or not path.is_file() or path.is_symlink():
        raise ProductionRunnerError("postflight evidence file is missing or invalid")
    if not detached_sha256_path.is_file() or detached_sha256_path.is_symlink():
        raise ProductionRunnerError("postflight detached SHA file is missing or invalid")
    try:
        raw = path.read_bytes()
        detached = detached_sha256_path.read_bytes()
    except OSError as exc:
        raise ProductionRunnerError("postflight evidence output cannot be read") from exc
    if len(raw) > base.MAX_EVIDENCE_BYTES:
        raise ProductionRunnerError("postflight evidence is too large")
    file_sha256 = hashlib.sha256(raw).hexdigest()
    expected_detached = f"{file_sha256}  {path.name}\n".encode("ascii")
    if not hmac.compare_digest(detached, expected_detached):
        raise ProductionRunnerError("postflight detached SHA does not match exact bytes")
    try:
        value = json.loads(
            raw.decode("utf-8"), object_pairs_hook=_postflight_duplicate_key_guard
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionRunnerError("postflight evidence is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise ProductionRunnerError("postflight evidence top-level value is invalid")
    if raw != release_e_evidence.canonical_json_bytes(value, trailing_newline=True):
        raise ProductionRunnerError("postflight evidence bytes are not canonical JSON")
    top_keys = {
        "schema", "mode", "postflight_timestamp_utc", "production_identity",
        "retained_evidence", "migration_execution", "flyway", "verification",
        "bounded_counts", "release_lineage", "evidence_sha256",
    }
    if set(value) != top_keys:
        raise ProductionRunnerError("postflight evidence top-level shape is invalid")
    if value["schema"] != V42_POSTFLIGHT_EVIDENCE_SCHEMA or value["mode"] != "postflight":
        raise ProductionRunnerError("postflight evidence schema or mode is invalid")
    digest = value.get("evidence_sha256")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ProductionRunnerError("postflight internal evidence SHA is invalid")
    if not hmac.compare_digest(digest, base._evidence_sha256(value)):
        raise ProductionRunnerError("postflight internal evidence SHA mismatch")
    postflight_time = _parse_postflight_timestamp(value["postflight_timestamp_utc"])
    if expected_migration_installed_at_utc.tzinfo is None:
        raise ProductionRunnerError("expected migration installed time must be timezone-aware")
    installed_time = expected_migration_installed_at_utc.astimezone(timezone.utc)
    installed_text = installed_time.isoformat().replace("+00:00", "Z")
    if postflight_time <= installed_time:
        raise ProductionRunnerError("postflight evidence timestamp precedes migration execution")

    lineage = value.get("release_lineage")
    if not isinstance(lineage, dict) or set(lineage) != {
        "checkout_commit", "migration_release_commit", "linear"
    }:
        raise ProductionRunnerError("postflight evidence release lineage shape is invalid")
    if lineage != {
        "checkout_commit": expected_checkout_commit,
        "migration_release_commit": expected_migration_release_commit,
        "linear": True,
    }:
        raise ProductionRunnerError("postflight evidence release lineage binding mismatch")
    validate_postflight_release_lineage(
        repo_root,
        checkout_commit=expected_checkout_commit,
        migration_release_commit=expected_migration_release_commit,
    )

    identity = value.get("production_identity")
    expected_identity = {
        "cluster_id": EXPECTED_PRODUCTION_CLUSTER_ID,
        "display_name": EXPECTED_DISPLAY_NAME,
        "target_identity": EXPECTED_TARGET_IDENTITY,
        "database": EXPECTED_DATABASE,
        "identity_evidence_sha256": expected_identity_evidence_sha256,
        "live_user_prefix_verified": True,
    }
    if not isinstance(identity, dict) or identity != expected_identity:
        raise ProductionRunnerError("postflight evidence production identity binding mismatch")
    if any(
        target.get(key) != expected_identity[key]
        for key in ("cluster_id", "display_name", "target_identity", "database")
    ):
        raise ProductionRunnerError("postflight loader target is not the approved production target")

    retained = value.get("retained_evidence")
    expected_retained = {
        "production_identity_evidence_sha256": expected_identity_evidence_sha256,
        "backup_evidence_sha256": expected_backup_evidence_sha256,
        "restore_evidence_sha256": expected_restore_evidence_sha256,
        "preflight_file_sha256": expected_preflight_file_sha256,
        "preflight_evidence_sha256": expected_preflight_evidence_sha256,
        "failure_inspection_file_sha256": expected_failure_inspection_file_sha256,
    }
    if not isinstance(retained, dict) or retained != expected_retained:
        raise ProductionRunnerError("postflight retained-evidence hash binding mismatch")
    migration_execution = value.get("migration_execution")
    if migration_execution != {
        "historical_migrate_attempt_count": 1,
        "postflight_migrate_call_count": 0,
        "installed_at_utc": installed_text,
    }:
        raise ProductionRunnerError("postflight migrate-attempt contract is invalid")
    if value.get("flyway") != {
        "current_version": TARGET_VERSION,
        "pending_versions": [],
        "database": EXPECTED_DATABASE,
        "flyway_version": EXPECTED_FLYWAY_VERSION,
        "state": "Success",
        "validate_success": True,
    }:
        raise ProductionRunnerError("postflight Flyway evidence contract is invalid")
    if value.get("verification") != _expected_postflight_verification_summary():
        raise ProductionRunnerError("postflight schema verification summary is invalid")
    expected_counts = {key: str(expected_bounded_counts[key]) for key in V42_BOUNDED_COUNTS}
    if value.get("bounded_counts") != expected_counts:
        raise ProductionRunnerError("postflight bounded-count evidence mismatch")
    return {"evidence": value, "file_sha256": file_sha256}


def write_and_reload_v42_postflight_evidence(
    path: Path,
    detached_sha256_path: Path,
    payload: Mapping[str, Any],
    *,
    loader_arguments: Mapping[str, Any],
) -> dict[str, Any]:
    """Atomically publish exact bytes, then reload once; clean up on failure."""
    path = Path(path)
    detached_sha256_path = Path(detached_sha256_path)
    if path.suffix.lower() != ".json":
        raise ProductionRunnerError("postflight evidence path must end with .json")
    if path.exists() or path.is_symlink() or detached_sha256_path.exists() or detached_sha256_path.is_symlink():
        raise ProductionRunnerError("refusing to overwrite postflight evidence output")
    body = release_e_evidence.canonical_json_bytes(payload, trailing_newline=True)
    digest = hashlib.sha256(body).hexdigest()
    detached = f"{digest}  {path.name}\n".encode("ascii")
    temp_paths: list[Path] = []
    final_paths: list[Path] = []
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        detached_sha256_path.parent.mkdir(parents=True, exist_ok=True)
        for parent, body_part in (
            (path.parent, body), (detached_sha256_path.parent, detached)
        ):
            descriptor, raw_temp = tempfile.mkstemp(prefix=".v42-postflight-", dir=parent)
            temp_path = Path(raw_temp)
            temp_paths.append(temp_path)
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(body_part)
                handle.flush()
                os.fsync(handle.fileno())
        os.link(temp_paths[0], path)
        final_paths.append(path)
        os.link(temp_paths[1], detached_sha256_path)
        final_paths.append(detached_sha256_path)
        for temp_path in temp_paths:
            temp_path.unlink()
        temp_paths.clear()
        return load_and_validate_v42_postflight_evidence(
            path, detached_sha256_path, **dict(loader_arguments)
        )
    except Exception:
        for final_path in reversed(final_paths):
            try:
                final_path.unlink()
            except OSError:
                pass
        raise
    finally:
        for temp_path in temp_paths:
            try:
                temp_path.unlink()
            except OSError:
                pass


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
    parser.add_argument("--evidence-detached-sha256", type=Path)
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
            args.evidence_detached_sha256,
        )
        if args.mode == "postflight":
            if not all(postflight_only):
                raise ProductionRunnerError(
                    "standalone postflight requires migration-release, failure-inspection, and detached-evidence bindings"
                )
            if not args.evidence_file:
                raise ProductionRunnerError(
                    "standalone postflight requires a new evidence output file"
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
        postflight_release_e: dict[str, Any] | None = None
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
                postflight_release_e = validate_release_e_postflight_evidence(
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
            assert postflight_release_e is not None
            assert args.expected_migration_release_commit is not None
            assert args.evidence_file is not None
            assert args.evidence_detached_sha256 is not None
            result = run_postflight(
                repo_root=repo_root, target=target, identity=identity,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                read_user=read_user, read_password=read_password,
                before_evidence=before_evidence,
                migration_installed_at_utc=failure_inspection[
                    "migration_installed_at_utc"
                ],
            )
            postflight_payload = build_standalone_postflight_evidence_payload(
                target=target,
                checkout_commit=checkout_commit,
                migration_release_commit=args.expected_migration_release_commit,
                production_identity_evidence_sha256=args.identity_evidence_sha256,
                backup_evidence_sha256=str(
                    postflight_release_e["backup"]["evidence_sha256"]
                ),
                restore_evidence_sha256=str(
                    postflight_release_e["restore"]["evidence_sha256"]
                ),
                preflight_file_sha256=args.before_evidence_sha256,
                preflight_evidence_sha256=str(raw["evidence_sha256"]),
                failure_inspection_file_sha256=args.failure_inspection_sha256,
                migration_installed_at_utc=failure_inspection[
                    "migration_installed_at_utc"
                ],
                flyway=result["flyway"],
                metadata=result["metadata"],
                verification=result["verification"],
            )
            write_and_reload_v42_postflight_evidence(
                args.evidence_file,
                args.evidence_detached_sha256,
                postflight_payload,
                loader_arguments={
                    "repo_root": repo_root,
                    "target": target,
                    "expected_checkout_commit": checkout_commit,
                    "expected_migration_release_commit": args.expected_migration_release_commit,
                    "expected_identity_evidence_sha256": args.identity_evidence_sha256,
                    "expected_backup_evidence_sha256": str(
                        postflight_release_e["backup"]["evidence_sha256"]
                    ),
                    "expected_restore_evidence_sha256": str(
                        postflight_release_e["restore"]["evidence_sha256"]
                    ),
                    "expected_preflight_file_sha256": args.before_evidence_sha256,
                    "expected_preflight_evidence_sha256": str(raw["evidence_sha256"]),
                    "expected_failure_inspection_file_sha256": args.failure_inspection_sha256,
                    "expected_bounded_counts": {
                        key: result["metadata"][key] for key in V42_BOUNDED_COUNTS
                    },
                    "expected_migration_installed_at_utc": failure_inspection[
                        "migration_installed_at_utc"
                    ],
                },
            )
            _print({
                "mode": "postflight",
                "target": {
                    "target_identity": target["target_identity"],
                    "display_name": target["display_name"],
                    "host": target["host"],
                    "database": target["database"],
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
