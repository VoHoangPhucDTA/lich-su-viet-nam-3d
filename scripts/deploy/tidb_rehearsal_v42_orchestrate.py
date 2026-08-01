#!/usr/bin/env python3
"""Fail-closed TiDB V42 rehearsal orchestrator.

The strict V42 rehearsal runner (`scripts/deploy/tidb_rehearsal_v42_migration.py`)
is intentionally NOT modified and NOT imported.  This wrapper sequences it as a
subprocess with a sanitised child-process environment.

It performs, in order:

1. Discovers the rehearsal branch metadata via authenticated `ticloud`.
2. Reads the production cluster human output to capture the production
   user prefix.
3. Probes the bootstrap account via the pinned mysql:8.0.36 container
   (TLS VERIFY_IDENTITY, credentials stdin-only); verifies CURRENT_USER()
   is bound to the branch user-prefix and not the production prefix.
4. Provisions exactly two least-privilege temporary accounts on the
   rehearsal branch (read and migrate) using the bootstrap session.
5. Verifies both accounts can connect through TLS with their own
   credentials.
6. Writes a real identity-evidence JSON file (exactly the 9 string fields
   required by the strict runner) and its detached SHA-256 to a temp
   directory OUTSIDE the repository.
7. Runs the strict runner in `local-check`, then `preflight`, then
   `migrate` (which performs its own postflight) modes, forwarding only
   sanitised child env.
8. Reports a sanitised summary, classified.
9. In `finally`: drops only the two temp accounts created in this run
   via the bootstrap session, deletes the evidence directory, removes
   bootstrap variables from the wrapper process's environment.

NEVER writes to production, never modifies V42, never repairs/baselines/
cleans Flyway, never persists secrets.  The runner unit tests are not
touched.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterator, Mapping, Sequence


# ============================================================================
# Approved constants (mirror authoritative runbook + strict runner)
# ============================================================================

PROJECT_ID = "1372813089454789783"
PRODUCTION_CLUSTER_ID = "10427158774816979902"
REHEARSAL_BRANCH_ID = "bran-3uewl2rhirehfg67jczif3bet4"
REHEARSAL_BRANCH_NAME = "lichsuvn3d-admin-v42-rehearsal"
REHEARSAL_DATABASE = "lichsuvn"
REHEARSAL_PORT = 4000
ENGINE_VERSION = "TiDB Server v8.5.3"
FLYWAY_CURRENT_VERSION = "41"
FLYWAY_TARGET_VERSION = "42"

IDENTITY_SOURCE = "ticloud"

# Block categories surfaced by the orchestrator.  Each call site tags the
# OrchestrationGuardError it raises with the appropriate code so the final
# report and process exit always carry a precise classification.
BLOCK_CREDENTIAL_PROVISIONING = "BLOCKED_REHEARSAL_CREDENTIAL_PROVISIONING"
BLOCK_BOOTSTRAP_IDENTITY = "BLOCKED_REHEARSAL_BOOTSTRAP_IDENTITY"
BLOCK_CONFIGURATION = "BLOCKED_REHEARSAL_CONFIGURATION"
BLOCK_V42_RUNNER = "BLOCKED_V42_RUNNER_REHEARSAL"
BLOCK_PASSED = "V42_RUNNER_REHEARSAL_PASSED"

# Stable stage names (spec §2) used as the `stage` field on every forensic
# bytes / meta artifact and on every primary-failure record.  Adding a new
# diagnostic step MUST extend this tuple in execution order so existing
# tooling keeps parsing unchanged.
DIAGNOSTIC_STAGES: tuple[str, ...] = (
    "docker_image_inspect",
    "docker_container_create",
    "docker_container_start",
    "docker_container_wait",
    "docker_container_inspect",
    "docker_container_logs",
    "flyway_version",
    "flyway_info",
    "flyway_validate",
    "mysql_identity_probe",
    "mysql_flyway_history_probe",
    "mysql_schema_metadata_probe",
    "manifest_verification",
    "bounded_count_probe",
)

# Stable sanitized classifications for Docker-level exit codes (spec §4).
DOCKER_INVOCATION_FAILED_CODE = "DOCKER_INVOCATION_FAILED"
CONTAINER_NOT_EXECUTABLE_CODE = "CONTAINER_COMMAND_NOT_EXECUTABLE"
CONTAINER_NOT_FOUND_CODE = "CONTAINER_COMMAND_NOT_FOUND"
CONTAINER_PROCESS_FAILED_CODE = "CONTAINER_PROCESS_FAILED"
CONTAINER_OOM_CODE = "CONTAINER_OOM"
CONTAINER_TIMEOUT_CODE = "CONTAINER_TIMEOUT"

# Prefix the strict runner uses when both captured streams are empty (spec §8).
EMPTY_SUBPROCESS_OUTPUT_PREFIX = "EMPTY_SUBPROCESS_OUTPUT:"


STRICT_RUNNER_PATH = Path(__file__).resolve().parent / "tidb_rehearsal_v42_migration.py"

APPROVED_MYSQL_IMAGE = "mysql:8.0.36"
APPROVED_MYSQL_DIGEST = "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964"
APPROVED_FLYWAY_IMAGE = "redgate/flyway:11.14.1"
APPROVED_FLYWAY_DIGEST = "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d"
CA_IN_CONTAINER = "/etc/pki/tls/certs/ca-bundle.crt"

IDENTITY_EVIDENCE_KEYS: frozenset[str] = frozenset({
    "source", "state", "parent_cluster_id", "branch_id", "branch_name",
    "host", "database", "user_prefix", "engine_version",
})
ALLOWED_IDENTITY_SOURCES = frozenset({"ticloud", "tidb-cloud-console", "tidb-cloud-api"})
ALLOWED_IDENTITY_STATES = frozenset({"AVAILABLE", "ACTIVE", "RUNNING"})
USER_PREFIX_RX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$")
TECHNICAL_BRANCH_ID_RX = re.compile(r"^bran-[A-Za-z0-9][A-Za-z0-9_-]{5,127}$")
SQL_USER_RX = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@:-]{0,255}$")
TIDB_USER_MAX_LEN = 32  # TiDB/MySQL user_part length cap

SQL_MARKER = "__LSVN3D_SQL_PAYLOAD__"

READ_SUFFIX = "r"
MIGRATE_SUFFIX = "m"
RANDOM_HEX_LEN = 8

CHILD_ENV_ALLOWLIST: frozenset[str] = frozenset({
    "PATH", "PATHEXT", "COMSPEC", "OS",
    "SystemRoot", "WINDIR",
    "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH",
    "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PUBLIC",
    "PROGRAMFILES", "PROGRAMFILES(X86)",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
    "LOGONSERVER", "TMPDIR", "TEMP", "TMP",
    "LANG", "LC_ALL", "LC_CTYPE", "TZ", "LANGUAGE", "TERM", "SHELL",
    "PYTHONIOENCODING", "PYTHONUNBUFFERED",
    "USER", "LOGNAME",
})

FORBIDDEN_FROM_CHILD_ENV: frozenset[str] = frozenset({
    "TIDB_REHEARSAL_BOOTSTRAP_USER", "TIDB_REHEARSAL_BOOTSTRAP_PASSWORD",
    "TIDB_REHEARSAL_INSTANCE_ID",
    "TIDB_REHEARSAL_MIGRATION_USER", "TIDB_REHEARSAL_MIGRATION_PASSWORD",
})

BOOTSTRAP_USER_VAR = "TIDB_REHEARSAL_BOOTSTRAP_USER"
BOOTSTRAP_PASSWORD_VAR = "TIDB_REHEARSAL_BOOTSTRAP_PASSWORD"

PROBE_SQL = (
    "SELECT DATABASE();\n"
    "SELECT VERSION();\n"
    "SELECT CURRENT_USER();\n"
    "SELECT USER();\n"
    "SELECT 1;\n"
)


# ============================================================================
# Errors
# ============================================================================


class OrchestrationGuardError(RuntimeError):
    """Raised whenever the orchestrator cannot prove a safety invariant.

    The optional `code` attribute is the precise block classification that
    main() reports in its structured summary.  It also re-emits the
    classification in the summary if cleanup fails after a successful run.
    """

    def __init__(self, message: str, code: str = BLOCK_V42_RUNNER) -> None:
        super().__init__(message)
        self.code = code


def err(msg: str, code: str = BLOCK_V42_RUNNER) -> OrchestrationGuardError:
    return OrchestrationGuardError(msg, code)


# ============================================================================
# Subprocess helpers (always timeouts, never shell=True)
# ============================================================================


def _run(cmd: Sequence[str], *, input_text: str | None = None,
         timeout: int = 30, env: Mapping[str, str] | None = None,
         cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(cmd), text=True, capture_output=True, check=False,
        timeout=timeout, input=input_text, env=env, cwd=cwd,
    )


def safe_run(cmd: Sequence[str], *, input_text: str | None = None,
             timeout: int = 30, redact: Sequence[str] = ()) -> subprocess.CompletedProcess:
    proc = _run(cmd, input_text=input_text, timeout=timeout)
    if proc.returncode != 0:
        merged = ((proc.stderr or "") + (proc.stdout or "")).strip()
        for s in redact:
            if s:
                merged = merged.replace(s, "***REDACTED***")
        raise err(
            f"command failed rc={proc.returncode}: {' '.join(cmd[:4])} ... {merged[:1200]}"
        )
    return proc


# ============================================================================
# Discovery via ticloud
# ============================================================================


def ticloud_branch_list(cluster_id: str, *, timeout: int = 30) -> list[Mapping[str, Any]]:
    proc = safe_run(
        ["ticloud", "serverless", "branch", "list", "-c", cluster_id,
         "-o", "json", "--no-color"],
        timeout=timeout,
    )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise err(f"ticloud branch list returned non-JSON: {exc}")
    branches = payload.get("branches") or payload.get("items") or payload.get("data")
    if not isinstance(branches, list):
        raise err("ticloud branch list response shape unexpected (no array)")
    return branches


def select_branch(branches: Sequence[Mapping[str, Any]], branch_id: str) -> Mapping[str, Any]:
    for b in branches:
        if not isinstance(b, Mapping):
            continue
        ids = (b.get("branchId"), b.get("id"), b.get("branch_id"))
        if any(branch_id == str(v) for v in ids if v is not None):
            return b
    raise err(
        f"branch {branch_id} not found in ticloud branch list response",
        code=BLOCK_CONFIGURATION,
    )


def extract_branch_identity(branch: Mapping[str, Any]) -> dict[str, str]:
    branch_id = str(branch.get("branchId") or branch.get("id") or branch.get("branch_id") or "")
    display_name = str(branch.get("displayName") or branch.get("display_name")
                        or branch.get("name") or "")
    state = str(branch.get("state") or branch.get("status") or "")
    user_prefix = str(branch.get("userPrefix") or branch.get("user_prefix") or "")
    parent_id = str(branch.get("parentId") or branch.get("parent_id")
                     or branch.get("parent") or "")
    region = str(branch.get("region") or branch.get("regionId") or "")
    create_time = str(branch.get("createTime") or branch.get("created_at") or "")

    if not TECHNICAL_BRANCH_ID_RX.fullmatch(branch_id):
        raise err(f"branch id malformed in ticloud metadata: {branch_id!r}", code=BLOCK_CONFIGURATION)
    if display_name.strip() != REHEARSAL_BRANCH_NAME:
        raise err(
            f"branch display_name {display_name!r} != approved {REHEARSAL_BRANCH_NAME!r}",
            code=BLOCK_CONFIGURATION,
        )
    if state.strip().upper() not in ALLOWED_IDENTITY_STATES:
        raise err(f"branch state {state!r} not in approved states", code=BLOCK_CONFIGURATION)
    if not USER_PREFIX_RX.fullmatch(user_prefix):
        raise err(f"branch userPrefix malformed: {user_prefix!r}", code=BLOCK_CONFIGURATION)
    if parent_id != PRODUCTION_CLUSTER_ID:
        raise err(
            f"branch parentId {parent_id!r} != approved parent {PRODUCTION_CLUSTER_ID!r}",
            code=BLOCK_CONFIGURATION,
        )

    endpoints = branch.get("endpoints")
    host: str | None = None
    if isinstance(endpoints, Mapping):
        public = endpoints.get("public")
        if isinstance(public, Mapping):
            candidate = public.get("host") or public.get("endpoint") or public.get("hostname")
            host = str(candidate) if candidate else None
    elif isinstance(endpoints, list):
        for ep in endpoints:
            if isinstance(ep, Mapping) and not ep.get("private"):
                candidate = ep.get("host") or ep.get("endpoint") or ep.get("hostname")
                if candidate:
                    host = str(candidate)
                    break
    if not host:
        raise err(
            "branch endpoint host not present in ticloud metadata",
            code=BLOCK_CONFIGURATION,
        )
    host = host.strip().lower()
    if not host.endswith(".tidbcloud.com"):
        raise err(
            f"branch host {host!r} is not a TiDB Cloud endpoint",
            code=BLOCK_CONFIGURATION,
        )

    return {
        "branch_id": branch_id.strip(),
        "branch_name": display_name.strip(),
        "state": state.strip().upper(),
        "user_prefix": user_prefix.strip(),
        "host": host,
        "parent_id": parent_id.strip(),
        "region": region.strip(),
        "create_time": create_time.strip(),
    }


def ticloud_cluster_describe(cluster_id: str, *, timeout: int = 30) -> str:
    """Cluster describe emits only human text; return raw."""
    proc = safe_run(
        ["ticloud", "serverless", "describe", "-c", cluster_id, "--no-color"],
        timeout=timeout,
    )
    return proc.stdout


# Cluster-level "User Prefix" line.  We anchor on the exact label `User
# Prefix` at the start of a line, accept an optional dash/bullet prefix and
# minor whitespace variation, and require the captured value to match the
# full USER_PREFIX_RX shape.  Branch listings are read from `branch list`,
# not from cluster describe, so this label binding is unique here.
PROD_USER_PREFIX_RX = re.compile(
    r"^(?:\s*[-*]?\s*)?User\s*Prefix\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9._-]{1,127})\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def _validate_production_prefix(prefix: str) -> str:
    """Apply the USER_PREFIX_RX + collision guards shared by all parser paths."""
    if not USER_PREFIX_RX.fullmatch(prefix):
        raise err(
            f"production User Prefix malformed: {prefix!r}",
            code=BLOCK_CONFIGURATION,
        )
    if prefix.casefold() == "3c7ghu483vq9ynn":
        raise err(
            "production User Prefix collides with rehearsal branch prefix; aborting",
            code=BLOCK_CONFIGURATION,
        )
    if prefix.casefold() == (REHEARSAL_BRANCH_ID[5:]).casefold():
        raise err(
            "production User Prefix collides with rehearsal branch id suffix; aborting",
            code=BLOCK_CONFIGURATION,
        )
    return prefix


def _parse_production_user_prefix_from_payload(payload: Mapping[str, Any]) -> str:
    """Extract a userPrefix from a ticloud describe JSON payload."""
    if not isinstance(payload, Mapping):
        raise err(
            "ticloud describe payload is not a JSON object",
            code=BLOCK_CONFIGURATION,
        )
    candidate = str(payload.get("userPrefix") or payload.get("user_prefix") or "")
    if not candidate:
        raise err(
            "production User Prefix not present in ticloud describe JSON payload",
            code=BLOCK_CONFIGURATION,
        )
    return _validate_production_prefix(candidate)


def parse_production_user_prefix(text: str) -> str:
    """Extract production User Prefix.

    Strategy order:
      1. If `text` parses as a JSON object containing `userPrefix`, return it.
      2. Otherwise, fall back to the legacy regex over text.
    Falling back is the right behavior because early ticloud beta builds emit
    human text, while the current build emits JSON automatically.
    """
    payload: Mapping[str, Any] | None = None
    try:
        decoded = json.loads(text)
    except (ValueError, json.JSONDecodeError):
        decoded = None
    if isinstance(decoded, Mapping):
        try:
            return _parse_production_user_prefix_from_payload(decoded)
        except OrchestrationGuardError as exc:
            # If the JSON path failed because userPrefix is missing, try the
            # legacy regex.  Any other failure (malformed prefix / collision)
            # is fatal and must propagate.
            if "not present" not in str(exc).lower():
                raise
    m = PROD_USER_PREFIX_RX.search(text)
    if not m:
        raise err(
            "production User Prefix not present in ticloud cluster describe output",
            code=BLOCK_CONFIGURATION,
        )
    prefix = m.group(1).strip()
    return _validate_production_prefix(prefix)


def _try_parse_production_prefix_from_sql_user_list(
    cluster_id: str, *, timeout: int = 30,
) -> str | None:
    """Defensive fallback via `ticloud serverless sql-user list -o json`.

    Returns the most-common valid user-prefix among the listed SQL users, or
    None if the call fails or no valid prefix is found.  Never raises —
    callers should treat None as "no usable fallback" and surface a
    BLOCK_CONFIGURATION error themselves.
    """
    try:
        proc = safe_run(
            ["ticloud", "serverless", "sql-user", "list", "-c", cluster_id,
             "-o", "json", "--no-color"],
            timeout=timeout,
        )
    except OrchestrationGuardError:
        return None
    try:
        payload = json.loads(proc.stdout)
    except (ValueError, json.JSONDecodeError):
        return None
    users: Any = None
    if isinstance(payload, list):
        users = payload
    elif isinstance(payload, Mapping):
        users = payload.get("users") or payload.get("data") or payload.get("sqlUsers")
    if not isinstance(users, list) or not users:
        return None
    counts: dict[str, int] = {}
    for item in users:
        if not isinstance(item, Mapping):
            continue
        uname = str(item.get("userName") or item.get("user_name") or "")
        if "." not in uname:
            continue
        cand = uname.split(".", 1)[0]
        if USER_PREFIX_RX.fullmatch(cand):
            counts[cand] = counts.get(cand, 0) + 1
    if not counts:
        return None
    best = max(counts, key=lambda p: counts[p])
    try:
        return _validate_production_prefix(best)
    except OrchestrationGuardError:
        return None


# ============================================================================
# Bootstrap probe + temp account provisioning via pinned mysql container
# ============================================================================


def mysql_config_stdin(host: str, port: int, user: str, password: str) -> str:
    if "\x00" in user or "\x00" in password:
        raise err("credential contains NUL", code=BLOCK_CREDENTIAL_PROVISIONING)
    cfg_user = json.dumps(user, ensure_ascii=False)[1:-1].replace("\\", "\\\\")
    cfg_pwd = json.dumps(password, ensure_ascii=False)[1:-1].replace("\\", "\\\\")
    return (
        "[client]\n"
        f"host={host.lower()}\n"
        f"port={port}\n"
        f"user={cfg_user}\n"
        f"password={cfg_pwd}\n"
        f"database={REHEARSAL_DATABASE}\n"
        "ssl-mode=VERIFY_IDENTITY\n"
        f"ssl-ca={CA_IN_CONTAINER}\n"
        "tls-version=TLSv1.2,TLSv1.3\n"
        "\n"
    )


# Identical to the splitting shell script inside
# `tidb_production_migration.build_mysql_command`, so the wrapper cannot
# accidentally re-introduce a path where mysql parses the marker
# `__LSVN3D_SQL_PAYLOAD__` as an unknown long option.  The shell grep
# consumes the marker line first; mysql then sees only the cnf via
# `--defaults-extra-file=$c` and the SQL via `< $q`.
_MYSQL_SPLIT_SHELL_SCRIPT = (
    "set -eu\n"
    "umask 077\n"
    "test -r /etc/pki/tls/certs/ca-bundle.crt\n"
    "test -s /etc/pki/tls/certs/ca-bundle.crt\n"
    "p=/tmp/lsvn3d-payload-opts.$$\n"
    "n=/tmp/lsvn3d-payload-opts.$$.lf\n"
    "c=/tmp/lsvn3d-client-opts.$$.cnf\n"
    "q=/tmp/lsvn3d-query-opts.$$.sql\n"
    "trap 'rm -f \"$p\" \"$n\" \"$c\" \"$q\"' EXIT HUP INT TERM\n"
    "cat > \"$p\"\n"
    "tr -d '\\015' < \"$p\" > \"$n\"\n"
    "mv \"$n\" \"$p\"\n"
    "line=$(grep -n '^__LSVN3D_SQL_PAYLOAD__$' \"$p\" | head -n 1 | cut -d: -f1)\n"
    "test -n \"$line\"\n"
    "head -n $((line - 1)) \"$p\" > \"$c\"\n"
    "tail -n +$((line + 1)) \"$p\" > \"$q\"\n"
    "mysql --defaults-extra-file=\"$c\" --connect-timeout=15 --batch --raw --skip-column-names < \"$q\"\n"
)


def run_mysql(host: str, port: int, user: str, password: str, sql: str,
              *, timeout: int = 60, redact: Sequence[str] = ()) -> str:
    """Run SQL through the pinned mysql:8.0.36 container; credentials stdin only.

    The orchestrator itself never executes DDL/DML other than the explicitly
    provisioned temp accounts, and never `DROP DATABASE`, `TRUNCATE`,
    `UPDATE`, `INSERT`, etc.  Only CREATE USER, GRANT, REVOKE, DROP USER,
    and SELECT are permitted by the keyword allowlist below.

    The container's entrypoint is `sh -c <_MYSQL_SPLIT_SHELL_SCRIPT>`,
    which mirrors the splitting shell script used by the strict V41/V42
    runners.  The marker `__LSVN3D_SQL_PAYLOAD__` is consumed by the
    shell `grep` before mysql starts, so mysql only ever sees the cnf
    through `--defaults-extra-file=$c` and the SQL through `< $q`.
    """
    if "\x00" in sql or SQL_MARKER in sql:
        raise err("mysql SQL contains reserved marker or NUL",
                  code=BLOCK_CREDENTIAL_PROVISIONING)
    upper = sql.upper()
    for forbidden in (
        "INTO OUTFILE", "INTO DUMPFILE", "LOAD_FILE",
        "DROP DATABASE", "DROP SCHEMA",
        "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT INTO",
        "REPLACE INTO", "ALTER USER",
    ):
        if forbidden in upper:
            raise err(
                f"orchestrator SQL contains forbidden keyword: {forbidden}",
                code=BLOCK_CREDENTIAL_PROVISIONING,
            )
    if not (
        "SELECT" in upper
        or "CREATE USER" in upper
        or "DROP USER" in upper
        or re.search(r"\bGRANT\b", upper) is not None
        or re.search(r"\bREVOKE\b", upper) is not None
    ):
        raise err(
            "orchestrator SQL outside the explicit allowlist",
            code=BLOCK_CREDENTIAL_PROVISIONING,
        )
    payload = mysql_config_stdin(host, port, user, password) + SQL_MARKER + "\n" + sql.rstrip() + "\n"
    image_ref = f"{APPROVED_MYSQL_IMAGE}@{APPROVED_MYSQL_DIGEST}"
    proc = _run([
        "docker", "run", "--rm", "-i", "--pull=never",
        image_ref, "sh", "-c", _MYSQL_SPLIT_SHELL_SCRIPT,
    ], input_text=payload, timeout=timeout)
    if proc.returncode != 0:
        merged = ((proc.stderr or "") + (proc.stdout or ""))
        for s in (password,) + tuple(redact):
            if s:
                merged = merged.replace(s, "***REDACTED***")
        raise err(f"mysql container call failed rc={proc.returncode}: {merged[:1500]}")
    return proc.stdout


def parse_probe(stdout: str, *, expected_user_prefix: str,
                forbidden_user_prefix: str) -> dict[str, str]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if len(lines) < 5:
        raise err(
            f"bootstrap probe returned {len(lines)} rows (expected >=5)",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )

    database = lines[0]
    version = lines[1]
    current_user_raw = lines[2]
    user_raw = lines[3]
    select_one = lines[4]

    if database != REHEARSAL_DATABASE:
        raise err(
            f"bootstrap probe DATABASE()={database!r} != {REHEARSAL_DATABASE!r}",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )
    if select_one != "1":
        raise err(
            f"bootstrap probe SELECT 1 returned {select_one!r}",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )
    if not re.search(r"tidb(?:[- ]server)?[- ]v?8\.5\.3", version, re.IGNORECASE):
        raise err(
            f"bootstrap probe VERSION()={version!r} is not TiDB v8.5.3",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )

    # TiDB Serverless public endpoints route every connection through a TLS
    # edge proxy: USER() therefore reports the proxy host (e.g. 104.28.163.33)
    # while CURRENT_USER() reports the authenticated identity with @'%'.
    # We intentionally do NOT compare CURRENT_USER() to USER() because the
    # legacy equality tripwire fired on every legitimate probe.  The
    # prefix-binding check below is the sole authorisation gate and reads
    # authority from CURRENT_USER() exclusively.
    account = current_user_raw.split("@", 1)[0] if "@" in current_user_raw else current_user_raw
    if not SQL_USER_RX.fullmatch(account):
        raise err(
            f"bootstrap CURRENT_USER() account part malformed: {account!r}",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )
    prefix_lc = expected_user_prefix.casefold()
    forbidden_lc = forbidden_user_prefix.casefold() if forbidden_user_prefix else ""
    bound_ok = account.casefold().startswith(prefix_lc + ".") or account.casefold().startswith(prefix_lc + "_")
    forbidden_hit = bool(forbidden_lc) and (
        account.casefold().startswith(forbidden_lc + ".")
        or account.casefold().startswith(forbidden_lc + "_")
    )
    if not bound_ok:
        raise err(
            f"bootstrap CURRENT_USER() account {account!r} is not bound to branch prefix "
            f"{expected_user_prefix!r}",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )
    if forbidden_hit:
        raise err(
            f"bootstrap CURRENT_USER() account {account!r} appears to use production prefix "
            f"{forbidden_user_prefix!r}",
            code=BLOCK_BOOTSTRAP_IDENTITY,
        )

    # Sanitised summary: only confirm the prefix binding, do not reveal any
    # suffix detail.
    return {
        "database": database,
        "version": version,
        "session_user_prefix_verified": "1",
        "_account_sanitised": f"{expected_user_prefix}***",
    }


def probe_bootstrap(host: str, port: int, bootstrap_user: str, bootstrap_password: str,
                    *, expected_user_prefix: str,
                    forbidden_user_prefix: str) -> dict[str, str]:
    stdout = run_mysql(host, port, bootstrap_user, bootstrap_password, PROBE_SQL,
                       timeout=90, redact=(bootstrap_password,))
    return parse_probe(stdout, expected_user_prefix=expected_user_prefix,
                        forbidden_user_prefix=forbidden_user_prefix)


def make_temp_account_names(user_prefix: str) -> tuple[str, str]:
    rnd = secrets.token_hex(RANDOM_HEX_LEN // 2)
    rnd = rnd[:RANDOM_HEX_LEN]
    read_name = f"{user_prefix}.{READ_SUFFIX}{rnd}"
    migrate_name = f"{user_prefix}.{MIGRATE_SUFFIX}{rnd}"
    for n in (read_name, migrate_name):
        if len(n) > TIDB_USER_MAX_LEN:
            raise err(
                f"temp account name {n!r} exceeds TiDB {TIDB_USER_MAX_LEN}-char limit; "
                f"reduce RANDOM_HEX_LEN",
                code=BLOCK_CREDENTIAL_PROVISIONING,
            )
        if not SQL_USER_RX.fullmatch(n):
            raise err(f"temp account name {n!r} malformed",
                      code=BLOCK_CREDENTIAL_PROVISIONING)
        prefix_lc = user_prefix.casefold()
        if not (
            n.casefold().startswith(prefix_lc + ".")
            or n.casefold().startswith(prefix_lc + "_")
        ):
            raise err(
                f"temp account name {n!r} is not bound to prefix {user_prefix!r}",
                code=BLOCK_CREDENTIAL_PROVISIONING,
            )
    return read_name, migrate_name


def provision_temp_users(host: str, port: int, bootstrap_user: str, bootstrap_password: str,
                         read_name: str, read_password: str,
                         migrate_name: str, migrate_password: str) -> None:
    """Issue CREATE USER + least-privilege GRANT for both temp accounts.

    No GRANT OPTION.  No global privileges.  No access to any other database.
    Migrate grants cover the privileges Flyway 11.14.1 + V42 actually need
    (DDL primitives, flyway_schema_history inserts/updates, advisory
    SCHEMA-level locks, routine/trigger creation if ever required by V42).
    Read grants are a narrow metadata SELECT.
    """
    if any("\x00" in v for v in (read_password, migrate_password, read_name, migrate_name)):
        raise err("temp credential contains NUL", code=BLOCK_CREDENTIAL_PROVISIONING)
    def lit(p: str) -> str:
        return "'" + p.replace("\\", "\\\\").replace("'", "''") + "'"
    sql = (
        f"CREATE USER IF NOT EXISTS '{read_name}'@'%' IDENTIFIED BY {lit(read_password)};\n"
        f"CREATE USER IF NOT EXISTS '{migrate_name}'@'%' IDENTIFIED BY {lit(migrate_password)};\n"
        f"GRANT SELECT ON {REHEARSAL_DATABASE}.* TO '{read_name}'@'%';\n"
        f"GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, "
        f"LOCK TABLES, EXECUTE, EVENT, TRIGGER "
        f"ON {REHEARSAL_DATABASE}.* TO '{migrate_name}'@'%';\n"
    )
    run_mysql(host, port, bootstrap_user, bootstrap_password, sql,
              timeout=120, redact=(bootstrap_password, read_password, migrate_password))


def verify_new_user(host: str, port: int, user: str, password: str) -> dict[str, str]:
    sql = "SELECT DATABASE(); SELECT CURRENT_USER(); SELECT 1;\n"
    out = run_mysql(host, port, user, password, sql, timeout=60, redact=(password,))
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    if len(lines) < 3 or lines[2] != "1":
        raise err(
            f"temp account probe failed for {user!r}",
            code=BLOCK_CREDENTIAL_PROVISIONING,
        )
    return {"database": lines[0], "current_user": lines[1]}


# ============================================================================
# Evidence (9 fields, detached SHA, companion audit context outside runner view)
# ============================================================================


def build_identity_evidence(branch: dict[str, str]) -> dict[str, str]:
    return {
        "source": IDENTITY_SOURCE,
        "state": branch["state"],
        "parent_cluster_id": PRODUCTION_CLUSTER_ID,
        "branch_id": branch["branch_id"],
        "branch_name": branch["branch_name"],
        "host": branch["host"],
        "database": REHEARSAL_DATABASE,
        "user_prefix": branch["user_prefix"],
        "engine_version": ENGINE_VERSION,
    }


def validate_identity_evidence_shape(evidence: Mapping[str, str]) -> None:
    if not isinstance(evidence, Mapping):
        raise err("identity evidence is not a mapping", code=BLOCK_CONFIGURATION)
    if set(evidence) != IDENTITY_EVIDENCE_KEYS:
        raise err(
            f"identity evidence keys mismatch: expected exactly "
            f"{sorted(IDENTITY_EVIDENCE_KEYS)}, got {sorted(evidence)}",
            code=BLOCK_CONFIGURATION,
        )
    if any(not isinstance(v, str) or not v for v in evidence.values()):
        raise err(
            "identity evidence contains non-string or empty value",
            code=BLOCK_CONFIGURATION,
        )
    if evidence["source"] not in ALLOWED_IDENTITY_SOURCES:
        raise err(
            f"identity evidence source {evidence['source']!r} not approved",
            code=BLOCK_CONFIGURATION,
        )
    if evidence["state"] not in ALLOWED_IDENTITY_STATES:
        raise err(
            f"identity evidence state {evidence['state']!r} not approved",
            code=BLOCK_CONFIGURATION,
        )
    if evidence["parent_cluster_id"] != PRODUCTION_CLUSTER_ID:
        raise err(
            "identity evidence parent_cluster_id is not approved production",
            code=BLOCK_CONFIGURATION,
        )
    if not TECHNICAL_BRANCH_ID_RX.fullmatch(evidence["branch_id"]):
        raise err(
            "identity evidence branch_id not a technical bran-* id",
            code=BLOCK_CONFIGURATION,
        )
    if evidence["branch_name"] != REHEARSAL_BRANCH_NAME:
        raise err(
            "identity evidence branch_name mismatch",
            code=BLOCK_CONFIGURATION,
        )
    if not evidence["host"].endswith(".tidbcloud.com"):
        raise err(
            "identity evidence host is not a TiDB Cloud endpoint",
            code=BLOCK_CONFIGURATION,
        )
    if evidence["database"] != REHEARSAL_DATABASE:
        raise err(
            "identity evidence database mismatch",
            code=BLOCK_CONFIGURATION,
        )
    if not USER_PREFIX_RX.fullmatch(evidence["user_prefix"]):
        raise err(
            "identity evidence user_prefix malformed",
            code=BLOCK_CONFIGURATION,
        )
    if not re.search(r"tidb(?:[- ]server)?[- ]v?8\.5\.3", evidence["engine_version"],
                      re.IGNORECASE):
        raise err(
            "identity evidence engine_version is not TiDB v8.5.3",
            code=BLOCK_CONFIGURATION,
        )


def make_evidence_dir() -> Path:
    d = Path(tempfile.mkdtemp(prefix="lsvn3d-v42-rehearsal-"))
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass
    return d


def write_identity_evidence_to_dir(evidence: Mapping[str, str],
                                     evidence_dir: Path) -> tuple[Path, str]:
    validate_identity_evidence_shape(evidence)
    payload_bytes = (
        json.dumps(evidence, separators=(",", ":"), sort_keys=True,
                    ensure_ascii=False) + "\n"
    ).encode("utf-8")
    if len(payload_bytes) > 64 * 1024:
        raise err(
            "identity evidence exceeds 64 KB limit", code=BLOCK_CONFIGURATION,
        )
    sha = hashlib.sha256(payload_bytes).hexdigest()
    evidence_path = evidence_dir / "identity-evidence.json"
    sha_path = evidence_dir / "identity-evidence.sha256"
    fd = os.open(str(evidence_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(payload_bytes)
    except Exception:
        try:
            os.unlink(evidence_path)
        except OSError:
            pass
        raise
    fd_sha = os.open(str(sha_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd_sha, "w", encoding="utf-8", newline="\n") as f:
            f.write(sha + "\n")
    except Exception:
        for p in (evidence_path, sha_path):
            try:
                os.unlink(p)
            except OSError:
                pass
        raise
    return evidence_path, sha


def write_audit_context(evidence_dir: Path, branch: Mapping[str, str],
                        production_user_prefix: str, identity_source: str) -> Path:
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_id": PROJECT_ID,
        "parent_id": PRODUCTION_CLUSTER_ID,
        "branch_id": branch["branch_id"],
        "branch_name": branch["branch_name"],
        "branch_user_prefix": branch["user_prefix"],
        "production_user_prefix_redacted": (
            production_user_prefix[:3] + "***" + production_user_prefix[-2:]
            if len(production_user_prefix) >= 6 else "***REDACTED***"
        ),
        "host": branch["host"],
        "region": branch["region"],
        "state": branch["state"],
        "identity_source": identity_source,
        "branch_create_time": branch["create_time"],
        "engine_version": ENGINE_VERSION,
        "purpose": "wrapper-managed audit companion; ignored by strict runner",
    }
    p = evidence_dir / "identity-context.json"
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    except Exception:
        try:
            os.unlink(p)
        except OSError:
            pass
        raise
    return p


# ============================================================================
# Confirmation string and sanitised child environment
# ============================================================================


def build_confirmation_string(branch: Mapping[str, str]) -> str:
    return (
        f"{branch['branch_id']}@{branch['host']}/{REHEARSAL_DATABASE}:"
        f"{FLYWAY_CURRENT_VERSION}->{FLYWAY_TARGET_VERSION}"
    )


def build_sanitized_env(*, branch: Mapping[str, str], production_user_prefix: str,
                        read_user: str, read_password: str,
                        migrate_user: str, migrate_password: str) -> dict[str, str]:
    env: dict[str, str] = {}
    for k in CHILD_ENV_ALLOWLIST:
        v = os.environ.get(k)
        if v is not None and v != "":
            env[k] = v
    env["TIDB_REHEARSAL_HOST"] = str(branch["host"])
    env["TIDB_REHEARSAL_PORT"] = str(REHEARSAL_PORT)
    env["TIDB_REHEARSAL_DATABASE"] = str(REHEARSAL_DATABASE)
    env["TIDB_REHEARSAL_PARENT_CLUSTER_ID"] = str(PRODUCTION_CLUSTER_ID)
    env["TIDB_REHEARSAL_BRANCH_ID"] = str(branch["branch_id"])
    env["TIDB_REHEARSAL_BRANCH_NAME"] = str(branch["branch_name"])
    env["TIDB_REHEARSAL_USER_PREFIX"] = str(branch["user_prefix"])
    env["TIDB_PRODUCTION_CLUSTER_ID"] = str(PRODUCTION_CLUSTER_ID)
    env["TIDB_PRODUCTION_USER_PREFIX"] = str(production_user_prefix)
    env["TIDB_REHEARSAL_READ_USER"] = str(read_user)
    env["TIDB_REHEARSAL_READ_PASSWORD"] = str(read_password)
    env["TIDB_REHEARSAL_MIGRATE_USER"] = str(migrate_user)
    env["TIDB_REHEARSAL_MIGRATE_PASSWORD"] = str(migrate_password)
    return env


# ============================================================================
# Strict runner invocation (subprocess; never imported)
# ============================================================================


_STRICT_RUNNER_CLASS_RX = re.compile(
    r"^(BLOCK(?:ED)?[A-Z0-9_]+):\s*(.*)$"
)

# Mirrors the strict runner's `SENSITIVE_URL` so any jdbc:mysql://USER:PASS@host
# substring that surfaces in subprocess output is credential-stripped before
# it ever reaches the human-readable redacted log.  The raw bytes file still
# preserves the original sub-string for forensic recovery.
_SENSITIVE_URL_RX = re.compile(
    r"(?i)(jdbc:mysql://)([^/\s:@]+)(?::[^@\s/]*)?@"
)


def _parse_runner_classification(stderr_str: str) -> tuple[str, str]:
    """Extract the strict runner's classification + primary message from stderr.

    The strict runner emits lines such as ``BLOCKED_REHEARSAL: <message>`` to
    stderr on failure.  We select the LAST such line so progress chatter that
    precedes the failure classification is discarded.
    """
    candidates: list[tuple[str, str]] = []
    for line in stderr_str.splitlines():
        m = _STRICT_RUNNER_CLASS_RX.match(line.strip())
        if m:
            candidates.append((m.group(1).strip(), m.group(2).strip()))
    if candidates:
        return candidates[-1]
    return ("", "")


def invoke_runner(mode: str, *, env: Mapping[str, str], confirm_target: str,
                  identity_evidence: Path, identity_sha: str,
                  evidence_dir: Path,
                  stage: str,
                  command_category: str = "strict_runner_subprocess",
                  redacted_log: Path | None = None,
                  secrets_to_redact: Sequence[str] = (),
                  before_evidence: Path | None = None,
                  before_sha: str | None = None,
                  evidence_out: Path | None = None,
                  timeout: int = 1800) -> dict[str, Any]:
    """Invoke the strict V42 runner; capture full bytes BEFORE any truncation.

    For each stage the wrapper writes:

    * ``runner-<stage>-stdout.bytes`` — full unredacted stdout bytes
      captured directly from the subprocess (NOT piped through head, tail
      or any line-count / substring filter);
    * ``runner-<stage>-stderr.bytes`` — full unredacted stderr bytes;
    * ``runner-<stage>-meta.json`` — stage, command category, mode, args,
      exit code, ISO-8601 started_at and finished_at timestamps, plus the
      byte-count of each stream.

    The optional ``redacted_log`` receives a bounded human-readable copy of
    the merged stdout+stderr AFTER secrets are replaced.  The redact step
    replaces only the matched secret substring; it does not truncate the
    surrounding message body, so the operator's primary error message is
    preserved verbatim apart from the redacted ranges.

    Returns a dict that exposes the exit code, byte paths, parsed
    classification line, primary message, and timestamps so ``main()`` can
    surface stage-level diagnostics in the structured summary.
    """
    args: list[str] = [
        sys.executable, "-I", str(STRICT_RUNNER_PATH),
        "--mode", mode,
        "--confirm-target", confirm_target,
        "--identity-evidence", str(identity_evidence),
        "--identity-evidence-sha256", identity_sha,
    ]
    if before_evidence is not None:
        args += ["--before-evidence", str(before_evidence)]
    if before_sha is not None:
        args += ["--before-evidence-sha256", before_sha]
    if evidence_out is not None:
        args += ["--evidence-file", str(evidence_out)]

    started_at = datetime.now(timezone.utc).isoformat()
    proc = subprocess.run(
        list(args),
        capture_output=True, check=False,
        env=dict(env), timeout=timeout,
    )
    finished_at = datetime.now(timezone.utc).isoformat()

    full_stdout_bytes = proc.stdout or b""
    full_stderr_bytes = proc.stderr or b""

    stdout_bytes_path = evidence_dir / f"runner-{stage}-stdout.bytes"
    stderr_bytes_path = evidence_dir / f"runner-{stage}-stderr.bytes"
    meta_path = evidence_dir / f"runner-{stage}-meta.json"

    stdout_bytes_path.write_bytes(bytes(full_stdout_bytes))
    stderr_bytes_path.write_bytes(bytes(full_stderr_bytes))
    meta = {
        "stage": stage,
        "command_category": command_category,
        "mode": mode,
        "args": [str(a) for a in args],
        "exit_code": int(proc.returncode),
        "started_at": started_at,
        "finished_at": finished_at,
        "stdout_bytes": len(full_stdout_bytes),
        "stderr_bytes": len(full_stderr_bytes),
    }
    meta_path.write_text(
        json.dumps(meta, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    stdout_str = full_stdout_bytes.decode("utf-8", errors="replace")
    stderr_str = full_stderr_bytes.decode("utf-8", errors="replace")
    merged_redacted = stdout_str + "\n--- STDERR ---\n" + stderr_str
    for secret in secrets_to_redact:
        if secret:
            merged_redacted = merged_redacted.replace(secret, "***REDACTED***")
    merged_redacted = _SENSITIVE_URL_RX.sub(r"\1[REDACTED]@", merged_redacted)
    if redacted_log is not None:
        try:
            redacted_log.write_text(merged_redacted, encoding="utf-8")
        except OSError:
            pass

    classification, primary_message = _parse_runner_classification(stderr_str)
    return {
        "exit_code": int(proc.returncode),
        "stdout_bytes_path": stdout_bytes_path,
        "stderr_bytes_path": stderr_bytes_path,
        "meta_path": meta_path,
        "stdout_str": stdout_str,
        "stderr_str": stderr_str,
        "redacted_log": redacted_log,
        "merged_redacted": merged_redacted,
        "classification": classification,
        "primary_message": primary_message,
        "started_at": started_at,
        "finished_at": finished_at,
    }


def _build_stage_summary(stage_name: str, result: Mapping[str, Any]) -> dict[str, Any]:
    """Build a per-stage diagnostics dict for the structured summary.

    The returned dict exposes the exit code, byte paths, parsed
    classification line, primary error message, and start/finish
    timestamps so the operator can reason about which strict-runner
    stage failed without re-reading the forensic bytes files.
    """
    stdout_str = str(result["stdout_str"])
    stderr_str = str(result["stderr_str"])
    return {
        "stage": stage_name,
        "exit_code": int(result["exit_code"]),
        "stdout_bytes_path": str(result["stdout_bytes_path"]),
        "stderr_bytes_path": str(result["stderr_bytes_path"]),
        "meta_path": str(result["meta_path"]),
        "classification": result["classification"],
        "primary_message": result["primary_message"],
        "started_at": result["started_at"],
        "finished_at": result["finished_at"],
        "stdout_bytes_count": len(stdout_str.encode("utf-8", errors="replace")),
        "stderr_bytes_count": len(stderr_str.encode("utf-8", errors="replace")),
    }


# ============================================================================
# Diagnostic pipeline (spec §3-5-8): docker create / start --attach / wait /
# inspect / logs / rm lifecycle, with sanitized .State codegen and stable
# exit-code classification.  The strict-runner contract is unchanged;
# these helpers only run inside the wrapper when --diagnostic-only is set
# OR when summarising a primary_failure that already carries an
# EMPTY_SUBPROCESS_OUTPUT: prefix from the strict runner.
# ============================================================================


def classify_container_exit_code(*, outer_exit: int, oom_killed: bool,
                                  timeout: bool) -> str:
    """Map the docker wait/inspect ExitCode onto a stable sanitized code."""
    if timeout:
        return CONTAINER_TIMEOUT_CODE
    if oom_killed:
        return CONTAINER_OOM_CODE
    if outer_exit == 125:
        return DOCKER_INVOCATION_FAILED_CODE
    if outer_exit == 126:
        return CONTAINER_NOT_EXECUTABLE_CODE
    if outer_exit == 127:
        return CONTAINER_NOT_FOUND_CODE
    if outer_exit != 0:
        return CONTAINER_PROCESS_FAILED_CODE
    return "OK"


def _safe_inspect_subset(stdout_text: str) -> dict[str, Any]:
    """Parse only the spec-§3 fields from a `docker inspect` JSON payload.

    Deliberately does NOT read `.Config.Env` so secrets never reach disk.
    """
    try:
        payload = json.loads(stdout_text)
    except (ValueError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, list) or not payload:
        return {}
    container = payload[0]
    if not isinstance(container, Mapping):
        return {}
    state = container.get("State") if isinstance(container.get("State"), Mapping) else {}
    config = container.get("Config") if isinstance(container.get("Config"), Mapping) else {}
    args = container.get("Args") if isinstance(container.get("Args"), list) else []
    entrypoint = config.get("Entrypoint") if isinstance(config.get("Entrypoint"), list) else []
    cmd = config.get("Cmd") if isinstance(config.get("Cmd"), list) else []
    return {
        "Status": str(state.get("Status", "") or ""),
        "Running": bool(state.get("Running", False)),
        "ExitCode": int(state.get("ExitCode") or 0),
        "Error": str(state.get("Error", "") or ""),
        "OOMKilled": bool(state.get("OOMKilled", False)),
        "StartedAt": str(state.get("StartedAt", "") or ""),
        "FinishedAt": str(state.get("FinishedAt", "") or ""),
        "Path": str(container.get("Path", "") or ""),
        "Args": [str(a) for a in args],
        "Config_Entrypoint": [str(e) for e in entrypoint],
        "Config_Cmd": [str(c) for c in cmd],
    }


def run_diagnostic_command(*, stage: str, image_ref: str,
                             argv: Sequence[str],
                             stdin_text: str | None,
                             evidence_dir: Path,
                             timeout: int = 120,
                             container_label_prefix: str = "lsvn3d-diag",
                             secrets_to_redact: Sequence[str] = ()) -> dict[str, Any]:
    """Run a single pinned-image command under docker create / wait / inspect.

    Persists runner-<stage>-stdout.bytes, runner-<stage>-stderr.bytes,
    runner-<stage>-meta.json, and runner-<stage>.log (LSVN_STAGE_BEGIN/END
    markers).  Captures: stage, container_id, container_exit_code,
    oom_killed, docker_state_error, outer_rc, stdout_bytes, stderr_bytes,
    timeout_reached, classification, primary_message.  Never records
    `.Config.Env`.
    """
    if stage not in DIAGNOSTIC_STAGES:
        raise err(
            f"diagnostic stage {stage!r} not in DIAGNOSTIC_STAGES",
            code=BLOCK_CONFIGURATION,
        )
    if not (
        image_ref.startswith("mysql:8.0.36@")
        or image_ref.startswith("redgate/flyway:11.14.1@")
    ):
        raise err(
            f"diagnostic image_ref {image_ref!r} is not a pinned approved digest",
            code=BLOCK_CONFIGURATION,
        )
    container_name = f"{container_label_prefix}-{stage}-{secrets.token_hex(6)}"
    started_at = datetime.now(timezone.utc).isoformat()
    timeout_reached = False
    outer_rc = 0
    container_id = ""
    create_stdout = create_stderr = ""
    start_stdout = start_stderr = ""
    wait_rc = 0
    inspect_subset: dict[str, Any] = {}
    logs_excerpt = ""
    rm_rc = 0
    rm_stderr = ""
    catastrophic_exc: Exception | None = None

    try:
        # 1. create
        # Defect found live (spec §3): `docker create` MUST keep stdin
        # open (`-i`).  Without `-i`, the container is created with
        # OpenStdin: false; the subsequent `docker start --attach -i`
        # then hits immediate EOF on stdin, the entrypoint's
        # `cat > "$p"` reads 0 bytes, `test -n "$line"` fails under
        # `set -eu`, and the script exits 1 before the MySQL client
        # is ever invoked.  This bit every wrapper diagnostic probe in
        # the first live run and is purely a Docker stream-handling
        # fix in the orchestrator script -- no privilege, TLS, Flyway
        # or target-state change.
        proc = _run(
            ["docker", "create", "--name", container_name, "-i",
             "--pull=never", image_ref, *argv],
            input_text=None, timeout=60,
        )
        create_stdout = proc.stdout or ""
        create_stderr = proc.stderr or ""
        outer_rc = proc.returncode
        if proc.returncode != 0:
            finished_at = datetime.now(timezone.utc).isoformat()
            return _record_diag(
                stage=stage, evidence_dir=evidence_dir,
                started_at=started_at, finished_at=finished_at,
                outer_rc=outer_rc, container_id="",
                start_stdout="", start_stderr="",
                inspect_subset={}, logs_excerpt="",
                rm_rc=0, rm_stderr="",
                timeout_reached=False,
                classification=DOCKER_INVOCATION_FAILED_CODE,
                primary_message=f"docker create rc={outer_rc}",
                create_stdout=create_stdout, create_stderr=create_stderr,
                docker_state_error="", container_exit_code=0,
                oom_killed=False,
                secrets_to_redact=secrets_to_redact,
            )
        container_id = create_stdout.strip() or container_name

        # 2. start --attach -i with stdin
        try:
            proc = _run(
                ["docker", "start", "--attach", "-i", container_name],
                input_text=stdin_text, timeout=timeout,
            )
            start_stdout = proc.stdout or ""
            start_stderr = proc.stderr or ""
            outer_rc = proc.returncode
        except subprocess.TimeoutExpired as exc:
            timeout_reached = True
            start_stdout = (exc.stdout.decode("utf-8", errors="replace")
                            if isinstance(exc.stdout, bytes) else (exc.stdout or ""))
            start_stderr = (exc.stderr.decode("utf-8", errors="replace")
                            if isinstance(exc.stderr, bytes) else (exc.stderr or ""))

        # 3. wait
        proc = _run(
            ["docker", "wait", container_name], input_text=None, timeout=60,
        )
        if proc.returncode == 0:
            try:
                wait_rc = int((proc.stdout or "").strip())
            except (ValueError, TypeError):
                wait_rc = proc.returncode

        # 4. inspect (read spec-§3 fields only)
        proc = _run(
            ["docker", "inspect", container_name], input_text=None, timeout=60,
        )
        if proc.returncode == 0:
            inspect_subset = _safe_inspect_subset(proc.stdout or "")

        # 5. logs (capture for forensic review only)
        proc = _run(
            ["docker", "logs", container_name], input_text=None, timeout=60,
        )
        if proc.returncode == 0:
            logs_excerpt = proc.stdout or ""

    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        # Defect §2: capture catastrophic exception (parallel try/except/
        # finally ordering is valid in Python).  The function then
        # continues to the after-finally classification block which
        # detects `catastrophic_exc is not None` and emits a classified
        # synthetic record instead of crashing the diagnostic chain.
        catastrophic_exc = exc

    finally:
        # 6. rm -- always remove the diagnostic container we created
        try:
            proc = _run(
                ["docker", "rm", container_name], input_text=None, timeout=60,
            )
            rm_rc = proc.returncode
            rm_stderr = proc.stderr or ""
        except (subprocess.TimeoutExpired, OSError):
            rm_rc = -1
            rm_stderr = "docker rm failed"

    finished_at = datetime.now(timezone.utc).isoformat()
    if catastrophic_exc is not None:
        return _record_diag(
            stage=stage, evidence_dir=evidence_dir,
            started_at=started_at, finished_at=finished_at,
            outer_rc=-1, container_id=container_id,
            start_stdout=start_stdout, start_stderr=start_stderr,
            inspect_subset=inspect_subset, logs_excerpt=logs_excerpt,
            rm_rc=rm_rc, rm_stderr=rm_stderr,
            timeout_reached=False,
            classification=CONTAINER_PROCESS_FAILED_CODE,
            primary_message=(f"stage={stage} diagnostic subprocess raised "
                              f"{type(catastrophic_exc).__name__}: {str(catastrophic_exc)[:1200]!r}"),
            create_stdout=create_stdout, create_stderr=create_stderr,
            docker_state_error="", container_exit_code=0,
            oom_killed=False,
            secrets_to_redact=secrets_to_redact,
        )
    oom_killed = bool(inspect_subset.get("OOMKilled", False))
    docker_state_error = str(inspect_subset.get("Error", "") or "")
    container_exit_code = int(inspect_subset.get("ExitCode", wait_rc) or 0)
    classification = classify_container_exit_code(
        outer_exit=wait_rc, oom_killed=oom_killed, timeout=timeout_reached,
    )
    primary_message = (
        f"stage={stage} container_exit={container_exit_code} "
        f"wait_rc={wait_rc} oom_killed={str(oom_killed).lower()} "
        f"docker_state_error={docker_state_error[:200]!r}"
    )
    return _record_diag(
        stage=stage, evidence_dir=evidence_dir,
        started_at=started_at, finished_at=finished_at,
        outer_rc=outer_rc, container_id=container_id,
        start_stdout=start_stdout, start_stderr=start_stderr,
        inspect_subset=inspect_subset, logs_excerpt=logs_excerpt,
        rm_rc=rm_rc, rm_stderr=rm_stderr,
        timeout_reached=timeout_reached,
        classification=classification,
        primary_message=primary_message,
        create_stdout=create_stdout, create_stderr=create_stderr,
        docker_state_error=docker_state_error,
        container_exit_code=container_exit_code,
        oom_killed=oom_killed,
        secrets_to_redact=secrets_to_redact,
    )


def _record_diag(*, stage: str, evidence_dir: Path,
                  started_at: str, finished_at: str,
                  outer_rc: int, container_id: str,
                  start_stdout: str, start_stderr: str,
                  inspect_subset: dict[str, Any], logs_excerpt: str,
                  rm_rc: int, rm_stderr: str,
                  timeout_reached: bool,
                  classification: str, primary_message: str,
                  create_stdout: str = "", create_stderr: str = "",
                  docker_state_error: str = "",
                  container_exit_code: int = 0,
                  oom_killed: bool = False,
                  secrets_to_redact: Sequence[str] = ()) -> dict[str, Any]:
    """Persist runner-<stage>-*.{bytes,log,meta.json} for forensic review.

    Defect §3 guard: `secrets_to_redact` plus `_SENSITIVE_URL_RX` are
    applied to start stdout/stderr, create stdout/stderr, logs excerpt,
    and rm stderr BEFORE any of those strings are written to disk.
    """
    def _scrub(text: str) -> str:
        if not text:
            return text
        for secret in secrets_to_redact:
            if secret:
                text = text.replace(secret, "***REDACTED***")
        return _SENSITIVE_URL_RX.sub(r"\1[REDACTED]@", text)
    stdout_bytes = _scrub(start_stdout).encode("utf-8", errors="replace")
    stderr_bytes = _scrub(start_stderr).encode("utf-8", errors="replace")
    scrubbed_create_stdout = _scrub(create_stdout)[:500]
    scrubbed_create_stderr = _scrub(create_stderr)[:500]
    scrubbed_rm_stderr = _scrub(rm_stderr)[:500]
    scrubbed_logs_excerpt = _scrub(logs_excerpt)[:500]
    stdout_path = evidence_dir / f"runner-{stage}-stdout.bytes"
    stderr_path = evidence_dir / f"runner-{stage}-stderr.bytes"
    meta_path = evidence_dir / f"runner-{stage}-meta.json"
    log_path = evidence_dir / f"runner-{stage}.log"
    stdout_path.write_bytes(stdout_bytes)
    stderr_path.write_bytes(stderr_bytes)
    meta = {
        "stage": stage,
        "command_category": "diagnostic_docker_subprocess",
        "mode": "wrapper_diagnostic",
        "args": [],
        "exit_code": int(outer_rc),
        "started_at": started_at,
        "finished_at": finished_at,
        "stdout_bytes": len(stdout_bytes),
        "stderr_bytes": len(stderr_bytes),
        "container_id": container_id,
        "container_exit_code": container_exit_code,
        "wait_rc": int(rm_rc),
        "oom_killed": oom_killed,
        "docker_state_error": docker_state_error,
        "rm_rc": int(rm_rc),
        "rm_stderr": scrubbed_rm_stderr,
        "create_stdout": scrubbed_create_stdout,
        "create_stderr": scrubbed_create_stderr,
        "container_inspect_subset": inspect_subset,
        "container_logs_excerpt": scrubbed_logs_excerpt,
        "timeout_reached": timeout_reached,
    }
    meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n",
                          encoding="utf-8")
    try:
        log_path.write_text(
            f"LSVN_STAGE_BEGIN:{stage}\n"
            + stdout_bytes.decode("utf-8", errors="replace")
            + "\n--- STDERR ---\n"
            + stderr_bytes.decode("utf-8", errors="replace")
            + f"\nLSVN_STAGE_END:{stage}:{classification}\n",
            encoding="utf-8",
        )
    except OSError:
        pass
    return {
        "stage": stage,
        "classification": classification,
        "primary_message": primary_message,
        "exit_code": int(outer_rc),
        "container_id": container_id,
        "container_exit_code": container_exit_code,
        "wait_rc": int(rm_rc),
        "oom_killed": oom_killed,
        "docker_state_error": docker_state_error,
        "timeout_reached": timeout_reached,
        "stdout_bytes": len(stdout_bytes),
        "stderr_bytes": len(stderr_bytes),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "meta_path": str(meta_path),
        "log_path": str(log_path),
        "started_at": started_at,
        "finished_at": finished_at,
    }


def _first_failing_stage(stages: Sequence[Mapping[str, Any]]) -> dict[str, Any] | None:
    for s in stages:
        if s.get("classification") and s["classification"] != "OK":
            return {
                "stage": s.get("stage"),
                "classification": s.get("classification"),
                "primary_message": s.get("primary_message"),
                "container_exit_code": s.get("container_exit_code"),
                "wait_rc": s.get("wait_rc"),
                "oom_killed": s.get("oom_killed"),
                "docker_state_error": s.get("docker_state_error"),
            }
    return None


def _metadata_diag_sql() -> str:
    """Read-only metadata SQL for the mysql_schema_metadata_probe stage.

    Each row is its own statement so a partial schema-state divergence
    still surfaces inside the captured container exit code + .State.Error.
    """
    return (
        "SELECT 'managed_columns', GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',') "
        "FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND column_name IN ('managed_asset_id','storage_provider','storage_public_id','storage_asset_id',"
        "'storage_original_url','storage_version','storage_mime_type','storage_format','storage_byte_size',"
        "'storage_sha256','storage_width','storage_height','uploaded_by','uploaded_at','storage_state',"
        "'upload_token','upload_started_at','storage_expires_at');\n"
        "SELECT 'managed_columns_v42', GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',') "
        "FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_media' "
        "AND column_name IN ('managed_asset_id','storage_provider','storage_public_id','storage_asset_id',"
        "'storage_original_url','storage_version','storage_mime_type','storage_format','storage_byte_size',"
        "'storage_sha256','storage_width','storage_height','uploaded_by','uploaded_at','storage_state',"
        "'upload_token','upload_started_at','storage_expires_at');\n"
    )


def _flyway_history_diag_sql() -> str:
    return (
        "SELECT 'failed_migration_count', COUNT(*) FROM flyway_schema_history WHERE success=0;\n"
        "SELECT 'installed_rank_max', COALESCE(MAX(installed_rank), 0) FROM flyway_schema_history;\n"
        "SELECT 'current_version', COALESCE(CAST((SELECT version FROM flyway_schema_history "
        "WHERE success=1 ORDER BY installed_rank DESC LIMIT 1) AS CHAR), '');\n"
    )


def _bounded_count_diag_sql() -> str:
    return (
        "SELECT 'users_total', COUNT(*) FROM users;\n"
        "SELECT 'events_total', COUNT(*) FROM historical_events;\n"
        "SELECT 'media_total', COUNT(*) FROM event_media;\n"
        "SELECT 'active_admin_count', COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur "
        "ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code='admin';\n"
    )


def run_standalone_diagnostic_preflight(
    *,
    branch: Mapping[str, str],
    read_user: str, read_password: str,
    migrate_user: str, migrate_password: str,
    evidence_dir: Path,
) -> dict[str, Any]:
    """Run the seven diagnostic mysql probes via docker create/wait/inspect.

    Each probe is wrapped in `run_diagnostic_command` so the wrapper owns
    the container lifecycle (create / wait / inspect / rm) and can recover
    the numeric container exit code + .State.Error + OOMKilled state
    from the pinned image BEFORE the strict runner's swallow-empty
    path can fire.

    Stages executed in order:
      1. mysql_identity_probe       (read account)
      2. mysql_schema_metadata_probe(read account)
      3. mysql_flyway_history_probe (read account)
      4. bounded_count_probe        (read account)
    Migrate-account stages are not exercised here because the rehearsal
    branch already grants the read account SELECT on bounded_count probes
    and any DDL probe would violate spec §10.
    """
    host = str(branch["host"])
    image_ref = f"{APPROVED_MYSQL_IMAGE}@{APPROVED_MYSQL_DIGEST}"
    cmd = ["sh", "-c", _MYSQL_SPLIT_SHELL_SCRIPT]
    argv_invoke = [image_ref, *cmd]
    _ = argv_invoke  # silence unused warnings if we ever inline
    def _stage(stage_name: str, sql: str) -> dict[str, Any]:
        payload = (
            mysql_config_stdin(host, REHEARSAL_PORT, read_user, read_password)
            + SQL_MARKER + "\n" + sql
        )
        # Defect §3 closure on the wrapper's diagnostic-only path:
        # forward read_password (and the migrate-account password for
        # any future probe) so docker pull / TLS / registry auth tokens
        # cannot leak into meta.json or the forensic bytes file.
        return run_diagnostic_command(
            stage=stage_name, image_ref=image_ref, argv=cmd,
            stdin_text=payload, evidence_dir=evidence_dir, timeout=180,
            secrets_to_redact=(read_password,),
        )
    stages = [
        _stage("mysql_identity_probe",
               "SELECT DATABASE();\nSELECT VERSION();\nSELECT CURRENT_USER();\nSELECT 1;\n"),
        _stage("mysql_schema_metadata_probe", _metadata_diag_sql()),
        _stage("mysql_flyway_history_probe", _flyway_history_diag_sql()),
        _stage("bounded_count_probe", _bounded_count_diag_sql()),
    ]
    return {"stages": stages, "first_failing_stage": _first_failing_stage(stages)}


# ============================================================================
# Cleanup
# ============================================================================


def drop_temp_users(host: str, port: int, bootstrap_user: str, bootstrap_password: str,
                    read_name: str, migrate_name: str) -> None:
    sql = (
        f"DROP USER IF EXISTS '{read_name}'@'%';\n"
        f"DROP USER IF EXISTS '{migrate_name}'@'%';\n"
    )
    run_mysql(host, port, bootstrap_user, bootstrap_password, sql,
              timeout=90, redact=(bootstrap_password,))


def _register_signal_handlers() -> None:
    def handler(signum, frame):
        raise KeyboardInterrupt(f"orchestrator interrupted by signal {signum}")
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, handler)
            except (ValueError, OSError):
                pass
    sig_break = getattr(signal, "SIGBREAK", None)
    if sig_break is not None:
        try:
            signal.signal(sig_break, handler)
        except (ValueError, OSError):
            pass


# ============================================================================
# Main
# ============================================================================


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fail-closed TiDB V42 rehearsal orchestrator wrapper"
    )
    parser.add_argument("--repo-root", type=Path,
                        default=Path(__file__).resolve().parents[1])
    parser.add_argument("--keep-evidence", action="store_true",
                        help="debug only: do NOT delete temp evidence directory")
    parser.add_argument("--diagnostic-only", action="store_true",
                        help="diagnostic preflight only: run the seven-stage docker create/wait probes "
                             "with fresh temp accounts, then drop them, do NOT invoke the strict runner")
    args = parser.parse_args(argv)

    bootstrap_user = os.environ.get(BOOTSTRAP_USER_VAR, "")
    bootstrap_password = os.environ.get(BOOTSTRAP_PASSWORD_VAR, "")
    if not bootstrap_user.strip() or not bootstrap_password.strip():
        print(
            f"BLOCKED_REHEARSAL_CREDENTIAL_PROVISIONING: "
            f"{BOOTSTRAP_USER_VAR} and/or {BOOTSTRAP_PASSWORD_VAR} missing",
            file=sys.stderr,
        )
        return 2

    _register_signal_handlers()

    evidence_dir: Path | None = None
    branch: dict[str, str] = {}
    prod_prefix = ""
    read_name = read_password = ""
    migrate_name = migrate_password = ""
    summary: dict[str, Any] = {
        "mode": "orchestrate",
        "classification": None,
        "stages": [],
        "primary_failure": None,
    }
    runner_logs: list[Path] = []

    def emit_summary(classification: str) -> None:
        summary["classification"] = classification
        print(json.dumps(summary, indent=2, sort_keys=True))

    try:
        # 1. branch discovery
        try:
            branches = ticloud_branch_list(PRODUCTION_CLUSTER_ID)
            rehearsal = select_branch(branches, REHEARSAL_BRANCH_ID)
            branch = extract_branch_identity(rehearsal)
        except OrchestrationGuardError as exc:
            summary["failed_step"] = "ticloud_branch_discovery"
            summary["error"] = str(exc)
            emit_summary(exc.code)
            print(f"{exc.code}: {exc}", file=sys.stderr)
            return 2

        # 2. production userPrefix via cluster describe (JSON-first, with
        #    regex + sql-user-list fallbacks).
        try:
            human_text = ticloud_cluster_describe(PRODUCTION_CLUSTER_ID)
            prod_prefix = parse_production_user_prefix(human_text)
        except OrchestrationGuardError as exc:
            msg = str(exc).lower()
            if "collides" in msg or "malformed" in msg or "present" in msg:
                # Fatal classification of the structure of the production
                # data — try the defensive sql-user-list fallback before
                # giving up.
                fallback = _try_parse_production_prefix_from_sql_user_list(
                    PRODUCTION_CLUSTER_ID,
                )
                if fallback is None:
                    summary["failed_step"] = "ticloud_cluster_describe"
                    summary["error"] = str(exc)
                    emit_summary(exc.code)
                    print(f"{exc.code}: {exc}", file=sys.stderr)
                    return 2
                prod_prefix = fallback
            else:
                summary["failed_step"] = "ticloud_cluster_describe"
                summary["error"] = str(exc)
                emit_summary(exc.code)
                print(f"{exc.code}: {exc}", file=sys.stderr)
                return 2

        # 3. bootstrap TLS probe
        try:
            probe = probe_bootstrap(
                branch["host"], REHEARSAL_PORT, bootstrap_user, bootstrap_password,
                expected_user_prefix=branch["user_prefix"],
                forbidden_user_prefix=prod_prefix,
            )
        except OrchestrationGuardError as exc:
            summary["failed_step"] = "bootstrap_tls_probe"
            summary["bootstrap_user"] = f"{branch['user_prefix']}***"
            summary["error"] = str(exc)
            emit_summary(exc.code)
            print(f"{exc.code}: {exc}", file=sys.stderr)
            return 2

        # 4. provision temp accounts
        try:
            read_name, migrate_name = make_temp_account_names(branch["user_prefix"])
            read_password = secrets.token_urlsafe(32)
            migrate_password = secrets.token_urlsafe(32)
            provision_temp_users(
                branch["host"], REHEARSAL_PORT,
                bootstrap_user, bootstrap_password,
                read_name, read_password,
                migrate_name, migrate_password,
            )
        except OrchestrationGuardError as exc:
            summary["failed_step"] = "provision_temp_users"
            summary["error"] = str(exc)
            emit_summary(exc.code)
            print(f"{exc.code}: {exc}", file=sys.stderr)
            return 2

        # 5. verify temp accounts via fresh TLS
        try:
            r_meta = verify_new_user(branch["host"], REHEARSAL_PORT, read_name, read_password)
            m_meta = verify_new_user(branch["host"], REHEARSAL_PORT,
                                      migrate_name, migrate_password)
            for label, meta in (("read", r_meta), ("migrate", m_meta)):
                cu = meta["current_user"].split("@", 1)[0]
                if not (
                    cu.casefold().startswith(branch["user_prefix"].casefold() + ".")
                    or cu.casefold().startswith(branch["user_prefix"].casefold() + "_")
                ):
                    raise err(
                        f"{label} account CURRENT_USER()={cu!r} is not branch-bound",
                        code=BLOCK_CREDENTIAL_PROVISIONING,
                    )
        except OrchestrationGuardError as exc:
            summary["failed_step"] = "verify_temp_users"
            summary["error"] = str(exc)
            emit_summary(exc.code)
            print(f"{exc.code}: {exc}", file=sys.stderr)
            return 2

        # 6. evidence + companion
        try:
            evidence_dir = make_evidence_dir()
            evidence = build_identity_evidence(branch)
            evidence_path, evidence_sha = write_identity_evidence_to_dir(
                evidence, evidence_dir)
            companion_path = write_audit_context(
                evidence_dir, branch, prod_prefix, IDENTITY_SOURCE)
        except OrchestrationGuardError as exc:
            summary["failed_step"] = "evidence_generation"
            summary["error"] = str(exc)
            emit_summary(exc.code)
            print(f"{exc.code}: {exc}", file=sys.stderr)
            return 2

        # 6a. diagnostic-only branch (spec §9): run the seven-stage mysql
        # probe through docker create/wait/inspect before invoking the
        # strict runner.  On first failing stage, emit the failing stage
        # name + classification + container_exit_code + primary_message,
        # drop temp accounts in `finally`, and never call migrate.
        if args.diagnostic_only:
            diag = run_standalone_diagnostic_preflight(
                branch=branch,
                read_user=read_name, read_password=read_password,
                migrate_user=migrate_name, migrate_password=migrate_password,
                evidence_dir=evidence_dir,
            )
            summary["diagnostic_mode"] = True
            summary["diagnostic_stages"] = diag["stages"]
            failing = diag["first_failing_stage"]
            summary["first_failing_stage"] = failing
            if failing is None:
                summary["runner_stages_executed"] = [s["stage"] for s in diag["stages"]]
                emit_summary(BLOCK_PASSED)
                print(
                    f"{BLOCK_PASSED}: diagnostic_only all_probes_passed "
                    f"stages={len(diag['stages'])}",
                    file=sys.stderr,
                )
                return 2
            summary["primary_failure"] = failing
            summary["failed_step"] = "diagnostic_" + failing["stage"]
            summary["error"] = failing["primary_message"]
            emit_summary(BLOCK_V42_RUNNER)
            print(
                f"{BLOCK_V42_RUNNER}: diagnostic_only "
                f"stage={failing['stage']} "
                f"classification={failing['classification']} "
                f"container_exit={failing.get('container_exit_code')} "
                f"wait_rc={failing.get('wait_rc')} "
                f"oom_killed={failing.get('oom_killed')} "
                f"docker_state_error={failing.get('docker_state_error', '')[:120]!r} "
                f"primary_message={failing['primary_message']}",
                file=sys.stderr,
            )
            return 2

        confirmation = build_confirmation_string(branch)
        env = build_sanitized_env(
            branch=branch, production_user_prefix=prod_prefix,
            read_user=read_name, read_password=read_password,
            migrate_user=migrate_name, migrate_password=migrate_password,
        )
        secrets_for_log = (
            bootstrap_user, bootstrap_password,
            read_name, read_password,
            migrate_name, migrate_password,
        )

        # 7. local-check
        local_log = evidence_dir / "runner-local-check.log"
        local_result = invoke_runner(
            "local-check", env=env, confirm_target=confirmation,
            identity_evidence=evidence_path, identity_sha=evidence_sha,
            evidence_dir=evidence_dir,
            stage="local_check",
            command_category="strict_runner_subprocess",
            redacted_log=local_log, secrets_to_redact=secrets_for_log,
        )
        rc_local = local_result["exit_code"]
        runner_logs.append(local_log)
        local_stage = _build_stage_summary("local_check", local_result)
        summary["stages"].append(local_stage)
        if rc_local != 0:
            summary["primary_failure"] = local_stage
            summary["failed_step"] = "strict_runner_local_check"
            summary["runner_log"] = str(local_log)
            summary["error"] = (
                f"strict runner local-check rc={rc_local} "
                f"classification={local_stage['classification']!r} "
                f"primary_message={local_stage['primary_message'][:1200]!r}"
            )
            emit_summary(BLOCK_V42_RUNNER)
            print(
                f"{BLOCK_V42_RUNNER}: strict_runner_local_check "
                f"stage=local_check rc={rc_local} "
                f"classification={local_stage['classification']} "
                f"primary_message={local_stage['primary_message'][:1200]}",
                file=sys.stderr,
            )
            return 2

        # 8. preflight
        preflight_evidence = evidence_dir / "preflight-evidence.json"
        preflight_log = evidence_dir / "runner-preflight.log"
        preflight_result = invoke_runner(
            "preflight", env=env, confirm_target=confirmation,
            identity_evidence=evidence_path, identity_sha=evidence_sha,
            evidence_dir=evidence_dir,
            stage="preflight",
            command_category="strict_runner_subprocess",
            evidence_out=preflight_evidence,
            redacted_log=preflight_log, secrets_to_redact=secrets_for_log,
        )
        rc_pre = preflight_result["exit_code"]
        runner_logs.append(preflight_log)
        preflight_stage = _build_stage_summary("preflight", preflight_result)
        summary["stages"].append(preflight_stage)
        if rc_pre != 0:
            summary["primary_failure"] = preflight_stage
            summary["failed_step"] = "strict_runner_preflight"
            summary["runner_log"] = str(preflight_log)
            summary["error"] = (
                f"strict runner preflight rc={rc_pre} "
                f"classification={preflight_stage['classification']!r} "
                f"primary_message={preflight_stage['primary_message'][:1200]!r}"
            )
            emit_summary(BLOCK_V42_RUNNER)
            print(
                f"{BLOCK_V42_RUNNER}: strict_runner_preflight "
                f"stage=preflight rc={rc_pre} "
                f"classification={preflight_stage['classification']} "
                f"primary_message={preflight_stage['primary_message'][:1200]}",
                file=sys.stderr,
            )
            return 2
        pre_sha = hashlib.sha256(preflight_evidence.read_bytes()).hexdigest()

        # 9. migrate
        postflight_evidence = evidence_dir / "postflight-evidence.json"
        migrate_log = evidence_dir / "runner-migrate.log"
        migrate_result = invoke_runner(
            "migrate", env=env, confirm_target=confirmation,
            identity_evidence=evidence_path, identity_sha=evidence_sha,
            evidence_dir=evidence_dir,
            stage="migrate",
            command_category="strict_runner_subprocess",
            before_evidence=preflight_evidence, before_sha=pre_sha,
            evidence_out=postflight_evidence,
            redacted_log=migrate_log, secrets_to_redact=secrets_for_log,
        )
        rc_mig = migrate_result["exit_code"]
        runner_logs.append(migrate_log)
        mig_sha = ""
        try:
            mig_sha = hashlib.sha256(postflight_evidence.read_bytes()).hexdigest()
        except OSError:
            pass
        migrate_stage = _build_stage_summary("migrate", migrate_result)
        migrate_stage["postflight_evidence_sha256"] = mig_sha
        summary["stages"].append(migrate_stage)
        if rc_mig != 0:
            summary["primary_failure"] = migrate_stage
            summary["failed_step"] = "strict_runner_migrate"
            summary["runner_log"] = str(migrate_log)
            summary["error"] = (
                f"strict runner migrate rc={rc_mig} "
                f"classification={migrate_stage['classification']!r} "
                f"primary_message={migrate_stage['primary_message'][:1200]!r}"
            )
            emit_summary(BLOCK_V42_RUNNER)
            print(
                f"{BLOCK_V42_RUNNER}: strict_runner_migrate "
                f"stage=migrate rc={rc_mig} "
                f"classification={migrate_stage['classification']} "
                f"primary_message={migrate_stage['primary_message'][:1200]}",
                file=sys.stderr,
            )
            return 2

        # 10. success summary (always classified)
        prod_redact = (
            prod_prefix[:3] + "***" + prod_prefix[-2:]
            if len(prod_prefix) >= 6 else "***REDACTED***"
        )
        summary.update({
            "branch": {
                "branch_id": branch["branch_id"],
                "branch_name": branch["branch_name"],
                "user_prefix": branch["user_prefix"],
                "host": branch["host"],
                "region": branch["region"],
                "state": branch["state"],
                "create_time": branch["create_time"],
            },
            "production": {
                "parent_id": PRODUCTION_CLUSTER_ID,
                "user_prefix_redacted": prod_redact,
            },
            "bootstrap_probe": {
                "database": probe["database"],
                "session_user_prefix_verified": probe["session_user_prefix_verified"],
                "account_sanitised": probe["_account_sanitised"],
            },
            "provisioned_temp_users": {
                "read_user": read_name,
                "migrate_user": migrate_name,
                "password_set": True,
            },
            "strict_runner": {
                "local_check_rc": rc_local,
                "preflight_rc": rc_pre,
                "migrate_rc": rc_mig,
                "preflight_evidence_sha256": pre_sha,
                "postflight_evidence_sha256": mig_sha,
            },
            "evidence": {
                "identity_evidence_sha256": evidence_sha,
                "audit_context_path": str(companion_path),
                "preflight_evidence_sha256": pre_sha,
                "postflight_evidence_sha256": mig_sha,
            },
            "runner_logs": [str(p) for p in runner_logs],
        })
        emit_summary(BLOCK_PASSED)
        return 0

    except subprocess.TimeoutExpired as exc:
        summary["failed_step"] = "subprocess_timeout"
        summary["error"] = repr(exc)
        emit_summary(BLOCK_V42_RUNNER)
        print(f"{BLOCK_V42_RUNNER}: subprocess timeout: {exc}", file=sys.stderr)
        return 2
    finally:
        # 11. cleanup
        try:
            if (read_name and migrate_name and branch
                    and bootstrap_user.strip() and bootstrap_password.strip()):
                try:
                    drop_temp_users(branch["host"], REHEARSAL_PORT,
                                     bootstrap_user, bootstrap_password,
                                     read_name, migrate_name)
                except OrchestrationGuardError as exc:
                    summary["cleanup_drop_user_failed"] = str(exc)
                    # Promote the final classification so the structured report
                    # reflects the actual end state, not a stale PASSED.
                    emit_summary(BLOCK_CREDENTIAL_PROVISIONING)
                    print(
                        f"{BLOCK_CREDENTIAL_PROVISIONING}: cleanup DROP USER failed: {exc}",
                        file=sys.stderr,
                    )
        finally:
            if evidence_dir is not None and not args.keep_evidence:
                # Always consume wrapper-generated evidence.  The strict runner's
                # in-evidence artifacts we wrote via --evidence-file are inside
                # this directory and so are deleted too.  The strict runner does
                # not retain them.
                shutil.rmtree(str(evidence_dir), ignore_errors=True)
            for var in (BOOTSTRAP_USER_VAR, BOOTSTRAP_PASSWORD_VAR):
                os.environ.pop(var, None)


if __name__ == "__main__":
    raise SystemExit(main())
