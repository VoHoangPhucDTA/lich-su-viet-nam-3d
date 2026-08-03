"""Read-only TiDB production audit for the V42 release boundary.

This intentionally has no migrate/repair/baseline/clean mode.  Credentials
are supplied to Docker processes through stdin by the shared fail-closed
runner; they are never command arguments or logged.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tidb_production_migration as base  # noqa: E402


TARGET_VERSION = "42"
EXPECTED_DATABASE = "lichsuvn"
MANIFEST_NAME = "tidb-production-v42.sha256"
EXPECTED_CHECKS = {
    "managed_columns": {
        "managed_asset_id", "storage_provider", "storage_public_id",
        "storage_asset_id", "storage_original_url", "storage_version",
        "storage_mime_type", "storage_format", "storage_byte_size",
        "storage_sha256", "storage_width", "storage_height", "uploaded_by",
        "uploaded_at", "storage_state", "upload_token", "upload_started_at",
        "upload_expires_at",
    },
    "media_indexes": {
        "uk_event_media_managed_asset", "uk_event_media_storage_identity",
        "idx_event_media_managed_read", "idx_event_media_upload_expiry",
    },
    "media_constraints": {
        "chk_event_media_storage_state", "chk_event_media_storage_byte_size",
        "chk_event_media_storage_dimensions", "fk_event_media_uploaded_by",
    },
    "cleanup_constraints": {
        "chk_event_media_cleanup_operation", "chk_event_media_cleanup_status",
        "chk_event_media_cleanup_attempts",
    },
}


def migration_paths(repo_root: Path) -> tuple[Path, Path]:
    migration_dir = repo_root / "backend" / "src" / "main" / "resources" / "db" / "migration"
    return migration_dir, repo_root / "scripts" / "deploy" / MANIFEST_NAME


def validate_target() -> dict[str, str | int]:
    host = base._env("TIDB_PRODUCTION_HOST")
    database = base._env("TIDB_PRODUCTION_DATABASE")
    target_id = base._env("TIDB_PRODUCTION_TARGET_ID")
    port = int(base._env("TIDB_PRODUCTION_PORT"))
    if not host.endswith(".tidbcloud.com") or port != 4000 or database != EXPECTED_DATABASE:
        raise base.MigrationGuardError("production target identity is not proven")
    if target_id != "main":
        raise base.MigrationGuardError("production target identity must be main")
    return {"host": host, "port": port, "database": database, "target_id": target_id}


def metadata_sql() -> str:
    statements = [
        "SELECT 'server_version', VERSION()",
        "SELECT 'version_comment', @@version_comment",
        "SELECT 'database', DATABASE()",
        "SELECT 'global_time_zone', @@global.time_zone",
        "SELECT 'session_time_zone', @@session.time_zone",
        "SELECT 'character_set_database', @@character_set_database",
        "SELECT 'collation_database', @@collation_database",
        "SELECT 'sql_mode', @@sql_mode",
        "SELECT 'tidb_enable_check_constraint', @@global.tidb_enable_check_constraint",
        "SELECT 'users_total', (SELECT COUNT(*) FROM users)",
        "SELECT 'events_total', (SELECT COUNT(*) FROM historical_events)",
        "SELECT 'media_total', (SELECT COUNT(*) FROM event_media)",
        "SELECT 'active_admin_count', (SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code='admin')",
        "SELECT 'failed_migration_count', (SELECT COUNT(*) FROM flyway_schema_history WHERE success=0)",
        "SELECT 'admin_guard_table', COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='admin_mutation_guards'",
        "SELECT 'admin_guard_columns', COALESCE((SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='admin_mutation_guards' AND column_name IN ('guard_key','revision','active_admin_count')),'')",
        "SELECT 'admin_guard_last_active_rows', (SELECT COUNT(*) FROM admin_mutation_guards WHERE guard_key='last_active_admin')",
        "SELECT 'updated_event_columns', COALESCE((SELECT GROUP_CONCAT(CONCAT(column_name,':',LOWER(data_type),':',COALESCE(datetime_precision,'')) ORDER BY column_name SEPARATOR '|') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='historical_events' AND column_name='updated_at'),'')",
        "SELECT 'updated_user_columns', COALESCE((SELECT GROUP_CONCAT(CONCAT(column_name,':',LOWER(data_type),':',COALESCE(datetime_precision,'')) ORDER BY column_name SEPARATOR '|') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name IN ('updated_at','auth_version')),'')",
        "SELECT 'managed_columns', COALESCE((SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_media' AND column_name IN ('managed_asset_id','storage_provider','storage_public_id','storage_asset_id','storage_original_url','storage_version','storage_mime_type','storage_format','storage_byte_size','storage_sha256','storage_width','storage_height','uploaded_by','uploaded_at','storage_state','upload_token','upload_started_at','upload_expires_at')),'')",
        "SELECT 'media_indexes', COALESCE((SELECT GROUP_CONCAT(DISTINCT index_name ORDER BY index_name SEPARATOR ',') FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_media' AND index_name IN ('uk_event_media_managed_asset','uk_event_media_storage_identity','idx_event_media_managed_read','idx_event_media_upload_expiry')),'')",
        "SELECT 'media_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='event_media' AND constraint_name IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','fk_event_media_uploaded_by')),'')",
        "SELECT 'cleanup_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='event_media_storage_cleanup_tasks' AND constraint_name IN ('chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
        "SELECT 'cleanup_table', COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='event_media_storage_cleanup_tasks'",
        "SELECT 'check_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
        "SELECT 'tidb_check_constraints', COALESCE((SELECT GROUP_CONCAT(CONSTRAINT_NAME ORDER BY CONSTRAINT_NAME SEPARATOR ',') FROM information_schema.TIDB_CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
    ]
    return ";\n".join(statements) + ";\n"


def summarise_flyway_info(payload: object) -> dict[str, object]:
    """Report, rather than assume, the version reached by production."""

    if not isinstance(payload, dict):
        raise base.MigrationGuardError("Flyway info payload is malformed")
    base._validate_flyway_envelope(
        payload,
        operation="info",
        expected_database=EXPECTED_DATABASE,
        expected_flyway_version="11.14.1",
    )
    migrations = payload.get("migrations")
    if not isinstance(migrations, list):
        raise base.MigrationGuardError("Flyway info did not contain migrations")
    states: dict[str, str] = {}
    for item in migrations:
        if not isinstance(item, dict) or not str(item.get("version") or "").isdigit():
            raise base.MigrationGuardError("Flyway info contains an unsupported migration")
        version = str(item["version"])
        state = base._normalise_state(item.get("state"))
        if version in states:
            raise base.MigrationGuardError("Flyway info contains duplicate versions")
        states[version] = state
    unsafe = {"failed", "missing", "future", "ignored", "deleted", "out of order", "above target", "below baseline", "baseline"}
    if any(state in unsafe for state in states.values()):
        raise base.MigrationGuardError("Flyway history contains an unsafe migration state")
    return {
        "current_version": str(payload.get("schemaVersion") or ""),
        "pending_versions": sorted((version for version, state in states.items() if state == "pending"), key=int),
        "successful_versions": len([state for state in states.values() if state == "success"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only TiDB V42 production audit")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--expected-release-commit", required=True)
    args = parser.parse_args()
    try:
        repo_root = args.repo_root.resolve()
        target = validate_target()
        base.verify_release_checkout(repo_root, args.expected_release_commit)
        migration_dir, manifest = migration_paths(repo_root)
        base.verify_migration_manifest(migration_dir, manifest, expected_versions=range(1, 43))
        if base.find_flyway_callbacks(migration_dir):
            raise base.MigrationGuardError("migration callbacks are not allowed")
        base.validate_local_docker_environment()
        images = base.verify_docker_images()
        read_user, read_password = base._credentials("TIDB_PRODUCTION_READ")
        config = base.build_flyway_config(host=target["host"], port=target["port"], database=target["database"], user=read_user, password=read_password)
        # The shared command builder is fail-closed for V41. Temporarily set its
        # target only in this process; the V41 runner and migrations are untouched.
        old_target = base.TARGET_VERSION
        base.TARGET_VERSION = TARGET_VERSION
        try:
            with base.canonical_migration_directory(migration_dir, manifest_path=manifest, expected_versions=range(1, 43)) as staged:
                info = base.run_flyway(migration_dir=staged, operation="info", config=config, image_ref=images[base.FLYWAY_IMAGE], secrets=(read_user, read_password))
                state = summarise_flyway_info(info)
                validation = base.run_flyway(migration_dir=staged, operation="validate", config=config, image_ref=images[base.FLYWAY_IMAGE], secrets=(read_user, read_password))
                base.validate_flyway_validate(validation)
        finally:
            base.TARGET_VERSION = old_target
        payload = base.build_mysql_payload(host=target["host"], port=target["port"], database=target["database"], user=read_user, password=read_password, sql=metadata_sql())
        result = base.run_external(base.build_mysql_command(image_ref=images[base.MYSQL_CLIENT_IMAGE]), payload, secrets=(read_user, read_password))
        metadata = base.parse_mysql_metadata(result.stdout)
        print(json.dumps({"target":"main", "database":EXPECTED_DATABASE, "flyway":state, "validation":"passed", "metadata":metadata}, sort_keys=True))
        return 0
    except base.MigrationGuardError as exc:
        print(f"BLOCKED_PRODUCTION_READ_ONLY_AUDIT: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
