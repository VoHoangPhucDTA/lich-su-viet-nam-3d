"""Validated, reproducible teacher-evaluation export/import/analysis helpers."""

from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import math
import random
import re
import statistics
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any, Iterable

MANIFEST_VERSION = "teacher-evaluation-v1"
SCHEMA_VERSION = "teacher-review-v1"
CATEGORIES = {
    "EVENT_TIME", "CAUSE", "DEVELOPMENT", "RESULT", "SIGNIFICANCE",
    "PERSON", "COMPARISON", "ASSESSMENT",
}
DIFFICULTIES = {"EASY", "MEDIUM", "HARD"}
RUBRIC_FIELDS = (
    "historicalFactualCorrectness",
    "groundingSourceConsistency",
    "questionClarity",
    "singleAnswerUnambiguity",
    "distractorQuality",
    "explanationQuality",
    "difficultyAppropriateness",
    "pedagogicalUsefulness",
)
DECISIONS = (
    "ACCEPT_AS_IS", "ACCEPT_WITH_MINOR_EDIT", "REQUIRES_MAJOR_EDIT", "REJECT"
)
CRITICAL_ISSUES = (
    "FACTUAL_ERROR", "UNSUPPORTED_BY_SOURCE", "MULTIPLE_CORRECT_OPTIONS",
    "NO_CORRECT_OPTION", "AMBIGUOUS_WORDING", "WEAK_DISTRACTORS",
    "INCORRECT_EXPLANATION", "DIFFICULTY_MISMATCH", "INAPPROPRIATE_FOR_GRADE",
    "SOURCE_MISMATCH", "OTHER",
)
EVALUATOR_PATTERN = re.compile(r"^GV[0-9]{2,3}$")
PII_FIELDS = {"name", "fullName", "email", "phone", "phoneNumber", "address"}
CSV_FIELDS = (
    "evaluatorId", "evaluationItemId", "sampleManifestHash", "generatedQuestionHash",
    *RUBRIC_FIELDS, "overallDecision", "criticalIssues", "comment",
)


class EvaluationValidationError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_value(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EvaluationValidationError(f"invalid JSONL at line {number}") from exc
        if not isinstance(value, dict):
            raise EvaluationValidationError(f"line {number} must contain an object")
        rows.append(value)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(canonical_json(row) + "\n" for row in rows), encoding="utf-8", newline="\n")


def validate_manifest(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if len(rows) != 36:
        raise EvaluationValidationError("teacher-evaluation-v1 must contain exactly 36 items")
    required = {
        "evaluationItemId", "requestId", "manifestVersion", "benchmarkCaseId",
        "grade", "lessonNumber", "difficulty", "category", "query", "count",
        "topK", "expectedSourceDocumentIds",
    }
    ids: set[str] = set()
    request_ids: set[str] = set()
    distribution = {"byGrade": Counter(), "byDifficulty": Counter(), "byCategory": Counter()}
    per_grade_difficulty: dict[int, Counter[str]] = defaultdict(Counter)
    for index, row in enumerate(rows, start=1):
        missing = sorted(required - set(row))
        if missing:
            raise EvaluationValidationError(f"item {index} missing fields: {','.join(missing)}")
        item_id = str(row["evaluationItemId"])
        request_id = str(row["requestId"])
        if item_id in ids:
            raise EvaluationValidationError(f"duplicate evaluationItemId: {item_id}")
        if request_id in request_ids:
            raise EvaluationValidationError(f"duplicate requestId: {request_id}")
        if row["manifestVersion"] != MANIFEST_VERSION:
            raise EvaluationValidationError(f"unsupported manifest version for {item_id}")
        if row["grade"] not in {10, 11, 12} or row["difficulty"] not in DIFFICULTIES:
            raise EvaluationValidationError(f"invalid grade/difficulty for {item_id}")
        if row["category"] not in CATEGORIES:
            raise EvaluationValidationError(f"invalid category for {item_id}")
        if row["count"] != 1 or not 1 <= int(row["topK"]) <= 10:
            raise EvaluationValidationError(f"invalid generation bounds for {item_id}")
        if not str(row["query"]).strip() or not row["expectedSourceDocumentIds"]:
            raise EvaluationValidationError(f"missing fixed query/source evidence for {item_id}")
        ids.add(item_id)
        request_ids.add(request_id)
        distribution["byGrade"][str(row["grade"])] += 1
        distribution["byDifficulty"][row["difficulty"]] += 1
        distribution["byCategory"][row["category"]] += 1
        per_grade_difficulty[int(row["grade"])][row["difficulty"]] += 1
    if distribution["byGrade"] != Counter({"10": 12, "11": 12, "12": 12}):
        raise EvaluationValidationError("manifest must contain 12 items per grade")
    for grade in (10, 11, 12):
        if per_grade_difficulty[grade] != Counter({"EASY": 4, "MEDIUM": 4, "HARD": 4}):
            raise EvaluationValidationError(f"grade {grade} must contain 4 items per difficulty")
    return {
        "manifestVersion": MANIFEST_VERSION,
        "sampleSize": len(rows),
        "manifestSha256": sha256_value(rows),
        "distribution": {key: dict(sorted(value.items())) for key, value in distribution.items()},
    }


def validate_sample(rows: list[dict[str, Any]], manifest_rows: list[dict[str, Any]]) -> dict[str, Any]:
    manifest = {row["evaluationItemId"]: row for row in manifest_rows}
    seen: set[str] = set()
    for row in rows:
        item_id = row.get("evaluationItemId")
        if item_id not in manifest or item_id in seen:
            raise EvaluationValidationError(f"invalid or duplicate sample item: {item_id}")
        seen.add(item_id)
        if row.get("status") == "GENERATED":
            required = {
                "generatedQuestionHash", "generationCacheIdentity", "sourceChunkIds",
                "sourceChunkHashes", "corpusSha256", "generationModel", "promptVersion",
                "schemaVersion", "question", "options", "correctOptionId", "explanation",
            }
            missing = sorted(required - set(row))
            if missing:
                raise EvaluationValidationError(f"generated item {item_id} missing {','.join(missing)}")
            if len(row["sourceChunkIds"]) != len(row["sourceChunkHashes"]):
                raise EvaluationValidationError(f"source identity mismatch for {item_id}")
            identity = {
                "question": row["question"], "options": row["options"],
                "correctOptionId": row["correctOptionId"], "explanation": row["explanation"],
                "difficulty": row["difficulty"], "sourceChunkIds": row["sourceChunkIds"],
            }
            if sha256_value(identity) != row["generatedQuestionHash"]:
                raise EvaluationValidationError(f"generated question hash mismatch for {item_id}")
        elif row.get("status") != "GENERATION_FAILED":
            raise EvaluationValidationError(f"invalid sample status for {item_id}")
    return {"sampleItems": len(rows), "generated": sum(row["status"] == "GENERATED" for row in rows)}


def randomized_items(rows: list[dict[str, Any]], evaluator_id: str, seed: str) -> list[dict[str, Any]]:
    if not EVALUATOR_PATTERN.fullmatch(evaluator_id):
        raise EvaluationValidationError("evaluator ID must match GV01/GV02/... pseudonym format")
    derived = int(hashlib.sha256(f"{seed}\0{evaluator_id}".encode()).hexdigest(), 16)
    shuffled = list(rows)
    random.Random(derived).shuffle(shuffled)
    return shuffled


def _blinded_item(row: dict[str, Any], display_order: int) -> dict[str, Any]:
    return {
        "displayOrder": display_order,
        "evaluationItemId": row["evaluationItemId"],
        "grade": row["grade"],
        "lessonNumber": row["lessonNumber"],
        "difficulty": row["difficulty"],
        "category": row["category"],
        "question": row["question"],
        "options": row["options"],
        "correctOptionId": row["correctOptionId"],
        "explanation": row["explanation"],
        "sources": row.get("sources", []),
        "generatedQuestionHash": row["generatedQuestionHash"],
    }


def export_review_package(
    sample_rows: list[dict[str, Any]], output_dir: Path, evaluator_id: str, seed: str
) -> dict[str, Any]:
    generated = [row for row in sample_rows if row.get("status") == "GENERATED"]
    if not generated:
        raise EvaluationValidationError("sample has no generated items to export")
    sample_hash = sha256_value(sample_rows)
    ordered = randomized_items(generated, evaluator_id, seed)
    blinded = [_blinded_item(row, index) for index, row in enumerate(ordered, start=1)]
    output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_dir / "review-items.jsonl", blinded)

    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for row in blinded:
        writer.writerow({
            "evaluatorId": evaluator_id,
            "evaluationItemId": row["evaluationItemId"],
            "sampleManifestHash": sample_hash,
            "generatedQuestionHash": row["generatedQuestionHash"],
        })
    (output_dir / "review-form.csv").write_text("\ufeff" + csv_buffer.getvalue(), encoding="utf-8", newline="")

    cards = []
    for row in blinded:
        options = "".join(
            f"<li><strong>{html.escape(str(option['id']))}.</strong> {html.escape(str(option['text']))}</li>"
            for option in row["options"]
        )
        sources = "".join(
            f"<li>{html.escape(str(source.get('lessonTitle', 'SGK')))} — "
            f"{html.escape(str(source.get('sectionTitle', '')))}: "
            f"{html.escape(str(source.get('excerpt', '')))}</li>"
            for source in row["sources"]
        ) or "<li>Source excerpt unavailable; stop and report package error.</li>"
        cards.append(f"""<article><h2>{row['displayOrder']}. {html.escape(row['evaluationItemId'])}</h2>
<p class="question">{html.escape(str(row['question']))}</p><ol class="options">{options}</ol>
<details><summary>Đối chiếu đáp án, giải thích và nguồn</summary>
<p><b>Đáp án dự kiến:</b> {html.escape(str(row['correctOptionId']))}</p>
<p><b>Giải thích:</b> {html.escape(str(row['explanation']))}</p><ul>{sources}</ul></details></article>""")
    document = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Teacher review {html.escape(evaluator_id)}</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;max-width:1000px;margin:auto;padding:24px}}article{{border:1px solid #bbb;border-radius:8px;padding:18px;margin:20px 0;break-inside:avoid}}.question{{font-weight:650}}details{{margin-top:14px}}@media print{{body{{max-width:none}}article{{page-break-inside:avoid}}}}</style></head>
<body><h1>Gói đánh giá câu hỏi lịch sử</h1><p>Mã người đánh giá: <b>{html.escape(evaluator_id)}</b>. Chấm câu hỏi trước khi mở phần đối chiếu.</p>{''.join(cards)}</body></html>"""
    (output_dir / "review-package.html").write_text(document, encoding="utf-8", newline="\n")
    mapping = [{"displayOrder": row["displayOrder"], "evaluationItemId": row["evaluationItemId"]} for row in blinded]
    (output_dir / "randomization-map.json").write_text(
        json.dumps({"evaluatorId": evaluator_id, "seedIdentity": hashlib.sha256(seed.encode()).hexdigest(), "mapping": mapping}, indent=2) + "\n",
        encoding="utf-8",
    )
    findings = output_dir / "ux-findings.md"
    if not findings.exists():
        findings.write_text(
            "# UX findings from teacher evaluation\n\n"
            "Teacher evaluation: NOT YET COLLECTED\n\n"
            "## Finding template\n\n"
            "- Evidence: TBD\n- Affected items: TBD\n- Severity: TBD\n"
            "- Proposed change: TBD\n- Expected benefit: TBD\n- Risk: TBD\n"
            "- Requires code change: yes/no\n",
            encoding="utf-8",
        )
    return {"evaluatorId": evaluator_id, "items": len(blinded), "sampleManifestHash": sample_hash}


def import_reviews(
    review_csv: Path, sample_rows: list[dict[str, Any]], output_dir: Path
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sample = {row["evaluationItemId"]: row for row in sample_rows if row.get("status") == "GENERATED"}
    expected_sample_hash = sha256_value(sample_rows)
    errors: list[dict[str, Any]] = []
    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    with review_csv.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        pii = sorted(PII_FIELDS & set(reader.fieldnames or []))
        if pii:
            raise EvaluationValidationError(f"PII columns are forbidden: {','.join(pii)}")
        missing_columns = sorted(set(CSV_FIELDS) - set(reader.fieldnames or []))
        if missing_columns:
            raise EvaluationValidationError(f"review CSV missing columns: {','.join(missing_columns)}")
        for line, row in enumerate(reader, start=2):
            row_errors: list[str] = []
            evaluator = (row.get("evaluatorId") or "").strip()
            item_id = (row.get("evaluationItemId") or "").strip()
            if not EVALUATOR_PATTERN.fullmatch(evaluator):
                row_errors.append("INVALID_EVALUATOR_ID")
            item = sample.get(item_id)
            if item is None:
                row_errors.append("UNKNOWN_EVALUATION_ITEM")
            if (evaluator, item_id) in seen:
                row_errors.append("DUPLICATE_EVALUATOR_ITEM")
            if row.get("sampleManifestHash") != expected_sample_hash:
                row_errors.append("SAMPLE_MANIFEST_HASH_MISMATCH")
            if item and row.get("generatedQuestionHash") != item.get("generatedQuestionHash"):
                row_errors.append("GENERATED_QUESTION_HASH_MISMATCH")
            ratings: dict[str, int] = {}
            for field in RUBRIC_FIELDS:
                try:
                    value = int(row.get(field, ""))
                except ValueError:
                    value = 0
                if value not in range(1, 6):
                    row_errors.append(f"INVALID_RATING:{field}")
                ratings[field] = value
            decision = (row.get("overallDecision") or "").strip()
            if decision not in DECISIONS:
                row_errors.append("INVALID_OVERALL_DECISION")
            issues = sorted({part.strip() for part in (row.get("criticalIssues") or "").split(";") if part.strip()})
            invalid_issues = sorted(set(issues) - set(CRITICAL_ISSUES))
            if invalid_issues:
                row_errors.append("INVALID_CRITICAL_ISSUE:" + ",".join(invalid_issues))
            seen.add((evaluator, item_id))
            if row_errors:
                errors.append({"line": line, "evaluationItemId": item_id, "errors": row_errors})
                continue
            normalized.append({
                "schemaVersion": SCHEMA_VERSION, "evaluatorId": evaluator,
                "evaluationItemId": item_id, "sampleManifestHash": expected_sample_hash,
                "generatedQuestionHash": item["generatedQuestionHash"], "ratings": ratings,
                "overallDecision": decision, "criticalIssues": issues,
                "comment": (row.get("comment") or "").strip(),
                "syntheticTestData": bool(item.get("syntheticTestData")),
            })
    report = {
        "status": "PASSED" if not errors else "FAILED",
        "inputRows": len(normalized) + len(errors), "validRows": len(normalized),
        "invalidRows": len(errors), "errors": errors, "containsPii": False,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "import-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "import-validation.md").write_text(
        "# Teacher review import validation\n\n"
        f"- Status: `{report['status']}`\n- Valid rows: {report['validRows']}\n"
        f"- Invalid rows: {report['invalidRows']}\n- PII stored: no\n",
        encoding="utf-8",
    )
    if not errors:
        write_jsonl(output_dir / "results" / "teacher-reviews.jsonl", normalized)
    return normalized, report


def numeric_summary(values: list[int]) -> dict[str, Any]:
    if not values:
        return {"n": 0, "mean": None, "median": None, "standardDeviation": None, "min": None, "max": None, "distribution": {str(i): 0 for i in range(1, 6)}, "ratingAtLeast4Rate": None}
    distribution = Counter(values)
    return {
        "n": len(values), "mean": round(statistics.mean(values), 4),
        "median": statistics.median(values),
        "standardDeviation": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
        "min": min(values), "max": max(values),
        "distribution": {str(i): distribution[i] for i in range(1, 6)},
        "ratingAtLeast4Rate": round(sum(value >= 4 for value in values) / len(values), 6),
    }


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, Any]:
    if total <= 0:
        return {"method": "Wilson 95%", "n": 0, "rate": None, "lower": None, "upper": None}
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return {"method": "Wilson 95%", "n": total, "rate": round(p, 6), "lower": round(max(0, centre - margin), 6), "upper": round(min(1, centre + margin), 6)}


def weighted_kappa(left: list[int], right: list[int]) -> float | None:
    if len(left) != len(right) or not left:
        return None
    n = len(left)
    observed = [[0.0] * 5 for _ in range(5)]
    for a, b in zip(left, right):
        observed[a - 1][b - 1] += 1 / n
    left_dist = [sum(row) for row in observed]
    right_dist = [sum(observed[i][j] for i in range(5)) for j in range(5)]
    observed_disagreement = sum(((i - j) / 4) ** 2 * observed[i][j] for i in range(5) for j in range(5))
    expected_disagreement = sum(((i - j) / 4) ** 2 * left_dist[i] * right_dist[j] for i in range(5) for j in range(5))
    if expected_disagreement == 0:
        return 1.0 if observed_disagreement == 0 else None
    return round(1 - observed_disagreement / expected_disagreement, 6)


def binary_kappa(left: list[bool], right: list[bool]) -> float | None:
    if len(left) != len(right) or not left:
        return None
    agreement = sum(a == b for a, b in zip(left, right)) / len(left)
    pa = sum(left) / len(left)
    pb = sum(right) / len(right)
    expected = pa * pb + (1 - pa) * (1 - pb)
    return None if expected == 1 else round((agreement - expected) / (1 - expected), 6)


def agreement_metrics(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    by_evaluator = defaultdict(dict)
    for review in reviews:
        by_evaluator[review["evaluatorId"]][review["evaluationItemId"]] = review
    evaluators = sorted(by_evaluator)
    if len(evaluators) < 2:
        return {"status": "NOT_COMPUTED", "reason": "at least two evaluators are required", "evaluatorCount": len(evaluators)}
    pairs = []
    for first, second in combinations(evaluators, 2):
        common = sorted(set(by_evaluator[first]) & set(by_evaluator[second]))
        if not common:
            continue
        criteria = {}
        for field in RUBRIC_FIELDS:
            left = [by_evaluator[first][item]["ratings"][field] for item in common]
            right = [by_evaluator[second][item]["ratings"][field] for item in common]
            criteria[field] = {
                "n": len(common), "exactAgreement": round(sum(a == b for a, b in zip(left, right)) / len(common), 6),
                "adjacentAgreement": round(sum(abs(a - b) <= 1 for a, b in zip(left, right)) / len(common), 6),
                "quadraticWeightedCohenKappa": weighted_kappa(left, right),
            }
        issue_left = [bool(by_evaluator[first][item]["criticalIssues"]) for item in common]
        issue_right = [bool(by_evaluator[second][item]["criticalIssues"]) for item in common]
        pairs.append({"evaluators": [first, second], "commonItems": len(common), "criteria": criteria, "anyCriticalIssueCohenKappa": binary_kappa(issue_left, issue_right)})
    return {
        "status": "COMPUTED" if pairs else "NOT_COMPUTED", "evaluatorCount": len(evaluators),
        "method": "pairwise quadratic-weighted Cohen kappa for ordinal ratings; pairwise Cohen kappa for binary issues; missing pairs omitted",
        "pairs": pairs,
    }


def warning_confusion(sample_rows: list[dict[str, Any]], reviews: list[dict[str, Any]]) -> dict[str, Any]:
    sample = {row["evaluationItemId"]: row for row in sample_rows}
    by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for review in reviews:
        by_item[review["evaluationItemId"]].append(review)
    eligible = {item: values for item, values in by_item.items() if len(values) >= 2 and item in sample}
    if not eligible:
        return {"status": "INSUFFICIENT_DATA", "definition": "requires at least two teacher reviews per item"}
    tp = fp = fn = tn = 0
    for item, values in eligible.items():
        flagged = bool(sample[item].get("heuristicWarnings"))
        found_issue = sum(bool(value["criticalIssues"]) for value in values) * 2 >= len(values)
        if flagged and found_issue: tp += 1
        elif flagged: fp += 1
        elif found_issue: fn += 1
        else: tn += 1
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    return {
        "status": "COMPUTED", "definition": "warning present versus majority any-critical-issue among items with >=2 reviews",
        "matrix": {"warningAndIssue": tp, "warningAndNoIssue": fp, "noWarningAndIssue": fn, "noWarningAndNoIssue": tn},
        "precision": None if precision is None else round(precision, 6),
        "recall": None if recall is None else round(recall, 6),
        "falsePositiveRate": round(fp / (fp + tn), 6) if fp + tn else None,
        "falseNegativeRate": round(fn / (fn + tp), 6) if fn + tp else None,
    }


def analyze_reviews(sample_rows: list[dict[str, Any]], reviews: list[dict[str, Any]]) -> dict[str, Any]:
    if not reviews:
        raise EvaluationValidationError("Teacher evaluation: NOT YET COLLECTED")
    sample = {row["evaluationItemId"]: row for row in sample_rows}
    rubric = {field: numeric_summary([review["ratings"][field] for review in reviews]) for field in RUBRIC_FIELDS}
    decisions = Counter(review["overallDecision"] for review in reviews)
    issues = Counter(issue for review in reviews for issue in review["criticalIssues"])
    splits: dict[str, dict[str, Any]] = {}
    for dimension, getter in (
        ("grade", lambda review: str(sample[review["evaluationItemId"]]["grade"])),
        ("difficulty", lambda review: sample[review["evaluationItemId"]]["difficulty"]),
        ("category", lambda review: sample[review["evaluationItemId"]]["category"]),
        ("evaluator", lambda review: review["evaluatorId"]),
    ):
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for review in reviews:
            grouped[getter(review)].append(review)
        splits[dimension] = {
            key: {field: numeric_summary([review["ratings"][field] for review in values]) for field in RUBRIC_FIELDS}
            for key, values in sorted(grouped.items())
        }
    total = len(reviews)
    critical_count = sum(bool(review["criticalIssues"]) for review in reviews)
    acceptance = {
        decision: {"count": decisions[decision], "interval": wilson_interval(decisions[decision], total)}
        for decision in DECISIONS
    }
    key_issue_rates = {
        "anyCriticalIssue": wilson_interval(critical_count, total),
        "factualError": wilson_interval(sum("FACTUAL_ERROR" in review["criticalIssues"] for review in reviews), total),
        "unsupportedSource": wilson_interval(sum("UNSUPPORTED_BY_SOURCE" in review["criticalIssues"] for review in reviews), total),
        "ambiguity": wilson_interval(sum("AMBIGUOUS_WORDING" in review["criticalIssues"] for review in reviews), total),
        "multipleOrNoCorrectOption": wilson_interval(sum(bool({"MULTIPLE_CORRECT_OPTIONS", "NO_CORRECT_OPTION"} & set(review["criticalIssues"])) for review in reviews), total),
        "difficultyMismatch": wilson_interval(sum("DIFFICULTY_MISMATCH" in review["criticalIssues"] for review in reviews), total),
    }
    return {
        "status": "COMPLETED_WITH_SYNTHETIC_DATA" if any(review.get("syntheticTestData") for review in reviews) else "COMPLETED",
        "teacherEvaluationClaim": "Ratings do not prove absolute factual correctness.",
        "reviewCount": total, "evaluatorCount": len({review["evaluatorId"] for review in reviews}),
        "rubric": rubric, "splits": splits, "overallDecisions": acceptance,
        "criticalIssueFrequencies": dict(sorted(issues.items())), "criticalIssueRates": key_issue_rates,
        "interRaterAgreement": agreement_metrics(reviews),
        "warningVsTeacher": warning_confusion(sample_rows, reviews),
        "limitations": ["Small samples must not be generalized beyond the evaluated items.", "Source provenance does not prove absolute factual correctness."],
    }


def write_analysis(report: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tables = output_dir / "tables"
    tables.mkdir(parents=True, exist_ok=True)
    (output_dir / "analysis.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Teacher evaluation analysis", "", f"- Status: `{report['status']}`", f"- Reviews: {report['reviewCount']}", f"- Evaluators: {report['evaluatorCount']}", "", "This report does not claim absolute factual correctness.", "", "## Rubric summary", ""]
    for field, value in report["rubric"].items():
        lines.append(f"- {field}: N={value['n']}, mean={value['mean']}, median={value['median']}, >=4={value['ratingAtLeast4Rate']}")
    lines.extend(["", "## Inter-rater agreement", "", f"- Status: {report['interRaterAgreement']['status']}", "", "## Warning correlation", "", f"- Status: {report['warningVsTeacher']['status']}", "", "## Limitations", "", "- Small sample; do not over-generalize.", "- Provenance is not proof of factual correctness.", ""])
    (output_dir / "analysis.md").write_text("\n".join(lines), encoding="utf-8")
    table_specs = {
        "overall-rubric-summary.csv": [(field, values["n"], values["mean"], values["median"], values["standardDeviation"], values["ratingAtLeast4Rate"]) for field, values in report["rubric"].items()],
        "overall-decisions.csv": [(key, value["count"], value["interval"]["rate"], value["interval"]["lower"], value["interval"]["upper"]) for key, value in report["overallDecisions"].items()],
        "critical-issue-frequencies.csv": [(key, value) for key, value in report["criticalIssueFrequencies"].items()],
    }
    headers = {
        "overall-rubric-summary.csv": ["criterion", "n", "mean", "median", "standardDeviation", "ratingAtLeast4Rate"],
        "overall-decisions.csv": ["decision", "count", "rate", "wilsonLower", "wilsonUpper"],
        "critical-issue-frequencies.csv": ["issue", "count"],
    }
    for name, rows in table_specs.items():
        with (tables / name).open("w", encoding="utf-8-sig", newline="") as output:
            writer = csv.writer(output)
            writer.writerow(headers[name])
            writer.writerows(rows)
    for dimension in ("grade", "difficulty", "category", "evaluator"):
        with (tables / f"summary-by-{dimension}.csv").open("w", encoding="utf-8-sig", newline="") as output:
            writer = csv.writer(output)
            writer.writerow([dimension, "criterion", "n", "mean", "median", "standardDeviation", "ratingAtLeast4Rate"])
            for group, criteria in report["splits"][dimension].items():
                for criterion, values in criteria.items():
                    writer.writerow([group, criterion, values["n"], values["mean"], values["median"], values["standardDeviation"], values["ratingAtLeast4Rate"]])
    with (tables / "inter-rater-agreement.csv").open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["evaluators", "criterion", "n", "exactAgreement", "adjacentAgreement", "quadraticWeightedCohenKappa"])
        for pair in report["interRaterAgreement"].get("pairs", []):
            for criterion, values in pair["criteria"].items():
                writer.writerow(["/".join(pair["evaluators"]), criterion, values["n"], values["exactAgreement"], values["adjacentAgreement"], values["quadraticWeightedCohenKappa"]])
    matrix = report["warningVsTeacher"].get("matrix", {})
    with (tables / "warning-vs-teacher-matrix.csv").open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["cell", "count"])
        writer.writerows(sorted(matrix.items()))
