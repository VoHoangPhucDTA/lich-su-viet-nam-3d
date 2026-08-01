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
import hashlib
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
import tidb_production_migration as base  # noqa: E402


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
EXPECTED_TIDB_VERSION_REGEX = r"tidb[- ]v?8\.5\.3\b"

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


# V42 schema footprint (must remain in sync with V42__add_managed_event_image_storage.sql).
MANAGED_STORAGE_COLUMNS = frozenset(
    {
        "managed_asset_id", "storage_provider", "storage_public_id",
        "storage_asset_id", "storage_original_url", "storage_version",
        "storage_mime_type", "storage_format", "storage_byte_size",
        "storage_sha256", "storage_width", "storage_height",
        "uploaded_by", "uploaded_at", "storage_state",
        "upload_token", "upload_started_at", "storage_expires_at",
    }
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
V42_BOUNDED_COUNTS = ("users_total", "events_total", "event_media_total", "active_admin_count")


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
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    if not re.search(EXPECTED_TIDB_VERSION_REGEX, value["engine_version"], re.IGNORECASE):
        raise ProductionRunnerError(
            "identity evidence engine_version is not TiDB v8.5.3"
        )
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
    return (
        "SELECT 'session_user', CURRENT_USER();\n"
        # 18 managed-storage columns on event_media.
        "SELECT 'v42_managed_columns', COALESCE("
        "(SELECT GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',') "
        "FROM information_schema.columns "
        "WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND column_name IN ("
        "'managed_asset_id','storage_provider','storage_public_id','storage_asset_id',"
        "'storage_original_url','storage_version','storage_mime_type','storage_format',"
        "'storage_byte_size','storage_sha256','storage_width','storage_height',"
        "'uploaded_by','uploaded_at','storage_state','upload_token',"
        "'upload_started_at','storage_expires_at'),"
        "'') AS v;\n"
        # 4 indexes on event_media.
        "SELECT 'v42_media_indexes', COALESCE("
        "(SELECT GROUP_CONCAT(index_name ORDER BY index_name SEPARATOR ',') "
        "FROM information_schema.statistics "
        "WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND index_name IN ("
        "'uk_event_media_managed_asset','uk_event_media_storage_identity',"
        "'idx_event_media_managed_read','idx_event_media_upload_expiry'),"
        "'') AS v;\n"
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
        "'chk_event_media_cleanup_attempts'),"
        "'') AS v;\n"
        # 6 CHECK constraints in information_schema.CHECK_CONSTRAINTS
        "SELECT 'v42_check_constraints', COALESCE("
        "(SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') "
        "FROM information_schema.CHECK_CONSTRAINTS "
        "WHERE constraint_schema=DATABASE() "
        "AND constraint_name IN ("
        "'chk_event_media_storage_state','chk_event_media_storage_byte_size',"
        "'chk_event_media_storage_dimensions','chk_event_media_cleanup_operation',"
        "'chk_event_media_cleanup_status','chk_event_media_cleanup_attempts'),"
        "'') AS v;\n"
        # 6 CHECK constraints in information_schema.TIDB_CHECK_CONSTRAINTS
        "SELECT 'v42_tidb_check_constraints', COALESCE("
        "(SELECT GROUP_CONCAT(CONSTRAINT_NAME ORDER BY CONSTRAINT_NAME SEPARATOR ',') "
        "FROM information_schema.TIDB_CHECK_CONSTRAINTS "
        "WHERE CONSTRAINT_SCHEMA=DATABASE() "
        "AND CONSTRAINT_NAME IN ("
        "'chk_event_media_storage_state','chk_event_media_storage_byte_size',"
        "'chk_event_media_storage_dimensions','chk_event_media_cleanup_operation',"
        "'chk_event_media_cleanup_status','chk_event_media_cleanup_attempts'),"
        "'') AS v;\n"
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


def run_preflight(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    read_user: str,
    read_password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
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
        info = base.run_flyway(
            migration_dir=flyway_dir, operation="info", config=config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
        )
        info_state = validate_flyway_info_for_v42(info)
        base.validate_flyway_validate(
            base.run_flyway(
                migration_dir=flyway_dir, operation="validate", config=config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=False,
    )
    base.validate_database_metadata(metadata)
    validate_user_prefix_binding(identity=identity, session_user=metadata.get("session_user", ""))
    metadata["session_user_prefix_verified"] = "1"
    metadata["v42_history_present"] = "0"
    return {"flyway": info_state, "metadata": metadata}


def run_migrate(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    identity: Mapping[str, str],
    read_user: str,
    read_password: str,
    migrate_user: str,
    migrate_password: str,
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
    pre = run_preflight(
        repo_root=repo_root, target=target, identity=identity,
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
        info_pre = base.run_flyway(
            migration_dir=flyway_dir, operation="info", config=migrate_config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets, executor=executor,
        )
        validate_flyway_info_for_v42(info_pre)
        base.validate_flyway_validate(
            base.run_flyway(
                migration_dir=flyway_dir, operation="validate", config=migrate_config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets, executor=executor,
            )
        )
        migrate_result = base.run_flyway(
            migration_dir=flyway_dir, operation="migrate", config=migrate_config,
            image_ref=images[base.FLYWAY_IMAGE], secrets=migrate_secrets, executor=executor,
        )
        validate_flyway_migrate_for_v42(migrate_result)
        info_post = base.run_flyway(
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
            base.run_flyway(
                migration_dir=flyway_dir, operation="validate", config=post_config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=read_secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=True,
    )
    base.validate_database_metadata(metadata)
    base.validate_postflight_metadata(metadata, pre["metadata"])
    validate_v42_postflight_extras(
        metadata,
        before={
            "users_total": pre["metadata"].get("users_total", ""),
            "events_total": pre["metadata"].get("events_total", ""),
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
    read_user: str,
    read_password: str,
    before_evidence: Mapping[str, Any],
    executor: Callable[[Sequence[str], str], base.CommandResult] = base._execute,
) -> dict[str, Any]:
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
        info = base.run_flyway(
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
            base.run_flyway(
                migration_dir=flyway_dir, operation="validate", config=config,
                image_ref=images[base.FLYWAY_IMAGE], secrets=secrets, executor=executor,
            )
        )
    metadata = run_metadata_query(
        target=target, user=read_user, password=read_password,
        executor=executor, postflight=True,
    )
    base.validate_database_metadata(metadata)
    base.validate_postflight_metadata(metadata, before_evidence["metadata"])
    validate_v42_postflight_extras(
        metadata,
        before={
            "users_total": before_evidence["metadata"].get("users_total", ""),
            "events_total": before_evidence["metadata"].get("events_total", ""),
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
    parser.add_argument("--confirm-target")
    parser.add_argument("--identity-evidence", type=Path)
    parser.add_argument("--identity-evidence-sha256")
    parser.add_argument("--backup-evidence")
    parser.add_argument("--restore-evidence")
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
    return parser


def _print(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        repo_root = args.repo_root.resolve()
        if args.mode == "local-check":
            _print(local_check(repo_root))
            return 0
        if not args.expected_release_commit:
            raise ProductionRunnerError("--expected-release-commit is required outside local-check")
        base.verify_release_checkout(repo_root, args.expected_release_commit)
        base.validate_local_docker_environment()
        if not args.confirm_target:
            raise ProductionRunnerError("--confirm-target is required")
        if not args.identity_evidence or not args.identity_evidence_sha256:
            raise ProductionRunnerError(
                "--identity-evidence and --identity-evidence-sha256 are required"
            )
        identity = load_identity_evidence(args.identity_evidence, args.identity_evidence_sha256)
        target = _target_from_environment_and_evidence(
            identity=identity, confirmation=args.confirm_target,
        )
        validate_identity_to_target(identity=identity, target=target)
        read_user, read_password = _credentials("TIDB_PRODUCTION_READ")
        before_evidence = None
        if args.mode in ("migrate", "postflight"):
            if not args.before_evidence or not args.before_evidence_sha256:
                raise ProductionRunnerError(
                    f"--before-evidence and --before-evidence-sha256 are required for {args.mode}"
                )
            raw = base._read_evidence(args.before_evidence)
            base.validate_evidence_binding(
                raw, target=target,
                expected_release_commit=args.expected_release_commit,
                expected_evidence_sha256=args.before_evidence_sha256,
            )
            before_evidence = {"flyway": raw.get("flyway"), "metadata": raw.get("metadata")}
            base.validate_approval_gates(
                backup_evidence=_env("TIDB_PRODUCTION_BACKUP_EVIDENCE", secret=False),
                restore_evidence=_env("TIDB_PRODUCTION_RESTORE_EVIDENCE", secret=False),
                two_active_admins=args.two_active_admins,
                backends_drained=args.backends_drained,
                single_migration_owner=args.single_migration_owner,
                maintenance_window=args.maintenance_window,
                rollback_owner=args.rollback_owner,
                runtime_security_verified=args.runtime_security_verified,
                execute_migrate=args.execute_migrate,
            )
        if args.mode == "preflight":
            result = run_preflight(
                repo_root=repo_root, target=target, identity=identity,
                read_user=read_user, read_password=read_password,
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_evidence_payload(
                        mode="preflight", target=target,
                        release_commit=args.expected_release_commit,
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
            migrate_user, migrate_password = _credentials("TIDB_PRODUCTION_MIGRATE")
            result = run_migrate(
                repo_root=repo_root, target=target, identity=identity,
                read_user=read_user, read_password=read_password,
                migrate_user=migrate_user, migrate_password=migrate_password,
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_evidence_payload(
                        mode="postflight", target=target,
                        release_commit=args.expected_release_commit,
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
            result = run_postflight(
                repo_root=repo_root, target=target, identity=identity,
                read_user=read_user, read_password=read_password,
                before_evidence=before_evidence,
            )
            if args.evidence_file:
                base._write_evidence(
                    args.evidence_file,
                    build_evidence_payload(
                        mode="postflight", target=target,
                        release_commit=args.expected_release_commit,
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
    except (base.MigrationGuardError, ProductionRunnerError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"BLOCKED_PRODUCTION_V42: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
