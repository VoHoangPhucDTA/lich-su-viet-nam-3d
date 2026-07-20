from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SERVICE_ROOT = REPOSITORY_ROOT / "ai-service"
TOOLING_PATH = REPOSITORY_ROOT / "scripts" / "evaluation" / "teacher_evaluation.py"
SPEC = importlib.util.spec_from_file_location("teacher_evaluation_test_target", TOOLING_PATH)
assert SPEC is not None and SPEC.loader is not None
tooling = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tooling)

MANIFEST_PATH = SERVICE_ROOT / "data" / "evaluation" / "teacher_evaluation_manifest.jsonl"
FIXTURE_ROOT = SERVICE_ROOT / "tests" / "fixtures" / "teacher-evaluation"


@pytest.fixture
def manifest_rows() -> list[dict]:
    return tooling.load_jsonl(MANIFEST_PATH)


@pytest.fixture
def sample_rows() -> list[dict]:
    return tooling.load_jsonl(FIXTURE_ROOT / "sample.jsonl")


def _csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        return list(reader.fieldnames or []), list(reader)


def _write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def test_fixed_manifest_has_required_size_and_balanced_distribution(manifest_rows: list[dict]) -> None:
    report = tooling.validate_manifest(manifest_rows)
    assert report["sampleSize"] == 36
    assert report["distribution"]["byGrade"] == {"10": 12, "11": 12, "12": 12}
    assert report["distribution"]["byDifficulty"] == {"EASY": 12, "HARD": 12, "MEDIUM": 12}
    assert len({row["evaluationItemId"] for row in manifest_rows}) == 36
    assert len({row["requestId"] for row in manifest_rows}) == 36


def test_manifest_rejects_duplicate_item(manifest_rows: list[dict]) -> None:
    invalid = [dict(row) for row in manifest_rows]
    invalid[1]["evaluationItemId"] = invalid[0]["evaluationItemId"]
    with pytest.raises(tooling.EvaluationValidationError, match="duplicate evaluationItemId"):
        tooling.validate_manifest(invalid)


def test_randomization_is_stable_and_evaluator_specific(sample_rows: list[dict]) -> None:
    first = [row["evaluationItemId"] for row in tooling.randomized_items(sample_rows, "GV01", "locked-seed")]
    repeat = [row["evaluationItemId"] for row in tooling.randomized_items(sample_rows, "GV01", "locked-seed")]
    second = [row["evaluationItemId"] for row in tooling.randomized_items(sample_rows, "GV02", "locked-seed")]
    assert first == repeat
    assert first != second
    with pytest.raises(tooling.EvaluationValidationError, match="pseudonym"):
        tooling.randomized_items(sample_rows, "Teacher Name", "locked-seed")


def test_sample_validation_checks_hash_and_source_identity(sample_rows: list[dict], manifest_rows: list[dict]) -> None:
    assert tooling.validate_sample(sample_rows, manifest_rows) == {"sampleItems": 3, "generated": 3}
    invalid = [dict(row) for row in sample_rows]
    invalid[0]["sourceChunkHashes"] = []
    with pytest.raises(tooling.EvaluationValidationError, match="source identity mismatch"):
        tooling.validate_sample(invalid, manifest_rows)
    invalid = [dict(row) for row in sample_rows]
    invalid[0]["generatedQuestionHash"] = "0" * 64
    with pytest.raises(tooling.EvaluationValidationError, match="question hash mismatch"):
        tooling.validate_sample(invalid, manifest_rows)


def test_export_is_blinded_bom_encoded_and_html_escaped(tmp_path: Path, sample_rows: list[dict]) -> None:
    report = tooling.export_review_package(sample_rows, tmp_path, "GV01", "locked-seed")
    assert report["items"] == 3
    assert (tmp_path / "review-form.csv").read_bytes().startswith(b"\xef\xbb\xbf")
    page = (tmp_path / "review-package.html").read_text(encoding="utf-8")
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "synthetic-test-model" not in page
    assert "PROPER_NAME_EVIDENCE_WARNING" not in page
    assert "latencyMs" not in page
    mapping = json.loads((tmp_path / "randomization-map.json").read_text(encoding="utf-8"))
    assert "locked-seed" not in json.dumps(mapping)


def test_import_accepts_locked_synthetic_fixture_and_preserves_no_pii(tmp_path: Path, sample_rows: list[dict]) -> None:
    reviews, report = tooling.import_reviews(FIXTURE_ROOT / "reviews.csv", sample_rows, tmp_path)
    assert report == {
        "status": "PASSED", "inputRows": 6, "validRows": 6,
        "invalidRows": 0, "errors": [], "containsPii": False,
    }
    assert all(row["syntheticTestData"] for row in reviews)
    persisted = tooling.load_jsonl(tmp_path / "results" / "teacher-reviews.jsonl")
    assert persisted == reviews
    assert not any(set(row) & tooling.PII_FIELDS for row in persisted)


@pytest.mark.parametrize(
    ("mutation", "error_code"),
    [
        ({"historicalFactualCorrectness": "6"}, "INVALID_RATING:historicalFactualCorrectness"),
        ({"questionClarity": ""}, "INVALID_RATING:questionClarity"),
        ({"overallDecision": "AUTO_ACCEPT"}, "INVALID_OVERALL_DECISION"),
        ({"sampleManifestHash": "0" * 64}, "SAMPLE_MANIFEST_HASH_MISMATCH"),
        ({"generatedQuestionHash": "0" * 64}, "GENERATED_QUESTION_HASH_MISMATCH"),
    ],
)
def test_import_rejects_invalid_review_fields(
    tmp_path: Path, sample_rows: list[dict], mutation: dict[str, str], error_code: str
) -> None:
    fields, rows = _csv_rows(FIXTURE_ROOT / "reviews.csv")
    rows = [rows[0] | mutation]
    path = tmp_path / "invalid.csv"
    _write_csv(path, fields, rows)
    normalized, report = tooling.import_reviews(path, sample_rows, tmp_path / "out")
    assert normalized == []
    assert report["status"] == "FAILED"
    assert error_code in report["errors"][0]["errors"]
    assert not (tmp_path / "out" / "results" / "teacher-reviews.jsonl").exists()


def test_import_rejects_duplicate_pair_and_pii_column(tmp_path: Path, sample_rows: list[dict]) -> None:
    fields, rows = _csv_rows(FIXTURE_ROOT / "reviews.csv")
    duplicate = tmp_path / "duplicate.csv"
    _write_csv(duplicate, fields, [rows[0], rows[0]])
    _, report = tooling.import_reviews(duplicate, sample_rows, tmp_path / "duplicate-out")
    assert "DUPLICATE_EVALUATOR_ITEM" in report["errors"][0 if len(report["errors"]) == 1 else 1]["errors"]

    pii = tmp_path / "pii.csv"
    _write_csv(pii, fields + ["email"], [rows[0] | {"email": "forbidden@example.test"}])
    with pytest.raises(tooling.EvaluationValidationError, match="PII columns are forbidden"):
        tooling.import_reviews(pii, sample_rows, tmp_path / "pii-out")


def test_statistics_agreement_and_warning_matrix_are_defined(sample_rows: list[dict], tmp_path: Path) -> None:
    reviews, _ = tooling.import_reviews(FIXTURE_ROOT / "reviews.csv", sample_rows, tmp_path)
    summary = tooling.numeric_summary([1, 3, 5])
    assert summary["mean"] == 3
    assert summary["median"] == 3
    assert summary["distribution"] == {"1": 1, "2": 0, "3": 1, "4": 0, "5": 1}
    interval = tooling.wilson_interval(5, 10)
    assert interval["lower"] < interval["rate"] < interval["upper"]
    agreement = tooling.agreement_metrics(reviews)
    assert agreement["status"] == "COMPUTED"
    assert agreement["pairs"][0]["commonItems"] == 3
    assert tooling.agreement_metrics(reviews[:3])["status"] == "NOT_COMPUTED"
    warning = tooling.warning_confusion(sample_rows, reviews)
    assert warning["status"] == "COMPUTED"
    assert sum(warning["matrix"].values()) == 3


def test_synthetic_pipeline_writes_all_reproducible_tables(tmp_path: Path, sample_rows: list[dict]) -> None:
    reviews, _ = tooling.import_reviews(FIXTURE_ROOT / "reviews.csv", sample_rows, tmp_path)
    report = tooling.analyze_reviews(sample_rows, reviews)
    tooling.write_analysis(report, tmp_path)
    assert report["status"] == "COMPLETED_WITH_SYNTHETIC_DATA"
    assert "absolute factual correctness" in report["teacherEvaluationClaim"]
    expected_tables = {
        "overall-rubric-summary.csv", "overall-decisions.csv", "critical-issue-frequencies.csv",
        "summary-by-grade.csv", "summary-by-difficulty.csv", "summary-by-category.csv",
        "summary-by-evaluator.csv", "inter-rater-agreement.csv", "warning-vs-teacher-matrix.csv",
    }
    assert expected_tables <= {path.name for path in (tmp_path / "tables").iterdir()}
    rendered = (tmp_path / "analysis.md").read_text(encoding="utf-8")
    assert "COMPLETED_WITH_SYNTHETIC_DATA" in rendered
    assert "absolute factual correctness" in rendered


def test_analysis_refuses_empty_reviews(sample_rows: list[dict]) -> None:
    with pytest.raises(tooling.EvaluationValidationError, match="NOT YET COLLECTED"):
        tooling.analyze_reviews(sample_rows, [])
