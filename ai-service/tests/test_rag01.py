"""Offline contract tests for the corrected RAG-01 evaluation package."""

import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.evaluation.rag01 import (
    HUMAN_REVIEW_REQUIRED,
    NO_PROJECT_SOURCE,
    EvaluationGenerationPolicy,
    ProviderBudget,
    ProviderBudgetExceeded,
    ProviderCallRequired,
    Rag01Cache,
    Rag01LiveHarness,
    SharedEvaluationGenerationRunner,
    aggregate_generation_results,
    aggregate_human_reviews,
    aggregate_paired_results,
    aggregate_retrieval_results,
    build_human_review_queue,
    evaluate_generated_question,
    factual_claim_check,
    paired_case_deltas,
    require_provider_call,
    retrieval_metrics,
    safe_provider_error,
    sanitize_generation_result,
    validate_generation_dataset,
    validate_human_review_import,
    validate_retrieval_dataset,
)
from app.generation.models import Difficulty, GeneratedQuestion, GenerationRequest
from app.generation.schemas import GeneratedQuestionBatch
from app.retrieval.models import FactContext, RetrievalResult
from scripts.evaluate_rag01 import corpus_sha256

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DATASET_ROOT = SERVICE_ROOT / "data" / "evaluation" / "rag01"
CORPUS_PATH = SERVICE_ROOT / "data" / "corpus" / "sgk_chunks.jsonl"
EXPECTED_CANONICAL_CORPUS_SHA = (
    "a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2"
)


@pytest.fixture(scope="module")
def corpus() -> dict[str, dict]:
    return {
        row["chunkId"]: row
        for row in (json.loads(line) for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines())
    }


@pytest.fixture(scope="module")
def retrieval_rows() -> list[dict]:
    return [
        json.loads(line)
        for line in (DATASET_ROOT / "retrieval_60_v1.jsonl").read_text(encoding="utf-8").splitlines()
    ]


@pytest.fixture(scope="module")
def generation_rows() -> list[dict]:
    return [
        json.loads(line)
        for line in (DATASET_ROOT / "generation_27_v1.jsonl").read_text(encoding="utf-8").splitlines()
    ]


def test_rag01_corpus_fingerprint_is_platform_stable(tmp_path: Path) -> None:
    crlf_copy = tmp_path / "corpus.jsonl"
    lf_bytes = CORPUS_PATH.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    crlf_copy.write_bytes(lf_bytes.replace(b"\n", b"\r\n"))

    assert corpus_sha256(crlf_copy) == EXPECTED_CANONICAL_CORPUS_SHA
    assert corpus_sha256(CORPUS_PATH) == EXPECTED_CANONICAL_CORPUS_SHA


def test_retrieval_60_schema_ids_and_coverage(retrieval_rows, corpus):
    summary = validate_retrieval_dataset(retrieval_rows, set(corpus))
    assert summary["status"] == "PASS"
    assert summary["cases"] == 60
    assert summary["byGrade"] == {"10": 20, "11": 20, "12": 20}
    assert summary["insufficientControls"] == 1
    assert all(row["caseId"] and row["queryType"] and row["difficulty"] for row in retrieval_rows)
    control = next(row for row in retrieval_rows if row["isInsufficientControl"])
    assert control["difficulty"] == "UNCLASSIFIED"
    assert control["controlScoring"] == "UNSCORABLE_WITH_CURRENT_RETRIEVER"


def test_retrieval_metrics_hit_mrr_and_multi_relevant_recall():
    metrics = retrieval_metrics(["wrong", "b", "a"], ["a", "b"])
    assert metrics["hitAt1"] == 0.0
    assert metrics["hitAt3"] == 1.0
    assert metrics["hitAt5"] == 1.0
    assert metrics["recallAt1"] == 0.0
    assert metrics["recallAt3"] == 1.0
    assert metrics["recallAt5"] == 1.0
    assert metrics["mrr"] == 0.5
    single = retrieval_metrics(["wrong", "a"], ["a"])
    assert single["recallAt1"] is None
    assert single["recallAt3"] is None
    assert single["recallAt5"] is None


def test_retrieval_aggregate_excludes_insufficient_control():
    results = [
        {
            "caseId": "normal",
            "isInsufficientControl": False,
            "expectedRelevantChunkIds": ["a", "b"],
            "metrics": retrieval_metrics(["a", "b"], ["a", "b"]),
        },
        {
            "caseId": "ret-044",
            "isInsufficientControl": True,
            "controlScoring": "UNSCORABLE_WITH_CURRENT_RETRIEVER",
            "expectedRelevantChunkIds": [],
            "metrics": None,
        },
    ]
    summary = aggregate_retrieval_results(results)
    assert summary["scoredCaseCount"] == 1
    assert summary["controlCaseCount"] == 1
    assert summary["multiRelevantRecallAt1"] == 0.5


def test_live_harness_preserves_multi_relevant_metadata_into_aggregate(tmp_path):
    cases = [
        {
            "caseId": "live-multi",
            "grade": 10,
            "difficulty": "hard",
            "queryType": "direct_fact",
            "expectedRelevantChunkIds": ["a", "b"],
        },
        {
            "caseId": "live-legacy",
            "grade": 11,
            "difficulty": "UNCLASSIFIED",
            "queryType": "legacy",
            "expectedRelevantChunkIds": ["d"],
        },
        {
            "caseId": "live-control",
            "grade": 12,
            "difficulty": "UNCLASSIFIED",
            "queryType": "insufficient_control",
            "expectedRelevantChunkIds": [],
            "isInsufficientControl": True,
        },
    ]

    def retrieve(case):
        ranked = {"live-multi": ["a", "z", "b"], "live-legacy": ["d"], "live-control": []}
        return {"actualRetrievedIds": ranked[case["caseId"]], "actualContextText": ""}

    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path),
        model_config={"model": "fake"},
        prompt_version="p1",
        schema_version="s1",
        corpus_hash="c",
        retrieval_config_fingerprint="r",
        retry_policy={},
        corpus={},
        retrieval_adapter=retrieve,
        rag_generation_adapter=lambda case, retrieval: {},
        gemini_only_generation_adapter=lambda case, retrieval: {},
    )
    results = harness.run_retrieval(cases, allow_provider_call=True)
    multi = next(item for item in results if item["caseId"] == "live-multi")
    assert multi["expectedRelevantChunkIds"] == ["a", "b"]
    assert multi["grade"] == 10
    assert multi["difficulty"] == "hard"
    assert multi["queryType"] == "direct_fact"
    assert multi["metrics"]["recallAt1"] == 0.5
    summary = aggregate_retrieval_results(results)
    assert summary["multiRelevantCaseCount"] == 1
    assert summary["multiRelevantRecallAt1"] == 0.5
    assert summary["multiRelevantRecallAt3"] == 1.0
    assert summary["multiRelevantRecallAt5"] == 1.0
    assert summary["controlCaseCount"] == 1
    assert summary["byGrade"]["10"]["multiRelevantRecallAt1"] == 0.5
    assert summary["byQueryType"]["direct_fact"]["hitAt1"] == 1.0
    assert "UNCLASSIFIED" in summary["byDifficulty"]


def test_generation_context_retrieval_has_no_gold_or_metrics_and_caches(tmp_path):
    calls = []
    case = {
        "caseId": "generation-context",
        "query": "Năm nào?",
        "grade": 10,
        "lessonNumber": 1,
        "difficulty": "EASY",
        "topK": 2,
        "sourceChunkIds": ["gold-source"],
        "criticalFacts": [{"acceptedValues": ["938"]}],
        "target": {"acceptedAnswers": ["938"]},
    }

    def retrieve(received):
        calls.append(received)
        return {
            "actualRetrievedIds": ["actual-a"],
            "actualContextChunkIds": ["actual-a"],
            "actualContextText": "bounded context",
            "response": {"ok": True},
        }

    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path), model_config={"model": "fake"},
        prompt_version="p1", schema_version="s1", corpus_hash="c",
        retrieval_config_fingerprint="r", retry_policy={}, corpus={},
        retrieval_adapter=retrieve, rag_generation_adapter=lambda case, retrieval: {},
        gemini_only_generation_adapter=lambda case, retrieval: {},
    )
    first = harness.run_retrieval([case], allow_provider_call=True)[0]
    second = harness.run_retrieval([case], allow_provider_call=True)[0]
    assert first["metrics"] is None
    assert first["retrievalEvaluationRole"] == "GENERATION_CONTEXT"
    assert first["expectedRelevantChunkIds"] == []
    assert first["actualContextText"] == "bounded context"
    assert first["response"] == {"ok": True}
    assert first["cacheHit"] is False and second["cacheHit"] is True
    assert second["metrics"] is None
    assert len(calls) == 1
    assert calls[0] is case
    assert "expectedRelevantChunkIds" not in calls[0]
    assert calls[0]["sourceChunkIds"] == ["gold-source"]


def test_generation_context_reaches_fake_rag_generation_adapter(tmp_path):
    case = _fake_case("generation-no-retrieval-gold")
    case.pop("expectedRelevantChunkIds")
    calls = {"retrieval": 0, "generation": 0}

    def retrieve(received):
        calls["retrieval"] += 1
        return {"actualRetrievedIds": ["s"], "actualContextChunkIds": ["s"],
                "actualContextText": "Tư liệu xác nhận năm 938.", "response": {}}

    def generate(received, retrieval):
        calls["generation"] += 1
        return {"questions": [_fake_question()],
                "actualRetrievedIds": retrieval["actualRetrievedIds"],
                "actualContextText": retrieval["actualContextText"]}

    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path), model_config={"model": "fake"},
        prompt_version="p1", schema_version="s1", corpus_hash="c",
        retrieval_config_fingerprint="r", retry_policy={},
        corpus={"s": {"text": "Tư liệu xác nhận năm 938."}},
        retrieval_adapter=retrieve, rag_generation_adapter=generate,
        gemini_only_generation_adapter=generate,
    )
    result = harness.run_generation([case], mode="rag", allow_provider_call=True)[0]
    assert calls == {"retrieval": 1, "generation": 1}
    assert len(result["questionResults"]) == 1


def test_retrieval_benchmark_gold_metrics_and_role_remain_unchanged(tmp_path):
    case = {"caseId": "benchmark", "expectedRelevantChunkIds": ["a", "b"]}
    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path), model_config={}, prompt_version="p",
        schema_version="s", corpus_hash="c", retrieval_config_fingerprint="r",
        retry_policy={}, corpus={},
        retrieval_adapter=lambda case: {"actualRetrievedIds": ["a", "z", "b"]},
        rag_generation_adapter=lambda case, retrieval: {},
        gemini_only_generation_adapter=lambda case, retrieval: {},
    )
    result = harness.run_retrieval([case], allow_provider_call=True)[0]
    assert result["retrievalEvaluationRole"] == "RETRIEVAL_BENCHMARK"
    assert result["metrics"]["recallAt1"] == 0.5
    assert result["metrics"]["recallAt3"] == 1.0
    assert result["metrics"]["recallAt5"] == 1.0


def test_generation_27_schema_gold_provenance_and_grid(generation_rows, corpus):
    summary = validate_generation_dataset(generation_rows, corpus)
    assert summary["status"] == "PASS"
    assert summary["cases"] == 27
    assert summary["byGrade"] == {"10": 9, "11": 9, "12": 9}
    assert summary["byDifficulty"] == {"EASY": 9, "MEDIUM": 9, "HARD": 9}
    assert summary["byContentGroup"] == {"facts": 9, "causes": 9, "synthesis": 9}
    assert summary["targetModes"] == {
        "EXACT_SINGLE": 8,
        "EXACT_SET": 4,
        "FACT_CONSTRAINED": 3,
        "HUMAN_REVIEW": 12,
    }
    assert summary["humanReviewCases"] == 15
    assert all(
        row["goldCurated"] and row["goldSpecVersion"] == "rag01-v2-explicit-curated"
        for row in generation_rows
    )
    assert all(
        fact["sourceChunkIds"] and fact["evidence"] for row in generation_rows for fact in row["goldFacts"]
    )
    tampered = json.loads(json.dumps(generation_rows))
    tampered[0]["criticalFacts"][0]["evidence"][0]["sourceTextSha256"] = "tampered"
    with pytest.raises(ValueError, match="source hash mismatch"):
        validate_generation_dataset(tampered, corpus)


def test_factual_evaluator_937_938_939_and_distractor_scope(generation_rows):
    case = next(row for row in generation_rows if row["query"].startswith("Ai chỉ huy chiến thắng Bạch Đằng"))
    assert factual_claim_check("Ngô Quyền chỉ huy chiến thắng Bạch Đằng năm 938.", case)["status"] == "PASS"
    assert factual_claim_check("Ngô Quyền chỉ huy chiến thắng Bạch Đằng năm 937.", case)["status"] == "FAIL"
    assert factual_claim_check("Ngô Quyền chỉ huy chiến thắng Bạch Đằng năm 939.", case)["status"] == "FAIL"


def _multi_value_question(case: dict, correct: str, *, source_ids: list[str] | None = None) -> dict:
    return {
        "question": case["query"],
        "options": [
            {"id": "A", "text": "Một đáp án khác"},
            {"id": "B", "text": correct},
            {"id": "C", "text": "Không liên quan"},
            {"id": "D", "text": "Một phương án nhiễu"},
        ],
        "correctOptionId": "B",
        "explanation": correct,
        "sourceChunkIds": source_ids or case["sourceChunkIds"],
    }


def test_long_bien_exact_set_requires_both_interval_endpoints(generation_rows, corpus):
    case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-001")
    source_text = " ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"])
    outcomes = {}
    for answer in ("1898", "1902", "1898-1902"):
        result = evaluate_generated_question(
            _multi_value_question(case, answer),
            case,
            corpus,
            actual_retrieved_ids=case["sourceChunkIds"],
            actual_context_text=source_text,
        )
        outcomes[answer] = result["dimensions"]["answerCorrectness"]
    assert outcomes == {"1898": "FAIL", "1902": "FAIL", "1898-1902": "PASS"}


def test_li_ong_years_are_evidence_not_semantic_answer(generation_rows, corpus):
    case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-015")
    result = evaluate_generated_question(
        _multi_value_question(case, "1831"),
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=" ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"]),
    )
    assert result["dimensions"]["answerCorrectness"] == HUMAN_REVIEW_REQUIRED
    assert result["pass"] is False


def test_doi_moi_year_is_not_answer_target(generation_rows, corpus):
    case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-023")
    assert case["target"]["targetMode"] == "FACT_CONSTRAINED"
    result = evaluate_generated_question(
        _multi_value_question(case, "1986"),
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=" ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"]),
    )
    assert result["dimensions"]["answerCorrectness"] == HUMAN_REVIEW_REQUIRED


def test_nam_dan_exact_set_does_not_accept_arbitrary_first_entity(generation_rows, corpus):
    case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-025")
    source_text = " ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"])
    partial = evaluate_generated_question(
        _multi_value_question(case, "Mai Thúc Loan"),
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=source_text,
    )
    complete = evaluate_generated_question(
        _multi_value_question(case, "Mai Thúc Loan; Lê Lợi; Nguyễn Huệ; Vương Thúc Mậu"),
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=source_text,
    )
    assert partial["dimensions"]["answerCorrectness"] == "FAIL"
    assert complete["dimensions"]["answerCorrectness"] == "PASS"


def test_fact_types_do_not_turn_count_identifier_or_measurement_digits_into_years(generation_rows):
    count_case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-019")
    identifier_case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-021")
    measurement_case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-026")
    assert factual_claim_check("Có 193 quốc gia thành viên.", count_case)["contradictoryYears"] == []
    assert (
        factual_claim_check("Nghị quyết 24C/18.6.5 ghi nhận năm 1990.", identifier_case)["status"]
        == "PASS"
    )
    assert (
        factual_claim_check("Nghị quyết 24C/18.6.5 ghi nhận 1987 và 1990.", identifier_case)["status"]
        == "FAIL"
    )
    assert factual_claim_check("Đường dây 500 kV hoàn thành năm 1992.", measurement_case)["status"] == "PASS"
    assert factual_claim_check("Đường dây 500 kV hoàn thành năm 1993.", measurement_case)["status"] == "FAIL"


def test_unesco_case_scores_only_the_commemorative_milestone(generation_rows, corpus):
    case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-021")
    assert case["target"]["targetMode"] == "EXACT_SINGLE"
    assert case["target"]["acceptedAnswers"] == ["1990"]
    assert "1987" in " ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"])
    for answer, expected in (("1990", "PASS"), ("1987", "FAIL")):
        result = evaluate_generated_question(
            _multi_value_question(case, answer),
            case,
            corpus,
            actual_retrieved_ids=case["sourceChunkIds"],
            actual_context_text=" ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"]),
        )
        assert result["dimensions"]["answerCorrectness"] == expected


def test_exact_single_rejects_obvious_extra_entity_or_value(generation_rows, corpus):
    place_case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-002")
    place_context = " ".join(corpus[chunk_id]["text"] for chunk_id in place_case["sourceChunkIds"])
    exact_place = evaluate_generated_question(
        _multi_value_question(place_case, "Anh"),
        place_case,
        corpus,
        actual_retrieved_ids=place_case["sourceChunkIds"],
        actual_context_text=place_context,
    )
    extra_place = evaluate_generated_question(
        _multi_value_question(place_case, "Anh và Pháp"),
        place_case,
        corpus,
        actual_retrieved_ids=place_case["sourceChunkIds"],
        actual_context_text=place_context,
    )
    assert exact_place["dimensions"]["answerCorrectness"] == "PASS"
    assert extra_place["dimensions"]["answerCorrectness"] == "FAIL"
    assert extra_place["pass"] is False

    unesco_case = next(row for row in generation_rows if row["caseId"] == "rag01-gen-021")
    unesco_context = " ".join(corpus[chunk_id]["text"] for chunk_id in unesco_case["sourceChunkIds"])
    extra_year = evaluate_generated_question(
        _multi_value_question(unesco_case, "1987 và 1990"),
        unesco_case,
        corpus,
        actual_retrieved_ids=unesco_case["sourceChunkIds"],
        actual_context_text=unesco_context,
    )
    assert extra_year["dimensions"]["answerCorrectness"] == "FAIL"
    assert extra_year["pass"] is False


def test_generation_aggregate_excludes_human_review_from_auto_denominator():
    results = [
        {"caseId": "pass", "dimensions": {"answerCorrectness": "PASS"}, "automaticOutcome": "AUTO_PASS"},
        {"caseId": "fail", "dimensions": {"answerCorrectness": "FAIL"}, "automaticOutcome": "AUTO_FAIL"},
        {
            "caseId": "human",
            "dimensions": {"answerCorrectness": HUMAN_REVIEW_REQUIRED},
            "humanReviewRequired": True,
            "automaticOutcome": HUMAN_REVIEW_REQUIRED,
        },
    ]
    summary = aggregate_generation_results(results)
    assert summary["passedCases"] == 1
    assert summary["failedCases"] == 1
    assert summary["humanReviewCases"] == 1
    assert summary["dimensionResults"]["answerCorrectness"] == {
        "autoScoredCount": 2,
        "autoPassCount": 1,
        "autoFailCount": 1,
        "autoPassRate": 0.5,
        "humanReviewCount": 1,
        "naCount": 0,
    }


def _bach_dang_question(case: dict, *, correct: str = "Ngô Quyền", explanation: str | None = None) -> dict:
    return {
        "question": "Ai chỉ huy chiến thắng Bạch Đằng năm 938?",
        "options": [
            {"id": "A", "text": "Lê Hoàn"},
            {"id": "B", "text": correct},
            {"id": "C", "text": "Chiến thắng diễn ra năm 939"},
            {"id": "D", "text": "Trần Quốc Tuấn"},
        ],
        "correctOptionId": "B",
        "explanation": explanation or "Ngô Quyền chỉ huy chiến thắng Bạch Đằng năm 938.",
        "sourceChunkIds": case["sourceChunkIds"],
    }


def test_answer_key_and_distractor_fact_role(generation_rows, corpus):
    case = next(row for row in generation_rows if row["query"].startswith("Ai chỉ huy chiến thắng Bạch Đằng"))
    source_text = " ".join(corpus[chunk_id]["text"] for chunk_id in case["sourceChunkIds"])
    question = _bach_dang_question(case)
    result = evaluate_generated_question(
        question,
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=source_text,
    )
    assert result["pass"] is True
    assert result["dimensions"]["answerCorrectness"] == "PASS"
    assert result["dimensions"]["answerExplanationConsistency"] == "PASS"
    assert result["dimensions"]["sourceTraceability"] == "PASS"
    assert result["dimensions"]["groundednessSourceSupport"] == "PASS"

    wrong_year = _bach_dang_question(case, explanation="Ngô Quyền chỉ huy chiến thắng năm 937.")
    wrong_year_result = evaluate_generated_question(
        wrong_year,
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=source_text,
    )
    assert wrong_year_result["pass"] is False
    assert wrong_year_result["dimensions"]["factualCorrectness"] == "FAIL"

    # 939 is present only in a distractor and must not poison factual scoring.
    assert result["factual"]["status"] == "PASS"
    assert "939" not in result["factual"]["contradictoryYears"]

    duplicate = {**question, "options": [*question["options"][:3], {"id": "D", "text": "Ngô Quyền"}]}
    duplicate_result = evaluate_generated_question(
        duplicate,
        case,
        corpus,
        actual_retrieved_ids=case["sourceChunkIds"],
        actual_context_text=source_text,
    )
    assert duplicate_result["dimensions"]["answerValidity"] == "FAIL"
    assert duplicate_result["dimensions"]["distractorBoundedChecks"] == "FAIL"


def test_gemini_only_grounding_and_traceability_are_na(generation_rows, corpus):
    case = next(row for row in generation_rows if row["query"].startswith("Ai chỉ huy chiến thắng Bạch Đằng"))
    question = _bach_dang_question(case)
    question["sourceChunkIds"] = [NO_PROJECT_SOURCE]
    result = evaluate_generated_question(question, case, corpus, mode="gemini-only")
    assert result["dimensions"]["projectContextGroundedness"] == "N/A"
    assert result["dimensions"]["groundednessSourceSupport"] == "N/A"
    assert result["dimensions"]["sourceTraceability"] == "N/A"


def test_unscorable_answer_target_requires_human_review(corpus):
    case = {
        "sourceChunkIds": ["s"],
        "expectedRelevantChunkIds": ["s"],
        "target": {
            "acceptedAnswers": [],
            "targetMode": "HUMAN_REVIEW",
            "humanReviewRequired": True,
        },
        "criticalFacts": [
            {
                "type": "text_fact",
                "acceptedValues": ["một kết luận"],
                "autoScorable": False,
                "humanReviewRequired": True,
                "curated": True,
            }
        ],
    }
    question = {
        "question": "Câu hỏi?",
        "options": [
            {"id": key, "text": text} for key, text in zip("ABCD", ["A", "B", "C", "D"], strict=True)
        ],
        "correctOptionId": "A",
        "explanation": "Một kết luận.",
        "sourceChunkIds": ["s"],
    }
    result = evaluate_generated_question(question, case, corpus, mode="gemini-only")
    assert result["dimensions"]["answerCorrectness"] == HUMAN_REVIEW_REQUIRED
    assert result["humanReviewRequired"] is True


def _fake_case(case_id: str = "fake-1") -> dict:
    return {
        "caseId": case_id,
        "query": "Năm nào?",
        "grade": 10,
        "lessonNumber": 1,
        "difficulty": "EASY",
        "count": 1,
        "topK": 1,
        "sourceChunkIds": ["s"],
        "expectedRelevantChunkIds": ["s"],
        "target": {"acceptedAnswers": ["938"], "targetMode": "EXACT_SINGLE", "autoScorable": True},
        "criticalFacts": [
            {
                "type": "year",
                "acceptedValues": ["938"],
                "autoScorable": True,
                "sourceChunkIds": ["s"],
                "curated": True,
            }
        ],
    }


def _fake_question() -> dict:
    return {
        "question": "Chiến thắng diễn ra năm nào?",
        "options": [
            {"id": "A", "text": "937"},
            {"id": "B", "text": "938"},
            {"id": "C", "text": "939"},
            {"id": "D", "text": "940"},
        ],
        "correctOptionId": "B",
        "explanation": "Chiến thắng diễn ra năm 938.",
        "sourceChunkIds": ["s"],
    }


def test_owner_gate_fake_adapters_cache_and_resume(tmp_path):
    calls = {"retrieval": 0, "rag": 0, "gemini": 0}
    corpus = {"s": {"text": "Tư liệu xác nhận năm 938."}}

    def retrieve(case):
        calls["retrieval"] += 1
        return {
            "actualRetrievedIds": ["s"],
            "actualContextText": corpus["s"]["text"],
            "actualContextChunkIds": ["s"],
        }

    def rag_generate(case, retrieval):
        calls["rag"] += 1
        return {
            "questions": [_fake_question()],
            "actualRetrievedIds": retrieval["actualRetrievedIds"],
            "actualContextText": retrieval["actualContextText"],
        }

    def gemini_generate(case, retrieval):
        calls["gemini"] += 1
        question = _fake_question()
        question["sourceChunkIds"] = [NO_PROJECT_SOURCE]
        return {"questions": [question], "actualRetrievedIds": [], "actualContextText": ""}

    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path),
        model_config={"model": "fake"},
        prompt_version="p1",
        schema_version="s1",
        corpus_hash="corpus-1",
        retrieval_config_fingerprint="retrieval-1",
        retry_policy={"retries": 1},
        corpus=corpus,
        retrieval_adapter=retrieve,
        rag_generation_adapter=rag_generate,
        gemini_only_generation_adapter=gemini_generate,
    )
    case = _fake_case()
    with pytest.raises(ProviderCallRequired):
        harness.run_generation([case], mode="rag", allow_provider_call=False)
    assert calls == {"retrieval": 0, "rag": 0, "gemini": 0}

    first = harness.run_generation([case], mode="rag", allow_provider_call=True)[0]
    assert first["pass"] is True
    assert calls == {"retrieval": 1, "rag": 1, "gemini": 0}
    second = harness.run_generation([case], mode="rag", allow_provider_call=True)[0]
    assert second["cacheHit"] is True
    assert calls == {"retrieval": 1, "rag": 1, "gemini": 0}

    second_case = _fake_case("fake-2")
    resumed = harness.run_generation([case, second_case], mode="rag", allow_provider_call=True)
    assert len(resumed) == 2
    assert calls == {"retrieval": 2, "rag": 2, "gemini": 0}

    gemini = harness.run_generation([case], mode="gemini-only", allow_provider_call=True)[0]
    assert gemini["dimensions"]["sourceTraceability"] == "N/A"
    assert gemini["dimensions"]["groundednessSourceSupport"] == "N/A"
    assert calls["gemini"] == 1


def test_hard_provider_budget_stops_before_generation_call(tmp_path):
    calls = {"retrieval": 0, "generation": 0}

    def retrieve(case):
        calls["retrieval"] += 1
        return {"actualRetrievedIds": ["s"], "actualContextText": "năm 938"}

    def generate(case, retrieval):
        calls["generation"] += 1
        return {
            "questions": [_fake_question()],
            "actualRetrievedIds": ["s"],
            "actualContextText": "năm 938",
        }

    budget = ProviderBudget(max_provider_calls=1)
    harness = Rag01LiveHarness(
        cache=Rag01Cache(tmp_path),
        model_config={"model": "fake"},
        prompt_version="p1",
        schema_version="s1",
        corpus_hash="c",
        retrieval_config_fingerprint="r",
        retry_policy={},
        corpus={"s": {"text": "năm 938"}},
        retrieval_adapter=retrieve,
        rag_generation_adapter=generate,
        gemini_only_generation_adapter=generate,
        provider_budget=budget,
    )
    with pytest.raises(ProviderBudgetExceeded):
        harness.run_generation([_fake_case()], mode="rag", allow_provider_call=True)
    assert calls == {"retrieval": 1, "generation": 0}
    assert budget.snapshot()["retrievalCasesInvoked"] == 1
    assert budget.snapshot()["generationPrimaryAttempts"] == 0
    repair_budget = ProviderBudget(max_provider_calls=2)
    repair_budget.reserve("generation_primary_attempt")
    repair_budget.reserve("generation_repair_attempt")
    assert repair_budget.snapshot()["generationRepairAttempts"] == 1


class _FairnessProvider:
    def __init__(self, source_id: str):
        self.source_id = source_id
        self.prompts: list[str] = []

    def generate_structured(self, prompt: str, **kwargs):
        del kwargs
        self.prompts.append(prompt)
        return GeneratedQuestionBatch(
            questions=[
                GeneratedQuestion(
                    question="Chiến thắng diễn ra năm nào?",
                    options=[
                        {"id": "A", "text": "937"},
                        {"id": "B", "text": "938"},
                        {"id": "C", "text": "939"},
                        {"id": "D", "text": "940"},
                    ],
                    correctOptionId="B",
                    explanation="Chiến thắng diễn ra năm 938.",
                    difficulty="EASY",
                    sourceChunkIds=[self.source_id],
                )
            ]
        )


def test_paired_prompts_share_task_but_use_honest_knowledge_source_policies():
    settings = Settings(gemini_generation_model="fake")
    policy = EvaluationGenerationPolicy(
        model="fake",
        temperature=0.3,
        max_output_tokens=8192,
        schema_version="grounded-mcq-schema-v1",
        max_retries=3,
        repair_attempts=1,
    )
    request = GenerationRequest(
        query="BENCHMARK_TASK_MARKER_938: Ai chỉ huy chiến thắng Bạch Đằng?",
        grade=10,
        difficulty=Difficulty.EASY,
        count=1,
    )
    retrieval = SimpleNamespace(
        fact_context=FactContext(
            text="[SOURCE 1] Chiến thắng Bạch Đằng diễn ra năm 938.",
            source_chunk_ids=["s"],
            included_chunks=1,
            truncated=False,
            character_count=49,
        ),
        results=[
            RetrievalResult(
                rank=1,
                chunkId="s",
                documentId="doc",
                grade=10,
                lessonNumber=1,
                lessonTitle="",
                sectionTitle="",
                sectionPath="",
                contentTypes="",
                text="Chiến thắng Bạch Đằng diễn ra năm 938.",
                distance=0.1,
                chunkHash="h",
            )
        ],
    )
    rag_provider = _FairnessProvider("s")
    gemini_provider = _FairnessProvider(NO_PROJECT_SOURCE)
    rag_runner = SharedEvaluationGenerationRunner(rag_provider, settings, policy)
    gemini_runner = SharedEvaluationGenerationRunner(gemini_provider, settings, policy)
    rag_runner.generate(request, retrieval_response=retrieval, mode="rag")
    gemini_runner.generate(request, retrieval_response=None, mode="gemini-only")
    rag_policy = rag_runner.policy.snapshot()
    gemini_policy = gemini_runner.policy.snapshot()
    assert rag_policy == gemini_policy
    assert rag_policy["model"] == "fake"
    assert rag_policy["temperature"] == 0.3
    assert rag_policy["maxOutputTokens"] == 8192
    assert rag_policy["schemaVersion"] == "grounded-mcq-schema-v1"
    assert rag_policy["repairAttempts"] == 1
    assert request.grade == 10 and request.difficulty == Difficulty.EASY and request.count == 1
    assert "BENCHMARK_TASK_MARKER_938" in rag_provider.prompts[0]
    assert "BENCHMARK_TASK_MARKER_938" in gemini_provider.prompts[0]
    assert "chunkId=s" in rag_provider.prompts[0]
    assert "chunkId=s" not in gemini_provider.prompts[0]
    assert "PROJECT FACT CONTEXT" in rag_provider.prompts[0]
    assert "PROJECT FACT CONTEXT" not in gemini_provider.prompts[0]
    assert "factual authority" in rag_provider.prompts[0]
    assert "parametric knowledge" in gemini_provider.prompts[0]
    assert "only use facts from FACT CONTEXT" not in gemini_provider.prompts[0]
    assert f'[{NO_PROJECT_SOURCE!r}]' not in gemini_provider.prompts[0]
    assert f'"{NO_PROJECT_SOURCE}"' in gemini_provider.prompts[0]
    for gold_only_token in (
        "acceptedAnswers",
        "acceptedAnswerSets",
        "criticalFacts",
        "goldRationale",
        "1987",
        "1990",
    ):
        assert gold_only_token not in rag_provider.prompts[0]
        assert gold_only_token not in gemini_provider.prompts[0]
    assert "GENERATION CONTRACT" in rag_provider.prompts[0]
    assert "GENERATION CONTRACT" in gemini_provider.prompts[0]


class _RepairFairnessProvider(_FairnessProvider):
    def __init__(self, source_id: str):
        super().__init__(source_id)
        self.calls = 0

    def generate_structured(self, prompt: str, **kwargs):
        self.calls += 1
        self.prompts.append(prompt)
        question = _fake_question()
        question["sourceChunkIds"] = [self.source_id]
        question["difficulty"] = "EASY"
        if self.calls == 1:
            question["options"][1]["text"] = question["options"][0]["text"]
        return GeneratedQuestionBatch(questions=[GeneratedQuestion.model_validate(question)])


def test_paired_repair_prompts_preserve_task_and_mode_policy_with_same_repair_cap():
    settings = Settings(gemini_generation_model="fake")
    policy = EvaluationGenerationPolicy(
        model="fake",
        temperature=0.3,
        max_output_tokens=8192,
        schema_version="grounded-mcq-schema-v1",
        max_retries=3,
        repair_attempts=1,
    )
    request = GenerationRequest(
        query="BENCHMARK_TASK_MARKER_938: Ai chỉ huy chiến thắng Bạch Đằng?",
        grade=10,
        difficulty=Difficulty.EASY,
        count=1,
    )
    retrieval = SimpleNamespace(
        fact_context=FactContext(
            text="[SOURCE 1] Chiến thắng Bạch Đằng diễn ra năm 938.",
            source_chunk_ids=["s"],
            included_chunks=1,
            truncated=False,
            character_count=49,
        ),
        results=[
            RetrievalResult(
                rank=1,
                chunkId="s",
                documentId="doc",
                grade=10,
                lessonNumber=1,
                lessonTitle="",
                sectionTitle="",
                sectionPath="",
                contentTypes="",
                text="Chiến thắng Bạch Đằng diễn ra năm 938.",
                distance=0.1,
                chunkHash="h",
            )
        ],
    )
    rag_provider = _RepairFairnessProvider("s")
    gemini_provider = _RepairFairnessProvider(NO_PROJECT_SOURCE)
    SharedEvaluationGenerationRunner(rag_provider, settings, policy).generate(
        request, retrieval_response=retrieval, mode="rag"
    )
    SharedEvaluationGenerationRunner(gemini_provider, settings, policy).generate(
        request, retrieval_response=None, mode="gemini-only"
    )
    assert len(rag_provider.prompts) == len(gemini_provider.prompts) == 2
    assert all("BENCHMARK_TASK_MARKER_938" in prompt for prompt in rag_provider.prompts)
    assert all("BENCHMARK_TASK_MARKER_938" in prompt for prompt in gemini_provider.prompts)
    assert "PROJECT FACT CONTEXT" in rag_provider.prompts[1]
    assert "PROJECT FACT CONTEXT" not in gemini_provider.prompts[1]
    assert "parametric knowledge" in gemini_provider.prompts[1]
    assert "only use facts from FACT CONTEXT" not in gemini_provider.prompts[1]


def test_sanitized_generation_export_removes_context_and_raw_provider_response():
    corpus = {"s": {"text": "REDACTION_CONTEXT_MARKER"}}
    sanitized = sanitize_generation_result(
        {
            "caseId": "x",
            "actualContextText": "REDACTION_CONTEXT_MARKER",
            "response": {"providerRaw": "REDACTION_PROVIDER_MARKER"},
            "actualRetrievedIds": ["s"],
            "questions": [],
        },
        corpus,
    )
    serialized = json.dumps(sanitized, ensure_ascii=False)
    assert "REDACTION_CONTEXT_MARKER" not in serialized
    assert "REDACTION_PROVIDER_MARKER" not in serialized
    assert sanitized["actualContextSha256"]
    assert sanitized["retrievedSourceRefs"][0]["chunkId"] == "s"


def test_human_review_queue_and_offline_aggregate_contract():
    raw = [
        {
            "caseId": "human-1",
            "mode": "rag",
            "automaticOutcome": HUMAN_REVIEW_REQUIRED,
            "humanReviewRubric": ["Check semantic answer"],
            "actualRetrievedIds": ["s"],
            "actualContextText": "private",
            "questions": [
                {
                    "question": "Câu hỏi",
                    "options": [],
                    "correctOptionId": "A",
                    "explanation": "Giải thích",
                    "sourceChunkIds": ["s"],
                }
            ],
        }
    ]
    queue = build_human_review_queue(raw)
    assert queue[0]["sourceEvidenceRefs"]["actualRetrievedIds"] == ["s"]
    assert "private" not in json.dumps(queue, ensure_ascii=False)
    aggregate = aggregate_human_reviews(
        [
            {
                "caseId": "human-1",
                "mode": "rag",
                "semanticAnswerCorrect": True,
                "factualCorrect": True,
                "distractorPlausibility": "PASS",
                "pedagogicalQuality": "PASS",
                "notes": "reviewed",
            }
        ]
    )
    assert aggregate["providerCalls"] == 0
    assert aggregate["adjudicatedPassCount"] == 1


def _completed_review(case_id: str, mode: str, *, passed: bool = True) -> dict:
    return {
        "caseId": case_id,
        "mode": mode,
        "semanticAnswerCorrect": passed,
        "factualCorrect": passed,
        "distractorPlausibility": "PASS" if passed else "FAIL",
        "pedagogicalQuality": "PASS" if passed else "FAIL",
        "notes": "reviewed",
    }


def test_human_review_import_is_pair_aware_and_reports_missing_reviews():
    queue = [{"caseId": "case-1", "mode": "rag"}, {"caseId": "case-1", "mode": "gemini-only"}]
    rag_review = _completed_review("case-1", "rag")
    aggregate = validate_human_review_import(queue, [rag_review])
    assert aggregate["expectedQueueCount"] == 2
    assert aggregate["reviewedCount"] == 1
    assert aggregate["missingReviewCount"] == 1
    assert aggregate["complete"] is False
    assert aggregate["status"] == "INCOMPLETE_REVIEWS"
    assert aggregate["byMode"]["rag"] == {"reviewed": 1, "pass": 1, "fail": 0, "passRate": 1.0}
    assert aggregate["byMode"]["gemini-only"]["reviewed"] == 0
    with pytest.raises(ValueError, match="duplicate human review key"):
        validate_human_review_import(queue, [rag_review, rag_review])
    with pytest.raises(ValueError, match="unknown human review key"):
        validate_human_review_import(queue, [_completed_review("unknown", "rag")])


def test_human_review_import_cli_requires_current_queue_and_explicit_output_dir():
    script = SERVICE_ROOT / "scripts" / "import_rag01_human_review.py"
    completed = subprocess.run(
        [sys.executable, str(script), "--help"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "--queue" in completed.stdout
    assert "--output-dir OUTPUT_DIR" in completed.stdout
    assert "rag01-evaluation-baseline-corrected-v2" not in script.read_text(encoding="utf-8")


def test_cache_identity_includes_corpus_retrieval_and_retry_policy():
    base = Rag01Cache.identity(
        "x",
        "rag",
        {"model": "test"},
        "p1",
        "s1",
        {"query": "q"},
        corpus_hash="c1",
        retrieval_config_fingerprint="r1",
        retry_policy={"n": 1},
    )
    assert (
        Rag01Cache.identity(
            "x",
            "rag",
            {"model": "test"},
            "p1",
            "s1",
            {"query": "q"},
            corpus_hash="c2",
            retrieval_config_fingerprint="r1",
            retry_policy={"n": 1},
        )
        != base
    )
    assert (
        Rag01Cache.identity(
            "x",
            "rag",
            {"model": "test"},
            "p1",
            "s1",
            {"query": "q"},
            corpus_hash="c1",
            retrieval_config_fingerprint="r2",
            retry_policy={"n": 1},
        )
        != base
    )
    assert (
        Rag01Cache.identity(
            "x",
            "rag",
            {"model": "test"},
            "p1",
            "s1",
            {"query": "q"},
            corpus_hash="c1",
            retrieval_config_fingerprint="r1",
            retry_policy={"n": 2},
        )
        != base
    )


def test_paired_aggregation_requires_complete_matching_ids_and_reports_answer_dimension():
    rag = [{"caseId": "x", "pass": True, "dimensions": {"structural": "PASS", "answerCorrectness": "PASS"}}]
    gemini = [
        {"caseId": "x", "pass": False, "dimensions": {"structural": "FAIL", "answerCorrectness": "FAIL"}}
    ]
    delta = paired_case_deltas(rag, gemini)[0]
    assert delta["ragOutcome"] == "AUTO_PASS"
    assert delta["geminiOnlyOutcome"] == "AUTO_FAIL"
    assert delta["ragAnswerCorrectness"] == "PASS"
    assert delta["geminiOnlyAnswerCorrectness"] == "FAIL"
    assert delta["autoPassDelta"] == 1
    assert delta["delta"] == 1
    assert aggregate_generation_results(rag)["passedCases"] == 1
    with pytest.raises(ValueError, match="complete matching"):
        paired_case_deltas(rag, [{"caseId": "different", "pass": False}])


def test_paired_human_review_delta_is_pending_not_boolean_failure():
    rag = [
        {
            "caseId": "pending",
            "pass": False,
            "humanReviewRequired": True,
            "automaticOutcome": HUMAN_REVIEW_REQUIRED,
            "dimensions": {"answerCorrectness": HUMAN_REVIEW_REQUIRED},
        }
    ]
    gemini = [
        {
            "caseId": "pending",
            "pass": True,
            "automaticOutcome": "AUTO_PASS",
            "dimensions": {"answerCorrectness": "PASS"},
        }
    ]
    delta = paired_case_deltas(rag, gemini)[0]
    assert delta["ragOutcome"] == HUMAN_REVIEW_REQUIRED
    assert delta["geminiOnlyOutcome"] == "AUTO_PASS"
    assert delta["autoPassDelta"] is None
    assert delta["delta"] is None
    assert delta["pairedAutoComparisonStatus"] == "HUMAN_REVIEW_PENDING"
    aggregate = aggregate_paired_results(rag, gemini)
    assert aggregate["autoComparableCaseCount"] == 0
    assert aggregate["humanReviewPendingPairCount"] == 1
    assert aggregate["ragAutoPassCount"] == 0
    assert aggregate["geminiAutoPassCount"] == 1
    assert "ragPass" not in delta
    assert "geminiOnlyPass" not in delta


def test_provider_gate_and_full_secret_redaction():
    with pytest.raises(ProviderCallRequired):
        require_provider_call(False)
    require_provider_call(True)
    values = ["VALUE_A", "VALUE_B", "VALUE_C", "VALUE_D", "VALUE_E", "VALUE_F", "VALUE_G"]
    error = safe_provider_error(
        RuntimeError(
            "Authorization: " + f"Bearer {values[0]} Bearer {values[1]} api_key={values[2]} "
            f"api-key: {values[3]} token={values[4]} secret={values[5]} authorization={values[6]}"
        )
    )
    for secret in values:
        assert secret not in error
    assert "REDACTED" in error
