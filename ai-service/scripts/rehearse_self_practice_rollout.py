"""Offline Goal 15P rehearsal for self-practice candidate routing."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, cast

from app.config import Settings
from app.core.deadline import OperationDeadline
from app.generation.models import (
    GenerationOutputError,
    GenerationRequest,
    GenerationResponse,
    GenerationTransientError,
    GenerationUseCase,
)
from app.generation.service import (
    GenerationEvaluationTrace,
    GenerationModelClass,
    RoutedGenerationService,
    select_generation_route,
)

OUTPUT_ROOT = Path("../artifacts/ai-service/goal15p")
STATUS_PASS = "LOCAL_STAGING_ACTIVATION_REHEARSAL_PASS"
LIVE_SMOKE_STATUS = "LIVE_SMOKE_NOT_RUN"


@dataclass(frozen=True)
class RecordedCall:
    query: str
    deadline: object | None
    trace: object | None


class RecordingService:
    def __init__(self, model_class: GenerationModelClass, failure: Exception | None = None) -> None:
        self.model_class = model_class
        self.failure = failure
        self.calls: list[RecordedCall] = []
        self.close_count = 0
        self._lock = Lock()

    def generate(self, request: GenerationRequest, **kwargs: Any) -> GenerationResponse:
        call = RecordedCall(
            request.query,
            kwargs.get("deadline"),
            kwargs.get("evaluation_trace"),
        )
        with self._lock:
            self.calls.append(call)
        if self.failure is not None:
            raise self.failure
        return cast(GenerationResponse, {"modelClass": self.model_class.value})

    def close(self) -> None:
        self.close_count += 1


class RecordingRetrieval:
    def __init__(self) -> None:
        self.close_count = 0

    def close(self) -> None:
        self.close_count += 1


def configured(*, enabled: bool, rollout: int) -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        gemini_generation_model="current-rehearsal-model",
        self_practice_model_enabled=enabled,
        self_practice_model="candidate-rehearsal-model",
        self_practice_model_rollout_percent=rollout,
        self_practice_model_fallback_enabled=False,
        self_practice_rollout_salt="wp15-rehearsal-salt",
    )


def request(use_case: GenerationUseCase, *, subject: str | None = "synthetic-subject") -> GenerationRequest:
    return GenerationRequest(
        query=f"rehearsal-{use_case.value.lower()}",
        generation_use_case=use_case,
        canary_subject=subject,
    )


def routing_row(scenario: str, settings: Settings, value: GenerationRequest) -> dict[str, Any]:
    decision = select_generation_route(value, settings)
    return {
        "scenario": scenario,
        "generationUseCase": value.generation_use_case.value,
        "hasCanarySubject": value.canary_subject is not None,
        "modelClass": decision.model_class.value,
        "canaryAssigned": decision.canary_assigned,
        "bucket": decision.bucket,
        "routingReason": decision.reason,
    }


def routing_rehearsal() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    use_cases = list(GenerationUseCase)
    for scenario, settings in (
        ("R0_DISABLED", configured(enabled=False, rollout=0)),
        ("R1_ROLLOUT_ZERO", configured(enabled=True, rollout=0)),
        ("R100", configured(enabled=True, rollout=100)),
    ):
        rows.extend(routing_row(scenario, settings, request(item)) for item in use_cases)
    rows.append(
        routing_row(
            "R100_MISSING_SUBJECT",
            configured(enabled=True, rollout=100),
            request(GenerationUseCase.SELF_PRACTICE, subject=None),
        )
    )
    r5 = configured(enabled=True, rollout=5)
    for index in range(32):
        rows.append(
            routing_row(
                f"R5_SUBJECT_{index:02d}",
                r5,
                request(GenerationUseCase.SELF_PRACTICE, subject=f"synthetic-{index:02d}"),
            )
        )
    return rows


def concurrency_rehearsal() -> dict[str, Any]:
    current = RecordingService(GenerationModelClass.CURRENT)
    candidate = RecordingService(GenerationModelClass.CANDIDATE)
    retrieval = RecordingRetrieval()
    router = RoutedGenerationService(
        settings=configured(enabled=True, rollout=100),
        current_service=current,
        candidate_service=candidate,
        retrieval_service=cast(Any, retrieval),
    )

    def invoke(index: int) -> str:
        use_case = GenerationUseCase.ADMIN_REVIEW if index < 16 else GenerationUseCase.SELF_PRACTICE
        query_request = request(use_case)
        query_request.query = f"concurrent-{index:02d}"
        deadline = OperationDeadline(30)
        trace = GenerationEvaluationTrace()
        result = cast(
            dict[str, str],
            router.generate(
                query_request,
                deadline=deadline,
                evaluation_trace=trace,
            ),
        )
        return result["modelClass"]

    with ThreadPoolExecutor(max_workers=16) as executor:
        results = list(executor.map(invoke, range(32)))
    all_calls = current.calls + candidate.calls
    unique_deadlines = len({id(item.deadline) for item in all_calls}) == 32
    unique_traces = len({id(item.trace) for item in all_calls}) == 32
    isolated = all(item == "CURRENT" for item in results[:16]) and all(
        item == "CANDIDATE" for item in results[16:]
    )
    router.close()
    router.close()
    return {
        "currentRequests": len(current.calls),
        "candidateRequests": len(candidate.calls),
        "modelClassIsolation": isolated,
        "deadlineIsolation": unique_deadlines,
        "repairTraceIsolation": unique_traces,
        "currentPoolCloseCount": current.close_count,
        "candidatePoolCloseCount": candidate.close_count,
        "retrievalCloseCount": retrieval.close_count,
        "shutdownIdempotent": all(
            count == 1
            for count in (current.close_count, candidate.close_count, retrieval.close_count)
        ),
    }


def failure_rehearsal() -> list[dict[str, Any]]:
    failures = {
        "provider_unavailable": GenerationTransientError("PROVIDER_UNAVAILABLE"),
        "provider_429": GenerationTransientError("PROVIDER_RATE_LIMITED"),
        "provider_5xx": GenerationTransientError("PROVIDER_SERVER_ERROR"),
        "timeout": TimeoutError("GENERATION_TIMEOUT"),
        "invalid_structured_output": GenerationOutputError("INVALID_STRUCTURED_OUTPUT"),
        "repair_invalid": GenerationOutputError("NO_VALID_QUESTIONS_AFTER_REPAIR"),
    }
    results: list[dict[str, Any]] = []
    for name, failure in failures.items():
        current = RecordingService(GenerationModelClass.CURRENT)
        candidate = RecordingService(GenerationModelClass.CANDIDATE, failure)
        router = RoutedGenerationService(
            settings=configured(enabled=True, rollout=100),
            current_service=current,
            candidate_service=candidate,
            retrieval_service=cast(Any, RecordingRetrieval()),
        )
        observed = ""
        try:
            router.generate(
                request(GenerationUseCase.SELF_PRACTICE),
                deadline=OperationDeadline(30),
                evaluation_trace=GenerationEvaluationTrace(),
            )
        except Exception as exc:
            observed = type(exc).__name__
        results.append(
            {
                "scenario": name,
                "observedException": observed,
                "candidateCalls": len(candidate.calls),
                "currentCalls": len(current.calls),
                "noFallback": len(candidate.calls) == 1 and not current.calls,
            }
        )
        router.close()
    return results


def rollback_rehearsal() -> dict[str, Any]:
    before = select_generation_route(
        request(GenerationUseCase.SELF_PRACTICE), configured(enabled=True, rollout=100)
    )
    rollback_started_at = datetime.now(timezone.utc)
    started = time.perf_counter()
    after = select_generation_route(
        request(GenerationUseCase.SELF_PRACTICE), configured(enabled=True, rollout=0)
    )
    ready_at = time.perf_counter()
    service_ready_at = datetime.now(timezone.utc)
    return {
        "rollbackStart": rollback_started_at.isoformat(),
        "serviceReadyAt": service_ready_at.isoformat(),
        "rollbackDurationMs": round((ready_at - started) * 1000, 3),
        "before": before.model_class.value,
        "after": after.model_class.value,
        "migrationRequired": False,
        "chromaRebuildRequired": False,
        "frontendDeployRequired": False,
    }


def redaction_rehearsal() -> dict[str, Any]:
    subject = "synthetic-subject-never-log"
    forbidden = [subject, "wp15-rehearsal-salt", "candidate-rehearsal-model", "current-rehearsal-model"]
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    logger = logging.getLogger("app.generation")
    logger.addHandler(handler)
    old_level = logger.level
    logger.setLevel(logging.INFO)
    try:
        current = RecordingService(GenerationModelClass.CURRENT)
        candidate = RecordingService(GenerationModelClass.CANDIDATE)
        router = RoutedGenerationService(
            settings=configured(enabled=True, rollout=100),
            current_service=current,
            candidate_service=candidate,
            retrieval_service=cast(Any, RecordingRetrieval()),
        )
        router.generate(request(GenerationUseCase.SELF_PRACTICE, subject=subject))
        router.close()
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)
    captured = stream.getvalue()
    required = [
        "generationUseCase",
        "modelClass",
        "canaryAssigned",
        "bucketGroup",
        "routingReason",
    ]
    return {
        "scannedInMemory": True,
        "forbiddenValueCount": sum(value in captured for value in forbidden),
        "requiredFieldCount": sum(value in captured for value in required),
        "logPersisted": False,
        "pass": not any(value in captured for value in forbidden)
        and all(value in captured for value in required),
    }


def build_report() -> dict[str, Any]:
    rows = routing_rehearsal()
    r5_rows = [row for row in rows if row["scenario"].startswith("R5_")]
    deterministic = all(
        routing_row(
            "repeat",
            configured(enabled=True, rollout=5),
            request(
                GenerationUseCase.SELF_PRACTICE,
                subject=f"synthetic-{index:02d}",
            ),
        )["bucket"]
        == row["bucket"]
        for index, row in enumerate(r5_rows)
    )
    concurrency = concurrency_rehearsal()
    failures = failure_rehearsal()
    rollback = rollback_rehearsal()
    redaction = redaction_rehearsal()
    disabled_rows = [row for row in rows if row["scenario"] == "R0_DISABLED"]
    zero_rows = [row for row in rows if row["scenario"] == "R1_ROLLOUT_ZERO"]
    hundred_rows = [row for row in rows if row["scenario"] == "R100"]
    missing_subject = next(
        row for row in rows if row["scenario"] == "R100_MISSING_SUBJECT"
    )
    checks = {
        "disabledCurrent": all(row["modelClass"] == "CURRENT" for row in disabled_rows),
        "rolloutZeroCurrent": all(row["modelClass"] == "CURRENT" for row in zero_rows),
        "rolloutHundredEligibleCandidate": any(
            row["modelClass"] == "CANDIDATE"
            for row in hundred_rows
            if row["generationUseCase"] == "SELF_PRACTICE"
        ),
        "nonPracticeCurrent": all(
            row["modelClass"] == "CURRENT"
            for row in hundred_rows
            if row["generationUseCase"] != "SELF_PRACTICE"
        ),
        "missingSubjectCurrent": missing_subject["modelClass"] == "CURRENT",
        "r5Deterministic": deterministic,
        "r5BucketRange": all(0 <= row["bucket"] <= 99 for row in r5_rows),
        "r5BucketVariation": len({row["bucket"] for row in r5_rows}) > 1,
        "r5BucketRule": all(
            (row["bucket"] < 5) == (row["modelClass"] == "CANDIDATE")
            for row in r5_rows
        ),
        "concurrencyIsolation": concurrency["modelClassIsolation"]
        and concurrency["deadlineIsolation"]
        and concurrency["repairTraceIsolation"],
        "noFallback": all(item["noFallback"] for item in failures),
        "rollback": rollback["before"] == "CANDIDATE" and rollback["after"] == "CURRENT",
        "redaction": redaction["pass"],
    }
    return {
        "status": STATUS_PASS if all(checks.values()) else "LOCAL_STAGING_ACTIVATION_REHEARSAL_FAILED",
        "checks": checks,
        "routingRows": rows,
        "concurrency": concurrency,
        "failures": failures,
        "rollback": rollback,
        "redaction": redaction,
        "liveSmoke": LIVE_SMOKE_STATUS,
    }


def write_artifacts(output_dir: Path, report: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=False)
    manifest = {
        "schemaVersion": "goal15p-rehearsal-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": report["status"],
        "liveSmoke": report["liveSmoke"],
        "providerCalls": 0,
        "productionChanged": False,
    }
    files: dict[str, Any] = {
        "manifest.json": manifest,
        "scenario-results.json": {
            "status": report["status"],
            "checks": report["checks"],
            "failures": report["failures"],
        },
        "lifecycle-summary.json": report["concurrency"],
        "rollback-summary.json": report["rollback"],
        "redaction-summary.json": report["redaction"],
    }
    for name, value in files.items():
        (output_dir / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with (output_dir / "routing-matrix.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(report["routingRows"][0]))
        writer.writeheader()
        writer.writerows(report["routingRows"])
    checksum_lines = []
    for path in sorted(output_dir.iterdir()):
        if path.name == "checksums.sha256":
            continue
        checksum_lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
    (output_dir / "checksums.sha256").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT)
    parser.add_argument("--run-id", default=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", args.run_id):
        raise SystemExit("run-id must contain only A-Z, a-z, 0-9, dot, underscore, or hyphen")
    report = build_report()
    write_artifacts(args.output_root / args.run_id, report)
    print(report["status"])
    return 0 if report["status"] == STATUS_PASS else 1


if __name__ == "__main__":
    raise SystemExit(main())
