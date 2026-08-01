from dataclasses import replace
from typing import cast

import pytest

from app.generation.models import GenerationRequest
from app.retrieval.models import RetrievalResponse
from scripts.benchmark_generation_candidate import (
    BudgetExhausted,
    CandidateNotConfigured,
    PreparedCase,
    ProviderBudget,
    RequestMetrics,
    acceptance_decision,
    candidate_model_from_env,
    crossover_plan,
)


def _case(case_id: str) -> PreparedCase:
    return PreparedCase(
        case_id=case_id,
        group="B",
        request=cast(GenerationRequest, None),
        retrieval=cast(RetrievalResponse, None),
        fact_context_identity="fact",
        style_example_identity="style",
        request_configuration_identity="request",
    )


def _row(case_id: str, variant: str, latency: float = 100.0) -> RequestMetrics:
    return RequestMetrics(
        case_id=case_id,
        group="B",
        variant=variant,
        model=f"{variant}-model",
        execution_order=1,
        request_id=f"{case_id}-{variant}",
        success=True,
        final_valid=True,
        question_count=5,
        total_latency_ms=latency,
        source_contract_valid=True,
        options_contract_valid=True,
        answer_contract_valid=True,
        explanation_contract_valid=True,
        scaffolding_leak_free=True,
        duplicate_free=True,
        pending_review_free=True,
    )


def _accepted_rows() -> list[RequestMetrics]:
    rows: list[RequestMetrics] = []
    for case_id in ("P1", "P2", "P3", "P4"):
        rows.extend((_row(case_id, "current", 100), _row(case_id, "candidate", 70)))
    return rows


def test_missing_candidate_stops_before_provider() -> None:
    with pytest.raises(CandidateNotConfigured, match="MODEL_CANDIDATE_NOT_CONFIGURED"):
        candidate_model_from_env({})


def test_candidate_label_and_crossover_order() -> None:
    assert candidate_model_from_env(
        {"GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE": " candidate-model "}
    ) == "candidate-model"
    plan = crossover_plan([_case(f"P{index}") for index in range(1, 5)])
    assert [(case.case_id, variant) for case, variant in plan] == [
        ("P1", "current"),
        ("P1", "candidate"),
        ("P2", "candidate"),
        ("P2", "current"),
        ("P3", "current"),
        ("P3", "candidate"),
        ("P4", "candidate"),
        ("P4", "current"),
    ]
    assert (
        len(
            {
                (
                    case.case_id,
                    case.fact_context_identity,
                    case.style_example_identity,
                    case.request_configuration_identity,
                )
                for case, _ in plan
            }
        )
        == 4
    )


def test_budget_stops_at_sixteen_calls() -> None:
    budget = ProviderBudget()
    for _ in range(16):
        budget.claim()
    with pytest.raises(BudgetExhausted, match="BUDGET_EXHAUSTED"):
        budget.claim()


def test_acceptance_requires_every_condition() -> None:
    decision = acceptance_decision(_accepted_rows())
    assert decision["decision"] == "CANDIDATE_ACCEPTED_FOR_PRODUCTION_PROPOSAL"
    assert all(decision["checks"].values())


def test_fast_candidate_with_more_repairs_is_rejected() -> None:
    rows = _accepted_rows()
    rows[1] = replace(rows[1], repair_attempted=True, repair_latency_ms=20)
    decision = acceptance_decision(rows)
    assert decision["decision"] == "CANDIDATE_REPAIR_REJECTED"


def test_total_latency_not_initial_latency_drives_decision() -> None:
    rows = _accepted_rows()
    for index, row in enumerate(rows):
        if row.variant == "candidate":
            rows[index] = replace(
                row,
                total_latency_ms=120,
                initial_provider_latency_ms=40,
                repair_attempted=False,
            )
    decision = acceptance_decision(rows)
    assert decision["decision"] == "CANDIDATE_LATENCY_REJECTED"


def test_fast_candidate_with_source_violation_is_rejected() -> None:
    rows = _accepted_rows()
    rows[1] = replace(rows[1], source_contract_valid=False, final_valid=False)
    decision = acceptance_decision(rows)
    assert decision["decision"] == "CANDIDATE_QUALITY_REJECTED"


def test_invalid_candidate_is_not_quality_pass() -> None:
    rows = _accepted_rows()
    rows[1] = replace(rows[1], question_count=4, final_valid=False)
    decision = acceptance_decision(rows)
    assert decision["checks"]["candidateFiveQuestions4Of4"] is False
    assert decision["decision"] == "CANDIDATE_QUALITY_REJECTED"


def test_artifact_shape_contains_no_raw_content() -> None:
    serialized = str(_row("P1", "candidate").__dict__).casefold()
    for forbidden in (
        "question_text",
        "option_text",
        "explanation_text",
        "raw_response",
        "fact_context_text",
        "api_key",
        "internal_token",
    ):
        assert forbidden not in serialized


def test_public_generation_request_has_no_model_selector() -> None:
    assert not {
        "model",
        "candidate_model",
        "use_candidate",
        "profile",
    } & set(GenerationRequest.model_fields)
