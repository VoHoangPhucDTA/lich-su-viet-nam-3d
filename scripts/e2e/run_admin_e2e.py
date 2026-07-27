"""Run isolated Admin browser E2E against disposable MySQL and production images."""

from __future__ import annotations

import json
import http.client
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "compose.admin-e2e.yml"
FRONTEND = ROOT / "frontend"
BASE_URL = "http://127.0.0.1:15174"
MYSQL_IMAGE = "mysql:8.0.36"

ACCOUNTS = {
    "ADMIN_ONE": ("Phase11 Admin One", ("admin",), "active"),
    "ADMIN_TWO": ("Phase11 Admin Two", ("admin",), "active"),
    "STUDENT": ("Phase11 Student", ("student",), "active"),
    "TEACHER": ("Phase11 Teacher", ("teacher",), "active"),
    "MULTI_ROLE": ("Phase11 Multi", ("admin", "teacher", "student"), "active"),
    "NO_ROLE": ("Phase11 No Role", (), "active"),
    "TARGET": ("Phase11 Target", ("student",), "active"),
    "DELETED": ("Phase11 Deleted", ("student",), "deleted"),
}


def compose(env_file: Path, *args: str, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "docker", "compose", "--env-file", str(env_file),
            "-f", str(COMPOSE), *args,
        ],
        cwd=ROOT,
        text=True,
        check=True,
        capture_output=capture,
    )


def redact(text: str, sensitive: list[str]) -> str:
    value = text
    for item in sorted((item for item in sensitive if item), key=len, reverse=True):
        value = value.replace(item, "<redacted>")
    value = re.sub(
        r"(?i)(password|token|secret|cookie|authorization|csrf)"
        r"(?:\s*(?:is|[=:])\s*)[^\s]+",
        r"\1=<redacted>",
        value,
    )
    value = re.sub(r"[\w.+-]+@[\w.-]+", "<redacted-email>", value)
    return value


def wait_frontend() -> None:
    deadline = time.monotonic() + 360
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(BASE_URL + "/", timeout=3) as response:
                if response.status == 200:
                    return
        except (
            urllib.error.URLError,
            TimeoutError,
            ConnectionError,
            http.client.RemoteDisconnected,
        ):
            time.sleep(2)
    raise RuntimeError("Admin E2E frontend did not become healthy")


def request(opener, method: str, path: str, body=None, csrf_value: str | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if csrf_value:
        headers["X-CSRF-TOKEN"] = csrf_value
    request_value = urllib.request.Request(
        BASE_URL + path,
        method=method,
        data=data,
        headers=headers,
    )
    try:
        with opener.open(request_value, timeout=20) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Fixture API request failed: {method} {path} -> {error.code}") from error


def csrf(opener) -> str:
    status, envelope = request(opener, "GET", "/api/auth/csrf")
    payload = envelope.get("data") if isinstance(envelope, dict) else None
    if status != 200 or not isinstance(payload, dict) or not payload.get("token"):
        raise RuntimeError("Fixture CSRF bootstrap failed")
    return str(payload["token"])


def register(email: str, password: str, full_name: str) -> None:
    # This cookie jar is intentionally discarded immediately after registration.
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    status, envelope = request(
        opener,
        "POST",
        "/api/auth/register",
        {
            "email": email,
            "password": password,
            "fullName": full_name,
            "grade": "10",
            "school": "Phase 11 disposable fixture",
        },
        csrf(opener),
    )
    if status != 200 or not envelope.get("success"):
        raise RuntimeError("Fixture registration failed")


def mysql(env_file: Path, sql: str) -> str:
    completed = subprocess.run(
        [
            "docker", "compose", "--env-file", str(env_file),
            "-f", str(COMPOSE), "exec", "-T", "mysql", "sh", "-lc",
            'mysql --batch --skip-column-names -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"',
        ],
        cwd=ROOT,
        input=sql,
        text=True,
        check=True,
        capture_output=True,
    )
    return completed.stdout.strip()


def sql_literal(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def prepare_fixtures(
    env_file: Path,
    emails: dict[str, str],
) -> dict[str, str]:
    email_values = ", ".join(sql_literal(value) for value in emails.values())
    statements = [
        (
            "UPDATE users SET status='active', email_verified_at=CURRENT_TIMESTAMP(6), "
            "auth_version=auth_version+1 WHERE email IN (" + email_values + ");"
        ),
        (
            "DELETE ur FROM user_roles ur JOIN users u ON u.id=ur.user_id "
            "WHERE u.email IN (" + email_values + ");"
        ),
    ]
    for key, (_, roles, status) in ACCOUNTS.items():
        for role in roles:
            statements.append(
                "INSERT INTO user_roles(user_id,role_id) "
                f"SELECT u.id,r.id FROM users u JOIN roles r ON r.code={sql_literal(role)} "
                f"WHERE u.email={sql_literal(emails[key])};"
            )
        if status == "deleted":
            statements.append(
                "UPDATE users SET status='deleted', auth_version=auth_version+1 "
                f"WHERE email={sql_literal(emails[key])};"
            )

    statements.extend([
        """
        INSERT INTO historical_events(
          id,slug,title,event_level,event_type,start_year,effective_end_year,
          geo_type,province_names,historical_locations,card_summary,canonical_summary,
          detailed_narrative,significance,key_facts,raw_json,status)
        VALUES(
          'admin-e2e-attention','admin-e2e-attention','Phase11 Attention Event',
          'atomic','political',NULL,NULL,'no_location',JSON_ARRAY(),JSON_ARRAY(),
          NULL,NULL,NULL,NULL,JSON_ARRAY(),JSON_OBJECT(),'draft');
        """,
        """
        INSERT INTO historical_events(
          id,slug,title,event_level,event_type,start_year,effective_end_year,
          geo_type,province_names,historical_locations,card_summary,canonical_summary,
          detailed_narrative,significance,key_facts,raw_json,status)
        VALUES(
          'admin-e2e-conflict','admin-e2e-conflict','Phase11 Conflict Event',
          'atomic','political',1010,1010,'no_location',JSON_ARRAY(),JSON_ARRAY(),
          'Card','Canonical','Narrative','Significance',JSON_ARRAY('Fact'),
          JSON_OBJECT('mapData', JSON_OBJECT('geoType','no_location')),'draft');
        """,
        "INSERT INTO event_grades(event_id,grade) VALUES('admin-e2e-conflict',10);",
    ])
    mysql(env_file, "\n".join(statements))

    query = (
        "SELECT email, BIN_TO_UUID(id) FROM users "
        "WHERE email IN (" + email_values + ") ORDER BY email;"
    )
    rows = mysql(env_file, query).splitlines()
    by_email = dict(row.split("\t", 1) for row in rows if "\t" in row)
    if set(by_email) != set(emails.values()):
        raise RuntimeError("Fixture identity lookup was incomplete")
    return {key: by_email[email] for key, email in emails.items()}


def verify_flyway(env_file: Path) -> None:
    result = mysql(
        env_file,
        "SELECT CONCAT(COUNT(*),':',COALESCE(MAX(CAST(version AS UNSIGNED)),0),':',"
        "SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)) FROM flyway_schema_history;",
    )
    count, maximum, failed = (int(value) for value in result.split(":"))
    if maximum != 39 or failed != 0 or count < 39:
        raise RuntimeError("Disposable database did not complete Flyway V1-V39")


def main() -> int:
    namespace = "phase11-" + secrets.token_hex(4)
    password = "P11!" + secrets.token_urlsafe(18)
    mysql_password = secrets.token_urlsafe(24)
    jwt_secret = secrets.token_urlsafe(64)
    emails = {
        key: f"{namespace}.{key.lower().replace('_', '-')}@example.invalid"
        for key in ACCOUNTS
    }
    sensitive = [password, mysql_password, jwt_secret, *emails.values()]
    env_values = {
        "ADMIN_E2E_MYSQL_PASSWORD": mysql_password,
        "ADMIN_E2E_JWT_SECRET": jwt_secret,
    }

    failure: BaseException | None = None
    with tempfile.TemporaryDirectory(prefix="lichsuvn-admin-e2e-") as directory:
        env_file = Path(directory) / ".env"
        env_file.write_text(
            "".join(f"{key}={value}\n" for key, value in env_values.items()),
            encoding="utf-8",
        )
        try:
            print(f"[admin-e2e] topology uses pinned {MYSQL_IMAGE}; only {BASE_URL} is exposed", flush=True)
            compose(env_file, "down", "-v", "--remove-orphans", capture=True)
            compose(env_file, "up", "--build", "-d")
            wait_frontend()
            verify_flyway(env_file)
            print("[admin-e2e] Flyway V1-V39 complete on disposable MySQL", flush=True)

            for key, (full_name, _, _) in ACCOUNTS.items():
                register(emails[key], password, full_name)
            ids = prepare_fixtures(env_file, emails)
            print("[admin-e2e] real registrations promoted; pre-promotion cookies discarded", flush=True)

            playwright_env = os.environ.copy()
            playwright_env.update({
                "ADMIN_E2E_BASE_URL": BASE_URL,
                "ADMIN_E2E_NAMESPACE": namespace,
                "ADMIN_E2E_PASSWORD": password,
                "ADMIN_E2E_ATTENTION_EVENT_TITLE": "Phase11 Attention Event",
                "ADMIN_E2E_CONFLICT_EVENT_ID": "admin-e2e-conflict",
                **{f"ADMIN_E2E_{key}_EMAIL": value for key, value in emails.items()},
                **{f"ADMIN_E2E_{key}_ID": value for key, value in ids.items()},
            })
            subprocess.run(
                [
                    "npm.cmd" if os.name == "nt" else "npm",
                    "run",
                    "test:e2e:admin",
                    *sys.argv[1:],
                ],
                cwd=FRONTEND,
                env=playwright_env,
                check=True,
            )
            print("[admin-e2e] Playwright Admin suite passed", flush=True)
        except BaseException as error:
            failure = error
            try:
                logs = compose(env_file, "logs", "--no-color", capture=True).stdout
                tail = "\n".join(logs.splitlines()[-250:])
                print(redact(tail, sensitive), file=sys.stderr)
            except Exception:
                pass
        finally:
            try:
                compose(env_file, "down", "-v", "--remove-orphans", capture=True)
                remaining = compose(env_file, "ps", "-q", capture=True).stdout.strip()
                if remaining:
                    raise RuntimeError("Admin E2E teardown left test-owned containers")
                print("[admin-e2e] containers, networks and disposable volume removed", flush=True)
            except BaseException as cleanup_error:
                failure = failure or cleanup_error

    if failure is not None:
        detail = redact(str(failure), sensitive)
        suffix = f": {detail}" if detail else ""
        print(
            f"[admin-e2e] failed: {type(failure).__name__}{suffix}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
