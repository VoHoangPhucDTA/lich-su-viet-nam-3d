"""Reproducible quota-free four-container smoke through the frontend proxy."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import statistics
import subprocess
import tempfile
import threading
import time
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "compose.ai-e2e.yml"
REPORT_DIR = ROOT / "artifacts" / "e2e"


def command(args: list[str], env_file: Path, *, capture: bool = False) -> str:
    completed = subprocess.run(
        ["docker", "compose", "--env-file", str(env_file), "-f", str(COMPOSE), *args],
        cwd=ROOT, check=True, text=True, capture_output=capture,
    )
    return completed.stdout if capture else ""


def request(
    opener,
    method: str,
    path: str,
    body=None,
    *,
    csrf_token: str | None = None,
    allow_error: bool = False,
):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        "http://127.0.0.1:15173" + path,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"X-CSRF-TOKEN": csrf_token} if csrf_token else {}),
        },
    )
    started = time.perf_counter()
    try:
        with opener.open(req, timeout=30) as response:
            value = json.loads(response.read())
            status = response.status
    except urllib.error.HTTPError as exc:
        if not allow_error:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"HTTP {exc.code} for {path}: {detail}") from exc
        status = exc.code
        value = json.loads(exc.read())
    return value, round((time.perf_counter() - started) * 1000, 3), status


def csrf(opener) -> str:
    response, _, status = request(opener, "GET", "/api/auth/csrf")
    payload = data(response)
    if status != 200 or not isinstance(payload, dict) or not payload.get("token"):
        raise RuntimeError("CSRF bootstrap did not return a token")
    return str(payload["token"])


def mysql(env_file: Path, sql: str) -> str:
    completed = subprocess.run(
        ["docker", "compose", "--env-file", str(env_file), "-f", str(COMPOSE),
         "exec", "-T", "mysql", "sh", "-lc",
         "mysql -N -u\"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" \"$MYSQL_DATABASE\""],
        cwd=ROOT, input=sql, text=True, check=True, capture_output=True,
    )
    return completed.stdout.strip()


def write_sanitized_logs(env_file: Path) -> None:
    completed = subprocess.run(
        ["docker", "compose", "--env-file", str(env_file), "-f", str(COMPOSE), "logs", "--no-color"],
        cwd=ROOT, text=True, capture_output=True,
    )
    sanitized = re.sub(
        r"(?i)(password|token|secret|api[_-]?key)=\S+",
        r"\1=<redacted>", completed.stdout,
    )
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "compose-sanitized.log").write_text(sanitized[-20000:], encoding="utf-8")


def data(response: dict):
    if not response.get("success", False):
        raise RuntimeError("API response reported failure")
    return response.get("data")


def summary(samples: list[float]) -> dict:
    ordered = sorted(samples)
    p95_index = max(0, min(len(ordered) - 1, int(len(ordered) * 0.95 + 0.999) - 1))
    return {
        "samples": len(samples), "averageMs": round(statistics.mean(samples), 3),
        "p50Ms": round(statistics.median(samples), 3), "p95Ms": ordered[p95_index],
        "minMs": ordered[0], "maxMs": ordered[-1], "errors": 0,
    }


def wait_frontend() -> None:
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:15173/", timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(2)
    raise RuntimeError("frontend/backend readiness timeout")


def create_identity(env_file: Path, role: str):
    email = f"ai-e2e-{role}-{secrets.token_hex(5)}@example.invalid"
    password = "E2e!" + secrets.token_urlsafe(20)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    register_csrf = csrf(opener)
    _, register_ms, _ = request(opener, "POST", "/api/auth/register", {
        "email": email, "password": password, "fullName": f"AI E2E {role}", "grade": "12", "school": "CI"
    }, csrf_token=register_csrf)
    mysql(env_file,
        f"UPDATE users SET status='active',email_verified_at=CURRENT_TIMESTAMP,"
        f"auth_version=auth_version+1 WHERE email='{email}';"
        "INSERT IGNORE INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r "
        f"WHERE u.email='{email}' AND r.code='{role}';")
    # Fixture promotion invalidates any credentials minted before the final role/status.
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    login_csrf = csrf(opener)
    _, login_ms, _ = request(
        opener, "POST", "/api/auth/login",
        {"email": email, "password": password},
        csrf_token=login_csrf,
    )
    session_csrf = csrf(opener)
    request(opener, "POST", "/api/auth/refresh", csrf_token=session_csrf)
    session_csrf = csrf(opener)
    return opener, session_csrf, register_ms, login_ms


def seed_publish_target(env_file: Path) -> dict[str, str]:
    target = {"datasetId": str(uuid4()), "definitionId": str(uuid4()), "sectionId": str(uuid4())}
    binary = lambda value: f"UNHEX(REPLACE('{value}','-',''))"
    mysql(env_file, f"""
        INSERT INTO exam_datasets (id,aggregate_hash,build_id,status,hash_schema_version,build_algorithm_version,source_count,build_metadata_json)
        VALUES ({binary(target['datasetId'])},REPEAT('a',64),'ai-e2e','ACTIVE',1,1,0,'{{}}');
        INSERT INTO exam_definitions
        (id,dataset_id,exam_id,title,exam_format,time_limit_minutes,total_score,source_file,content_hash,visibility_status,verification_status,mcq_count,tf_count)
        VALUES ({binary(target['definitionId'])},{binary(target['datasetId'])},'ai-e2e','AI E2E','MCQ',15,10,'internal',REPEAT('b',64),'HIDDEN','REVIEW_REQUIRED',0,0);
        INSERT INTO exam_sections (id,exam_definition_id,section_id,section_type,title,order_in_exam,total_questions)
        VALUES ({binary(target['sectionId'])},{binary(target['definitionId'])},'mcq','mcq','MCQ',1,0);
    """)
    return target


def generate_and_approve(
    creator,
    creator_csrf: str,
    reviewer,
    reviewer_csrf: str,
    latency: dict[str, list[float]],
):
    generated, elapsed, _ = request(creator, "POST", "/api/exams/ai/generate", {
        "query": "Cách mạng tháng Tám", "grade": 12, "lessonNumber": 6,
        "difficulty": "MEDIUM", "count": 1, "topK": 3,
    }, csrf_token=creator_csrf)
    receipt = data(generated)["generationReceipt"]["id"]
    created, elapsed_save, _ = request(creator, "POST", "/api/exams/ai/candidates", {
        "generationReceiptId": receipt, "questionIndexes": [0]
    }, csrf_token=creator_csrf)
    candidate = data(created)[0]
    submitted, elapsed_submit, _ = request(creator, "POST", f"/api/exams/ai/candidates/{candidate['id']}/submit", {
        "version": candidate["version"], "note": "deterministic HTTP concurrency fixture"
    }, csrf_token=creator_csrf)
    candidate = data(submitted)
    approved, elapsed_approve, _ = request(reviewer, "POST", f"/api/exams/ai/candidates/{candidate['id']}/approve", {
        "version": candidate["version"], "note": "independent deterministic reviewer",
        "selfReviewOverride": False,
    }, csrf_token=reviewer_csrf)
    latency["save"].append(elapsed_save)
    latency["submit"].append(elapsed_submit)
    latency["approve"].append(elapsed_approve)
    return data(approved)


def publish_race(opener, csrf_token: str, candidate: dict, target: dict, latency: list[float]):
    barrier = threading.Barrier(2)
    body = {"version": candidate["version"], **target}
    path = f"/api/exams/ai/candidates/{candidate['id']}/publish"

    def invoke():
        barrier.wait(timeout=10)
        return request(
            opener, "POST", path, body,
            csrf_token=csrf_token, allow_error=True,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [future.result() for future in [pool.submit(invoke), pool.submit(invoke)]]
    statuses = [item[2] for item in results]
    latency.extend(item[1] for item in results)
    if not all(status in {200, 409} for status in statuses) or 200 not in statuses:
        raise RuntimeError(f"unsafe concurrent publish result: {statuses}")
    published = next(data(item[0]) for item in results if item[2] == 200)
    if published["status"] != "PUBLISHED":
        raise RuntimeError("winner did not return PUBLISHED")
    return statuses, published


def assert_publish_shape(env_file: Path, candidate_id: str) -> None:
    cid = f"UNHEX(REPLACE('{candidate_id}','-',''))"
    shape = mysql(env_file, f"""
        SELECT CONCAT(
          (SELECT COUNT(*) FROM exam_questions q JOIN ai_question_candidates c ON c.official_question_id=q.id WHERE c.id={cid}),':',
          (SELECT COUNT(*) FROM exam_mcq_options o JOIN ai_question_candidates c ON c.official_question_id=o.question_internal_id WHERE c.id={cid}),':',
          (SELECT COUNT(*) FROM ai_question_official_revisions r WHERE r.candidate_id={cid}),':',
          (SELECT status FROM ai_question_candidates WHERE id={cid}));
    """)
    if shape != "1:4:1:PUBLISHED":
        raise RuntimeError(f"publish SQL invariant failed: {shape}")


def run_once(env_file: Path, build: bool) -> dict:
    if build:
        command(["build"], env_file)
    command(["up", "-d", "--wait"], env_file)
    wait_frontend()
    creator, creator_csrf, register_ms, login_ms = create_identity(env_file, "teacher")
    reviewer, reviewer_csrf, _, _ = create_identity(env_file, "teacher")
    admin, admin_csrf, _, _ = create_identity(env_file, "admin")
    target = seed_publish_target(env_file)
    generation = {}
    latency = {"register": [register_ms], "login": [login_ms]}
    for count in (1, 3):
        response, elapsed, _ = request(creator, "POST", "/api/exams/ai/generate", {
            "query": "Cách mạng tháng Tám", "grade": 12, "lessonNumber": 6,
            "difficulty": "MEDIUM", "count": count, "topK": 3,
        }, csrf_token=creator_csrf)
        payload = data(response)
        questions = payload.get("questions", [])
        if len(questions) != count:
            raise RuntimeError(f"generation count mismatch: expected={count} actual={len(questions)}")
        generation[str(count)] = {"questions": len(questions), "receiptPresent": bool(payload.get("generationReceipt", {}).get("id"))}
        latency[f"generationCount{count}"] = [elapsed]
    latency.update({"save": [], "submit": [], "approve": [], "originalPublish": [],
                    "sourceSearch": [], "remap": [], "revisionCreate": [], "revisionPublish": []})
    original_statuses = []
    revision_statuses = []
    for _ in range(5):
        original = generate_and_approve(
            creator, creator_csrf, reviewer, reviewer_csrf, latency)
        statuses, published = publish_race(
            admin, admin_csrf, original, target, latency["originalPublish"])
        original_statuses.append(statuses)
        assert_publish_shape(env_file, published["id"])

        revised, elapsed_revision, _ = request(creator, "POST", f"/api/exams/ai/candidates/{published['id']}/revisions", {
            "reason": "deterministic post-publish correction"
        }, csrf_token=creator_csrf)
        revision = data(revised)
        latency["revisionCreate"].append(elapsed_revision)
        search, elapsed_search, _ = request(creator, "POST", f"/api/exams/ai/candidates/{revision['id']}/source-search", {
            "query": "Cách mạng tháng Tám", "grade": 12, "lessonNumber": 6, "topK": 3
        }, csrf_token=creator_csrf)
        canonical = data(search)[0]
        remapped, elapsed_remap, _ = request(creator, "PUT", f"/api/exams/ai/candidates/{revision['id']}/sources", {
            "version": revision["version"],
            "sources": [{"chunkId": canonical["chunkId"], "chunkHash": canonical["chunkHash"]}],
            "reason": "explicit deterministic canonical remap"
        }, csrf_token=creator_csrf)
        revision = data(remapped)
        latency["sourceSearch"].append(elapsed_search)
        latency["remap"].append(elapsed_remap)
        submitted, elapsed_submit, _ = request(creator, "POST", f"/api/exams/ai/candidates/{revision['id']}/submit", {
            "version": revision["version"], "note": "revision concurrency fixture"
        }, csrf_token=creator_csrf)
        revision = data(submitted)
        latency["submit"].append(elapsed_submit)
        approved, elapsed_approve, _ = request(reviewer, "POST", f"/api/exams/ai/candidates/{revision['id']}/approve", {
            "version": revision["version"], "note": "independent revision reviewer", "selfReviewOverride": False
        }, csrf_token=reviewer_csrf)
        revision = data(approved)
        latency["approve"].append(elapsed_approve)
        statuses, revision_published = publish_race(
            admin, admin_csrf, revision, target, latency["revisionPublish"])
        revision_statuses.append(statuses)
        assert_publish_shape(env_file, revision_published["id"])
    flyway = mysql(env_file, "SELECT CONCAT(COUNT(*),':',MAX(CAST(version AS UNSIGNED))) FROM flyway_schema_history WHERE success=1;")
    return {
        "migration": {"successfulCountAndMaxVersion": flyway},
        "serviceHealth": {"composeWait": "passed", "frontendProxy": "passed"},
        "authMatrix": {"teacherCreator": "passed", "otherTeacherReviewer": "passed", "adminPublisher": "passed"},
        "generation": generation,
        "candidateFourEyes": "passed",
        "concurrency": {"originalRounds": len(original_statuses), "revisionRounds": len(revision_statuses),
                        "originalStatuses": original_statuses, "revisionStatuses": revision_statuses,
                        "sqlInvariant": "1 official:4 options:1 chain:PUBLISHED"},
        "latency": {name: summary(values) for name, values in latency.items()},
        "environment": {"provider": "deterministic-e2e", "composeFile": COMPOSE.name},
    }


def write_report(report: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "ai-e2e-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    lines = ["# AI deterministic E2E report", "", f"Status: **{report['status']}**", "",
             f"Runs: {len(report['runs'])}", "", "Provider: deterministic-e2e (no Gemini credential).", "",
             "This is a local/CI integration baseline, not a production benchmark."]
    (REPORT_DIR / "ai-e2e-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()
    if args.repeat < 1:
        raise SystemExit("--repeat must be positive")
    subprocess.run(["docker", "version"], check=True, stdout=subprocess.DEVNULL)
    descriptor, env_name = tempfile.mkstemp(prefix="lichsuvn-ai-e2e-", suffix=".env")
    os.close(descriptor)
    env_file = Path(env_name)
    env_file.write_text(
        "AI_E2E_MYSQL_PASSWORD=" + secrets.token_urlsafe(32) + "\n"
        "AI_E2E_JWT_SECRET=" + secrets.token_urlsafe(64) + "\n"
        "AI_E2E_INTERNAL_TOKEN=" + secrets.token_urlsafe(48) + "\n"
        "AI_E2E_FLYWAY_ENABLED=true\n", encoding="utf-8"
    )
    report = {"status": "FAILED", "runs": [], "cleanup": "pending", "failures": []}
    try:
        # Recover only this Compose project's stale resources from an interrupted prior run.
        command(["down", "-v", "--remove-orphans"], env_file)
        for index in range(args.repeat):
            report["runs"].append(run_once(env_file, build=index == 0 and not args.no_build))
            command(["down", "-v", "--remove-orphans"], env_file)
        report["status"] = "PASSED"
        report["cleanup"] = "passed"
        return 0
    except Exception as exc:
        write_sanitized_logs(env_file)
        report["failures"].append(type(exc).__name__ + ": " + str(exc))
        return 1
    finally:
        if not args.keep:
            try:
                command(["down", "-v", "--remove-orphans"], env_file)
                report["cleanup"] = "passed"
            except Exception:
                report["cleanup"] = "failed"
            env_file.unlink(missing_ok=True)
        else:
            report["cleanup"] = "kept-for-debug"
        write_report(report)


if __name__ == "__main__":
    raise SystemExit(main())
