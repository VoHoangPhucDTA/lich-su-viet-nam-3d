from __future__ import annotations

import os
from dataclasses import asdict, replace

from scripts.benchmark_self_practice_promotion import (
    CANDIDATE_MODEL,
    CaseMetric,
    _configure_process,
    _promotion_decision,
    _summary,
)


def _row(
    case_id: str,
    *,
    count: int = 5,
    latency_ms: float = 5_000,
) -> CaseMetric:
    return CaseMetric(
        case_id=case_id,
        repetition=1,
        question_count=count,
        difficulty="MEDIUM",
        topic_category="TOPIC_A",
        selected_pool="CANDIDATE",
        selected_model=CANDIDATE_MODEL,
        rollout_percent=100,
        retrieval_latency_ms=500,
        provider_latency_ms=4_000,
        repair_latency_ms=None,
        total_latency_ms=latency_ms,
        repair_attempts=0,
        provider_attempt_count=1,
        provider_retry_count=0,
        provider_retry_reasons=[],
        provider_retry_delay_ms=0,
        provider_attempt_latencies_ms=[latency_ms - 500],
        raw_transient=False,
        validation_issue_count=0,
        validation_issue_codes=[],
        final_valid=True,
        citation_contract_valid=True,
        answer_key_contract_valid=True,
        provider_error=None,
        provider_error_category=None,
        provider_status_code=None,
        retry_after_ms=None,
        exception_chain=[],
    )


def test_candidate_process_configuration_uses_runtime_provider_pool_variables(
    monkeypatch,
) -> None:
    for name in (
        "AI_GENERATION_DIAGNOSTICS",
        "AI_SELF_PRACTICE_MODEL",
        "AI_SELF_PRACTICE_MODEL_ENABLED",
        "AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT",
        "AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED",
        "AI_SELF_PRACTICE_PROVIDER_MAX_RETRIES",
        "AI_SELF_PRACTICE_PROVIDER_RETRY_BASE_DELAY_SECONDS",
        "AI_SELF_PRACTICE_PROVIDER_RETRY_MAX_DELAY_SECONDS",
        "AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS",
        "AI_SELF_PRACTICE_ROLLOUT_SALT",
    ):
        monkeypatch.delenv(name, raising=False)

    _configure_process("candidate")

    assert os.environ["AI_SELF_PRACTICE_MODEL"] == CANDIDATE_MODEL
    assert os.environ["AI_SELF_PRACTICE_MODEL_ENABLED"] == "true"
    assert os.environ["AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT"] == "100"
    assert (
        os.environ["AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED"] == "false"
    )
    assert os.environ["AI_SELF_PRACTICE_PROVIDER_MAX_RETRIES"] == "1"
    assert (
        os.environ["AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS"] == "20"
    )


def test_current_proof_disables_candidate_and_rollout(monkeypatch) -> None:
    _configure_process("current-proof")

    assert os.environ["AI_SELF_PRACTICE_MODEL_ENABLED"] == "false"
    assert os.environ["AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT"] == "0"
    assert (
        os.environ["AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED"] == "false"
    )


def test_summary_uses_successful_latencies_but_all_requests_for_quality_rates() -> None:
    rows = [
        _row("A", latency_ms=4_000),
        _row("B", latency_ms=5_000),
        replace(
            _row("C", latency_ms=6_000),
            selected_pool="UNKNOWN",
            selected_model="UNKNOWN",
            final_valid=False,
            citation_contract_valid=False,
            answer_key_contract_valid=False,
            provider_error="GenerationTransientError",
            provider_error_category="HTTP_503",
            provider_status_code=503,
            raw_transient=True,
        ),
    ]

    summary = _summary(rows)

    assert summary["requests"] == 3
    assert summary["meanMs"] == 4_500
    assert summary["p95Ms"] == 5_000
    assert summary["providerErrorRate"] == 0.333333
    assert summary["finalValidRate"] == 0.666667


def test_promotion_accepts_only_when_every_gate_passes() -> None:
    rows = [
        _row("A", count=1, latency_ms=2_000),
        _row("B", count=3, latency_ms=3_000),
        _row("C", count=5, latency_ms=5_000),
        _row("D", count=10, latency_ms=9_000),
    ]

    decision = _promotion_decision(rows, public_contract_unchanged=True)

    assert decision["decision"] == "CANDIDATE_PROMOTION_ACCEPTED"
    assert all(decision["checks"].values())


def test_provider_error_rejects_candidate_even_when_latency_passes() -> None:
    rows = [_row(f"C5_{index}") for index in range(6)]
    rows[-1] = replace(
        rows[-1],
        selected_pool="UNKNOWN",
        selected_model="UNKNOWN",
        final_valid=False,
        citation_contract_valid=False,
        answer_key_contract_valid=False,
        provider_error="GenerationTransientError",
        provider_error_category="HTTP_503",
        provider_status_code=503,
        raw_transient=True,
    )

    decision = _promotion_decision(rows, public_contract_unchanged=True)

    assert decision["checks"]["fiveQuestionMeanAtMost10Seconds"] is True
    assert decision["checks"]["fiveQuestionP95AtMost20Seconds"] is True
    assert decision["checks"]["providerErrorsZero"] is False
    assert decision["checks"]["finalValid100Percent"] is False
    assert decision["decision"] == "CANDIDATE_PROMOTION_REJECTED"


def test_high_retry_rate_requires_larger_sample() -> None:
    rows = [_row(f"C5_{index}") for index in range(6)]
    rows[0] = replace(
        rows[0],
        provider_attempt_count=2,
        provider_retry_count=1,
        provider_retry_reasons=["HTTP_503"],
        raw_transient=True,
    )

    decision = _promotion_decision(rows, public_contract_unchanged=True)

    assert decision["retryRateRequiresReview"] is True
    assert decision["decision"] == "CANDIDATE_REQUIRES_LARGER_SAMPLE"


def test_public_contract_regression_rejects_candidate() -> None:
    decision = _promotion_decision(
        [_row("C5_MEDIUM_TOPIC_A")],
        public_contract_unchanged=False,
    )

    assert decision["checks"]["publicContractUnchanged"] is False
    assert decision["decision"] == "CANDIDATE_PROMOTION_REJECTED"


def test_case_artifact_shape_excludes_sensitive_content() -> None:
    serialized = str(asdict(_row("C5_MEDIUM_TOPIC_A"))).casefold()

    for forbidden in (
        "query",
        "prompt",
        "fact_context",
        "raw_response",
        "api_key",
        "canary_subject",
        "user_id",
    ):
        assert forbidden not in serialized
