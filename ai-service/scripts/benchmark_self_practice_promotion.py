"""Bounded live routing and promotion benchmark for AI self-practice.

The report intentionally stores no prompt, query, Fact Context, user identity,
canary subject, credential, generated question, or raw provider response.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import statistics
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.config import Settings
from app.core.runtime import AiRuntimeResources
from app.generation.models import Difficulty, GenerationRequest, GenerationUseCase

CANDIDATE_MODEL = "gemini-3.5-flash-lite"
CURRENT_EXPECTED_MODEL = "gemini-2.5-flash"
BASE_CANDIDATE_REQUESTS = 24
MAX_CANDIDATE_REQUESTS = 48
OUTPUT_ROOT = Path("../artifacts/ai-service/goal17c")

_TOPICS = (
    ("TOPIC_A", "Cách mạng tháng Tám năm 1945"),
    ("TOPIC_B", "Chiến thắng Điện Biên Phủ năm 1954"),
)
_COUNTS = (1, 3, 5, 10)
_DIFFICULTIES = (Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD)


class _GenerationLogCapture(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())

    def reset(self) -> None:
        self.messages.clear()


@dataclass
class CaseMetric:
    case_id: str
    repetition: int
    question_count: int
    difficulty: str
    topic_category: str
    selected_pool: str
    selected_model: str
    rollout_percent: int
    retrieval_latency_ms: float | None
    provider_latency_ms: float | None
    repair_latency_ms: float | None
    total_latency_ms: float
    repair_attempts: int
    provider_attempt_count: int
    provider_retry_count: int
    provider_retry_reasons: list[str]
    provider_retry_delay_ms: float
    provider_attempt_latencies_ms: list[float]
    raw_transient: bool
    validation_issue_count: int | None
    validation_issue_codes: list[str]
    final_valid: bool
    citation_contract_valid: bool
    answer_key_contract_valid: bool
    provider_error: str | None
    provider_error_category: str | None
    provider_status_code: int | None
    retry_after_ms: float | None
    exception_chain: list[str]


def _configure_process(mode: Literal["current-proof", "candidate"]) -> None:
    os.environ["AI_GENERATION_DIAGNOSTICS"] = "true"
    os.environ["AI_SELF_PRACTICE_MODEL"] = CANDIDATE_MODEL
    os.environ["AI_SELF_PRACTICE_MODEL_ENABLED"] = (
        "true" if mode == "candidate" else "false"
    )
    os.environ["AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT"] = (
        "100" if mode == "candidate" else "0"
    )
    os.environ["AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED"] = "false"
    os.environ["AI_SELF_PRACTICE_PROVIDER_MAX_RETRIES"] = "1"
    os.environ["AI_SELF_PRACTICE_PROVIDER_RETRY_BASE_DELAY_SECONDS"] = "0.25"
    os.environ["AI_SELF_PRACTICE_PROVIDER_RETRY_MAX_DELAY_SECONDS"] = "0.5"
    os.environ["AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS"] = "20"
    os.environ["AI_SELF_PRACTICE_ROLLOUT_SALT"] = "goal17b-local-v1"


def _value(message: str, name: str) -> str | None:
    marker = f"{name}="
    for token in message.split():
        if token.startswith(marker):
            return token[len(marker) :].rstrip(",")
    return None


def _float_value(message: str, name: str) -> float | None:
    value = _value(message, name)
    return float(value) if value is not None else None


def _int_value(message: str, name: str) -> int | None:
    value = _value(message, name)
    return int(value) if value is not None else None


def _float_list(message: str, name: str) -> list[float]:
    value = _value(message, name)
    if value is None or value == "NONE":
        return []
    return [float(item) for item in value.split(",") if item]


def _string_list(message: str, name: str) -> list[str]:
    value = _value(message, name)
    if value is None or value == "NONE":
        return []
    return [item for item in value.split(",") if item]


def _provider_diagnostics(messages: list[str]) -> dict[str, Any]:
    provider_messages = [
        item for item in messages if "event=generation.provider" in item
    ]
    attempt_count = sum(
        _int_value(item, "providerAttemptCount") or 0
        for item in provider_messages
    )
    retry_count = sum(
        _int_value(item, "providerRetryCount") or 0
        for item in provider_messages
    )
    retry_reasons = [
        reason
        for item in provider_messages
        for reason in _string_list(item, "providerRetryReason")
    ]
    terminal = next(
        (
            _value(item, "terminalCategory")
            for item in reversed(provider_messages)
            if _value(item, "terminalCategory") not in {None, "NONE"}
        ),
        None,
    )
    status_code_value = next(
        (
            _value(item, "statusCode")
            for item in reversed(provider_messages)
            if _value(item, "statusCode") not in {None, "NONE"}
        ),
        None,
    )
    retry_after_value = next(
        (
            _value(item, "retryAfterMs")
            for item in reversed(provider_messages)
            if _value(item, "retryAfterMs") not in {None, "NONE"}
        ),
        None,
    )
    model = next(
        (
            _value(item, "model")
            for item in reversed(provider_messages)
            if _value(item, "model")
        ),
        None,
    )
    return {
        "attemptCount": attempt_count,
        "retryCount": retry_count,
        "retryReasons": retry_reasons,
        "retryDelayMs": round(
            sum(
                _float_value(item, "providerRetryDelayMs") or 0
                for item in provider_messages
            ),
            3,
        ),
        "attemptLatenciesMs": [
            latency
            for item in provider_messages
            for latency in _float_list(item, "providerAttemptLatenciesMs")
        ],
        "terminalCategory": terminal,
        "statusCode": (
            int(status_code_value) if status_code_value is not None else None
        ),
        "retryAfterMs": (
            float(retry_after_value) if retry_after_value is not None else None
        ),
        "model": model,
        "rawTransient": bool(retry_reasons)
        or terminal
        in {
            "HTTP_429",
            "HTTP_500",
            "HTTP_502",
            "HTTP_503",
            "HTTP_504",
            "NETWORK_CONNECT",
            "NETWORK_RESET",
            "READ_TIMEOUT",
            "PROVIDER_TIMEOUT",
            "UNKNOWN_TRANSIENT",
        },
    }


def _exception_chain(exc: BaseException) -> list[str]:
    chain: list[str] = []
    current: BaseException | None = exc
    while current is not None and len(chain) < 4:
        chain.append(type(current).__name__)
        current = current.__cause__
    return chain


def _diagnostics(messages: list[str]) -> tuple[str, dict[str, Any]]:
    routing = next(
        (item for item in reversed(messages) if "event=generation.routing" in item),
        "",
    )
    diagnostic = next(
        (
            item
            for item in reversed(messages)
            if "event=generation.diagnostic" in item
        ),
        "",
    )
    repair = next(
        (
            item
            for item in reversed(messages)
            if "event=generation.repair_decision payload=" in item
        ),
        "",
    )
    repair_payload: dict[str, Any] = {}
    if "payload=" in repair:
        repair_payload = json.loads(repair.split("payload=", 1)[1])
    return routing, {
        "diagnostic": diagnostic,
        "repair": repair_payload,
    }


def _quality(response: Any, expected_count: int) -> tuple[bool, bool, bool]:
    source_ids = {item.chunk_id for item in response.sources}
    citation_valid = bool(source_ids) and all(
        question.source_chunk_ids
        and set(question.source_chunk_ids).issubset(source_ids)
        for question in response.questions
    )
    answer_valid = all(
        [option.id for option in question.options] == ["A", "B", "C", "D"]
        and question.correct_option_id in {option.id for option in question.options}
        and bool(question.explanation.strip())
        for question in response.questions
    )
    final_valid = (
        len(response.questions) == expected_count
        and response.metadata.generated_count == expected_count
        and citation_valid
        and answer_valid
    )
    return final_valid, citation_valid, answer_valid


def _run_case(
    *,
    service: Any,
    capture: _GenerationLogCapture,
    settings: Settings,
    case_id: str,
    repetition: int,
    topic_category: str,
    query: str,
    difficulty: Difficulty,
    count: int,
) -> CaseMetric:
    capture.reset()
    request = GenerationRequest(
        query=query,
        difficulty=difficulty,
        count=count,
        top_k=5,
        generation_use_case=GenerationUseCase.SELF_PRACTICE,
        canary_subject="v1.goal17b-bounded-benchmark",
    )
    started = time.perf_counter()
    try:
        response = service.generate(request)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        routing, _ = _diagnostics(capture.messages)
        provider_details = _provider_diagnostics(capture.messages)
        error_category = (
            provider_details["terminalCategory"]
            or getattr(exc, "category", None)
            or (
                "PROVIDER_TIMEOUT"
                if type(exc).__name__ == "OperationDeadlineExceeded"
                else "UNKNOWN_TRANSIENT"
            )
        )
        return CaseMetric(
            case_id=case_id,
            repetition=repetition,
            question_count=count,
            difficulty=difficulty.value,
            topic_category=topic_category,
            selected_pool=_value(routing, "modelClass") or "UNKNOWN",
            selected_model=provider_details["model"] or "UNKNOWN",
            rollout_percent=settings.self_practice_model_rollout_percent,
            retrieval_latency_ms=None,
            provider_latency_ms=None,
            repair_latency_ms=None,
            total_latency_ms=round(elapsed_ms, 3),
            repair_attempts=0,
            provider_attempt_count=provider_details["attemptCount"]
            or getattr(exc, "attempt_count", 0),
            provider_retry_count=provider_details["retryCount"]
            or getattr(exc, "retry_count", 0),
            provider_retry_reasons=list(provider_details["retryReasons"]),
            provider_retry_delay_ms=provider_details["retryDelayMs"],
            provider_attempt_latencies_ms=list(
                provider_details["attemptLatenciesMs"]
            ),
            raw_transient=provider_details["rawTransient"]
            or type(exc).__name__
            in {"GenerationTransientError", "OperationDeadlineExceeded"},
            validation_issue_count=None,
            validation_issue_codes=[],
            final_valid=False,
            citation_contract_valid=False,
            answer_key_contract_valid=False,
            provider_error=type(exc).__name__,
            provider_error_category=error_category,
            provider_status_code=provider_details["statusCode"]
            or getattr(exc, "status_code", None),
            retry_after_ms=provider_details["retryAfterMs"],
            exception_chain=_exception_chain(exc),
        )

    routing, details = _diagnostics(capture.messages)
    diagnostic = str(details["diagnostic"])
    repair_payload = details["repair"]
    provider_details = _provider_diagnostics(capture.messages)
    final_valid, citation_valid, answer_valid = _quality(response, count)
    issue_codes = repair_payload.get("repairTriggerCodes", [])
    return CaseMetric(
        case_id=case_id,
        repetition=repetition,
        question_count=count,
        difficulty=difficulty.value,
        topic_category=topic_category,
        selected_pool=_value(routing, "modelClass") or "UNKNOWN",
        selected_model=response.metadata.generation_model,
        rollout_percent=settings.self_practice_model_rollout_percent,
        retrieval_latency_ms=_float_value(diagnostic, "retrievalMs"),
        provider_latency_ms=_float_value(diagnostic, "providerInitialMs"),
        repair_latency_ms=_float_value(diagnostic, "repairProviderMs"),
        total_latency_ms=response.metadata.latency_ms,
        repair_attempts=response.metadata.repair_attempts,
        provider_attempt_count=provider_details["attemptCount"],
        provider_retry_count=provider_details["retryCount"],
        provider_retry_reasons=list(provider_details["retryReasons"]),
        provider_retry_delay_ms=provider_details["retryDelayMs"],
        provider_attempt_latencies_ms=list(
            provider_details["attemptLatenciesMs"]
        ),
        raw_transient=provider_details["rawTransient"],
        validation_issue_count=_int_value(diagnostic, "validationIssueCount"),
        validation_issue_codes=list(issue_codes),
        final_valid=final_valid,
        citation_contract_valid=citation_valid,
        answer_key_contract_valid=answer_valid,
        provider_error=None,
        provider_error_category=None,
        provider_status_code=None,
        retry_after_ms=provider_details["retryAfterMs"],
        exception_chain=[],
    )


def _percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(quantile * len(ordered)) - 1)]


def _summary(rows: list[CaseMetric]) -> dict[str, Any]:
    successful = [row for row in rows if row.provider_error is None]
    latencies = [row.total_latency_ms for row in successful]
    repairs = sum(row.repair_attempts > 0 for row in rows)
    p95 = _percentile(latencies, 0.95)
    p99 = _percentile(latencies, 0.99)
    raw_transients = sum(row.raw_transient for row in rows)
    retry_requests = sum(row.provider_retry_count > 0 for row in rows)
    retry_successes = sum(
        row.provider_retry_count > 0 and row.provider_error is None
        for row in rows
    )
    return {
        "requests": len(rows),
        "meanMs": round(statistics.fmean(latencies), 3) if latencies else None,
        "medianMs": round(statistics.median(latencies), 3) if latencies else None,
        "p95Ms": round(p95, 3) if p95 is not None else None,
        "p99Ms": round(p99, 3) if p99 is not None else None,
        "minMs": round(min(latencies), 3) if latencies else None,
        "maxMs": round(max(latencies), 3) if latencies else None,
        "repairRate": round(repairs / len(rows), 6) if rows else 0.0,
        "providerAttemptCount": sum(
            row.provider_attempt_count for row in rows
        ),
        "providerRetryCount": sum(row.provider_retry_count for row in rows),
        "rawTransientCount": raw_transients,
        "rawTransientRate": (
            round(raw_transients / len(rows), 6) if rows else 0.0
        ),
        "retryRequestCount": retry_requests,
        "retryRate": (
            round(retry_requests / len(rows), 6) if rows else 0.0
        ),
        "retrySuccessRate": (
            round(retry_successes / retry_requests, 6)
            if retry_requests
            else None
        ),
        "finalValidRate": (
            round(sum(row.final_valid for row in rows) / len(rows), 6)
            if rows
            else 0.0
        ),
        "providerErrorRate": (
            round(sum(row.provider_error is not None for row in rows) / len(rows), 6)
            if rows
            else 0.0
        ),
        "terminalProviderErrorRate": (
            round(
                sum(row.provider_error is not None for row in rows)
                / len(rows),
                6,
            )
            if rows
            else 0.0
        ),
        "citationContractRate": (
            round(sum(row.citation_contract_valid for row in rows) / len(rows), 6)
            if rows
            else 0.0
        ),
        "answerKeyContractRate": (
            round(sum(row.answer_key_contract_valid for row in rows) / len(rows), 6)
            if rows
            else 0.0
        ),
    }


def _promotion_decision(
    rows: list[CaseMetric],
    *,
    public_contract_unchanged: bool,
) -> dict[str, Any]:
    summary = _summary(rows)
    five_question_summary = _summary(
        [row for row in rows if row.question_count == 5]
    )
    checks = {
        "selectedCandidatePool": bool(rows)
        and all(row.selected_pool == "CANDIDATE" for row in rows),
        "selectedCandidateModel": bool(rows)
        and all(row.selected_model == CANDIDATE_MODEL for row in rows),
        "finalValid100Percent": summary["finalValidRate"] == 1.0,
        "providerErrorsZero": summary["providerErrorRate"] == 0.0,
        "publicContractUnchanged": public_contract_unchanged,
        "citationContract100Percent": summary["citationContractRate"] == 1.0,
        "answerKeyContract100Percent": summary["answerKeyContractRate"] == 1.0,
        "fiveQuestionMeanAtMost10Seconds": (
            five_question_summary["requests"] > 0
            and five_question_summary["meanMs"] is not None
            and five_question_summary["meanMs"] <= 10_000
        ),
        "fiveQuestionP95AtMost20Seconds": (
            five_question_summary["requests"] > 0
            and five_question_summary["p95Ms"] is not None
            and five_question_summary["p95Ms"] <= 20_000
        ),
        "overallP95AtMost20Seconds": (
            summary["p95Ms"] is not None and summary["p95Ms"] <= 20_000
        ),
        "repairRateAtMost10Percent": summary["repairRate"] <= 0.1,
        "noCrossModelFallback": all(
            row.selected_pool == "CANDIDATE" for row in rows
        ),
    }
    retry_rate_requires_review = summary["retryRate"] > 0.1
    if all(checks.values()) and not retry_rate_requires_review:
        decision = "CANDIDATE_PROMOTION_ACCEPTED"
    elif all(checks.values()):
        decision = "CANDIDATE_REQUIRES_LARGER_SAMPLE"
    else:
        decision = "CANDIDATE_PROMOTION_REJECTED"
    return {
        "decision": decision,
        "checks": checks,
        "retryRateRequiresReview": retry_rate_requires_review,
    }


def _write_report(
    output_dir: Path,
    mode: str,
    settings: Settings,
    rows: list[CaseMetric],
    counters: Any,
    *,
    public_contract_unchanged: bool,
) -> dict[str, Any]:
    overall_summary = _summary(rows)
    by_count = {
        str(count): _summary([row for row in rows if row.question_count == count])
        for count in _COUNTS
        if any(row.question_count == count for row in rows)
    }
    report = {
        "schemaVersion": "goal17c-self-practice-resilience-v2",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "configuration": {
            "currentModel": settings.gemini_generation_model,
            "candidateModel": settings.self_practice_model,
            "featureEnabled": settings.self_practice_model_enabled,
            "rolloutPercent": settings.self_practice_model_rollout_percent,
            "fallbackEnabled": settings.self_practice_model_fallback_enabled,
            "candidateProviderMaxRetries": (
                settings.self_practice_provider_max_retries
            ),
            "candidateProviderRetryBaseDelaySeconds": (
                settings.self_practice_provider_retry_base_delay_seconds
            ),
            "candidateProviderRetryMaxDelaySeconds": (
                settings.self_practice_provider_retry_max_delay_seconds
            ),
            "candidateProviderTotalBudgetSeconds": (
                settings.self_practice_provider_total_budget_seconds
            ),
        },
        "runtimeCounters": {
            "currentProviderConstructions": counters.current_generation_provider_constructions,
            "candidateProviderConstructions": counters.candidate_generation_provider_constructions,
        },
        "summary": overall_summary,
        "byQuestionCount": by_count,
        "promotion": (
            _promotion_decision(
                rows,
                public_contract_unchanged=public_contract_unchanged,
            )
            if mode == "candidate"
            else None
        ),
        "cases": [asdict(row) for row in rows],
        "limitations": [
            "Bounded local live sample; not a production SLO.",
            "Provider load and network conditions differ from earlier baselines.",
            "No prompt, query, Fact Context, user identity, credential, or raw output is retained.",
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    markdown = (
        "# Goal 17C self-practice resilience benchmark\n\n"
        f"- Mode: `{mode}`\n"
        f"- Requests: `{overall_summary['requests']}`\n"
        f"- Mean: `{overall_summary['meanMs']}` ms\n"
        f"- Median: `{overall_summary['medianMs']}` ms\n"
        f"- P95: `{overall_summary['p95Ms']}` ms\n"
        f"- Raw transient rate: `{overall_summary['rawTransientRate']}`\n"
        f"- Retry rate: `{overall_summary['retryRate']}`\n"
        f"- Repair rate: `{overall_summary['repairRate']}`\n"
        f"- Final-valid rate: `{overall_summary['finalValidRate']}`\n"
        f"- Provider-error rate: `{overall_summary['providerErrorRate']}`\n\n"
        "This bounded local sample is not a production SLO.\n"
    )
    (output_dir / "report.md").write_text(markdown, encoding="utf-8")
    return report


def run(
    mode: Literal["current-proof", "candidate"],
    output_dir: Path,
    *,
    public_contract_unchanged: bool = False,
    repetitions: int = 1,
) -> dict[str, Any]:
    if repetitions not in {1, 2}:
        raise ValueError("repetitions must be 1 or 2")
    if mode == "current-proof" and repetitions != 1:
        raise ValueError("current-proof supports exactly one repetition")
    _configure_process(mode)
    settings = Settings()
    if settings.self_practice_model_fallback_enabled:
        raise RuntimeError("Cross-model fallback must remain disabled")
    if mode == "candidate":
        if not settings.self_practice_model_enabled:
            raise RuntimeError("Candidate feature must be enabled for benchmark")
        if settings.self_practice_model_rollout_percent != 100:
            raise RuntimeError("Candidate benchmark requires rollout 100")
        if settings.self_practice_model != CANDIDATE_MODEL:
            raise RuntimeError("Candidate model configuration mismatch")

    capture = _GenerationLogCapture()
    generation_logger = logging.getLogger("app.generation")
    diagnostics_logger = logging.getLogger("app.generation.diagnostics")
    provider_logger = logging.getLogger("app.generation.provider")
    previous_generation_level = generation_logger.level
    previous_diagnostics_level = diagnostics_logger.level
    previous_provider_level = provider_logger.level
    generation_logger.setLevel(logging.INFO)
    diagnostics_logger.setLevel(logging.INFO)
    provider_logger.setLevel(logging.INFO)
    generation_logger.addHandler(capture)
    resources = AiRuntimeResources(settings)
    rows: list[CaseMetric] = []
    try:
        resources.start()
        if not resources.ready or resources.generation_service is None:
            raise RuntimeError(f"AI runtime not ready: {resources.error_code}")
        if mode == "current-proof":
            rows.append(
                _run_case(
                    service=resources.generation_service,
                    capture=capture,
                    settings=settings,
                    case_id="CURRENT_PROOF",
                    repetition=1,
                    topic_category="TOPIC_A",
                    query=_TOPICS[0][1],
                    difficulty=Difficulty.MEDIUM,
                    count=1,
                )
            )
        else:
            for repetition in range(1, repetitions + 1):
                for count in _COUNTS:
                    for difficulty in _DIFFICULTIES:
                        for topic_category, query in _TOPICS:
                            rows.append(
                                _run_case(
                                    service=resources.generation_service,
                                    capture=capture,
                                    settings=settings,
                                    case_id=(
                                        f"C{count}_{difficulty.value}_"
                                        f"{topic_category}_R{repetition}"
                                    ),
                                    repetition=repetition,
                                    topic_category=topic_category,
                                    query=query,
                                    difficulty=difficulty,
                                    count=count,
                                )
                            )
            expected_requests = BASE_CANDIDATE_REQUESTS * repetitions
            if (
                len(rows) != expected_requests
                or len(rows) > MAX_CANDIDATE_REQUESTS
            ):
                raise RuntimeError("Candidate request budget mismatch")
        return _write_report(
            output_dir,
            mode,
            settings,
            rows,
            resources.counters,
            public_contract_unchanged=public_contract_unchanged,
        )
    finally:
        resources.shutdown()
        generation_logger.removeHandler(capture)
        generation_logger.setLevel(previous_generation_level)
        diagnostics_logger.setLevel(previous_diagnostics_level)
        provider_logger.setLevel(previous_provider_level)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode", choices=("current-proof", "candidate"), required=True
    )
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument(
        "--repetitions",
        type=int,
        choices=(1, 2),
        default=1,
    )
    parser.add_argument(
        "--public-contract-verified",
        action="store_true",
        help=(
            "Declare that the deterministic Spring public-contract regression "
            "gate passed for this source revision."
        ),
    )
    args = parser.parse_args()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output_dir or OUTPUT_ROOT / f"{timestamp}-{args.mode}"
    report = run(
        args.mode,
        output_dir,
        public_contract_unchanged=args.public_contract_verified,
        repetitions=args.repetitions,
    )
    safe = {
        "outputDir": str(output_dir),
        "mode": report["mode"],
        "configuration": report["configuration"],
        "runtimeCounters": report["runtimeCounters"],
        "summary": report["summary"],
        "byQuestionCount": report["byQuestionCount"],
        "promotion": report["promotion"],
    }
    print(json.dumps(safe, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
