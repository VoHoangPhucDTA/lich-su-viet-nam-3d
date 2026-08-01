"""Fail-closed TiDB V42 rehearsal runner for the isolated admin clone.

This runner is deliberately separate from the production V41 runner.  It only
permits the exact V41 -> V42 transition on the explicitly named rehearsal
branch, uses separate read and migration accounts, and never offers repair,
baseline, clean, or arbitrary Flyway target modes.

Credentials are passed to Docker through stdin only.  Docker is required to use
the local daemon, pinned locally available image digests, and --pull=never.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any, Callable, Iterator, Mapping, Sequence

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import tidb_production_migration as base  # noqa: E402


FLYWAY_IMAGE = base.FLYWAY_IMAGE
MYSQL_CLIENT_IMAGE = base.MYSQL_CLIENT_IMAGE
APPROVED_IMAGE_DIGESTS = {
    FLYWAY_IMAGE: "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d",
    MYSQL_CLIENT_IMAGE: "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964",
}
TARGET_VERSION = "42"
EXPECTED_CURRENT_VERSION = "41"
EXPECTED_PENDING_VERSIONS = ("42",)
EXPECTED_DATABASE = "lichsuvn"
EXPECTED_BRANCH_NAME = "lichsuvn3d-admin-v42-rehearsal"
EXPECTED_PRODUCTION_CLUSTER_ID = "10427158774816979902"
EXPECTED_TIDB_VERSION = "8.5.3"
TECHNICAL_BRANCH_ID = re.compile(r"^bran-[A-Za-z0-9][A-Za-z0-9_-]{5,127}$")
IDENTITY_EVIDENCE_KEYS = frozenset({
    "source", "state", "parent_cluster_id", "branch_id", "branch_name",
    "host", "database", "user_prefix", "engine_version",
})
USER_PREFIX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$")
SQL_USER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@:-]{0,255}$")
PRODUCTION_CLUSTER_ENV = "TIDB_PRODUCTION_CLUSTER_ID"
PRODUCTION_USER_PREFIX_ENV = "TIDB_PRODUCTION_USER_PREFIX"
IDENTITY_EVIDENCE_MAX_BYTES = 64 * 1024
APPROVED_IDENTITY_SOURCES = frozenset({"ticloud", "tidb-cloud-console", "tidb-cloud-api"})
MANIFEST_NAME = "tidb-rehearsal-v42.sha256"
# Digest of the LF manifest committed with this runner. The manifest itself is
# immutable input, not an operator-editable allowlist.
MANIFEST_SHA256 = "7674766770b068a9a24db3409571cec4ec1daff4bba741bbe1a584181b8ddaac"
SQL_MARKER = base.SQL_MARKER

MANAGED_COLUMNS = frozenset(
    {
        "managed_asset_id", "storage_provider", "storage_public_id",
        "storage_asset_id", "storage_original_url", "storage_version",
        "storage_mime_type", "storage_format", "storage_byte_size",
        "storage_sha256", "storage_width", "storage_height", "uploaded_by",
        "uploaded_at", "storage_state", "upload_token", "upload_started_at",
        "upload_expires_at",
    }
)
MEDIA_INDEXES = frozenset(
    {
        "uk_event_media_managed_asset", "uk_event_media_storage_identity",
        "idx_event_media_managed_read", "idx_event_media_upload_expiry",
    }
)
MEDIA_CONSTRAINTS = frozenset(
    {
        "chk_event_media_storage_state", "chk_event_media_storage_byte_size",
        "chk_event_media_storage_dimensions", "fk_event_media_uploaded_by",
    }
)
CHECK_CONSTRAINTS = frozenset(
    {
        "chk_event_media_storage_state", "chk_event_media_storage_byte_size",
        "chk_event_media_storage_dimensions", "chk_event_media_cleanup_operation",
        "chk_event_media_cleanup_status", "chk_event_media_cleanup_attempts",
    }
)
CLEANUP_CONSTRAINTS = frozenset(
    {
        "chk_event_media_cleanup_operation", "chk_event_media_cleanup_status",
        "chk_event_media_cleanup_attempts",
    }
)
BOUNDED_COUNTS = ("users_total", "events_total", "media_total", "active_admin_count")


class RehearsalGuardError(RuntimeError):
    """Raised whenever the isolated rehearsal cannot be proven safe."""


@dataclass(frozen=True)
class CommandResult:
    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str


def _error(message: str) -> RehearsalGuardError:
    return RehearsalGuardError(message)


def _env(name: str, *, secret: bool = False) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        raise _error(f"required environment variable {name} is missing")
    try:
        return base._require_secret(value, name) if secret else base._require_text(value, name)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc


def _env_alias(primary: str, alias: str, *, secret: bool = False) -> str:
    """Read the canonical variable, with a non-printing compatibility alias."""

    if os.environ.get(primary, "").strip():
        return _env(primary, secret=secret)
    return _env(alias, secret=secret)


def _host(value: str) -> str:
    host = value.lower()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host):
        raise _error("rehearsal host is not a plain DNS name")
    if not host.endswith(".tidbcloud.com"):
        raise _error("rehearsal host is not a TiDB Cloud endpoint")
    return host


def validate_target(*, host: str, port: int, database: str, parent_cluster_id: str, branch_name: str, branch_id: str, user_prefix: str, production_user_prefix: str, confirmation: str, production_cluster_id: str = EXPECTED_PRODUCTION_CLUSTER_ID) -> dict[str, Any]:
    """Require a technically identified child branch on the production base cluster.

    TiDB Serverless child branches can share the gateway hostname and parent
    cluster ID with production. The branch ID and branch-scoped SQL prefix are
    the isolation boundary.
    """

    host = _host(host)
    try:
        parsed_port = base._parse_port(port)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc
    database = database.strip()
    parent_cluster_id = parent_cluster_id.strip()
    branch_name = branch_name.strip()
    branch_id = branch_id.strip()
    user_prefix = user_prefix.strip()
    production_user_prefix = production_user_prefix.strip()
    confirmation = confirmation.strip()
    if parsed_port != 4000:
        raise _error("rehearsal TiDB port must be 4000")
    if database != EXPECTED_DATABASE:
        raise _error(f"rehearsal database must be exactly {EXPECTED_DATABASE}")
    if parent_cluster_id != EXPECTED_PRODUCTION_CLUSTER_ID or production_cluster_id != EXPECTED_PRODUCTION_CLUSTER_ID:
        raise _error("rehearsal parent must be the approved production base cluster")
    if branch_name != EXPECTED_BRANCH_NAME:
        raise _error(f"rehearsal branch name must be exactly {EXPECTED_BRANCH_NAME}")
    if not TECHNICAL_BRANCH_ID.fullmatch(branch_id):
        raise _error("rehearsal branch ID is missing or is not a technical bran-* ID")
    if not USER_PREFIX.fullmatch(user_prefix) or not USER_PREFIX.fullmatch(production_user_prefix):
        raise _error("SQL user prefixes are missing or malformed")
    if user_prefix.casefold() == production_user_prefix.casefold():
        raise _error("rehearsal SQL user prefix must differ from production")
    expected_confirmation = f"{branch_id}@{host}/{database}:{EXPECTED_CURRENT_VERSION}->{TARGET_VERSION}"
    if confirmation != expected_confirmation:
        raise _error("typed rehearsal confirmation does not match host, branch, database, and V42 transition")
    return {
        "host": host,
        "port": parsed_port,
        "database": database,
        "parent_cluster_id": parent_cluster_id,
        "branch_name": branch_name,
        "branch_id": branch_id,
        "user_prefix": user_prefix,
        "production_user_prefix": production_user_prefix,
        "confirmation": expected_confirmation,
    }


def load_identity_evidence(path: Path, detached_sha256: str) -> dict[str, str]:
    """Load an operator-supplied TiDB Cloud identity proof without guessing IDs."""

    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise _error("approved rehearsal identity evidence is missing")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", detached_sha256 or ""):
        raise _error("identity evidence detached SHA-256 is missing or invalid")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise _error("approved rehearsal identity evidence cannot be read") from exc
    if len(raw) > IDENTITY_EVIDENCE_MAX_BYTES:
        raise _error("approved rehearsal identity evidence is too large")
    if hashlib.sha256(raw).hexdigest().lower() != detached_sha256.lower():
        raise _error("identity evidence detached SHA-256 does not match the file")

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise _error("identity evidence contains duplicate keys")
            result[key] = value
        return result

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _error("identity evidence is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping) or set(value) != IDENTITY_EVIDENCE_KEYS:
        raise _error("identity evidence has an invalid shape")
    if any(not isinstance(value[key], str) for key in IDENTITY_EVIDENCE_KEYS):
        raise _error("identity evidence fields must all be JSON strings")
    try:
        result = {key: base._require_text(value[key], f"identity evidence {key}") for key in IDENTITY_EVIDENCE_KEYS}
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc
    if result["source"].lower() not in APPROVED_IDENTITY_SOURCES:
        raise _error("identity evidence source is not an approved TiDB Cloud metadata source")
    if result["state"].upper() not in {"AVAILABLE", "ACTIVE", "RUNNING"}:
        raise _error("rehearsal clone is not reported available by identity metadata")
    if result["parent_cluster_id"] != EXPECTED_PRODUCTION_CLUSTER_ID:
        raise _error("identity evidence parent cluster is not the approved production base")
    if not TECHNICAL_BRANCH_ID.fullmatch(result["branch_id"]):
        raise _error("identity evidence branch_id is not a technical bran-* ID")
    if result["branch_name"] != EXPECTED_BRANCH_NAME:
        raise _error(f"identity evidence branch_name must be exactly {EXPECTED_BRANCH_NAME}")
    if result["database"] != EXPECTED_DATABASE:
        raise _error("identity evidence database is not lichsuvn")
    if not USER_PREFIX.fullmatch(result["user_prefix"]):
        raise _error("identity evidence user_prefix is malformed")
    if not re.search(r"tidb(?:[- ]server)?[- ]v?8\.5\.3\b", result["engine_version"], re.IGNORECASE):
        raise _error("identity evidence engine is not TiDB v8.5.3")
    result["host"] = _host(result["host"])
    return result


def validate_identity_binding(identity: Mapping[str, str], target: Mapping[str, Any]) -> None:
    """Require control-plane identity to match the configured branch target."""

    for key in ("host", "database", "parent_cluster_id", "branch_id", "branch_name", "user_prefix"):
        if str(identity.get(key)) != str(target.get(key)):
            raise _error(f"identity evidence does not match configured target {key}")


def validate_sql_user_binding(user: str, prefix: str) -> None:
    """Bind an opaque SQL username to the branch prefix without exposing it."""

    if not SQL_USER.fullmatch(user) or not USER_PREFIX.fullmatch(prefix):
        raise _error("SQL username or branch prefix is malformed")
    if not user.casefold().startswith(prefix.casefold() + ".") and not user.casefold().startswith(prefix.casefold() + "_"):
        raise _error("SQL username is not bound to the rehearsal branch prefix")


def target_from_environment(confirmation: str, identity: Mapping[str, str]) -> dict[str, Any]:
    try:
        port = int(_env("TIDB_REHEARSAL_PORT"))
    except ValueError as exc:
        raise _error("TIDB_REHEARSAL_PORT must be an integer") from exc
    target = validate_target(
        host=_env("TIDB_REHEARSAL_HOST"),
        port=port,
        database=_env("TIDB_REHEARSAL_DATABASE"),
        parent_cluster_id=_env("TIDB_REHEARSAL_PARENT_CLUSTER_ID"),
        branch_name=_env("TIDB_REHEARSAL_BRANCH_NAME"),
        branch_id=_env("TIDB_REHEARSAL_BRANCH_ID"),
        user_prefix=_env("TIDB_REHEARSAL_USER_PREFIX"),
        production_user_prefix=_env(PRODUCTION_USER_PREFIX_ENV),
        production_cluster_id=os.environ.get(PRODUCTION_CLUSTER_ENV, EXPECTED_PRODUCTION_CLUSTER_ID),
        confirmation=confirmation,
    )
    validate_identity_binding(identity, target)
    return target


def migration_paths(repo_root: Path) -> tuple[Path, Path]:
    migration_dir = repo_root / "backend" / "src" / "main" / "resources" / "db" / "migration"
    return migration_dir, repo_root / "scripts" / "deploy" / MANIFEST_NAME


def canonical_sql_bytes(path: Path) -> bytes:
    return path.read_bytes().replace(b"\r\n", b"\n")


def verify_manifest(migration_dir: Path, manifest_path: Path) -> list[str]:
    """Require exactly the immutable V1-V42 SQL set and recorded checksums."""

    if not migration_dir.is_dir() or not manifest_path.is_file():
        raise _error("V42 rehearsal migration directory or manifest is missing")
    try:
        manifest_bytes = manifest_path.read_bytes()
    except OSError as exc:
        raise _error("V42 rehearsal manifest is unreadable") from exc
    if hashlib.sha256(manifest_bytes).hexdigest() != MANIFEST_SHA256:
        raise _error("V42 rehearsal manifest digest does not match the approved artifact")
    expected: dict[str, str] = {}
    try:
        text = manifest_bytes.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise _error("V42 rehearsal manifest is unreadable or not UTF-8") from exc
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?(.+)", line)
        if not match or match.group(2) in expected:
            raise _error("V42 rehearsal manifest contains an invalid or duplicate line")
        expected[match.group(2)] = match.group(1).lower()
    actual = sorted(path for path in migration_dir.iterdir() if path.is_file())
    actual_names = {path.name for path in actual}
    if actual_names != set(expected):
        raise _error("V42 rehearsal migration source set differs from immutable manifest")
    versions: set[int] = set()
    for path in actual:
        match = re.fullmatch(r"V(\d+)__[^/\\]+\.sql", path.name)
        if not match:
            raise _error(f"unsupported migration source entry: {path.name}")
        versions.add(int(match.group(1)))
        if hashlib.sha256(canonical_sql_bytes(path)).hexdigest() != expected[path.name]:
            raise _error(f"checksum mismatch for {path.name}")
    if versions != set(range(1, 43)):
        raise _error("V42 rehearsal manifest must contain exactly V1 through V42")
    return sorted(actual_names, key=lambda name: int(re.match(r"V(\d+)", name).group(1)))


@contextmanager
def canonical_migration_directory(migration_dir: Path, manifest_path: Path) -> Iterator[Path]:
    """Stage an independently re-hashed LF-only SQL source for Flyway."""

    verify_manifest(migration_dir, manifest_path)
    with tempfile.TemporaryDirectory(prefix="lsvn3d-v42-rehearsal-") as directory:
        staged = Path(directory) / "sql"
        staged.mkdir()
        for source in migration_dir.iterdir():
            if not source.is_file() or source.is_symlink():
                raise _error(f"unsupported migration source entry: {source.name}")
            (staged / source.name).write_bytes(canonical_sql_bytes(source))
        verify_manifest(staged, manifest_path)
        yield staged


def find_callbacks(migration_dir: Path) -> list[Path]:
    callbacks = base.find_flyway_callbacks(migration_dir)
    if callbacks:
        raise _error("Flyway callbacks are not permitted in the V42 rehearsal source")
    return callbacks


def build_flyway_command(migration_dir: Path, operation: str, *, image_ref: str) -> list[str]:
    if operation not in {"info", "validate", "migrate"}:
        raise _error(f"Flyway operation {operation!r} is not allowlisted")
    # Reuse the reviewed stdin/TLS-safe command construction, but make the
    # rehearsal target explicit without changing the production module.
    command = base.build_flyway_command(migration_dir, operation, image_ref=image_ref)
    try:
        index = command.index("-target=41")
    except ValueError as exc:
        raise _error("shared Flyway command did not expose the expected V41 target") from exc
    command[index] = f"-target={TARGET_VERSION}"
    return command


def build_flyway_config(*, host: str, port: int, database: str, user: str, password: str) -> str:
    try:
        return base.build_flyway_config(host=host, port=port, database=database, user=user, password=password)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc


def build_mysql_payload(*, host: str, port: int, database: str, user: str, password: str, sql: str) -> str:
    """Build a bounded read-only payload, including exact TLS status syntax."""

    if "\x00" in sql or SQL_MARKER in sql:
        raise _error("metadata SQL contains a reserved or NUL marker")
    statements = [statement.strip() for statement in sql.split(";") if statement.strip()]
    for statement in statements:
        if re.match(r"(?is)^SHOW\s+STATUS\s+LIKE\s+'Ssl_version'\s*$", statement):
            continue
        try:
            base._read_only_sql_statements(statement)
        except base.MigrationGuardError as exc:
            raise _error(str(exc)) from exc
    try:
        host = base._require_text(host, "host")
        database = base._require_text(database, "database")
        user = base._require_text(user, "database user")
        password = base._require_secret(password, "database password")
        if "\\r" in password or "\\n" in password:
            raise _error("database password cannot contain a newline")
        config = "\\n".join((
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
        ))
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc
    return config + SQL_MARKER + "\\n" + sql.rstrip() + "\\n"


def run_external(command: Sequence[str], stdin: str, *, secrets: Sequence[str] = (), executor: Callable[[Sequence[str], str], CommandResult] | None = None, stage: str | None = None) -> CommandResult:
    if executor is None:
        def execute(args: Sequence[str], payload: str) -> CommandResult:
            completed = subprocess.run(list(args), input=payload, text=True, capture_output=True, check=False, env=base._sanitized_child_environment())
            return CommandResult(tuple(str(part) for part in args), completed.returncode, completed.stdout, completed.stderr)
        executor = execute
    try:
        result = executor(command, stdin)
    except OSError as exc:
        raise _error("external command could not be started") from exc
    if result.returncode != 0:
        # Pick the more substantive stream; whitespace-only stderr falls
        # back to stdout because Flyway / MySQLClient commonly print their
        # JSON error payload to stdout with a single newline on stderr.
        # Decode bytes safely so unit-test executors that pass bytes do
        # not surface the literal ""b'...'" representation.
        def _decode(stream: Any) -> str:
            if isinstance(stream, bytes):
                return stream.decode("utf-8", errors="replace").strip()
            if isinstance(stream, str):
                return stream.strip()
            return ""
        chosen = _decode(result.stderr) or _decode(result.stdout)
        # Zero-output fallback (spec §8): when both streams are empty or
        # whitespace-only, surface the outer exit code + stage so the
        # wrapper diagnostic capture can localize the failing stage
        # instead of collapsing into the prior `_error("")` swallow-empty
        # path.  This MUST keep the runner's contract (allowlist,
        # target-state, prefix-binding) intact and only changes the
        # diagnostic surface.
        if not chosen:
            stage_label = stage or "external_subprocess"
            outer_code = result.returncode
            synthetic = (
                f"EMPTY_SUBPROCESS_OUTPUT: stage={stage_label} "
                f"outer_exit={outer_code} "
                f"non_substantive_streams=true "
                f"next_action='invoke wrapper diagnostic-only mode with "
                f"--diagnostic-only to capture container_exit_code and docker_state_error'"
            )
            raise _error(synthetic)
        raise _error(base.redact_output(chosen, secrets))
    return result


def run_flyway(*, migration_dir: Path, operation: str, config: str, image_ref: str, secrets: Sequence[str] = (), executor: Callable[[Sequence[str], str], CommandResult] | None = None, stage: str | None = None) -> Mapping[str, Any]:
    # Propagate stage= so the EMPTY_SUBPROCESS_OUTPUT fallback (spec §8)
    # can localise the failing Flyway operation instead of falling back
    # to the generic `external_subprocess` placeholder.  Defaults to a
    # deterministic flyway_<operation> tag so callers can omit it.
    effective_stage = stage if stage is not None else f"flyway_{operation}"
    result = run_external(build_flyway_command(migration_dir, operation, image_ref=image_ref), config, secrets=secrets, executor=executor, stage=effective_stage)
    try:
        return base._parse_json_output(base.CommandResult(result.args, result.returncode, result.stdout, result.stderr), secrets)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc


def run_mysql(*, target: Mapping[str, Any], user: str, password: str, sql: str, image_ref: str, executor: Callable[[Sequence[str], str], CommandResult] | None = None, stage: str | None = None) -> dict[str, str]:
    try:
        payload = build_mysql_payload(host=target["host"], port=target["port"], database=target["database"], user=user, password=password, sql=sql)
        command = base.build_mysql_command(image_ref=image_ref)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc
    # Propagate stage= (spec §8) so the EMPTY_SUBPROCESS_OUTPUT fallback
    # localises the failing MySQL probe.  Callers MUST specify the stage
    # because the same run_mysql function is used for preflight + postflight
    # + per-instance numbered bounded_count probes.
    effective_stage = stage or "mysql_preflight"
    result = run_external(command, payload, secrets=(user, password), executor=executor, stage=effective_stage)
    try:
        metadata = base.parse_mysql_metadata(result.stdout)
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc
    if "Ssl_version" in metadata:
        metadata["tls_version"] = metadata.pop("Ssl_version")
    return metadata


def validate_flyway_envelope(payload: Mapping[str, Any], operation: str) -> None:
    try:
        base._validate_flyway_envelope(payload, operation=operation, expected_database=EXPECTED_DATABASE, expected_flyway_version="11.14.1")
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc


def validate_flyway_info(payload: Mapping[str, Any], *, current: str, pending: Sequence[str]) -> dict[str, Any]:
    validate_flyway_envelope(payload, "info")
    if str(payload.get("schemaVersion") or "") != current:
        raise _error(f"expected Flyway current version {current}, got {payload.get('schemaVersion')!r}")
    migrations = payload.get("migrations")
    if not isinstance(migrations, list):
        raise _error("Flyway info did not contain migrations")
    states: dict[str, str] = {}
    for item in migrations:
        if not isinstance(item, Mapping) or not str(item.get("version") or "").isdigit():
            raise _error("Flyway info contained an unsupported migration")
        version = str(item["version"])
        if version in states:
            raise _error(f"Flyway info contains duplicate migration {version}")
        state = base._normalise_state(item.get("state"))
        if state in {"failed", "missing", "future", "ignored", "deleted", "out of order", "above target", "below baseline", "baseline"}:
            raise _error(f"Flyway info contains unsafe migration state {state!r}")
        states[version] = state
    expected_versions = {str(version) for version in range(1, int(current) + 1)} | {str(version) for version in pending}
    if set(states) != expected_versions:
        raise _error("Flyway history version set does not match the exact applied-plus-pending set")
    expected_applied = {str(version) for version in range(1, int(current) + 1)}
    if {v for v, state in states.items() if int(v) <= int(current) and state == "success"} != expected_applied:
        raise _error(f"Flyway history is not complete through V{current}")
    observed_pending = sorted((v for v, state in states.items() if state == "pending"), key=int)
    if observed_pending != sorted((str(v) for v in pending), key=int):
        raise _error(f"Flyway pending set is {observed_pending!r}, expected {list(pending)!r}")
    expected_pending_set = {str(p) for p in pending}
    for version, state in states.items():
        expected_state = "pending" if version in expected_pending_set else "success"
        if state != expected_state:
            raise _error(f"Flyway migration {version} has state {state!r}, expected {expected_state!r}")
    return {"current_version": current, "pending_versions": observed_pending, "database": EXPECTED_DATABASE, "flyway_version": "11.14.1"}


def validate_flyway_validate(payload: Mapping[str, Any]) -> None:
    validate_flyway_envelope(payload, "validate")
    if payload.get("validationSuccessful") is not True or payload.get("invalidMigrations") != []:
        raise _error("Flyway validate did not pass with zero invalid migrations")


def validate_flyway_migrate(payload: Mapping[str, Any]) -> None:
    validate_flyway_envelope(payload, "migrate")
    if str(payload.get("initialSchemaVersion") or "") != EXPECTED_CURRENT_VERSION:
        raise _error("Flyway migrate did not start at V41")
    if str(payload.get("targetSchemaVersion") or "") != TARGET_VERSION:
        raise _error("Flyway migrate did not target V42")
    if int(payload.get("migrationsExecuted") or -1) != 1:
        raise _error("Flyway migrate did not execute exactly one migration")
    migrations = payload.get("migrations")
    if not isinstance(migrations, list) or [str(item.get("version")) for item in migrations if isinstance(item, Mapping)] != [TARGET_VERSION]:
        raise _error("Flyway migrate did not execute exactly V42")


def metadata_sql() -> str:
    statements = [
        "SELECT 'server_version', VERSION()",
        "SELECT 'version_comment', @@version_comment",
        "SELECT 'database', DATABASE()",
        "SELECT 'session_user', CURRENT_USER()",
        "SHOW STATUS LIKE 'Ssl_version'",
        "SELECT 'tidb_enable_check_constraint', @@global.tidb_enable_check_constraint",
        "SELECT 'users_total', (SELECT COUNT(*) FROM users)",
        "SELECT 'events_total', (SELECT COUNT(*) FROM historical_events)",
        "SELECT 'media_total', (SELECT COUNT(*) FROM event_media)",
        "SELECT 'active_admin_count', (SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code='admin')",
        "SELECT 'failed_migration_count', (SELECT COUNT(*) FROM flyway_schema_history WHERE success=0)",
        "SELECT 'v42_success_rows', (SELECT COUNT(*) FROM flyway_schema_history WHERE version='42' AND success=1)",
        "SELECT 'v42_history_checksum', COALESCE((SELECT CAST(checksum AS CHAR) FROM flyway_schema_history WHERE version='42' AND success=1 ORDER BY installed_rank DESC LIMIT 1), '')",
        "SELECT 'managed_columns', COALESCE((SELECT GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_media' AND column_name IN ('managed_asset_id','storage_provider','storage_public_id','storage_asset_id','storage_original_url','storage_version','storage_mime_type','storage_format','storage_byte_size','storage_sha256','storage_width','storage_height','uploaded_by','uploaded_at','storage_state','upload_token','upload_started_at','upload_expires_at')),'')",
        "SELECT 'media_indexes', COALESCE((SELECT GROUP_CONCAT(DISTINCT index_name ORDER BY index_name SEPARATOR ',') FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_media' AND index_name IN ('uk_event_media_managed_asset','uk_event_media_storage_identity','idx_event_media_managed_read','idx_event_media_upload_expiry')),'')",
        "SELECT 'media_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='event_media' AND constraint_name IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','fk_event_media_uploaded_by')),'')",
        "SELECT 'cleanup_table', COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='event_media_storage_cleanup_tasks'",
        "SELECT 'cleanup_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='event_media_storage_cleanup_tasks' AND constraint_name IN ('chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
        "SELECT 'check_constraints', COALESCE((SELECT GROUP_CONCAT(constraint_name ORDER BY constraint_name SEPARATOR ',') FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
        "SELECT 'tidb_check_constraints', COALESCE((SELECT GROUP_CONCAT(CONSTRAINT_NAME ORDER BY CONSTRAINT_NAME SEPARATOR ',') FROM information_schema.TIDB_CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('chk_event_media_storage_state','chk_event_media_storage_byte_size','chk_event_media_storage_dimensions','chk_event_media_cleanup_operation','chk_event_media_cleanup_status','chk_event_media_cleanup_attempts')),'')",
    ]
    return ";\n".join(statements) + ";\n"


def _csv(value: str) -> set[str]:
    return {item for item in value.split(",") if item}


def flyway_v42_history_checksum(payload: Mapping[str, Any]) -> str:
    """Extract Flyway's own V42 checksum without reimplementing its algorithm."""

    migrations = payload.get("migrations")
    if not isinstance(migrations, list):
        raise _error("Flyway info did not contain migrations for V42 checksum binding")
    matches = [
        item for item in migrations
        if isinstance(item, Mapping) and str(item.get("version") or "") == TARGET_VERSION
    ]
    if len(matches) != 1:
        raise _error("Flyway info must contain exactly one V42 entry for checksum binding")
    item = matches[0]
    if base._normalise_state(item.get("state")) != "success":
        raise _error("Flyway V42 entry is not successful for checksum binding")
    checksum = str(item.get("checksum") or "").strip()
    if not re.fullmatch(r"-?\d+", checksum):
        raise _error("Flyway V42 checksum is missing or not an integer")
    return checksum


def validate_session_user(metadata: dict[str, str], user_prefix: str) -> None:
    """Prove the SQL session account is scoped to the discovered branch prefix.

    The raw CURRENT_USER() value is deliberately removed before evidence is
    serialized; only the verification result is retained.
    """

    session_user = metadata.pop("session_user", "")
    account = session_user.split("@", 1)[0]
    validate_sql_user_binding(account, user_prefix)
    metadata["session_user_prefix_verified"] = "1"


def validate_metadata(
    metadata: Mapping[str, str],
    *,
    postflight: bool,
    expected_v42_history_checksum: str | None = None,
    expected_user_prefix: str | None = None,
) -> None:
    version = metadata.get("server_version", "")
    if not re.search(r"tidb(?:[- ]server)?[- ]v?8\.5\.3\b", version, re.IGNORECASE):
        raise _error("clone engine is not verified TiDB v8.5.3")
    if "tidb" not in metadata.get("version_comment", "").lower():
        raise _error("clone version comment is not TiDB")
    if metadata.get("database") != EXPECTED_DATABASE:
        raise _error("metadata database does not match rehearsal target")
    if metadata.get("tidb_enable_check_constraint") != "1":
        raise _error("@@global.tidb_enable_check_constraint is not 1")
    if metadata.get("tls_version", "").strip().upper() not in {"TLSV1.2", "TLSV1.3"}:
        raise _error("clone did not report an approved TLSv1.2 or TLSv1.3 session")
    if metadata.get("failed_migration_count") != "0":
        raise _error("Flyway history contains failed migrations")
    for key in BOUNDED_COUNTS:
        try:
            count = int(metadata.get(key, "-1"))
            if count < 0:
                raise ValueError
        except ValueError as exc:
            raise _error(f"metadata count is invalid for {key}") from exc
    if int(metadata["active_admin_count"]) < 2:
        raise _error("clone baseline must contain at least two active Admins")
    if expected_user_prefix is not None and metadata.get("session_user_prefix_verified") != "1":
        raise _error("SQL session user was not verified against the rehearsal branch prefix")
    if not postflight:
        return
    checks = {
        "managed_columns": MANAGED_COLUMNS,
        "media_indexes": MEDIA_INDEXES,
        "media_constraints": MEDIA_CONSTRAINTS,
        "cleanup_constraints": CLEANUP_CONSTRAINTS,
        "check_constraints": CHECK_CONSTRAINTS,
        "tidb_check_constraints": CHECK_CONSTRAINTS,
    }
    for key, expected in checks.items():
        if _csv(metadata.get(key, "")) != expected:
            raise _error(f"V42 schema verification failed for {key}")
    if metadata.get("cleanup_table") != "1":
        raise _error("event_media_storage_cleanup_tasks is missing")
    if metadata.get("v42_success_rows") != "1":
        raise _error("Flyway history does not contain exactly one successful V42 row")
    observed_checksum = metadata.get("v42_history_checksum", "").strip()
    if not re.fullmatch(r"-?\d+", observed_checksum):
        raise _error("Flyway V42 history checksum is missing or not an integer")
    if expected_v42_history_checksum is not None and observed_checksum != expected_v42_history_checksum:
        raise _error("database V42 history checksum does not match Flyway info")


def validate_counts_unchanged(before: Mapping[str, str], after: Mapping[str, str]) -> None:
    for key in BOUNDED_COUNTS:
        if before.get(key) != after.get(key):
            raise _error(f"bounded count changed for {key}")


def verify_docker_images() -> dict[str, str]:
    """Use only locally present images whose repository digest is approved."""

    verified: dict[str, str] = {}
    for image, expected in APPROVED_IMAGE_DIGESTS.items():
        try:
            completed = subprocess.run(
                ["docker", "image", "inspect", image, "--format", "{{json .RepoDigests}}"],
                text=True, capture_output=True, check=False,
                env=base._sanitized_child_environment(), timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise _error("Docker image inspection is unavailable") from exc
        if completed.returncode != 0:
            raise _error(f"pinned image {image} is not available locally")
        try:
            digests = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise _error(f"Docker returned invalid digest metadata for {image}") from exc
        if not isinstance(digests, list):
            raise _error(f"Docker returned malformed digest metadata for {image}")
        match = None
        for digest in digests:
            try:
                match = base.validate_image_digest(str(digest), expected)
                break
            except base.MigrationGuardError:
                continue
        if match is None:
            raise _error(f"local image {image} does not match its approved digest")
        verified[image] = f"{image.rsplit(':', 1)[0]}@{match}"
    return verified


def validate_local_docker() -> None:
    try:
        base.validate_local_docker_environment()
    except base.MigrationGuardError as exc:
        raise _error(str(exc)) from exc


def _preflight(*, repo_root: Path, target: Mapping[str, Any], images: Mapping[str, str], read_user: str, read_password: str, executor: Callable[[Sequence[str], str], CommandResult] | None = None) -> dict[str, Any]:
    migration_dir, manifest = migration_paths(repo_root)
    verify_manifest(migration_dir, manifest)
    find_callbacks(migration_dir)
    config = build_flyway_config(host=target["host"], port=target["port"], database=target["database"], user=read_user, password=read_password)
    with canonical_migration_directory(migration_dir, manifest) as staged:
        info = run_flyway(migration_dir=staged, operation="info", config=config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), executor=executor, stage="flyway_info_preflight")
        state = validate_flyway_info(info, current=EXPECTED_CURRENT_VERSION, pending=EXPECTED_PENDING_VERSIONS)
        validate_flyway_validate(run_flyway(migration_dir=staged, operation="validate", config=config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), executor=executor, stage="flyway_validate_preflight"))
    metadata = run_mysql(target=target, user=read_user, password=read_password, sql=metadata_sql(), image_ref=images[MYSQL_CLIENT_IMAGE], executor=executor, stage="mysql_metadata_preflight")
    validate_session_user(metadata, target["user_prefix"])
    validate_metadata(metadata, postflight=False, expected_user_prefix=target["user_prefix"])
    return {"flyway": state, "metadata": metadata}


def _postflight(*, repo_root: Path, target: Mapping[str, Any], images: Mapping[str, str], read_user: str, read_password: str, before: Mapping[str, str], executor: Callable[[Sequence[str], str], CommandResult] | None = None) -> dict[str, Any]:
    migration_dir, manifest = migration_paths(repo_root)
    verify_manifest(migration_dir, manifest)
    find_callbacks(migration_dir)
    config = build_flyway_config(host=target["host"], port=target["port"], database=target["database"], user=read_user, password=read_password)
    with canonical_migration_directory(migration_dir, manifest) as staged:
        info = run_flyway(migration_dir=staged, operation="info", config=config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), executor=executor, stage="flyway_info_postflight")
        state = validate_flyway_info(info, current=TARGET_VERSION, pending=())
        expected_checksum = flyway_v42_history_checksum(info)
        validate_flyway_validate(run_flyway(migration_dir=staged, operation="validate", config=config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), executor=executor, stage="flyway_validate_postflight"))
    metadata = run_mysql(target=target, user=read_user, password=read_password, sql=metadata_sql(), image_ref=images[MYSQL_CLIENT_IMAGE], executor=executor, stage="mysql_metadata_postflight")
    validate_session_user(metadata, target["user_prefix"])
    validate_metadata(metadata, postflight=True, expected_v42_history_checksum=expected_checksum, expected_user_prefix=target["user_prefix"])
    validate_counts_unchanged(before, metadata)
    return {"flyway": state, "metadata": metadata}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fail-closed isolated-clone TiDB V42 rehearsal runner")
    parser.add_argument("--mode", choices=("local-check", "preflight", "migrate", "postflight"), default="local-check")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--confirm-target")
    parser.add_argument("--evidence-file", type=Path)
    parser.add_argument("--before-evidence", type=Path)
    parser.add_argument("--before-evidence-sha256")
    parser.add_argument("--identity-evidence", type=Path)
    parser.add_argument("--identity-evidence-sha256")
    return parser


def _evidence(mode: str, target: Mapping[str, Any], flyway: Mapping[str, Any], metadata: Mapping[str, str]) -> dict[str, Any]:
    payload = {
        "mode": mode,
        "target": {
            "parent_cluster_id": target["parent_cluster_id"],
            "branch_name": target["branch_name"],
            "branch_id": target["branch_id"],
            "user_prefix": target["user_prefix"],
            "production_user_prefix": target["production_user_prefix"],
            "host": target["host"],
            "port": target["port"],
            "database": target["database"],
        },
        "tls": {"mode": "VERIFY_IDENTITY", "version": metadata.get("tls_version", "")},
        "manifest_sha256": MANIFEST_SHA256,
        "images": {"flyway": APPROVED_IMAGE_DIGESTS[FLYWAY_IMAGE], "mysql": APPROVED_IMAGE_DIGESTS[MYSQL_CLIENT_IMAGE]},
        "flyway": dict(flyway),
        "metadata": dict(metadata),
    }
    payload["evidence_sha256"] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return payload


def _validate_evidence(path: Path, target: Mapping[str, Any], detached_sha256: str) -> Mapping[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise _error("preflight evidence file is missing")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", detached_sha256 or ""):
        raise _error("detached preflight evidence SHA-256 is missing or invalid")
    try:
        raw = path.read_bytes()
        value = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _error("preflight evidence is not valid JSON") from exc
    if hashlib.sha256(raw).hexdigest().lower() != detached_sha256.lower():
        raise _error("preflight evidence detached SHA-256 does not match the file")
    if not isinstance(value, Mapping) or value.get("mode") != "preflight":
        raise _error("evidence must be a preflight object")
    digest = value.get("evidence_sha256")
    unsigned = {key: item for key, item in value.items() if key != "evidence_sha256"}
    expected = hashlib.sha256(json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if not isinstance(digest, str) or digest != expected:
        raise _error("preflight evidence digest is invalid")
    evidence_target = value.get("target")
    expected_target = {
        "parent_cluster_id": target["parent_cluster_id"],
        "branch_name": target["branch_name"],
        "branch_id": target["branch_id"],
        "user_prefix": target["user_prefix"],
        "production_user_prefix": target["production_user_prefix"],
        "host": target["host"],
        "port": target["port"],
        "database": target["database"],
    }
    if evidence_target != expected_target:
        raise _error("preflight evidence target binding does not match the verified clone")
    if value.get("manifest_sha256") != MANIFEST_SHA256 or value.get("images") != {"flyway": APPROVED_IMAGE_DIGESTS[FLYWAY_IMAGE], "mysql": APPROVED_IMAGE_DIGESTS[MYSQL_CLIENT_IMAGE]}:
        raise _error("preflight evidence artifact binding is invalid")
    tls = value.get("tls")
    if not isinstance(tls, Mapping) or tls.get("mode") != "VERIFY_IDENTITY" or not str(tls.get("version") or "").strip():
        raise _error("preflight evidence does not prove TLS hostname verification")
    metadata = value.get("metadata")
    if not isinstance(metadata, Mapping):
        raise _error("preflight evidence has no metadata")
    validate_metadata(metadata, postflight=False)
    expected_flyway = {
        "current_version": EXPECTED_CURRENT_VERSION,
        "pending_versions": [TARGET_VERSION],
        "database": EXPECTED_DATABASE,
        "flyway_version": "11.14.1",
    }
    if value.get("flyway") != expected_flyway:
        raise _error("preflight evidence Flyway state is not exactly V41 with V42 pending")
    return value


def _write_evidence(path: Path, payload: Mapping[str, Any]) -> None:
    if path.suffix.lower() != ".json" or path.exists() or path.is_symlink():
        raise _error("evidence path must be a new .json file")
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(data)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        repo_root = args.repo_root.resolve()
        migration_dir, manifest = migration_paths(repo_root)
        if args.mode == "local-check":
            files = verify_manifest(migration_dir, manifest)
            find_callbacks(migration_dir)
            print(json.dumps({"mode": "local-check", "migration_count": len(files), "first_migration": files[0], "last_migration": files[-1], "target": {"branch_name": EXPECTED_BRANCH_NAME, "technical_branch_id_required": True, "parent_cluster_id": EXPECTED_PRODUCTION_CLUSTER_ID, "branch_user_prefix_required": True, "shared_gateway_allowed": True}, "target_version": TARGET_VERSION}, sort_keys=True))
            return 0
        if not args.confirm_target:
            raise _error("--confirm-target is required")
        if not args.identity_evidence or not args.identity_evidence_sha256:
            raise _error("--identity-evidence and --identity-evidence-sha256 are required")
        identity = load_identity_evidence(args.identity_evidence, args.identity_evidence_sha256)
        validate_local_docker()
        target = target_from_environment(args.confirm_target, identity)
        images = verify_docker_images()
        read_user, read_password = _env("TIDB_REHEARSAL_READ_USER", secret=True), _env("TIDB_REHEARSAL_READ_PASSWORD", secret=True)
        validate_sql_user_binding(read_user, target["user_prefix"])
        if args.mode == "preflight":
            result = _preflight(repo_root=repo_root, target=target, images=images, read_user=read_user, read_password=read_password)
            if args.evidence_file:
                payload = _evidence("preflight", target, result["flyway"], result["metadata"])
                _write_evidence(args.evidence_file, payload)
            print(json.dumps({"mode": "preflight", "target": {"parent_cluster_id": target["parent_cluster_id"], "branch_name": target["branch_name"], "branch_id": target["branch_id"], "user_prefix": target["user_prefix"], "host": target["host"], "database": target["database"]}, "flyway": result["flyway"], "bounded_counts": {key: result["metadata"][key] for key in BOUNDED_COUNTS}}, sort_keys=True))
            return 0
        if args.mode == "postflight":
            if not args.before_evidence or not args.before_evidence.is_file():
                raise _error("--before-evidence is required for postflight")
            if not args.before_evidence_sha256:
                raise _error("--before-evidence-sha256 is required for postflight")
            evidence = _validate_evidence(args.before_evidence, target, args.before_evidence_sha256)
            before = evidence["metadata"]
            result = _postflight(repo_root=repo_root, target=target, images=images, read_user=read_user, read_password=read_password, before=before)
            if args.evidence_file:
                payload = _evidence("postflight", target, result["flyway"], result["metadata"])
                _write_evidence(args.evidence_file, payload)
            print(json.dumps({"mode": "postflight", "target": {"parent_cluster_id": target["parent_cluster_id"], "branch_name": target["branch_name"], "branch_id": target["branch_id"], "user_prefix": target["user_prefix"], "host": target["host"], "database": target["database"]}, "flyway": result["flyway"], "bounded_counts": {key: result["metadata"][key] for key in BOUNDED_COUNTS}}, sort_keys=True))
            return 0
        before_result = _preflight(repo_root=repo_root, target=target, images=images, read_user=read_user, read_password=read_password)
        if args.mode == "migrate":
            if not args.before_evidence or not args.before_evidence.is_file():
                raise _error("--before-evidence is required for migrate")
            if not args.before_evidence_sha256:
                raise _error("--before-evidence-sha256 is required for migrate")
            evidence = _validate_evidence(args.before_evidence, target, args.before_evidence_sha256)
            before = evidence["metadata"]
            validate_counts_unchanged(before, before_result["metadata"])
            migrate_user = _env_alias("TIDB_REHEARSAL_MIGRATE_USER", "TIDB_REHEARSAL_MIGRATION_USER", secret=True)
            migrate_password = _env_alias("TIDB_REHEARSAL_MIGRATE_PASSWORD", "TIDB_REHEARSAL_MIGRATION_PASSWORD", secret=True)
            if migrate_user.casefold() == read_user.casefold():
                raise _error("read and migration accounts must be separate")
            validate_sql_user_binding(migrate_user, target["user_prefix"])
            latest = _preflight(repo_root=repo_root, target=target, images=images, read_user=read_user, read_password=read_password)
            validate_counts_unchanged(before_result["metadata"], latest["metadata"])
            migrate_config = build_flyway_config(host=target["host"], port=target["port"], database=target["database"], user=migrate_user, password=migrate_password)
            post_config = build_flyway_config(host=target["host"], port=target["port"], database=target["database"], user=read_user, password=read_password)
            with canonical_migration_directory(migration_dir, manifest) as staged:
                info = run_flyway(migration_dir=staged, operation="info", config=migrate_config, image_ref=images[FLYWAY_IMAGE], secrets=(migrate_user, migrate_password), stage="flyway_info_pre_migrate")
                validate_flyway_info(info, current=EXPECTED_CURRENT_VERSION, pending=EXPECTED_PENDING_VERSIONS)
                validate_flyway_validate(run_flyway(migration_dir=staged, operation="validate", config=migrate_config, image_ref=images[FLYWAY_IMAGE], secrets=(migrate_user, migrate_password), stage="flyway_validate_pre_migrate"))
                migration = run_flyway(migration_dir=staged, operation="migrate", config=migrate_config, image_ref=images[FLYWAY_IMAGE], secrets=(migrate_user, migrate_password), stage="flyway_migrate")
                validate_flyway_migrate(migration)
                post_info = run_flyway(migration_dir=staged, operation="info", config=post_config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), stage="flyway_info_post_migrate")
                post_state = validate_flyway_info(post_info, current=TARGET_VERSION, pending=())
                expected_checksum = flyway_v42_history_checksum(post_info)
                result = run_mysql(target=target, user=read_user, password=read_password, sql=metadata_sql(), image_ref=images[MYSQL_CLIENT_IMAGE], stage="mysql_metadata_post_migrate")
                validate_session_user(result, target["user_prefix"])
                validate_metadata(result, postflight=True, expected_v42_history_checksum=expected_checksum, expected_user_prefix=target["user_prefix"])
                validate_counts_unchanged(latest["metadata"], result)
                validate_flyway_validate(run_flyway(migration_dir=staged, operation="validate", config=post_config, image_ref=images[FLYWAY_IMAGE], secrets=(read_user, read_password), stage="flyway_validate_post_migrate"))
            if args.evidence_file:
                payload = _evidence("postflight", target, post_state, result)
                _write_evidence(args.evidence_file, payload)
            print(json.dumps({"mode": "migrate", "target": {"parent_cluster_id": target["parent_cluster_id"], "branch_name": target["branch_name"], "branch_id": target["branch_id"], "user_prefix": target["user_prefix"], "host": target["host"], "database": target["database"]}, "executed": [TARGET_VERSION], "flyway": post_state, "bounded_counts": {key: result[key] for key in BOUNDED_COUNTS}}, sort_keys=True))
            return 0
        raise _error(f"unsupported mode {args.mode}")
    except (RehearsalGuardError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"BLOCKED_REHEARSAL: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
