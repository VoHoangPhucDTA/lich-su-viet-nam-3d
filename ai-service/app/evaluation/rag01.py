"""RAG-01 evaluation contracts and an owner-gated live harness.

This module is evaluation-only. It reuses production adapters supplied by the
script layer, but it is never imported by an API route and never enables a
provider call implicitly.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import os
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

NOT_RUN_REQUIRES_OWNER_AUTH = "NOT_RUN_REQUIRES_OWNER_AUTH"
READY_FOR_OWNER_PROVIDER_RUN = "READY_FOR_OWNER_PROVIDER_RUN"
NO_PROJECT_SOURCE = "NO_PROJECT_SOURCE"
HUMAN_REVIEW_REQUIRED = "HUMAN_REVIEW_REQUIRED"
INSUFFICIENT_CONTEXT_CONTROL = "INSUFFICIENT_CONTEXT_CONTROL"
UNSCORABLE_WITH_CURRENT_RETRIEVER = "UNSCORABLE_WITH_CURRENT_RETRIEVER"
PAIRED_COMPARISON_DESIGN = (
    "paired retrieval-grounded vs Gemini-only parametric-knowledge generation"
)
PAIRED_PROMPT_VERSION = "rag01-paired-evaluation-v3"


class ProviderCallRequired(RuntimeError):
    """Raised instead of contacting a provider when the explicit gate is off."""


class RetrievalAdapter(Protocol):
    def __call__(self, case: dict[str, Any]) -> dict[str, Any]: ...


class GenerationAdapter(Protocol):
    def __call__(self, case: dict[str, Any], retrieval: dict[str, Any] | None) -> dict[str, Any]: ...


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.split())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _fact_records(case: dict[str, Any]) -> list[dict[str, Any]]:
    facts = case.get("criticalFacts") or case.get("goldFacts") or []
    records: list[dict[str, Any]] = []
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        values = fact.get("acceptedValues") or fact.get("requiredTokens") or [fact.get("value")]
        records.append({**fact, "acceptedValues": [str(value) for value in values if value is not None]})
    return records


def _contains_any(text: str, values: Iterable[str]) -> str | None:
    normalized = normalize_text(text)
    return next((value for value in values if normalize_text(value) in normalized), None)


def _year_tokens(text: str) -> set[str]:
    return set(re.findall(r"(?<!\d)(?:\d{3,4})(?!\d)", text))


def _fact_year_tokens(facts: Iterable[dict[str, Any]]) -> set[str]:
    return {
        year
        for fact in facts
        if fact.get("type") in {"year", "date", "year_range"}
        for value in fact.get("acceptedValues", [])
        for year in _year_tokens(str(value))
    }


def _fact_non_year_numeric_tokens(facts: Iterable[dict[str, Any]]) -> set[str]:
    return {
        token
        for fact in facts
        if fact.get("type") not in {"year", "date", "year_range"}
        for value in fact.get("acceptedValues", [])
        for token in _year_tokens(str(value))
    }


def validate_retrieval_dataset(rows: list[dict[str, Any]], corpus_ids: set[str]) -> dict[str, Any]:
    if len(rows) != 60:
        raise ValueError(f"RAG-01 retrieval dataset must contain 60 cases, got {len(rows)}")
    case_ids = [row["caseId"] for row in rows]
    if len(set(case_ids)) != 60:
        raise ValueError("RAG-01 retrieval case IDs must be unique")
    if len({normalize_text(row["query"]) for row in rows}) != 60:
        raise ValueError("RAG-01 retrieval queries must be unique after normalization")
    for grade in (10, 11, 12):
        if sum(row["grade"] == grade for row in rows) != 20:
            raise ValueError(f"RAG-01 retrieval grade {grade} must contain 20 cases")
    for row in rows:
        if row.get("difficulty") not in {"easy", "medium", "hard", "UNCLASSIFIED"}:
            raise ValueError(f"invalid retrieval difficulty: {row['caseId']}")
        expected = row["expectedRelevantChunkIds"]
        if row["isInsufficientControl"]:
            if expected or row.get("controlScoring") != UNSCORABLE_WITH_CURRENT_RETRIEVER:
                raise ValueError(f"invalid insufficient-context control: {row['caseId']}")
        elif not expected or not set(expected) <= corpus_ids:
            raise ValueError(f"retrieval case has missing or empty relevant IDs: {row['caseId']}")
    return {
        "status": "PASS",
        "cases": len(rows),
        "byGrade": dict(Counter(str(row["grade"]) for row in rows)),
        "byDifficulty": dict(Counter(row["difficulty"] for row in rows)),
        "insufficientControls": sum(row["isInsufficientControl"] for row in rows),
        "queryTypes": dict(Counter(row["queryType"] for row in rows)),
    }


def validate_generation_dataset(
    rows: list[dict[str, Any]], corpus: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    if len(rows) != 27:
        raise ValueError(f"RAG-01 generation dataset must contain 27 cases, got {len(rows)}")
    if len({row["caseId"] for row in rows}) != 27:
        raise ValueError("RAG-01 generation case IDs must be unique")
    for grade in (10, 11, 12):
        grade_rows = [row for row in rows if row["grade"] == grade]
        if len(grade_rows) != 9:
            raise ValueError(f"generation grade {grade} must contain 9 cases")
        if {row["difficulty"] for row in grade_rows} != {"EASY", "MEDIUM", "HARD"}:
            raise ValueError(f"generation grade {grade} must cover all difficulties")
        if {row["contentGroup"] for row in grade_rows} != {"facts", "causes", "synthesis"}:
            raise ValueError(f"generation grade {grade} must cover all content groups")
    for row in rows:
        source_ids = row["sourceChunkIds"]
        if not source_ids or not set(source_ids) <= corpus.keys():
            raise ValueError(f"generation case has missing source IDs: {row['caseId']}")
        target = row.get("target")
        if not isinstance(target, dict) or "acceptedAnswers" not in target:
            raise ValueError(f"generation case lacks answer target: {row['caseId']}")
        if not row.get("goldCurated") or row.get("goldSpecVersion") != "rag01-v2-explicit-curated":
            raise ValueError(f"generation case is not explicitly curated: {row['caseId']}")
        target_mode = target.get("targetMode")
        if target_mode not in {"EXACT_SINGLE", "EXACT_SET", "FACT_CONSTRAINED", "HUMAN_REVIEW"}:
            raise ValueError(f"invalid target mode: {row['caseId']}")
        if target_mode == "EXACT_SINGLE" and len(target.get("acceptedAnswers", [])) != 1:
            raise ValueError(f"exact-single target must have one answer: {row['caseId']}")
        if target_mode == "EXACT_SET" and not target.get("acceptedAnswerSets"):
            raise ValueError(f"exact-set target must have answer sets: {row['caseId']}")
        if target_mode in {"FACT_CONSTRAINED", "HUMAN_REVIEW"} and not target.get("humanReviewRequired"):
            raise ValueError(f"semantic target must require human review: {row['caseId']}")
        facts = _fact_records(row)
        if not facts:
            raise ValueError(f"generation case lacks critical facts: {row['caseId']}")
        for fact in facts:
            if fact.get("type") not in {
                "year",
                "date",
                "year_range",
                "count",
                "identifier",
                "measurement",
                "named_entity",
                "text_fact",
            }:
                raise ValueError(f"invalid curated fact type: {row['caseId']}")
            if not fact.get("curated"):
                raise ValueError(f"critical fact is not explicitly curated: {row['caseId']}")
            fact_sources = set(fact.get("sourceChunkIds", []))
            if not fact_sources or not fact_sources <= set(source_ids) or not fact.get("evidence"):
                raise ValueError(f"gold fact provenance is incomplete: {row['caseId']}")
            for evidence in fact["evidence"]:
                chunk_id = evidence.get("chunkId")
                match = str(evidence.get("match", ""))
                snippet = str(evidence.get("snippet", ""))
                if chunk_id not in corpus or chunk_id not in fact_sources or not match or not snippet:
                    raise ValueError(f"gold fact evidence locator is invalid: {row['caseId']}")
                if normalize_text(match) not in normalize_text(str(corpus[chunk_id].get("text", ""))):
                    raise ValueError(f"gold fact evidence is not in source text: {row['caseId']}:{match}")
                if normalize_text(match) not in normalize_text(snippet):
                    raise ValueError(f"gold fact evidence snippet is invalid: {row['caseId']}:{match}")
                expected_hash = evidence.get("sourceTextSha256")
                actual_hash = hashlib.sha256(
                    str(corpus[chunk_id].get("text", "")).encode("utf-8")
                ).hexdigest()
                if expected_hash != actual_hash:
                    raise ValueError(f"gold fact source hash mismatch: {row['caseId']}:{chunk_id}")
    return {
        "status": "PASS",
        "cases": len(rows),
        "byGrade": dict(Counter(str(row["grade"]) for row in rows)),
        "byDifficulty": dict(Counter(row["difficulty"] for row in rows)),
        "byContentGroup": dict(Counter(row["contentGroup"] for row in rows)),
        "autoScorableFacts": sum(
            fact.get("autoScorable", False) for row in rows for fact in _fact_records(row)
        ),
        "humanReviewFacts": sum(
            fact.get("humanReviewRequired", False) for row in rows for fact in _fact_records(row)
        ),
        "targetModes": dict(Counter(row["target"]["targetMode"] for row in rows)),
        "humanReviewCases": sum(
            row["target"]["targetMode"] in {"FACT_CONSTRAINED", "HUMAN_REVIEW"} for row in rows
        ),
    }


def retrieval_metrics(
    ranked_ids: list[str], expected_ids: list[str], ks: tuple[int, ...] = (1, 3, 5)
) -> dict[str, float | None]:
    expected = set(expected_ids)
    result: dict[str, float | None] = {}
    first = next((index for index, chunk_id in enumerate(ranked_ids, start=1) if chunk_id in expected), None)
    for k in ks:
        result[f"hitAt{k}"] = float(bool(first and first <= k)) if expected else 0.0
        result[f"recallAt{k}"] = (
            len(set(ranked_ids[:k]) & expected) / len(expected) if len(expected) > 1 else None
        )
    result["mrr"] = 1.0 / first if first and expected else 0.0
    return result


def aggregate_retrieval_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    scored = [item for item in results if not item.get("isInsufficientControl")]

    def average(metric: str, values: list[dict[str, Any]]) -> float | None:
        measured = [item.get("metrics", {}).get(metric) for item in values]
        measured = [float(value) for value in measured if value is not None]
        return round(sum(measured) / len(measured), 6) if measured else None

    def summary(values: list[dict[str, Any]]) -> dict[str, Any]:
        grouped_multi = [
            item for item in values if len(item.get("expectedRelevantChunkIds", [])) > 1
        ]
        return {
            "scoredCaseCount": len(values),
            "multiRelevantCaseCount": len(grouped_multi),
            "hitAt1": average("hitAt1", values),
            "hitAt3": average("hitAt3", values),
            "hitAt5": average("hitAt5", values),
            "mrr": average("mrr", values),
            "multiRelevantRecallAt1": average("recallAt1", grouped_multi),
            "multiRelevantRecallAt3": average("recallAt3", grouped_multi),
            "multiRelevantRecallAt5": average("recallAt5", grouped_multi),
        }

    def grouped(field: str) -> dict[str, dict[str, Any]]:
        groups: dict[str, list[dict[str, Any]]] = {}
        for item in scored:
            value = item.get(field)
            key = str(value) if value not in {None, ""} else "UNCLASSIFIED"
            groups.setdefault(key, []).append(item)
        return {key: summary(values) for key, values in sorted(groups.items())}

    return {
        **summary(scored),
        "controlScoring": UNSCORABLE_WITH_CURRENT_RETRIEVER,
        "controlCaseCount": len(results) - len(scored),
        "byGrade": grouped("grade"),
        "byQueryType": grouped("queryType"),
        "byDifficulty": grouped("difficulty"),
    }


def factual_claim_check(text: str, case: dict[str, Any]) -> dict[str, Any]:
    facts = _fact_records(case)
    found: list[str] = []
    missing: list[str] = []
    human_review: list[str] = []
    for fact in facts:
        values = fact.get("acceptedValues", [])
        found_value = _contains_any(text, values)
        if found_value:
            found.append(found_value)
        elif fact.get("autoScorable", False):
            missing.extend(values)
        else:
            human_review.extend(values)
    expected_years = _fact_year_tokens(facts)
    non_year_numbers = _fact_non_year_numeric_tokens(facts)
    contradictory_years = (
        sorted(_year_tokens(text) - expected_years - non_year_numbers) if expected_years else []
    )
    forbidden = [
        value
        for value in case.get("forbiddenClaims", [])
        if normalize_text(str(value)) in normalize_text(text)
    ]
    if missing or contradictory_years or forbidden:
        status = "FAIL"
    elif human_review:
        status = HUMAN_REVIEW_REQUIRED
    else:
        status = "PASS"
    return {
        "status": status,
        "found": found,
        "missing": missing,
        "humanReview": human_review,
        "contradictoryYears": contradictory_years,
        "forbiddenFound": forbidden,
    }


def evaluate_generated_question(
    question: dict[str, Any],
    case: dict[str, Any],
    corpus: dict[str, dict[str, Any]],
    *,
    mode: str = "rag",
    actual_retrieved_ids: list[str] | None = None,
    actual_context_text: str | None = None,
) -> dict[str, Any]:
    options = question.get("options") if isinstance(question, dict) else None
    option_ids = [option.get("id") for option in options] if isinstance(options, list) else []
    option_texts = (
        [str(option.get("text", "")).strip() for option in options] if isinstance(options, list) else []
    )
    correct_id = question.get("correctOptionId") if isinstance(question, dict) else None
    correct_index = ["A", "B", "C", "D"].index(correct_id) if correct_id in {"A", "B", "C", "D"} else None
    correct_text = (
        option_texts[correct_index] if correct_index is not None and correct_index < len(option_texts) else ""
    )
    structural = bool(
        isinstance(question, dict)
        and str(question.get("question", "")).strip()
        and str(question.get("explanation", "")).strip()
        and len(options or []) == 4
        and option_ids == ["A", "B", "C", "D"]
    )
    answer_membership = bool(
        structural and correct_id in option_ids and len({text.casefold() for text in option_texts}) == 4
    )
    target = case.get("target", {})
    target_mode = target.get("targetMode") if isinstance(target, dict) else None
    accepted_answers = target.get("acceptedAnswers", []) if isinstance(target, dict) else []
    accepted_answer_sets = target.get("acceptedAnswerSets", []) if isinstance(target, dict) else []
    if target_mode in {"FACT_CONSTRAINED", "HUMAN_REVIEW"} or target.get("humanReviewRequired"):
        answer_correctness = HUMAN_REVIEW_REQUIRED
    elif target_mode == "EXACT_SET":
        answer_correctness = (
            "PASS"
            if any(
                all(_contains_any(correct_text, [value]) for value in answer_set)
                for answer_set in accepted_answer_sets
            )
            else "FAIL"
        )
    elif target_mode == "EXACT_SINGLE" and accepted_answers:
        normalized_correct = normalize_text(correct_text)
        normalized_targets = {normalize_text(value) for value in accepted_answers}
        answer_correctness = "PASS" if normalized_correct in normalized_targets else "FAIL"
    else:
        answer_correctness = HUMAN_REVIEW_REQUIRED
    asserted_text = " ".join(
        [str(question.get("question", "")), correct_text, str(question.get("explanation", ""))]
    )
    factual = factual_claim_check(asserted_text, case)
    explanation = str(question.get("explanation", ""))
    explanation_facts = factual_claim_check(explanation, case)
    if explanation_facts["status"] == "FAIL":
        answer_explanation = "FAIL"
    elif any(
        fact.get("autoScorable") and not _contains_any(explanation, fact.get("acceptedValues", []))
        for fact in _fact_records(case)
    ):
        answer_explanation = HUMAN_REVIEW_REQUIRED
    else:
        answer_explanation = "PASS"

    cited_ids = question.get("sourceChunkIds", []) if isinstance(question, dict) else []
    actual_ids = actual_retrieved_ids or []
    expected_ids = set(case.get("sourceChunkIds", []))
    if mode == "gemini-only":
        source_traceability = "N/A"
        groundedness = "N/A"
        actual_relevant_ids: list[str] = []
    else:
        source_traceability = "PASS" if bool(cited_ids) and set(cited_ids) <= set(actual_ids) else "FAIL"
        actual_relevant_ids = sorted(set(actual_ids) & expected_ids)
        context = actual_context_text or " ".join(
            str(corpus[chunk_id].get("text", "")) for chunk_id in actual_ids if chunk_id in corpus
        )
        context_normalized = normalize_text(context)
        unsupported_years = sorted(_year_tokens(asserted_text) - _year_tokens(context))
        missing_context_facts = [
            value
            for fact in _fact_records(case)
            if fact.get("autoScorable")
            for value in fact.get("acceptedValues", [])
            if normalize_text(value) not in context_normalized
        ]
        if missing_context_facts or unsupported_years:
            groundedness = "FAIL"
        elif any(fact.get("humanReviewRequired") for fact in _fact_records(case)):
            groundedness = HUMAN_REVIEW_REQUIRED
        else:
            groundedness = "PASS"

    distractors = [text for index, text in enumerate(option_texts) if index != correct_index]
    distractors_pass = bool(
        len(distractors) == 3
        and len({text.casefold() for text in distractors}) == 3
        and correct_text
        and all(text.casefold() != correct_text.casefold() for text in distractors)
    )
    human_required = any(
        value == HUMAN_REVIEW_REQUIRED
        for value in (answer_correctness, factual["status"], answer_explanation, groundedness)
    )
    dimensions = {
        "structural": "PASS" if structural else "FAIL",
        "answerMembership": "PASS" if answer_membership else "FAIL",
        "answerValidity": "PASS" if answer_membership else "FAIL",
        "answerCorrectness": answer_correctness,
        "targetMode": target_mode or HUMAN_REVIEW_REQUIRED,
        "criticalFactCorrectness": factual["status"],
        "factualCorrectness": factual["status"],
        "answerExplanationConsistency": answer_explanation,
        "projectContextGroundedness": groundedness,
        "groundednessSourceSupport": groundedness,
        "sourceTraceability": source_traceability,
        "distractorBoundedChecks": "PASS" if distractors_pass else "FAIL",
        "humanReviewRequired": "HUMAN_REVIEW_REQUIRED" if human_required else "PASS",
    }
    applicable = [
        value for key, value in dimensions.items() if key not in {"humanReviewRequired", "targetMode"}
    ]
    passed = all(value in {"PASS", "N/A"} for value in applicable) and not human_required
    return {
        "dimensions": dimensions,
        "factual": factual,
        "source": {
            "actualRetrievedIds": actual_ids,
            "citedOutputIds": cited_ids,
            "actualRelevantIds": actual_relevant_ids,
            "citedSubsetOfActual": source_traceability in {"PASS", "N/A"},
        },
        "pass": passed,
        "humanReviewRequired": human_required,
    }


def _automatic_outcome(result: dict[str, Any]) -> str:
    values = list(result.get("dimensions", {}).values())
    if not values:
        return "N/A"
    if any(value == HUMAN_REVIEW_REQUIRED for value in values) or result.get("humanReviewRequired"):
        return HUMAN_REVIEW_REQUIRED
    if any(value == "FAIL" for value in values):
        return "AUTO_FAIL"
    if values and all(value == "N/A" for value in values):
        return "N/A"
    return "AUTO_PASS"


def aggregate_generation_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    names = (
        "structural",
        "answerMembership",
        "answerCorrectness",
        "criticalFactCorrectness",
        "answerExplanationConsistency",
        "projectContextGroundedness",
        "sourceTraceability",
        "distractorBoundedChecks",
    )

    def dimension_summary(name: str) -> dict[str, Any]:
        values = [result.get("dimensions", {}).get(name) for result in results]
        auto_pass = sum(value == "PASS" for value in values)
        auto_fail = sum(value == "FAIL" for value in values)
        human = sum(value == HUMAN_REVIEW_REQUIRED for value in values)
        na = sum(value == "N/A" for value in values)
        auto_count = auto_pass + auto_fail
        return {
            "autoScoredCount": auto_count,
            "autoPassCount": auto_pass,
            "autoFailCount": auto_fail,
            "autoPassRate": round(auto_pass / auto_count, 6) if auto_count else None,
            "humanReviewCount": human,
            "naCount": na,
        }

    dimensions = {name: dimension_summary(name) for name in names}
    categories = Counter(result.get("automaticOutcome", _automatic_outcome(result)) for result in results)
    return {
        "cases": len(results),
        "passedCases": categories["AUTO_PASS"],
        "failedCases": categories["AUTO_FAIL"],
        "autoPassCases": categories["AUTO_PASS"],
        "autoFailCases": categories["AUTO_FAIL"],
        "humanReviewCases": categories[HUMAN_REVIEW_REQUIRED],
        "outcomeCategories": {
            "AUTO_PASS": categories["AUTO_PASS"],
            "AUTO_FAIL": categories["AUTO_FAIL"],
            HUMAN_REVIEW_REQUIRED: categories[HUMAN_REVIEW_REQUIRED],
            "N/A": categories["N/A"],
        },
        "dimensionResults": dimensions,
    }


def _paired_outcome(result: dict[str, Any]) -> str:
    outcome = result.get("automaticOutcome")
    if outcome in {"AUTO_PASS", "AUTO_FAIL", HUMAN_REVIEW_REQUIRED, "N/A"}:
        return outcome
    return _automatic_outcome(result)


def paired_case_deltas(rag: list[dict[str, Any]], gemini_only: list[dict[str, Any]]) -> list[dict[str, Any]]:
    baseline = {result["caseId"]: result for result in gemini_only}
    if {result["caseId"] for result in rag} != set(baseline):
        raise ValueError("paired baseline requires complete matching case IDs")
    deltas: list[dict[str, Any]] = []
    for result in rag:
        counterpart = baseline[result["caseId"]]
        rag_outcome = _paired_outcome(result)
        gemini_outcome = _paired_outcome(counterpart)
        auto_comparable = rag_outcome in {"AUTO_PASS", "AUTO_FAIL"} and gemini_outcome in {
            "AUTO_PASS",
            "AUTO_FAIL",
        }
        auto_delta = (
            int(rag_outcome == "AUTO_PASS") - int(gemini_outcome == "AUTO_PASS")
            if auto_comparable
            else None
        )
        pending = HUMAN_REVIEW_REQUIRED in {rag_outcome, gemini_outcome}
        deltas.append(
            {
                "caseId": result["caseId"],
                "ragOutcome": rag_outcome,
                "geminiOnlyOutcome": gemini_outcome,
                "ragAnswerCorrectness": result.get("dimensions", {}).get("answerCorrectness"),
                "geminiOnlyAnswerCorrectness": counterpart.get("dimensions", {}).get("answerCorrectness"),
                "autoPassDelta": auto_delta,
                "delta": auto_delta,
                "pairedAutoComparisonStatus": (
                    "AUTO_COMPARABLE"
                    if auto_comparable
                    else "HUMAN_REVIEW_PENDING"
                    if pending
                    else "NOT_AUTO_COMPARABLE"
                ),
                "latencyDeltaMs": result.get("latencyMs", 0) - counterpart.get("latencyMs", 0),
                "retryDelta": result.get("retryCount", 0) - counterpart.get("retryCount", 0),
            }
        )
    return deltas


def aggregate_paired_results(rag: list[dict[str, Any]], gemini_only: list[dict[str, Any]]) -> dict[str, Any]:
    deltas = paired_case_deltas(rag, gemini_only)
    auto_comparable = [item for item in deltas if item["pairedAutoComparisonStatus"] == "AUTO_COMPARABLE"]
    pending = [item for item in deltas if item["pairedAutoComparisonStatus"] == "HUMAN_REVIEW_PENDING"]
    return {
        "status": "COMPLETED",
        "caseCount": len(deltas),
        "autoComparableCaseCount": len(auto_comparable),
        "humanReviewPendingPairCount": len(pending),
        "ragAutoPassCount": sum(item["ragOutcome"] == "AUTO_PASS" for item in deltas),
        "geminiAutoPassCount": sum(item["geminiOnlyOutcome"] == "AUTO_PASS" for item in deltas),
        "comparisonDesign": PAIRED_COMPARISON_DESIGN,
        "sameTask": True,
        "sameModel": True,
        "sameGenerationParameters": True,
        "sameStructuralContract": True,
        "differentKnowledgeSourcePolicy": True,
        "rag": aggregate_generation_results(rag),
        "geminiOnly": aggregate_generation_results(gemini_only),
        "deltas": deltas,
        "projectGroundingComparison": "RAG_GROUNDED_GEMINI_ONLY_PARAMETRIC_KNOWLEDGE",
    }


class Rag01Cache:
    def __init__(self, root: Path) -> None:
        self.root = root

    @staticmethod
    def identity(
        case_id: str,
        mode: str,
        model_config: dict[str, Any],
        prompt_version: str,
        schema_version: str,
        case_payload: dict[str, Any],
        *,
        corpus_hash: str = "",
        retrieval_config_fingerprint: str = "",
        retry_policy: dict[str, Any] | None = None,
    ) -> str:
        payload = {
            "cacheIdentityVersion": "rag01-live-cache-v2",
            "caseId": case_id,
            "mode": mode,
            "modelConfig": model_config,
            "promptVersion": prompt_version,
            "schemaVersion": schema_version,
            "retryPolicy": retry_policy or {},
            "corpusHash": corpus_hash,
            "retrievalConfigFingerprint": retrieval_config_fingerprint,
            "caseHash": hashlib.sha256(
                json.dumps(case_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest(),
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    def get(self, cache_key: str) -> dict[str, Any] | None:
        path = self.root / f"{cache_key}.json"
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            return value if value.get("cacheKey") == cache_key else None
        except (OSError, ValueError, TypeError, AttributeError, json.JSONDecodeError):
            return None

    def set(self, cache_key: str, value: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{cache_key}.json"
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump({"cacheKey": cache_key, **value}, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)


def require_provider_call(allow_provider_call: bool) -> None:
    if not allow_provider_call:
        raise ProviderCallRequired(
            "provider call blocked: pass --allow-provider-call after owner authorization"
        )


class ProviderBudgetExceeded(RuntimeError):
    """Raised before an adapter invocation would exceed the owner budget."""


PARTIAL_OBSERVABILITY = "PARTIAL_OBSERVABILITY"


def paired_comparison_metadata() -> dict[str, Any]:
    """Metadata for the deliberately different knowledge-source policies."""

    return {
        "comparisonDesign": PAIRED_COMPARISON_DESIGN,
        "sameTask": True,
        "sameModel": True,
        "sameGenerationParameters": True,
        "sameStructuralContract": True,
        "differentKnowledgeSourcePolicy": True,
    }


def _paired_source_marked_context(context: Any | None) -> str:
    if context is None:
        return "(NO PROJECT RETRIEVAL CONTEXT)"
    text = context.text
    for index, chunk_id in enumerate(context.source_chunk_ids, start=1):
        text = text.replace(f"[SOURCE {index}]", f"[SOURCE chunkId={chunk_id}]", 1)
    return text or "(PROJECT RETRIEVAL RETURNED NO TEXT)"


def build_paired_generation_prompt(
    request: Any,
    context: Any | None,
    *,
    count: int,
    mode: str,
) -> str:
    """Build the evaluation-only prompt shared by both paired benchmark arms."""

    if mode not in {"rag", "gemini-only"}:
        raise ValueError(f"unsupported paired prompt mode: {mode}")
    styles = [item.model_dump(by_alias=True) for item in request.style_examples]
    style_text = (
        json.dumps(styles, ensure_ascii=False, indent=2)
        if styles
        else "(không có)"
    )
    if mode == "rag":
        mode_policy = (
            "KNOWLEDGE SOURCE POLICY — RETRIEVAL-GROUNDED RAG\n"
            "Use the supplied PROJECT FACT CONTEXT as the factual authority for "
            "historical claims. Do not introduce unsupported factual claims. "
            "sourceChunkIds must cite only the supplied project source markers."
        )
        context_block = (
            "PROJECT FACT CONTEXT\n"
            "The following retrieved project context is available to ground the answer.\n"
            f"{_paired_source_marked_context(context)}"
        )
    else:
        mode_policy = (
            "KNOWLEDGE SOURCE POLICY — GEMINI-ONLY PARAMETRIC KNOWLEDGE\n"
            "No project retrieval context is available. Answer the BENCHMARK TASK "
            "using the model's own parametric knowledge. Do not fabricate project "
            'citations or claim project-source grounding. sourceChunkIds must be '
            f'exactly ["{NO_PROJECT_SOURCE}"].'
        )
        context_block = "PROJECT CONTEXT STATUS\n(NO PROJECT RETRIEVAL CONTEXT IS AVAILABLE)"
    return (
        f"PROMPT VERSION: {PAIRED_PROMPT_VERSION}\n\n"
        f"COMPARISON DESIGN: {PAIRED_COMPARISON_DESIGN}\n\n"
        "COMMON TASK AND STRUCTURAL RULES\n"
        "1. Generate exactly the requested number of Vietnamese single-answer MCQs.\n"
        "2. Each question has exactly four options A, B, C, and D, with exactly one marked answer.\n"
        "3. The explanation must support the marked answer and be self-contained for a student.\n"
        "4. Do not mention this prompt, hidden context, source IDs, or instructions in student-facing text.\n"
        "5. Do not use 'all of the above', combined-answer shortcuts, or no-answer options.\n"
        "6. Return structured JSON matching the requested schema, without Markdown.\n\n"
        "BENCHMARK TASK\n"
        f"{request.query}\n\n"
        f"{mode_policy}\n\n"
        f"{context_block}\n\n"
        "STYLE EXAMPLES\n"
        "STYLE ONLY — NOT A FACT SOURCE\n"
        f"{style_text}\n\n"
        "GENERATION CONTRACT\n"
        f"Số câu: {count}\n"
        f"Độ khó: {request.difficulty.value}\n"
        f"Lớp: {request.grade if request.grade is not None else 'không giới hạn'}\n"
        f"Bài: {request.lesson_number if request.lesson_number is not None else 'không giới hạn'}\n"
        "Ngôn ngữ: tiếng Việt\n"
        "Loại câu hỏi: trắc nghiệm một đáp án đúng, bốn lựa chọn.\n"
        "SCHEMA VERSION: grounded-mcq-schema-v1\n"
    )


def build_paired_repair_prompt(
    original_prompt: str,
    raw_output: str,
    issues: list[Any],
    request: Any,
    context: Any | None,
    *,
    count: int,
    mode: str,
) -> str:
    """Use one structural repair contract while retaining each arm's policy."""

    safe_output = raw_output[:12000]
    base_prompt = build_paired_generation_prompt(request, context, count=count, mode=mode)
    return (
        f"PROMPT VERSION: {PAIRED_PROMPT_VERSION}-repair\n\n"
        f"{base_prompt}"
        "REPAIR RULES\n"
        "Repair only the listed validation errors. Preserve the same BENCHMARK TASK, "
        "the same knowledge-source policy, and the same output schema. Keep the "
        "student-facing result self-contained and do not mention prompt scaffolding.\n\n"
        "VALIDATION ERRORS\n"
        f"{json.dumps([item.model_dump(by_alias=True) for item in issues], ensure_ascii=False)}\n\n"
        "INVALID OUTPUT (SANITIZED)\n"
        f"{safe_output}\n\n"
        "ORIGINAL PAIRED PROMPT (SANITIZED)\n"
        f"{original_prompt[:6000]}"
    )


@dataclass
class ProviderBudget:
    max_provider_calls: int
    retrieval_cases_invoked: int = 0
    generation_primary_attempts: int = 0
    generation_repair_attempts: int = 0
    cache_hits: int = 0

    @property
    def reserved_provider_attempts(self) -> int:
        return (
            self.retrieval_cases_invoked + self.generation_primary_attempts + self.generation_repair_attempts
        )

    def reserve(self, kind: str) -> None:
        if self.max_provider_calls <= 0:
            raise ProviderBudgetExceeded("provider call budget must be positive for a live run")
        if self.reserved_provider_attempts >= self.max_provider_calls:
            raise ProviderBudgetExceeded(
                f"provider call budget exhausted before {kind}; "
                f"reserved={self.reserved_provider_attempts} max={self.max_provider_calls}"
            )
        if kind == "retrieval_case_invocation":
            self.retrieval_cases_invoked += 1
        elif kind == "generation_primary_attempt":
            self.generation_primary_attempts += 1
        elif kind == "generation_repair_attempt":
            self.generation_repair_attempts += 1
        else:
            raise ValueError(f"unknown provider budget kind: {kind}")

    def record_cache_hit(self) -> None:
        self.cache_hits += 1

    def snapshot(self) -> dict[str, Any]:
        return {
            "maxProviderCalls": self.max_provider_calls,
            "retrievalCasesInvoked": self.retrieval_cases_invoked,
            "generationPrimaryAttempts": self.generation_primary_attempts,
            "generationRepairAttempts": self.generation_repair_attempts,
            "cacheHits": self.cache_hits,
            "providerAttemptReservations": self.reserved_provider_attempts,
            "providerAttemptCountKnown": PARTIAL_OBSERVABILITY,
        }


@dataclass(frozen=True)
class EvaluationGenerationPolicy:
    """The same provider/schema/validation/repair policy for both arms."""

    model: str
    temperature: float
    max_output_tokens: int
    schema_version: str
    max_retries: int
    repair_attempts: int

    def snapshot(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "temperature": self.temperature,
            "maxOutputTokens": self.max_output_tokens,
            "schemaVersion": self.schema_version,
            "maxRetries": self.max_retries,
            "repairAttempts": self.repair_attempts,
            "structuralValidation": "app.generation.validators.validate_questions",
            "repairPolicy": "evaluation-only paired repair builder with same bounded loop",
            **paired_comparison_metadata(),
        }


class SharedEvaluationGenerationRunner:
    """Evaluation-only shared provider/schema/validation/repair runner."""

    def __init__(
        self,
        provider: Any,
        settings: Any,
        policy: EvaluationGenerationPolicy,
        budget: ProviderBudget | None = None,
    ) -> None:
        self.provider = provider
        self.settings = settings
        self.policy = policy
        self.budget = budget

    @staticmethod
    def _gemini_only_source(request: Any) -> list[Any]:
        from app.retrieval.models import RetrievalResult

        return [
            RetrievalResult(
                rank=1,
                chunk_id=NO_PROJECT_SOURCE,
                document_id=NO_PROJECT_SOURCE,
                grade=request.grade or 10,
                lesson_number=request.lesson_number or 1,
                lesson_title="",
                section_title="",
                section_path="",
                content_types="",
                text="",
                distance=0.0,
                chunk_hash="NO_PROJECT_SOURCE",
            )
        ]

    def _provider_call(self, prompt: str) -> Any:
        from app.generation.schemas import GeneratedQuestionBatch

        method = self.provider.generate_structured
        kwargs: dict[str, Any] = {}
        parameters = inspect.signature(method).parameters
        if "stage" in parameters:
            kwargs["stage"] = "generation"
        if "minimum_timeout_seconds" in parameters:
            kwargs["minimum_timeout_seconds"] = self.settings.ai_min_provider_timeout_seconds
        batch = method(prompt, **kwargs)
        return GeneratedQuestionBatch.model_validate(
            batch.model_dump(by_alias=True) if hasattr(batch, "model_dump") else batch
        )

    def generate(self, request: Any, *, retrieval_response: Any | None, mode: str) -> dict[str, Any]:
        from app.generation.models import GenerationOutputError
        from app.generation.validators import validate_questions

        if mode not in {"rag", "gemini-only"}:
            raise ValueError(f"unsupported generation mode: {mode}")
        context = retrieval_response.fact_context if retrieval_response is not None else None
        sources = (
            retrieval_response.results
            if retrieval_response is not None
            else self._gemini_only_source(request)
        )
        count = request.count or 1
        prompt = build_paired_generation_prompt(request, context, count=count, mode=mode)
        current_prompt = prompt
        valid: list[Any] = []
        repair_count = 0
        last_issues: list[Any] = []
        for attempt in range(self.policy.repair_attempts + 1):
            if attempt > 0:
                repair_count += 1
                if self.budget is not None:
                    self.budget.reserve("generation_repair_attempt")
            batch = self._provider_call(current_prompt)
            valid, summary = validate_questions(batch.questions, request, sources, self.settings)
            last_issues = summary.issues
            if len(valid) >= count and not any(issue.severity == "ERROR" for issue in summary.issues):
                return {
                    "questions": [item.model_dump(by_alias=True) for item in valid[:count]],
                    "retryCount": repair_count,
                    "generationPrimaryAttempts": 1,
                    "generationRepairAttempts": repair_count,
                    "providerAttemptCountKnown": PARTIAL_OBSERVABILITY,
                }
            if attempt < self.policy.repair_attempts:
                current_prompt = build_paired_repair_prompt(
                    prompt,
                    batch.model_dump_json(by_alias=True),
                    [issue for issue in summary.issues if issue.severity == "ERROR"] or last_issues,
                    request,
                    context,
                    count=count,
                    mode=mode,
                )
        raise GenerationOutputError("NO_VALID_QUESTIONS_AFTER_EVALUATION_REPAIR")


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sanitize_retrieval_result(result: dict[str, Any], corpus: dict[str, dict[str, Any]]) -> dict[str, Any]:
    context = str(result.get("actualContextText", ""))
    return {
        key: value
        for key, value in {
            **result,
            "actualContextText": None,
            "actualContextSha256": _sha256_text(context),
            "retrievedSourceRefs": [
                {"chunkId": chunk_id, "sourceTextSha256": _sha256_text(str(corpus[chunk_id].get("text", "")))}
                for chunk_id in result.get("actualRetrievedIds", [])
                if chunk_id in corpus
            ],
        }.items()
        if key not in {"response", "actualContextText"}
    }


def sanitize_generation_result(result: dict[str, Any], corpus: dict[str, dict[str, Any]]) -> dict[str, Any]:
    context = str(result.get("actualContextText", ""))
    return {
        key: value
        for key, value in {
            **result,
            "actualContextText": None,
            "actualContextSha256": _sha256_text(context),
            "retrievedSourceRefs": [
                {"chunkId": chunk_id, "sourceTextSha256": _sha256_text(str(corpus[chunk_id].get("text", "")))}
                for chunk_id in result.get("actualRetrievedIds", [])
                if chunk_id in corpus
            ],
        }.items()
        if key not in {"response", "actualContextText", "retrievalTrace", "generationTrace"}
    }


def build_human_review_queue(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for result in results:
        if result.get("automaticOutcome") != HUMAN_REVIEW_REQUIRED:
            continue
        for question in result.get("questions", []):
            queue.append(
                {
                    "caseId": result["caseId"],
                    "mode": result.get("mode", "rag"),
                    "question": question.get("question", ""),
                    "options": question.get("options", []),
                    "correctOptionId": question.get("correctOptionId"),
                    "explanation": question.get("explanation", ""),
                    "sourceEvidenceRefs": {
                        "actualRetrievedIds": result.get("actualRetrievedIds", []),
                        "citedOutputIds": question.get("sourceChunkIds", []),
                        "actualContextSha256": _sha256_text(str(result.get("actualContextText", ""))),
                    },
                    "rubric": result.get("humanReviewRubric", []),
                }
            )
    return queue


def render_human_review_queue_markdown(items: list[dict[str, Any]]) -> str:
    lines = ["# RAG-01 human review queue", "", f"Items: {len(items)}", ""]
    if not items:
        lines.append("No live provider result was available; queue is empty.")
        return "\n".join(lines) + "\n"
    for item in items:
        lines.extend(
            [
                f"## {item['caseId']} / {item['mode']}",
                f"Question: {item['question']}",
                f"Marked answer: {item['correctOptionId']}",
                f"Explanation: {item['explanation']}",
                f"Source refs: {json.dumps(item['sourceEvidenceRefs'], ensure_ascii=False)}",
                "Rubric:",
                *[f"- {entry}" for entry in item.get("rubric", [])],
                "",
            ]
        )
    return "\n".join(lines)


def _human_review_key(item: dict[str, Any]) -> tuple[str, str]:
    case_id = str(item.get("caseId", "")).strip()
    mode = str(item.get("mode", "")).strip()
    if not case_id or mode not in {"rag", "gemini-only"}:
        raise ValueError(f"invalid human review key: ({case_id!r}, {mode!r})")
    return case_id, mode


def _human_review_passes(review: dict[str, Any]) -> bool:
    return bool(
        review["semanticAnswerCorrect"]
        and review["factualCorrect"]
        and review["distractorPlausibility"] == "PASS"
        and review["pedagogicalQuality"] == "PASS"
    )


def _human_review_by_mode(reviews: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_mode: dict[str, dict[str, Any]] = {}
    for mode in ("rag", "gemini-only"):
        mode_reviews = [review for review in reviews if review["mode"] == mode]
        passed = sum(_human_review_passes(review) for review in mode_reviews)
        by_mode[mode] = {
            "reviewed": len(mode_reviews),
            "pass": passed,
            "fail": len(mode_reviews) - passed,
            "passRate": round(passed / len(mode_reviews), 6) if mode_reviews else None,
        }
    return by_mode


def aggregate_human_reviews(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    required = {
        "caseId",
        "mode",
        "semanticAnswerCorrect",
        "factualCorrect",
        "distractorPlausibility",
        "pedagogicalQuality",
        "notes",
    }
    seen_keys: set[tuple[str, str]] = set()
    for review in reviews:
        if not required <= set(review):
            raise ValueError(f"human review is missing fields for {review.get('caseId', '<unknown>')}")
        if review["mode"] not in {"rag", "gemini-only"}:
            raise ValueError(f"invalid human review mode: {review['mode']}")
        key = _human_review_key(review)
        if key in seen_keys:
            raise ValueError(f"duplicate human review key: {key}")
        seen_keys.add(key)
    adjudicated_pass = sum(_human_review_passes(item) for item in reviews)
    return {
        "status": "COMPLETED_WITH_REVIEWS" if reviews else "NO_REVIEWS_IMPORTED",
        "reviewCount": len(reviews),
        "adjudicatedPassCount": adjudicated_pass,
        "adjudicatedFailCount": len(reviews) - adjudicated_pass,
        "byMode": _human_review_by_mode(reviews),
        "reviews": reviews,
        "providerCalls": 0,
    }


def validate_human_review_import(
    queue_items: list[dict[str, Any]], reviews: list[dict[str, Any]]
) -> dict[str, Any]:
    """Validate a completed review file against the actual pair-aware queue."""

    queue_keys = [_human_review_key(item) for item in queue_items]
    if len(queue_keys) != len(set(queue_keys)):
        raise ValueError("duplicate queue review key")
    aggregate = aggregate_human_reviews(reviews)
    review_keys = [_human_review_key(review) for review in reviews]
    queue_key_set = set(queue_keys)
    review_key_set = set(review_keys)
    unknown = sorted(review_key_set - queue_key_set)
    if unknown:
        raise ValueError(f"unknown human review key: {unknown[0]}")
    missing = sorted(queue_key_set - review_key_set)
    aggregate.update(
        {
            "expectedQueueCount": len(queue_keys),
            "reviewedCount": len(review_keys),
            "missingReviewCount": len(missing),
            "missingReviewKeys": [list(key) for key in missing],
            "complete": not missing,
            "queueReviewKeys": [list(key) for key in queue_keys],
        }
    )
    if missing:
        aggregate["status"] = "INCOMPLETE_REVIEWS"
    return aggregate


@dataclass
class Rag01LiveHarness:
    """Generic cache-wired runner; production adapters are injected by the script."""

    cache: Rag01Cache
    model_config: dict[str, Any]
    prompt_version: str
    schema_version: str
    corpus_hash: str
    retrieval_config_fingerprint: str
    retry_policy: dict[str, Any]
    corpus: dict[str, dict[str, Any]]
    retrieval_adapter: RetrievalAdapter
    rag_generation_adapter: GenerationAdapter
    gemini_only_generation_adapter: GenerationAdapter
    provider_budget: ProviderBudget | None = None

    def _key(self, case: dict[str, Any], mode: str, extra: dict[str, Any] | None = None) -> str:
        return self.cache.identity(
            case["caseId"],
            mode,
            self.model_config,
            self.prompt_version,
            self.schema_version,
            {**case, "extra": extra or {}},
            corpus_hash=self.corpus_hash,
            retrieval_config_fingerprint=self.retrieval_config_fingerprint,
            retry_policy=self.retry_policy,
        )

    def run_retrieval(
        self, cases: list[dict[str, Any]], *, allow_provider_call: bool
    ) -> list[dict[str, Any]]:
        require_provider_call(allow_provider_call)
        results: list[dict[str, Any]] = []
        for case in cases:
            has_retrieval_gold = "expectedRelevantChunkIds" in case
            expected_ids = list(case.get("expectedRelevantChunkIds", []))
            key = self._key(case, "retrieval")
            cached = self.cache.get(key)
            if cached is not None:
                if self.provider_budget is not None:
                    self.provider_budget.record_cache_hit()
                item = {**cached, "cacheHit": True, "providerCallPerformed": False}
            else:
                if self.provider_budget is not None:
                    self.provider_budget.reserve("retrieval_case_invocation")
                item = {
                    **self.retrieval_adapter(case),
                    "cacheHit": False,
                    "providerCallPerformed": True,
                }
            item["caseId"] = case["caseId"]
            item.update(
                {
                    "expectedRelevantChunkIds": expected_ids,
                    "grade": case.get("grade"),
                    "difficulty": case.get("difficulty") or "UNCLASSIFIED",
                    "queryType": case.get("queryType") or "UNCLASSIFIED",
                }
            )
            if case.get("isInsufficientControl"):
                item.update(
                    {
                        "isInsufficientControl": True,
                        "controlScoring": UNSCORABLE_WITH_CURRENT_RETRIEVER,
                        "metrics": None,
                        "retrievalEvaluationRole": "INSUFFICIENT_CONTEXT_CONTROL",
                    }
                )
            elif has_retrieval_gold:
                item.update(
                    {
                        "isInsufficientControl": False,
                        "metrics": retrieval_metrics(
                            item.get("actualRetrievedIds", []), expected_ids
                        ),
                        "retrievalEvaluationRole": "RETRIEVAL_BENCHMARK",
                    }
                )
            else:
                item.update(
                    {
                        "isInsufficientControl": False,
                        "metrics": None,
                        "retrievalEvaluationRole": "GENERATION_CONTEXT",
                    }
                )
            if cached is None:
                self.cache.set(key, item)
            results.append(item)
        return results

    def run_generation(
        self, cases: list[dict[str, Any]], *, mode: str, allow_provider_call: bool
    ) -> list[dict[str, Any]]:
        if mode not in {"rag", "gemini-only"}:
            raise ValueError(f"unsupported generation mode: {mode}")
        require_provider_call(allow_provider_call)
        results: list[dict[str, Any]] = []
        for case in cases:
            retrieval = self.run_retrieval([case], allow_provider_call=True)[0] if mode == "rag" else None
            key = self._key(
                case,
                f"generation-{mode}",
                {"actualRetrievedIds": (retrieval or {}).get("actualRetrievedIds", [])},
            )
            cached = self.cache.get(key)
            if cached is not None:
                if self.provider_budget is not None:
                    self.provider_budget.record_cache_hit()
                raw = {**cached, "cacheHit": True, "providerCallPerformed": False}
            else:
                adapter = (
                    self.rag_generation_adapter if mode == "rag" else self.gemini_only_generation_adapter
                )
                if self.provider_budget is not None:
                    self.provider_budget.reserve("generation_primary_attempt")
                raw = {**adapter(case, retrieval), "cacheHit": False, "providerCallPerformed": True}
                self.cache.set(key, raw)
            question_results = [
                evaluate_generated_question(
                    question,
                    case,
                    self.corpus,
                    mode=mode,
                    actual_retrieved_ids=raw.get("actualRetrievedIds", []),
                    actual_context_text=raw.get("actualContextText", ""),
                )
                for question in raw.get("questions", [])
            ]
            merged = {
                **raw,
                "caseId": case["caseId"],
                "mode": mode,
                "targetMode": case.get("target", {}).get("targetMode"),
                "humanReviewRubric": case.get("humanReviewRubric", []),
                "retrievalCacheHit": (retrieval or {}).get("cacheHit", False),
                "retrievalProviderCallPerformed": (retrieval or {}).get("providerCallPerformed", False),
                "questionResults": question_results,
                "pass": bool(question_results) and all(result["pass"] for result in question_results),
                "humanReviewRequired": any(result["humanReviewRequired"] for result in question_results),
            }
            if question_results:
                merged["dimensions"] = question_results[0]["dimensions"]
                merged["automaticOutcome"] = _automatic_outcome(merged)
            results.append(merged)
        return results


def safe_provider_error(exc: BaseException) -> str:
    """Return a short error category with bearer/key material fully removed."""
    text = str(exc)
    text = re.sub(r"(?i)(authorization\s*:\s*)bearer\s+[^\s,;]+", r"\1Bearer [REDACTED]", text)
    text = re.sub(r"(?i)\bbearer\s+[^\s,;]+", "Bearer [REDACTED]", text)
    text = re.sub(
        r"(?i)\b(api[-_ ]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", text
    )
    return text[:240]
