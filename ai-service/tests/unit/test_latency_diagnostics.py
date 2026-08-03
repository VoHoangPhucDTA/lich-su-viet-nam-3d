from __future__ import annotations

from dataclasses import asdict

from scripts.diagnose_generation_latency import (
    MAX_LOGICAL_REQUESTS,
    MAX_PROVIDER_CALLS,
    CaseTrace,
    _load_cases,
    _summary,
)


def test_latency_summary_is_empty_without_measurements() -> None:
    assert _summary([]) == {
        "n": 0,
        "min": None,
        "median": None,
        "max": None,
        "mean": None,
    }


def test_latency_summary_reports_deterministic_small_sample_metrics() -> None:
    assert _summary([30.0, 10.0, 20.0]) == {
        "n": 3,
        "min": 10.0,
        "median": 20.0,
        "max": 30.0,
        "mean": 20.0,
    }


def test_case_plan_is_bounded_and_uses_production_eligible_corpus_metadata() -> None:
    cases = _load_cases()
    assert len(cases) == MAX_LOGICAL_REQUESTS
    assert sum(case.count for case in cases if case.case_id.startswith("A")) == 2
    assert sum(case.count for case in cases if case.case_id.startswith("B")) == 15
    assert cases[-1].case_id == "C1"
    assert all(case.query and case.grade in {10, 11, 12} for case in cases)
    assert MAX_PROVIDER_CALLS == 12


def test_case_trace_serialization_contains_no_content_fields() -> None:
    trace = asdict(CaseTrace(case_id="A1"))
    assert "prompt" not in trace
    assert "fact_context" not in trace
    assert "raw_output" not in trace
    assert "api_key" not in trace
