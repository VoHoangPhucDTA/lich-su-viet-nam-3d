"""Fail-closed, operator-driven Flyway runner for production TiDB.

The module has no import-time network or Docker side effects.  Credentials are
passed to the container through standard input only; they are never command
arguments, process environment variables, logs, or files on the host.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence


FLYWAY_IMAGE = "redgate/flyway:11.14.1"
MYSQL_CLIENT_IMAGE = "mysql:8.0.36"
APPROVED_IMAGE_DIGESTS = {
    FLYWAY_IMAGE: "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d",
    MYSQL_CLIENT_IMAGE: "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964",
}
MYSQL_CA_BUNDLE = "/etc/pki/tls/certs/ca-bundle.crt"
TARGET_VERSION = "41"
EXPECTED_CURRENT_VERSION = "37"
EXPECTED_PENDING_VERSIONS = ("38", "39", "40", "41")
EXPECTED_DATABASE = "lichsuvn"
EXPECTED_TIDB_VERSION = "8.5.3"
MANIFEST_NAME = "tidb-production-v41.sha256"
SQL_MARKER = "__LSVN3D_SQL_PAYLOAD__"
ALLOWED_FLYWAY_OPERATIONS = frozenset(("info", "validate", "migrate"))
RELEASE_CHECK_PATHS = (
    "backend/src/main/resources/db/migration",
    "scripts/deploy/tidb_production_migration.py",
    "scripts/deploy/run-tidb-production-migration.ps1",
    "scripts/deploy/run-tidb-production-migration.cmd",
    "scripts/deploy/tidb-production-v41.sha256",
)
CALLBACK_NAME = re.compile(
    r"(?i)^(?:before|after)[A-Za-z0-9_.-]*\.(?:sql|java|class)$"
)
VERSIONED_MIGRATION_NAME = re.compile(r"^V(\d+)__[^/\\]+\.sql$")
SENSITIVE_URL = re.compile(
    r"(?i)(jdbc:mysql://)([^/\s:@]+)(?::[^@\s/]*)?@"
)
SENSITIVE_ENV_MARKERS = (
    "PASSWORD",
    "SECRET",
    "TOKEN",
    "PRIVATE_KEY",
)
EVIDENCE_FORMAT_VERSION = 1
MAX_EVIDENCE_BYTES = 1024 * 1024
DOCKER_METADATA_TIMEOUT_SECONDS = 15
DOCKER_IMAGE_INSPECT_TIMEOUT_SECONDS = 60
EXPECTED_DOCKER_SERVER_OS = "linux"
EXPECTED_DOCKER_SERVER_ARCHITECTURE = "amd64"
PRE_FLIGHT_METADATA_KEYS = frozenset(
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
    }
)


class MigrationGuardError(RuntimeError):
    """Raised whenever a safety invariant cannot be proven."""


@dataclass(frozen=True)
class CommandResult:
    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str


def _read_only_sql_statements(sql: str) -> list[str]:
    """Split a SQL payload while rejecting comments and unsafe statements."""

    if not isinstance(sql, str) or not sql.strip() or "\x00" in sql:
        raise MigrationGuardError("metadata SQL must be non-empty and safe")
    statements: list[str] = []
    current: list[str] = []
    quote: str | None = None
    escaped = False
    index = 0
    while index < len(sql):
        char = sql[index]
        next_char = sql[index + 1] if index + 1 < len(sql) else ""
        if quote:
            current.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                if next_char == quote:
                    current.append(next_char)
                    index += 1
                else:
                    quote = None
            index += 1
            continue
        if char in ("'", '"', "`"):
            quote = char
            current.append(char)
            index += 1
            continue
        if char == "#" or (char == "-" and next_char == "-"):
            raise MigrationGuardError("metadata SQL comments are not allowed")
        if char == "/" and next_char == "*":
            raise MigrationGuardError("metadata SQL comments are not allowed")
        if char == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
        else:
            current.append(char)
        index += 1
    if quote:
        raise MigrationGuardError("metadata SQL contains an unterminated string")
    statement = "".join(current).strip()
    if statement:
        statements.append(statement)
    if not statements:
        raise MigrationGuardError("metadata SQL must contain a SELECT")
    unsafe = re.compile(
        r"(?is)\b(?:INTO|FOR\s+UPDATE|LOCK\s+IN\s+SHARE|"
        r"OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK)\b"
    )
    for statement in statements:
        if not re.match(r"(?is)^SELECT\b", statement):
            raise MigrationGuardError("metadata SQL may contain SELECT statements only")
        # Ignore quoted literals for keyword checks so a value such as "UPDATE"
        # remains harmless while SELECT ... INTO/locking clauses are rejected.
        unquoted = re.sub(r"""'(?:\\.|''|[^'])*'|"(?:\\.|""|[^"])*"|`[^`]*`""", " ", statement)
        if unsafe.search(unquoted):
            raise MigrationGuardError("metadata SQL contains an unsafe SELECT clause")
    return statements


def _require_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MigrationGuardError(f"{name} must be non-empty")
    if any(ord(char) < 32 and char not in ("\t",) for char in value):
        raise MigrationGuardError(f"{name} contains a control character")
    return value.strip()


def _require_secret(value: Any, name: str) -> str:
    """Validate a secret without changing its opaque value."""

    if not isinstance(value, str) or not value.strip():
        raise MigrationGuardError(f"{name} must be non-empty")
    if any(ord(char) < 32 and char not in ("\t",) for char in value):
        raise MigrationGuardError(f"{name} contains a control character")
    return value


def _toml_string(value: str) -> str:
    """Encode one opaque value as a TOML basic string."""

    return json.dumps(value, ensure_ascii=False)


def _escape_mysql_option(value: str) -> str:
    _require_secret(value, "database credential")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _parse_port(value: Any) -> int:
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise MigrationGuardError("port must be an integer") from exc
    if not 1 <= port <= 65535:
        raise MigrationGuardError("port is outside the valid TCP range")
    return port


def validate_target(
    *,
    host: str,
    port: int,
    database: str,
    target_identity: str,
    confirmation: str,
) -> dict[str, Any]:
    """Validate the manually confirmed production identity."""

    host = _require_text(host, "host").lower()
    database = _require_text(database, "database")
    target_identity = _require_text(target_identity, "target identity")
    confirmation = _require_text(confirmation, "target confirmation")
    parsed_port = _parse_port(port)

    if not re.fullmatch(
        r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?",
        host,
    ):
        raise MigrationGuardError("host is not a plain DNS name")
    if not host.endswith(".tidbcloud.com"):
        raise MigrationGuardError("host is not a TiDB Cloud endpoint")
    if parsed_port != 4000:
        raise MigrationGuardError("production TiDB port must be 4000")
    if database != EXPECTED_DATABASE:
        raise MigrationGuardError(
            f"database must be exactly {EXPECTED_DATABASE}"
        )
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", target_identity):
        raise MigrationGuardError("target identity contains unsupported characters")
    if target_identity != "main":
        raise MigrationGuardError(
            "the production migration runner accepts only the exact target identity 'main'"
        )

    expected_confirmation = (
        f"{target_identity}@{host}/{database}:"
        f"{EXPECTED_CURRENT_VERSION}->{TARGET_VERSION}"
    )
    if confirmation != expected_confirmation:
        raise MigrationGuardError(
            "typed target confirmation does not match the selected production target"
        )
    return {
        "host": host,
        "port": parsed_port,
        "database": database,
        "target_identity": target_identity,
        "confirmation": expected_confirmation,
    }


def validate_approval_gates(
    *,
    backup_evidence: str,
    restore_evidence: str,
    two_active_admins: bool,
    backends_drained: bool,
    single_migration_owner: bool,
    maintenance_window: bool,
    rollback_owner: bool,
    runtime_security_verified: bool,
    execute_migrate: bool,
) -> None:
    """Require explicit, non-empty operator acknowledgements before writes."""

    _require_text(backup_evidence, "backup evidence")
    _require_text(restore_evidence, "restore rehearsal evidence")
    gates = {
        "two active Admins": two_active_admins,
        "backends drained": backends_drained,
        "single migration owner": single_migration_owner,
        "maintenance window": maintenance_window,
        "rollback owner": rollback_owner,
        "runtime security settings": runtime_security_verified,
        "execute-migrate confirmation": execute_migrate,
    }
    missing = [name for name, value in gates.items() if value is not True]
    if missing:
        raise MigrationGuardError(
            "missing migration approval gate(s): " + ", ".join(missing)
        )


def validate_risk_accepted_minimal_gate(
    *,
    risk_accepted_minimal: bool,
    backends_drained: bool,
    runtime_security_verified: bool,
    execute_migrate: bool,
) -> None:
    """Keep the non-negotiable write boundaries for an explicitly accepted thesis release."""

    gates = {
        "risk-accepted minimal confirmation": risk_accepted_minimal,
        "backends drained": backends_drained,
        "runtime security settings": runtime_security_verified,
        "execute-migrate confirmation": execute_migrate,
    }
    missing = [name for name, value in gates.items() if value is not True]
    if missing:
        raise MigrationGuardError(
            "missing risk-accepted migration gate(s): " + ", ".join(missing)
        )


def _docker_mount_source(path: Path) -> str:
    resolved = str(path.resolve())
    if "," in resolved:
        raise MigrationGuardError("migration path cannot contain a comma")
    return resolved


def _trusted_docker_search_path(value: str) -> tuple[str, frozenset[str]]:
    """Return absolute parent-PATH entries without implicit cwd lookup."""

    if not isinstance(value, str) or not value.strip():
        raise MigrationGuardError(
            "Docker executable was not found: trusted parent PATH is missing"
        )
    entries: list[str] = []
    normalised: set[str] = set()
    for raw_entry in value.split(os.pathsep):
        entry = raw_entry.strip().strip('"')
        if not entry or not os.path.isabs(entry):
            continue
        normalised_entry = os.path.normcase(os.path.normpath(entry))
        if normalised_entry in normalised:
            continue
        entries.append(entry)
        normalised.add(normalised_entry)
    if not entries:
        raise MigrationGuardError(
            "Docker executable was not found: trusted parent PATH has no absolute entries"
        )
    return os.pathsep.join(entries), frozenset(normalised)


def _validate_resolved_docker_executable(
    candidate: str | None,
    *,
    trusted_parent_directories: frozenset[str],
) -> str:
    if not candidate:
        raise MigrationGuardError(
            "Docker executable was not found on the trusted parent PATH"
        )
    if not os.path.isabs(candidate):
        raise MigrationGuardError("resolved Docker executable path is not absolute")
    expected_basename = "docker.exe" if sys.platform.startswith("win") else "docker"
    if os.path.basename(candidate).casefold() != expected_basename:
        raise MigrationGuardError(
            "resolved Docker executable has an unexpected basename"
        )
    candidate_parent = os.path.normcase(
        os.path.normpath(os.path.dirname(candidate))
    )
    if candidate_parent not in trusted_parent_directories:
        raise MigrationGuardError(
            "resolved Docker executable is outside the trusted parent PATH"
        )
    unresolved = Path(candidate)
    if not unresolved.exists():
        raise MigrationGuardError("resolved Docker executable does not exist")
    if not unresolved.is_file():
        raise MigrationGuardError("resolved Docker executable is not a file")
    try:
        resolved = unresolved.resolve(strict=True)
    except OSError as exc:
        raise MigrationGuardError(
            "resolved Docker executable path cannot be normalised"
        ) from exc
    if not resolved.is_file():
        raise MigrationGuardError("resolved Docker executable is not a regular file")
    if not sys.platform.startswith("win") and not os.access(resolved, os.X_OK):
        raise MigrationGuardError("resolved Docker executable is not launchable")
    return str(resolved)


@lru_cache(maxsize=1)
def resolve_docker_executable() -> str:
    """Resolve Docker once from the trusted parent process environment."""

    search_path, trusted_directories = _trusted_docker_search_path(
        os.environ.get("PATH", "")
    )
    names = ("docker", "docker.exe") if sys.platform.startswith("win") else ("docker",)
    last_error: MigrationGuardError | None = None
    for name in names:
        candidate = shutil.which(name, path=search_path)
        try:
            return _validate_resolved_docker_executable(
                candidate,
                trusted_parent_directories=trusted_directories,
            )
        except MigrationGuardError as exc:
            last_error = exc
    assert last_error is not None
    raise last_error


def _run_docker_metadata_command(
    docker_executable: str,
    arguments: Sequence[str],
    *,
    operation: str,
    environment: Mapping[str, str],
    timeout: int = DOCKER_METADATA_TIMEOUT_SECONDS,
) -> subprocess.CompletedProcess[str]:
    """Run one bounded local Docker metadata command without a shell."""

    trusted_executable = resolve_docker_executable()
    if os.path.normcase(os.path.normpath(docker_executable)) != os.path.normcase(
        os.path.normpath(trusted_executable)
    ):
        raise MigrationGuardError(
            "Docker executable path does not match the trusted parent resolver"
        )
    started = time.monotonic()
    try:
        return subprocess.run(
            [docker_executable, *(str(argument) for argument in arguments)],
            text=True,
            capture_output=True,
            check=False,
            env=dict(environment),
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed = time.monotonic() - started
        raise MigrationGuardError(
            f"Docker command timeout during {operation} after {elapsed:.3f}s "
            f"(limit {timeout}s)"
        ) from exc
    except OSError as exc:
        raise MigrationGuardError(
            f"Docker executable could not be launched during {operation}"
        ) from exc


def _normalise_docker_architecture(value: Any) -> str:
    architecture = str(value or "").strip().lower()
    return {"x86_64": "amd64", "x64": "amd64"}.get(
        architecture, architecture
    )


def _validate_docker_daemon_platform(
    docker_executable: str,
    environment: Mapping[str, str],
) -> dict[str, str]:
    result = _run_docker_metadata_command(
        docker_executable,
        ["version", "--format", "{{json .Server}}"],
        operation="daemon-version",
        environment=environment,
    )
    if result.returncode != 0:
        raise MigrationGuardError(
            "Docker daemon is unavailable during daemon-version "
            f"(exit code {result.returncode})"
        )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise MigrationGuardError(
            "Docker daemon returned invalid platform metadata"
        ) from exc
    if not isinstance(payload, Mapping):
        raise MigrationGuardError("Docker daemon platform metadata is not an object")
    server_os = str(payload.get("Os") or payload.get("OS") or "").strip().lower()
    architecture = _normalise_docker_architecture(payload.get("Arch"))
    if (
        server_os != EXPECTED_DOCKER_SERVER_OS
        or architecture != EXPECTED_DOCKER_SERVER_ARCHITECTURE
    ):
        safe_os = server_os if re.fullmatch(r"[a-z0-9._-]+", server_os) else "invalid"
        safe_arch = (
            architecture
            if re.fullmatch(r"[a-z0-9._-]+", architecture)
            else "invalid"
        )
        raise MigrationGuardError(
            "Docker server platform mismatch: expected linux/amd64, "
            f"observed {safe_os}/{safe_arch}"
        )
    return {"os": server_os, "architecture": architecture}


def build_flyway_command(
    migration_dir: Path,
    operation: str,
    *,
    image_ref: str = FLYWAY_IMAGE,
    target_version: str = TARGET_VERSION,
) -> list[str]:
    """Build the only permitted Flyway Docker invocations."""

    if operation not in ALLOWED_FLYWAY_OPERATIONS:
        raise MigrationGuardError(
            f"Flyway operation {operation!r} is not allowlisted"
        )
    image_ref = _require_text(image_ref, "Flyway image reference")
    target_version = _require_text(target_version, "Flyway target version")
    if not re.fullmatch(r"\d+", target_version):
        raise MigrationGuardError("Flyway target version must be numeric")
    mount = (
        f"type=bind,source={_docker_mount_source(Path(migration_dir))},"
        "target=/flyway/sql,readonly"
    )
    shell_script = r"""set -eu
umask 077
c=/tmp/lsvn3d-flyway.$$.toml
trap 'rm -f "$c"' EXIT HUP INT TERM
cat > "$c"
/flyway/flyway -configFiles="$c" "$@"
"""
    return [
        resolve_docker_executable(),
        "run",
        "--pull=never",
        "--rm",
        "-i",
        "-e",
        "REDGATE_DISABLE_TELEMETRY=true",
        "--mount",
        mount,
        "--entrypoint",
        "sh",
        image_ref,
        "-c",
        shell_script,
        "lsvn3d-flyway-stdin",
        "-locations=filesystem:/flyway/sql",
        f"-target={target_version}",
        "-cleanDisabled=true",
        "-baselineOnMigrate=false",
        "-outOfOrder=false",
        "-skipExecutingMigrations=false",
        "-skipDefaultCallbacks=true",
        "-callbacks=",
        "-validateMigrationNaming=true",
        "-validateOnMigrate=true",
        "-connectRetries=0",
        "-outputType=json",
        "-outputQueryResults=false",
        *( ["-ignoreMigrationPatterns=*:pending"] if operation == "validate" else [] ),
        operation,
    ]


def build_flyway_config(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
) -> str:
    """Create Flyway's stdin-only config without writing a host file."""

    host = _require_text(host, "host")
    database = _require_text(database, "database")
    user = _require_text(user, "database user")
    password = _require_secret(password, "database password")
    if "\r" in password or "\n" in password:
        raise MigrationGuardError("database password cannot contain a newline")
    url = (
        f"jdbc:mysql://{host}:{_parse_port(port)}/{database}"
        "?sslMode=VERIFY_IDENTITY"
        "&tlsVersions=TLSv1.2,TLSv1.3"
        "&fallbackToSystemTrustStore=true"
        "&useSsl=true"
        "&trustServerCertificate=false"
        "&disableSslHostnameVerification=false"
        "&enabledSslProtocolSuites=TLSv1.2,TLSv1.3"
        "&allowPublicKeyRetrieval=false"
        "&connectTimeout=15000"
        "&socketTimeout=120000"
    )
    return "\n".join(
        (
            "[environments.default]",
            f"url = {_toml_string(url)}",
            f"user = {_toml_string(user)}",
            f"password = {_toml_string(password)}",
            "",
            "[flyway]",
            'environment = "default"',
        )
    ) + "\n"


def build_mysql_payload(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    sql: str,
) -> str:
    """Build a disposable mysql-client config + bounded SELECT script."""

    host = _require_text(host, "host")
    database = _require_text(database, "database")
    user = _require_text(user, "database user")
    password = _require_secret(password, "database password")
    _read_only_sql_statements(sql)
    if SQL_MARKER in sql or SQL_MARKER in password:
        raise MigrationGuardError("reserved SQL payload marker was supplied")
    config = "\n".join(
        (
            "[client]",
            f"host={host}",
            f"port={_parse_port(port)}",
            f"user={_escape_mysql_option(user)}",
            f"password={_escape_mysql_option(password)}",
            f"database={database}",
            "ssl-mode=VERIFY_IDENTITY",
            f"ssl-ca={MYSQL_CA_BUNDLE}",
            "tls-version=TLSv1.2,TLSv1.3",
            "",
        )
    )
    return config + SQL_MARKER + "\n" + sql.rstrip() + "\n"


def build_mysql_command(
    *,
    image_ref: str = MYSQL_CLIENT_IMAGE,
) -> list[str]:
    """Build a mysql client invocation whose credentials arrive only on stdin."""

    image_ref = _require_text(image_ref, "MySQL image reference")
    shell_script = r"""set -eu
umask 077
test -r /etc/pki/tls/certs/ca-bundle.crt
test -s /etc/pki/tls/certs/ca-bundle.crt
p=/tmp/lsvn3d-payload.$$
n=/tmp/lsvn3d-payload.$$.lf
c=/tmp/lsvn3d-client.$$.cnf
q=/tmp/lsvn3d-query.$$.sql
trap 'rm -f "$p" "$n" "$c" "$q"' EXIT HUP INT TERM
cat > "$p"
tr -d '\015' < "$p" > "$n"
mv "$n" "$p"
line=$(grep -n '^__LSVN3D_SQL_PAYLOAD__$' "$p" | head -n 1 | cut -d: -f1)
test -n "$line"
head -n $((line - 1)) "$p" > "$c"
tail -n +$((line + 1)) "$p" > "$q"
mysql --defaults-extra-file="$c" --connect-timeout=15 --batch --raw --skip-column-names < "$q"
"""
    return [
        resolve_docker_executable(),
        "run",
        "--pull=never",
        "--rm",
        "-i",
        image_ref,
        "sh",
        "-c",
        shell_script,
    ]


def validate_image_digest(observed: str, expected: str) -> str:
    """Require an exact immutable image digest, never a mutable tag alone."""

    expected = _require_text(expected, "expected image digest").lower()
    observed = _require_text(observed, "observed image digest").lower()
    digest_pattern = re.compile(r"^sha256:[0-9a-f]{64}$")
    if not digest_pattern.fullmatch(expected):
        raise MigrationGuardError("expected image digest is not a SHA-256 digest")
    if "@" in observed:
        observed = observed.rsplit("@", 1)[-1]
    if not digest_pattern.fullmatch(observed):
        raise MigrationGuardError("observed image digest is not a SHA-256 digest")
    if observed != expected:
        raise MigrationGuardError("Docker image digest does not match the approved artifact")
    return observed


def verify_docker_images() -> dict[str, str]:
    """Read-only local image verification; never pulls from a registry."""

    operator_values = {
        FLYWAY_IMAGE: _env("TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST"),
        MYSQL_CLIENT_IMAGE: _env("TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST"),
    }
    for image, operator_digest in operator_values.items():
        validate_image_digest(operator_digest, APPROVED_IMAGE_DIGESTS[image])
    docker_executable = resolve_docker_executable()
    environment = _sanitized_child_environment()
    _validate_docker_daemon_platform(docker_executable, environment)
    verified: dict[str, str] = {}
    for image, operator_digest in operator_values.items():
        approved_digest = APPROVED_IMAGE_DIGESTS[image]
        completed = _run_docker_metadata_command(
            docker_executable,
            [
                "image",
                "inspect",
                image,
                "--format",
                "{{json .RepoDigests}}|{{.Os}}|{{.Architecture}}",
            ],
            operation=f"image-inspect:{image}",
            environment=environment,
            timeout=DOCKER_IMAGE_INSPECT_TIMEOUT_SECONDS,
        )
        if completed.returncode != 0:
            # Distinguish a daemon outage from a genuinely absent local image.
            _validate_docker_daemon_platform(docker_executable, environment)
            if re.search(r"(?i)\bno such (?:image|object)\b", completed.stderr or ""):
                raise MigrationGuardError(
                    f"approved Docker image {image} is not available locally "
                    f"(image-inspect exit code {completed.returncode})"
                )
            raise MigrationGuardError(
                "Docker command failed during image-inspect "
                f"(exit code {completed.returncode})"
            )
        parts = completed.stdout.strip().rsplit("|", 2)
        if len(parts) != 3:
            raise MigrationGuardError(
                f"Docker returned invalid image metadata for {image}"
            )
        repo_digest_json, image_os, image_architecture = parts
        normalised_image_os = image_os.strip().lower()
        normalised_image_architecture = _normalise_docker_architecture(
            image_architecture
        )
        if (
            normalised_image_os != EXPECTED_DOCKER_SERVER_OS
            or normalised_image_architecture
            != EXPECTED_DOCKER_SERVER_ARCHITECTURE
        ):
            raise MigrationGuardError(
                f"approved Docker image {image} platform mismatch"
            )
        try:
            repo_digests = json.loads(repo_digest_json)
        except json.JSONDecodeError as exc:
            raise MigrationGuardError(
                f"Docker returned invalid digest metadata for {image}"
            ) from exc
        if not isinstance(repo_digests, list) or not repo_digests:
            raise MigrationGuardError(f"Docker image {image} has no immutable digest")
        image_name = image.rsplit(":", 1)[0]
        approved_reference = f"{image_name}@{approved_digest}"
        matched_digest: str | None = None
        for observed in repo_digests:
            if not isinstance(observed, str):
                continue
            if observed.strip().lower() != approved_reference.lower():
                continue
            try:
                matched_digest = validate_image_digest(observed, approved_digest)
            except MigrationGuardError:
                continue
            break
        if matched_digest is None:
            raise MigrationGuardError(
                f"Docker image {image} does not match the approved digest"
            )
        verified[image] = f"{image_name}@{matched_digest}"
    return verified


def redact_output(text: str, secrets: Iterable[str] = ()) -> str:
    """Redact exact secrets and common credential-bearing URL/config forms."""

    redacted = text
    for secret in sorted(
        (value for value in secrets if value),
        key=len,
        reverse=True,
    ):
        redacted = redacted.replace(secret, "[REDACTED]")
    redacted = SENSITIVE_URL.sub(r"\1[REDACTED]@", redacted)
    redacted = re.sub(
        r"(?im)^(flyway\.(?:user|password)=).*$",
        r"\1[REDACTED]",
        redacted,
    )
    redacted = re.sub(
        r"(?im)^(?:user|password)=.*$",
        "[REDACTED]",
        redacted,
    )
    return redacted


def _sanitized_child_environment() -> dict[str, str]:
    """Do not inherit application credentials into Docker CLI processes."""

    environment = os.environ.copy()
    for name in list(environment):
        upper_name = name.upper()
        if upper_name.startswith(
            ("TIDB_PRODUCTION_", "TIDB_REHEARSAL_")
        ) or upper_name in {
            "DOCKER_HOST",
            "DOCKER_CONTEXT",
            "DOCKER_TLS_VERIFY",
            "DOCKER_CERT_PATH",
        } or any(marker in upper_name for marker in SENSITIVE_ENV_MARKERS):
            environment.pop(name, None)
    return environment


def validate_local_docker_environment() -> None:
    """Prevent an inherited Docker context from redirecting credentials."""

    for name in (
        "DOCKER_HOST",
        "DOCKER_CONTEXT",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
    ):
        if os.environ.get(name):
            raise MigrationGuardError(
                f"{name} must be unset; the runner only permits the local Docker daemon"
            )
    docker_executable = resolve_docker_executable()
    environment = _sanitized_child_environment()
    context_result = _run_docker_metadata_command(
        docker_executable,
        ["context", "show"],
        operation="context-show",
        environment=environment,
    )
    if context_result.returncode != 0:
        raise MigrationGuardError(
            "Docker command failed during context-show "
            f"(exit code {context_result.returncode})"
        )
    context_name = context_result.stdout.strip()
    if not context_name:
        raise MigrationGuardError("Docker context name is empty")
    endpoint_result = _run_docker_metadata_command(
        docker_executable,
        [
            "context",
            "inspect",
            context_name,
            "--format",
            "{{json .Endpoints.docker.Host}}",
        ],
        operation="context-inspect",
        environment=environment,
    )
    if endpoint_result.returncode != 0:
        raise MigrationGuardError(
            "Docker command failed during context-inspect "
            f"(exit code {endpoint_result.returncode})"
        )
    try:
        endpoint = json.loads(endpoint_result.stdout)
    except json.JSONDecodeError as exc:
        raise MigrationGuardError("Docker context endpoint is invalid") from exc
    if not isinstance(endpoint, str) or not endpoint.startswith(
        ("npipe://", "unix://")
    ):
        raise MigrationGuardError(
            "Docker context endpoint is not a local npipe or Unix socket"
        )
    _validate_docker_daemon_platform(docker_executable, environment)


def _normalise_state(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ")


def _versioned_migrations(info: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    migrations = info.get("migrations")
    if not isinstance(migrations, list):
        raise MigrationGuardError("Flyway info did not contain a migrations list")
    return [
        migration
        for migration in migrations
        if isinstance(migration, Mapping) and str(migration.get("version") or "")
    ]


def _validate_flyway_envelope(
    payload: Mapping[str, Any],
    *,
    operation: str,
    expected_database: str,
    expected_flyway_version: str,
) -> None:
    if payload.get("operation") != operation:
        raise MigrationGuardError(
            f"Flyway response operation is not {operation!r}"
        )
    warnings = payload.get("warnings", [])
    if warnings is None:
        warnings = []
    if not isinstance(warnings, list):
        raise MigrationGuardError(f"Flyway {operation} warnings payload is invalid")
    if warnings:
        summaries: list[str] = []
        for warning in warnings[:3]:
            if isinstance(warning, Mapping):
                raw = str(warning.get("message") or warning.get("code") or "warning")
            else:
                raw = str(warning)
            safe = redact_output(raw)
            safe = re.sub(r"(?i)(password|secret|token)=[^\s,;]+", r"\1=[REDACTED]", safe)
            summaries.append(safe[:240])
        raise MigrationGuardError(
            f"Flyway returned unexpected warnings for {operation}: "
            + " | ".join(summaries)
        )
    if str(payload.get("database") or "") != expected_database:
        raise MigrationGuardError(
            f"Flyway {operation} database does not match target"
        )
    if str(payload.get("flywayVersion") or "") != expected_flyway_version:
        raise MigrationGuardError(
            f"Flyway {operation} CLI version is not pinned"
        )


def validate_flyway_info(
    info: Mapping[str, Any],
    *,
    expected_current: str = EXPECTED_CURRENT_VERSION,
    expected_pending: Sequence[str] = EXPECTED_PENDING_VERSIONS,
    expected_database: str = EXPECTED_DATABASE,
    expected_flyway_version: str = "11.14.1",
) -> dict[str, Any]:
    """Reject every partial, failed, missing, future or out-of-order state."""

    _validate_flyway_envelope(
        info,
        operation="info",
        expected_database=expected_database,
        expected_flyway_version=expected_flyway_version,
    )
    current = str(info.get("schemaVersion") or "")
    if current != str(expected_current):
        raise MigrationGuardError(
            f"expected schema version {expected_current}, got {current or '<none>'}"
        )

    expected_pending = tuple(str(version) for version in expected_pending)
    all_migrations = info.get("migrations")
    if not isinstance(all_migrations, list):
        raise MigrationGuardError("Flyway info did not contain a migrations list")
    for migration in all_migrations:
        if not isinstance(migration, Mapping):
            raise MigrationGuardError("Flyway info contained a malformed migration entry")
        if not str(migration.get("version") or ""):
            raise MigrationGuardError(
                "repeatable or unversioned migration state is not allowed"
            )
    migrations = _versioned_migrations(info)
    observed: dict[str, str] = {}
    forbidden = {
        "failed",
        "missing",
        "future",
        "ignored",
        "deleted",
        "out of order",
        "above target",
        "below baseline",
        "baseline",
    }
    for migration in migrations:
        version = str(migration.get("version"))
        if not re.fullmatch(r"\d+", version):
            raise MigrationGuardError(
                f"Flyway migration version is not numeric: {version!r}"
            )
        state = _normalise_state(migration.get("state"))
        if version in observed:
            raise MigrationGuardError(f"duplicate Flyway migration version {version}")
        observed[version] = state
        if state in forbidden:
            raise MigrationGuardError(
                f"Flyway migration {version} has unsafe state {migration.get('state')!r}"
            )
        if int(version) <= int(expected_current) and state != "success":
            raise MigrationGuardError(
                f"applied migration {version} is not in Success state"
            )
        if version in expected_pending and state != "pending":
            raise MigrationGuardError(
                f"expected migration {version} to be Pending, got {state}"
            )
        if version not in expected_pending and int(version) > int(expected_current):
            raise MigrationGuardError(
                f"unexpected migration version {version} in Flyway info"
            )

    observed_pending = sorted(
        (version for version, state in observed.items() if state == "pending"),
        key=int,
    )
    if observed_pending != sorted(expected_pending, key=int):
        raise MigrationGuardError(
            f"pending migration set mismatch: {observed_pending!r}"
        )
    expected_applied = {str(version) for version in range(1, int(expected_current) + 1)}
    observed_applied = {
        version
        for version, state in observed.items()
        if int(version) <= int(expected_current) and state == "success"
    }
    if observed_applied != expected_applied:
        raise MigrationGuardError("Flyway applied migration set is incomplete")
    return {
        "current_version": current,
        "pending_versions": observed_pending,
        "database": expected_database,
        "flyway_version": expected_flyway_version,
    }


def validate_flyway_validate(
    result: Mapping[str, Any],
    *,
    expected_database: str = EXPECTED_DATABASE,
    expected_flyway_version: str = "11.14.1",
) -> None:
    _validate_flyway_envelope(
        result,
        operation="validate",
        expected_database=expected_database,
        expected_flyway_version=expected_flyway_version,
    )
    invalid_migrations = result.get("invalidMigrations")
    if result.get("validationSuccessful") is not True:
        detail = redact_output(json.dumps(invalid_migrations, ensure_ascii=False))[:600]
        raise MigrationGuardError(f"Flyway validation did not succeed: {detail}")
    if not isinstance(invalid_migrations, list) or invalid_migrations:
        detail = redact_output(json.dumps(invalid_migrations, ensure_ascii=False))[:600]
        raise MigrationGuardError(f"Flyway reported invalid migrations: {detail}")
def validate_flyway_migrate(
    result: Mapping[str, Any],
    *,
    expected_database: str = EXPECTED_DATABASE,
    expected_flyway_version: str = "11.14.1",
) -> None:
    if str(result.get("initialSchemaVersion") or "") != EXPECTED_CURRENT_VERSION:
        raise MigrationGuardError("Flyway migrate started from an unexpected version")
    if str(result.get("targetSchemaVersion") or "") != TARGET_VERSION:
        raise MigrationGuardError("Flyway migrate did not target V41")
    if int(result.get("migrationsExecuted") or -1) != len(
        EXPECTED_PENDING_VERSIONS
    ):
        raise MigrationGuardError("Flyway did not execute exactly V38-V41")
    migrations = result.get("migrations")
    if not isinstance(migrations, list):
        raise MigrationGuardError("Flyway migrate did not contain a migrations list")
    if any(not isinstance(item, Mapping) for item in migrations):
        raise MigrationGuardError("Flyway migrate contained a malformed migration entry")
    versions = [
        str(item.get("version"))
        for item in migrations
        if item.get("version") is not None
    ]
    if versions != list(EXPECTED_PENDING_VERSIONS):
        raise MigrationGuardError(
            f"Flyway executed unexpected migration versions: {versions!r}"
        )
    _validate_flyway_envelope(
        result,
        operation="migrate",
        expected_database=expected_database,
        expected_flyway_version=expected_flyway_version,
    )


def _canonical_sql_bytes(path: Path) -> bytes:
    """Hash SQL independently of checkout newline conversion."""

    return path.read_bytes().replace(b"\r\n", b"\n")


@contextmanager
def canonical_migration_directory(
    source: Path,
    *,
    manifest_path: Path,
    expected_versions: Sequence[int] | None = None,
) -> Iterator[Path]:
    """Yield a disposable, manifest-verified LF-only Flyway source."""

    source = Path(source)
    manifest_path = Path(manifest_path)
    if not source.is_dir():
        raise MigrationGuardError("migration source directory is missing")
    try:
        manifest_bytes = manifest_path.read_bytes()
    except OSError as exc:
        raise MigrationGuardError("migration manifest is missing") from exc
    verify_migration_manifest(
        source,
        manifest_path,
        expected_versions=expected_versions,
        manifest_bytes=manifest_bytes,
    )
    with tempfile.TemporaryDirectory(prefix="lsvn3d-flyway-") as directory:
        staged = Path(directory) / "sql"
        staged.mkdir()
        for path in source.iterdir():
            if not path.is_file() or path.is_symlink():
                raise MigrationGuardError(
                    f"unsupported migration source entry: {path.name}"
                )
            destination = staged / path.name
            destination.write_bytes(_canonical_sql_bytes(path))
        # Re-hash the disposable copy, not only the source.  If a source file
        # changes while it is being copied, Flyway must never see that copy.
        verify_migration_manifest(
            staged,
            manifest_path,
            expected_versions=expected_versions,
            manifest_bytes=manifest_bytes,
        )
        yield staged


def verify_migration_manifest(
    migration_dir: Path,
    manifest_path: Path,
    *,
    expected_versions: Sequence[int] | None = None,
    manifest_bytes: bytes | None = None,
) -> list[str]:
    """Verify the exact immutable V1-V41 source set and SHA-256 values."""

    migration_dir = Path(migration_dir)
    manifest_path = Path(manifest_path)
    if expected_versions is None:
        expected_versions = tuple(range(1, int(TARGET_VERSION) + 1))
    expected_version_set = {int(version) for version in expected_versions}
    if not migration_dir.is_dir() or not manifest_path.is_file():
        raise MigrationGuardError("migration directory or manifest is missing")
    expected: dict[str, str] = {}
    if manifest_bytes is None:
        try:
            manifest_bytes = manifest_path.read_bytes()
        except OSError as exc:
            raise MigrationGuardError("migration manifest is missing") from exc
    try:
        manifest_text = manifest_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise MigrationGuardError("migration manifest is not UTF-8") from exc
    for raw_line in manifest_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?(.+)", line)
        if not match:
            raise MigrationGuardError("manifest contains an invalid line")
        digest, name = match.groups()
        if name in expected:
            raise MigrationGuardError(f"manifest contains duplicate {name}")
        expected[name] = digest.lower()

    files = sorted(
        (path for path in migration_dir.iterdir() if path.is_file()),
        key=lambda path: int(
            VERSIONED_MIGRATION_NAME.match(path.name).group(1)
        )
        if VERSIONED_MIGRATION_NAME.match(path.name)
        else 10**9,
    )
    actual_names = {path.name for path in files}
    if actual_names != set(expected):
        missing = sorted(set(expected) - actual_names)
        extra = sorted(actual_names - set(expected))
        raise MigrationGuardError(
            f"migration source set mismatch; missing={missing}, extra={extra}"
        )
    observed_versions: set[int] = set()
    for name in actual_names:
        match = VERSIONED_MIGRATION_NAME.fullmatch(name)
        if not match:
            raise MigrationGuardError(
                f"non-versioned or unsupported migration file found: {name}"
            )
        observed_versions.add(int(match.group(1)))
    if observed_versions != expected_version_set:
        raise MigrationGuardError(
            "migration version set does not match the approved release"
        )
    for path in files:
        actual = hashlib.sha256(_canonical_sql_bytes(path)).hexdigest()
        if actual != expected[path.name]:
            raise MigrationGuardError(f"checksum mismatch for {path.name}")
    return [path.name for path in files]


def find_flyway_callbacks(migration_dir: Path) -> list[Path]:
    callbacks: list[Path] = []
    for path in Path(migration_dir).rglob("*"):
        if not path.is_file():
            continue
        if CALLBACK_NAME.fullmatch(path.name):
            callbacks.append(path)
    return sorted(callbacks)


def parse_mysql_metadata(output: str) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 1)
        if len(parts) != 2:
            raise MigrationGuardError("metadata query returned an unexpected row")
        key, value = parts
        if key in metadata:
            raise MigrationGuardError(f"metadata key repeated: {key}")
        metadata[key] = value
    return metadata


def build_metadata_sql(*, postflight: bool = False) -> str:
    """Only bounded SELECT statements; no INSERT/UPDATE/DDL is present."""

    statements = [
        "SELECT 'server_version', VERSION()",
        "SELECT 'version_comment', @@version_comment",
        "SELECT 'database', DATABASE()",
        "SELECT 'global_time_zone', @@global.time_zone",
        "SELECT 'session_time_zone', @@session.time_zone",
        "SELECT 'character_set_database', @@character_set_database",
        "SELECT 'collation_database', @@collation_database",
        "SELECT 'sql_mode', @@sql_mode",
        "SELECT 'active_admin_count', (SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code='admin')",
        "SELECT 'failed_migration_count', (SELECT COUNT(*) FROM flyway_schema_history WHERE success=0)",
        "SELECT 'users_total', (SELECT COUNT(*) FROM users)",
        "SELECT 'events_total', (SELECT COUNT(*) FROM historical_events)",
        "SELECT 'user_roles_total', (SELECT COUNT(*) FROM user_roles)",
        "SELECT 'roles_total', (SELECT COUNT(*) FROM roles)",
        "SELECT 'admin_role_assignment_count', (SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code='admin')",
        "SELECT 'role_code_counts', COALESCE((SELECT GROUP_CONCAT(CONCAT(code,'=',n) ORDER BY code SEPARATOR ',') FROM (SELECT code, COUNT(*) n FROM roles GROUP BY code) s), '')",
        "SELECT 'role_assignment_counts', COALESCE((SELECT GROUP_CONCAT(CONCAT(code,'=',n) ORDER BY code SEPARATOR ',') FROM (SELECT r.code, COUNT(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id GROUP BY r.code) s), '')",
        "SELECT 'event_status_counts', COALESCE((SELECT GROUP_CONCAT(CONCAT(status,'=',n) ORDER BY status SEPARATOR ',') FROM (SELECT status, COUNT(*) n FROM historical_events GROUP BY status) s), '')",
        "SELECT 'user_status_counts', COALESCE((SELECT GROUP_CONCAT(CONCAT(status,'=',n) ORDER BY status SEPARATOR ',') FROM (SELECT status, COUNT(*) n FROM users GROUP BY status) s), '')",
    ]
    if postflight:
        statements.extend(
            [
                "SELECT 'historical_events_updated_at_type', LOWER(data_type) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='historical_events' AND column_name='updated_at'",
                "SELECT 'historical_events_updated_at_precision', COALESCE(CAST(datetime_precision AS CHAR), '') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='historical_events' AND column_name='updated_at'",
                "SELECT 'users_updated_at_type', LOWER(data_type) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='updated_at'",
                "SELECT 'users_updated_at_precision', COALESCE(CAST(datetime_precision AS CHAR), '') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='updated_at'",
                "SELECT 'users_auth_version_type', LOWER(column_type) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='auth_version'",
                "SELECT 'users_auth_version_nullable', is_nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='auth_version'",
                "SELECT 'users_auth_version_default', COALESCE(CAST(column_default AS CHAR), '') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='auth_version'",
                "SELECT 'auth_version_positive_count', (SELECT COUNT(*) FROM users WHERE auth_version > 0)",
                "SELECT 'admin_guard_rows', (SELECT COUNT(*) FROM admin_mutation_guards)",
                "SELECT 'admin_guard_active_count', (SELECT active_admin_count FROM admin_mutation_guards WHERE guard_key='last_active_admin')",
            ]
        )
    return ";\n".join(statements) + ";\n"


def validate_database_metadata(
    metadata: Mapping[str, str],
    *,
    minimum_active_admins: int = 2,
) -> None:
    version = metadata.get("server_version", "")
    if not re.search(r"tidb[- ]v?8\.5\.3\b", version, re.IGNORECASE):
        raise MigrationGuardError(
            "remote engine is not the verified TiDB v8.5.3 release"
        )
    if "tidb" not in metadata.get("version_comment", "").lower():
        raise MigrationGuardError("remote version comment is not TiDB")
    if metadata.get("database") != EXPECTED_DATABASE:
        raise MigrationGuardError("metadata database does not match target")
    try:
        active_admins = int(metadata.get("active_admin_count", "-1"))
        failed = int(metadata.get("failed_migration_count", "-1"))
    except ValueError as exc:
        raise MigrationGuardError("operational metadata contains a non-number") from exc
    if active_admins < minimum_active_admins:
        raise MigrationGuardError("production requires at least two active Admins")
    if failed != 0:
        raise MigrationGuardError("Flyway history contains failed migrations")
    for key in (
        "global_time_zone",
        "session_time_zone",
        "character_set_database",
        "collation_database",
        "sql_mode",
        "users_total",
        "events_total",
        "user_roles_total",
        "roles_total",
        "admin_role_assignment_count",
        "role_code_counts",
        "role_assignment_counts",
        "event_status_counts",
        "user_status_counts",
    ):
        if key not in metadata:
            raise MigrationGuardError(f"operational metadata is missing {key}")
    for key in (
        "global_time_zone",
        "session_time_zone",
        "character_set_database",
        "collation_database",
    ):
        if not str(metadata.get(key, "")).strip():
            raise MigrationGuardError(f"operational metadata is empty for {key}")
    for key in (
        "users_total",
        "events_total",
        "user_roles_total",
        "roles_total",
        "admin_role_assignment_count",
    ):
        try:
            number = int(metadata[key])
        except (TypeError, ValueError) as exc:
            raise MigrationGuardError(
                f"operational metadata is not a count for {key}"
            ) from exc
        if number < 0:
            raise MigrationGuardError(f"operational metadata is negative for {key}")
    if int(metadata["admin_role_assignment_count"]) < active_admins:
        raise MigrationGuardError(
            "admin role assignments are fewer than active Admins"
        )


def validate_operational_counts_unchanged(
    after: Mapping[str, str],
    before: Mapping[str, str],
) -> None:
    for key in (
        "users_total",
        "events_total",
        "user_roles_total",
        "roles_total",
        "admin_role_assignment_count",
        "role_code_counts",
        "role_assignment_counts",
        "active_admin_count",
        "event_status_counts",
        "user_status_counts",
    ):
        if key not in before or key not in after:
            raise MigrationGuardError(
                f"bounded operational metadata is missing {key}"
            )
        if after.get(key) != before.get(key):
            raise MigrationGuardError(
                f"bounded operational count changed for {key}"
            )


def validate_postflight_metadata(
    metadata: Mapping[str, str],
    before: Mapping[str, str],
) -> None:
    validate_database_metadata(metadata)
    expected = {
        "historical_events_updated_at_type": "datetime",
        "historical_events_updated_at_precision": "6",
        "users_updated_at_type": "datetime",
        "users_updated_at_precision": "6",
        "users_auth_version_type": "bigint",
        "users_auth_version_nullable": "NO",
        "users_auth_version_default": "0",
        "auth_version_positive_count": "0",
        "admin_guard_rows": "1",
    }
    for key, value in expected.items():
        if str(metadata.get(key, "")).lower() != value.lower():
            raise MigrationGuardError(
                f"postflight schema check failed for {key}: "
                f"{metadata.get(key)!r}"
            )
    if metadata.get("admin_guard_active_count") != metadata.get(
        "active_admin_count"
    ):
        raise MigrationGuardError("active Admin guard counter is stale")
    validate_operational_counts_unchanged(metadata, before)


def _execute(command: Sequence[str], stdin: str) -> CommandResult:
    completed = subprocess.run(
        list(command),
        input=stdin,
        text=True,
        capture_output=True,
        check=False,
        env=_sanitized_child_environment(),
    )
    return CommandResult(
        tuple(str(part) for part in command),
        completed.returncode,
        completed.stdout,
        completed.stderr,
    )


def run_external(
    command: Sequence[str],
    stdin: str,
    *,
    secrets: Iterable[str] = (),
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> CommandResult:
    try:
        result = executor(command, stdin)
    except OSError as exc:
        raise MigrationGuardError("external command could not be started") from exc
    if result.returncode != 0:
        message = redact_output(
            (result.stderr or result.stdout).strip(),
            secrets,
        )
        raise MigrationGuardError(
            f"external command failed with exit code {result.returncode}: {message}"
        )
    return result


def _parse_json_output(result: CommandResult, secrets: Iterable[str]) -> Mapping[str, Any]:
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        safe = redact_output(result.stdout[-2000:], secrets)
        raise MigrationGuardError(
            f"Flyway returned non-JSON output: {safe}"
        ) from exc
    if not isinstance(payload, Mapping):
        raise MigrationGuardError("Flyway returned a non-object JSON payload")
    return payload


def run_flyway(
    *,
    migration_dir: Path,
    operation: str,
    config: str,
    image_ref: str = FLYWAY_IMAGE,
    target_version: str = TARGET_VERSION,
    secrets: Iterable[str] = (),
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> Mapping[str, Any]:
    command = build_flyway_command(
        migration_dir,
        operation,
        image_ref=image_ref,
        target_version=target_version,
    )
    result = run_external(command, config, secrets=secrets, executor=executor)
    return _parse_json_output(result, secrets)


def run_validated_migration(
    *,
    migration_dir: Path,
    config: str,
    image_ref: str = FLYWAY_IMAGE,
    secrets: Iterable[str] = (),
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> Mapping[str, Any]:
    """Validate with the migration account immediately before writing."""

    info = run_flyway(
        migration_dir=migration_dir,
        operation="info",
        config=config,
        image_ref=image_ref,
        secrets=secrets,
        executor=executor,
    )
    validate_flyway_info(info)
    validate_flyway_validate(
        run_flyway(
            migration_dir=migration_dir,
            operation="validate",
            config=config,
            image_ref=image_ref,
            secrets=secrets,
            executor=executor,
        )
    )
    result = run_flyway(
        migration_dir=migration_dir,
        operation="migrate",
        config=config,
        image_ref=image_ref,
        secrets=secrets,
        executor=executor,
    )
    validate_flyway_migrate(result)
    return result


def run_mysql_metadata(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    postflight: bool,
    image_ref: str = MYSQL_CLIENT_IMAGE,
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> dict[str, str]:
    payload = build_mysql_payload(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
        sql=build_metadata_sql(postflight=postflight),
    )
    result = run_external(
        build_mysql_command(image_ref=image_ref),
        payload,
        secrets=(user, password),
        executor=executor,
    )
    return parse_mysql_metadata(result.stdout)


def _migration_paths(repo_root: Path) -> tuple[Path, Path]:
    migration_dir = (
        Path(repo_root)
        / "backend"
        / "src"
        / "main"
        / "resources"
        / "db"
        / "migration"
    )
    manifest = Path(repo_root) / "scripts" / "deploy" / MANIFEST_NAME
    return migration_dir, manifest


def verify_release_checkout(repo_root: Path, expected_commit: str) -> None:
    expected_commit = _require_text(expected_commit, "release commit")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", expected_commit):
        raise MigrationGuardError("release commit must be a full 40-character SHA")
    try:
        current = subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.STDOUT,
            env=_sanitized_child_environment(),
        ).strip()
        dirty = subprocess.check_output(
            [
                "git",
                "-C",
                str(repo_root),
                "status",
                "--porcelain",
                "--untracked-files=all",
                "--",
                *RELEASE_CHECK_PATHS,
            ],
            text=True,
            stderr=subprocess.STDOUT,
            env=_sanitized_child_environment(),
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise MigrationGuardError("cannot verify the release checkout") from exc
    if current.lower() != expected_commit.lower():
        raise MigrationGuardError("checkout does not match the approved release commit")
    if dirty:
        raise MigrationGuardError("migration directory has uncommitted changes")


def local_check(repo_root: Path) -> dict[str, Any]:
    migration_dir, manifest = _migration_paths(repo_root)
    files = verify_migration_manifest(migration_dir, manifest)
    callbacks = find_flyway_callbacks(migration_dir)
    if callbacks:
        raise MigrationGuardError(
            "callback files are not allowed in the standalone migration artifact: "
            + ", ".join(str(path) for path in callbacks)
        )
    return {
        "migration_count": len(files),
        "first_migration": files[0],
        "last_migration": files[-1],
        "flyway_image": FLYWAY_IMAGE,
        "target_version": TARGET_VERSION,
    }


def _env(name: str, *, secret: bool = False) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        raise MigrationGuardError(f"required environment variable {name} is missing")
    return _require_secret(value, name) if secret else value.strip()


def _target_from_environment(confirmation: str) -> dict[str, Any]:
    return validate_target(
        host=_env("TIDB_PRODUCTION_HOST"),
        port=int(os.environ.get("TIDB_PRODUCTION_PORT", "4000")),
        database=_env("TIDB_PRODUCTION_DATABASE"),
        target_identity=_env("TIDB_PRODUCTION_TARGET_ID"),
        confirmation=confirmation,
    )


def _credentials(prefix: str) -> tuple[str, str]:
    return _env(f"{prefix}_USER", secret=True), _env(
        f"{prefix}_PASSWORD", secret=True
    )


def _run_preflight(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    read_user: str,
    read_password: str,
    flyway_image: str = FLYWAY_IMAGE,
    mysql_image: str = MYSQL_CLIENT_IMAGE,
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> dict[str, Any]:
    migration_dir, manifest = _migration_paths(repo_root)
    local_check(repo_root)
    config = build_flyway_config(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=read_user,
        password=read_password,
    )
    secrets = (read_user, read_password)
    with canonical_migration_directory(
        migration_dir,
        manifest_path=manifest,
        expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
    ) as flyway_dir:
        info = run_flyway(
            migration_dir=flyway_dir,
            operation="info",
            config=config,
            image_ref=flyway_image,
            secrets=secrets,
            executor=executor,
        )
        info_state = validate_flyway_info(info)
        validate_flyway_validate(
            run_flyway(
                migration_dir=flyway_dir,
                operation="validate",
                config=config,
                image_ref=flyway_image,
                secrets=secrets,
                executor=executor,
            )
        )
    metadata = run_mysql_metadata(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=read_user,
        password=read_password,
        postflight=False,
        image_ref=mysql_image,
        executor=executor,
    )
    validate_database_metadata(metadata)
    return {"flyway": info_state, "metadata": metadata}


def _write_evidence(path: Path, payload: Mapping[str, Any]) -> None:
    path = Path(path)
    if path.suffix.lower() != ".json":
        raise MigrationGuardError("evidence path must end with .json")
    if path.exists() or path.is_symlink():
        raise MigrationGuardError("refusing to overwrite existing evidence")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise MigrationGuardError("evidence directory cannot be created") from exc
    data = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    created = False
    try:
        descriptor = os.open(
            path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        created = True
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
    except FileExistsError as exc:
        raise MigrationGuardError("refusing to overwrite existing evidence") from exc
    except OSError as exc:
        if created:
            try:
                path.unlink()
            except OSError:
                pass
        raise MigrationGuardError("evidence file cannot be written") from exc


def _canonical_evidence_payload(payload: Mapping[str, Any]) -> bytes:
    unsigned = {
        key: value
        for key, value in payload.items()
        if key != "evidence_sha256"
    }
    return json.dumps(
        unsigned,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _evidence_sha256(payload: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_evidence_payload(payload)).hexdigest()


def validate_evidence_integrity(evidence: Mapping[str, Any]) -> None:
    if evidence.get("format_version") != EVIDENCE_FORMAT_VERSION:
        raise MigrationGuardError("evidence format version is unsupported")
    digest = evidence.get("evidence_sha256")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        raise MigrationGuardError("evidence integrity digest is missing or invalid")
    expected = _evidence_sha256(evidence)
    if not hmac.compare_digest(digest.lower(), expected):
        raise MigrationGuardError("evidence integrity digest mismatch")


def build_evidence(
    *,
    mode: str,
    target: Mapping[str, Any],
    release_commit: str,
    flyway: Mapping[str, Any],
    metadata: Mapping[str, str],
) -> dict[str, Any]:
    payload = {
        "format_version": EVIDENCE_FORMAT_VERSION,
        "mode": mode,
        "target": {
            "target_identity": target["target_identity"],
            "host": target["host"],
            "port": target["port"],
            "database": target["database"],
        },
        "release_commit": release_commit.lower(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "flyway": dict(flyway),
        "metadata": dict(metadata),
    }
    payload["evidence_sha256"] = _evidence_sha256(payload)
    return payload


def validate_evidence_binding(
    evidence: Mapping[str, Any],
    *,
    target: Mapping[str, Any],
    expected_release_commit: str,
    expected_evidence_sha256: str | None = None,
) -> None:
    validate_evidence_integrity(evidence)
    evidence_target = evidence.get("target")
    if not isinstance(evidence_target, Mapping):
        raise MigrationGuardError("evidence has no target binding")
    if set(evidence_target) != {"target_identity", "host", "port", "database"}:
        raise MigrationGuardError("evidence target has an invalid shape")
    for key in ("target_identity", "host", "port", "database"):
        if str(evidence_target.get(key)) != str(target.get(key)):
            raise MigrationGuardError(
                f"evidence target binding mismatch for {key}"
            )
    if not isinstance(evidence_target.get("port"), int):
        raise MigrationGuardError("evidence target port is invalid")
    if str(evidence.get("release_commit", "")).lower() != str(
        expected_release_commit
    ).lower():
        raise MigrationGuardError("evidence release commit binding mismatch")
    created_at = evidence.get("created_at")
    if not isinstance(created_at, str):
        raise MigrationGuardError("evidence has no creation timestamp")
    try:
        parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MigrationGuardError("evidence timestamp is invalid") from exc
    if parsed.tzinfo is None:
        raise MigrationGuardError("evidence timestamp has no timezone")
    if expected_evidence_sha256 is not None:
        if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_evidence_sha256):
            raise MigrationGuardError("expected evidence digest is invalid")
        if not hmac.compare_digest(
            str(evidence["evidence_sha256"]).lower(),
            expected_evidence_sha256.lower(),
        ):
            raise MigrationGuardError("evidence digest does not match the recorded digest")


def _read_evidence(path: Path) -> Mapping[str, Any]:
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        raise MigrationGuardError("preflight evidence file is missing")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise MigrationGuardError("preflight evidence cannot be read") from exc
    if len(raw) > MAX_EVIDENCE_BYTES:
        raise MigrationGuardError("preflight evidence is too large")

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise MigrationGuardError("preflight evidence has duplicate keys")
            result[key] = value
        return result

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MigrationGuardError("preflight evidence is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise MigrationGuardError("preflight evidence has an invalid shape")
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
    if set(value) != expected_keys or not isinstance(value.get("metadata"), Mapping):
        raise MigrationGuardError("preflight evidence has an invalid shape")
    if value.get("mode") != "preflight":
        raise MigrationGuardError("before evidence must come from preflight")
    validate_evidence_integrity(value)
    flyway = value.get("flyway")
    if not isinstance(flyway, Mapping):
        raise MigrationGuardError("preflight evidence has no Flyway state")
    expected_flyway = {
        "current_version": EXPECTED_CURRENT_VERSION,
        "pending_versions": list(EXPECTED_PENDING_VERSIONS),
        "database": EXPECTED_DATABASE,
        "flyway_version": "11.14.1",
    }
    if dict(flyway) != expected_flyway:
        raise MigrationGuardError("preflight evidence Flyway state is not V37 with V38-V41 pending")
    metadata = value["metadata"]
    if set(metadata) != PRE_FLIGHT_METADATA_KEYS:
        raise MigrationGuardError("preflight evidence metadata shape is not approved")
    validate_database_metadata(metadata)
    return value


def _run_postflight(
    *,
    repo_root: Path,
    target: Mapping[str, Any],
    read_user: str,
    read_password: str,
    before: Mapping[str, str],
    flyway_image: str = FLYWAY_IMAGE,
    mysql_image: str = MYSQL_CLIENT_IMAGE,
    executor: Callable[[Sequence[str], str], CommandResult] = _execute,
) -> dict[str, Any]:
    migration_dir, manifest = _migration_paths(repo_root)
    local_check(repo_root)
    config = build_flyway_config(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=read_user,
        password=read_password,
    )
    secrets = (read_user, read_password)
    with canonical_migration_directory(
        migration_dir,
        manifest_path=manifest,
        expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
    ) as flyway_dir:
        info = run_flyway(
            migration_dir=flyway_dir,
            operation="info",
            config=config,
            image_ref=flyway_image,
            secrets=secrets,
            executor=executor,
        )
        info_state = validate_flyway_info(
            info,
            expected_current=TARGET_VERSION,
            expected_pending=(),
        )
        validate_flyway_validate(
            run_flyway(
                migration_dir=flyway_dir,
                operation="validate",
                config=config,
                image_ref=flyway_image,
                secrets=secrets,
                executor=executor,
            )
        )
    metadata = run_mysql_metadata(
        host=target["host"],
        port=target["port"],
        database=target["database"],
        user=read_user,
        password=read_password,
        postflight=True,
        image_ref=mysql_image,
        executor=executor,
    )
    validate_postflight_metadata(metadata, before)
    return {"flyway": info_state, "metadata": metadata}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fail-closed TiDB production migration runner"
    )
    parser.add_argument(
        "--mode",
        choices=("local-check", "preflight", "migrate", "postflight"),
        default="local-check",
    )
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--expected-release-commit")
    parser.add_argument("--confirm-target")
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


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        repo_root = args.repo_root.resolve()
        if args.mode == "local-check":
            if args.expected_release_commit:
                verify_release_checkout(repo_root, args.expected_release_commit)
            print(json.dumps(local_check(repo_root), sort_keys=True))
            return 0
        if not args.expected_release_commit:
            raise MigrationGuardError(
                "--expected-release-commit is required outside local-check"
            )
        verify_release_checkout(repo_root, args.expected_release_commit)
        if not args.confirm_target:
            raise MigrationGuardError("--confirm-target is required")
        validate_local_docker_environment()
        target = _target_from_environment(args.confirm_target)
        read_user, read_password = _credentials("TIDB_PRODUCTION_READ")
        image_refs = verify_docker_images()
        before_evidence = None
        if args.mode in ("migrate", "postflight"):
            if not args.before_evidence:
                raise MigrationGuardError(
                    f"--before-evidence is required for {args.mode}"
                )
            if not args.before_evidence_sha256:
                raise MigrationGuardError(
                    f"--before-evidence-sha256 is required for {args.mode}"
                )
            before_evidence = _read_evidence(args.before_evidence)
            validate_evidence_binding(
                before_evidence,
                target=target,
                expected_release_commit=args.expected_release_commit,
                expected_evidence_sha256=args.before_evidence_sha256,
            )
        if args.mode == "postflight":
            assert before_evidence is not None
            postflight = _run_postflight(
                repo_root=repo_root,
                target=target,
                read_user=read_user,
                read_password=read_password,
                before=before_evidence["metadata"],
                flyway_image=image_refs[FLYWAY_IMAGE],
                mysql_image=image_refs[MYSQL_CLIENT_IMAGE],
            )
            evidence_digest = None
            if args.evidence_file:
                evidence_payload = build_evidence(
                    mode="postflight",
                    target=target,
                    release_commit=args.expected_release_commit,
                    flyway=postflight["flyway"],
                    metadata=postflight["metadata"],
                )
                _write_evidence(args.evidence_file, evidence_payload)
                evidence_digest = evidence_payload["evidence_sha256"]
            print(
                json.dumps(
                    {
                        "mode": "postflight",
                        "target": target["target_identity"],
                        "flyway": postflight["flyway"],
                        "active_admins": postflight["metadata"][
                            "active_admin_count"
                        ],
                        "evidence_sha256": evidence_digest,
                    },
                    sort_keys=True,
                )
            )
            return 0
        preflight = _run_preflight(
            repo_root=repo_root,
            target=target,
            read_user=read_user,
            read_password=read_password,
            flyway_image=image_refs[FLYWAY_IMAGE],
            mysql_image=image_refs[MYSQL_CLIENT_IMAGE],
        )
        if args.mode == "preflight":
            evidence_digest = None
            if args.evidence_file:
                evidence_payload = build_evidence(
                    mode="preflight",
                    target=target,
                    release_commit=args.expected_release_commit,
                    flyway=preflight["flyway"],
                    metadata=preflight["metadata"],
                )
                _write_evidence(args.evidence_file, evidence_payload)
                evidence_digest = evidence_payload["evidence_sha256"]
            print(
                json.dumps(
                    {
                        "mode": "preflight",
                        "target": target["target_identity"],
                        "flyway": preflight["flyway"],
                        "active_admins": preflight["metadata"][
                            "active_admin_count"
                        ],
                        "evidence_sha256": evidence_digest,
                    },
                    sort_keys=True,
                )
            )
            return 0
        if args.mode == "migrate":
            assert before_evidence is not None
            validate_operational_counts_unchanged(
                preflight["metadata"],
                before_evidence["metadata"],
            )
            if args.risk_accepted_minimal:
                validate_risk_accepted_minimal_gate(
                    risk_accepted_minimal=True,
                    backends_drained=args.backends_drained,
                    runtime_security_verified=args.runtime_security_verified,
                    execute_migrate=args.execute_migrate,
                )
            else:
                validate_approval_gates(
                    backup_evidence=args.backup_evidence or "",
                    restore_evidence=args.restore_evidence or "",
                    two_active_admins=args.two_active_admins,
                    backends_drained=args.backends_drained,
                    single_migration_owner=args.single_migration_owner,
                    maintenance_window=args.maintenance_window,
                    rollback_owner=args.rollback_owner,
                    runtime_security_verified=args.runtime_security_verified,
                    execute_migrate=args.execute_migrate,
                )
            migrate_user, migrate_password = _credentials("TIDB_PRODUCTION_MIGRATE")
            if migrate_user.casefold() == read_user.casefold():
                raise MigrationGuardError(
                    "migration and read accounts must be separate"
                )
            latest_before = run_mysql_metadata(
                host=target["host"],
                port=target["port"],
                database=target["database"],
                user=read_user,
                password=read_password,
                postflight=False,
                image_ref=image_refs[MYSQL_CLIENT_IMAGE],
            )
            validate_database_metadata(latest_before)
            validate_operational_counts_unchanged(
                latest_before,
                preflight["metadata"],
            )
            migration_dir, manifest = _migration_paths(repo_root)
            migrate_config = build_flyway_config(
                host=target["host"],
                port=target["port"],
                database=target["database"],
                user=migrate_user,
                password=migrate_password,
            )
            post_config = build_flyway_config(
                host=target["host"],
                port=target["port"],
                database=target["database"],
                user=read_user,
                password=read_password,
            )
            with canonical_migration_directory(
                migration_dir,
                manifest_path=manifest,
                expected_versions=tuple(range(1, int(TARGET_VERSION) + 1)),
            ) as flyway_dir:
                run_validated_migration(
                    migration_dir=flyway_dir,
                    config=migrate_config,
                    image_ref=image_refs[FLYWAY_IMAGE],
                    secrets=(migrate_user, migrate_password),
                )
                postflight = run_mysql_metadata(
                    host=target["host"],
                    port=target["port"],
                    database=target["database"],
                    user=read_user,
                    password=read_password,
                    postflight=True,
                    image_ref=image_refs[MYSQL_CLIENT_IMAGE],
                )
                validate_postflight_metadata(postflight, latest_before)
                post_info = run_flyway(
                    migration_dir=flyway_dir,
                    operation="info",
                    config=post_config,
                    image_ref=image_refs[FLYWAY_IMAGE],
                    secrets=(read_user, read_password),
                )
                validate_flyway_info(
                    post_info,
                    expected_current=TARGET_VERSION,
                    expected_pending=(),
                )
                validate_flyway_validate(
                    run_flyway(
                        migration_dir=flyway_dir,
                        operation="validate",
                        config=post_config,
                        image_ref=image_refs[FLYWAY_IMAGE],
                        secrets=(read_user, read_password),
                    )
                )
            evidence_digest = None
            if args.evidence_file:
                evidence_payload = build_evidence(
                    mode="postflight",
                    target=target,
                    release_commit=args.expected_release_commit,
                    flyway={
                        "current_version": TARGET_VERSION,
                        "pending_versions": [],
                        "database": EXPECTED_DATABASE,
                        "flyway_version": "11.14.1",
                    },
                    metadata=postflight,
                )
                _write_evidence(args.evidence_file, evidence_payload)
                evidence_digest = evidence_payload["evidence_sha256"]
            print(
                json.dumps(
                    {
                        "mode": "migrate",
                        "target": target["target_identity"],
                        "migrations": list(EXPECTED_PENDING_VERSIONS),
                        "active_admins": postflight["active_admin_count"],
                        "evidence_sha256": evidence_digest,
                    },
                    sort_keys=True,
                )
            )
            return 0
        raise MigrationGuardError(f"unsupported mode {args.mode}")
    except (MigrationGuardError, ValueError) as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
