"""Deterministic structural, source, and grounding heuristics."""

import re
from typing import Literal

from app.config import Settings
from app.generation.duplicate_checker import duplicate_issues, normalize_text
from app.generation.models import (
    GeneratedQuestion,
    GenerationRequest,
    ValidationIssue,
    ValidationSummary,
)
from app.retrieval.models import RetrievalResult

FORBIDDEN_CHOICES = (
    "tất cả các đáp án",
    "cả a và b",
    "không có đáp án",
)

PROMPT_SCAFFOLDING_MARKERS = (
    "fact context",
    "style example",
    "style examples",
    "source chunk",
    "source id",
    "chunk id",
    "the provided context",
    "the context above",
    "the passage above",
    "theo fact context",
    "theo đoạn trích trên",
    "theo đoạn trích được cung cấp",
    "theo đoạn văn trên",
    "theo tư liệu trên",
    "theo nội dung được cung cấp",
    "đoạn văn chỉ rõ",
    "tư liệu trên cho biết",
)


def find_prompt_scaffolding_markers(value: str) -> set[str]:
    """Return precise normalized prompt references in student-visible text."""

    normalized = normalize_text(value)
    return {marker for marker in PROMPT_SCAFFOLDING_MARKERS if normalize_text(marker) in normalized}


def validate_questions(
    questions: list[GeneratedQuestion],
    request: GenerationRequest,
    sources: list[RetrievalResult],
    settings: Settings,
) -> tuple[list[GeneratedQuestion], ValidationSummary]:
    source_map = {source.chunk_id: source for source in sources}
    issues: list[ValidationIssue] = []
    invalid_indexes: set[int] = set()
    normalized_questions = list(questions)
    for index, question in enumerate(questions):
        errors: list[ValidationIssue] = []
        ids = [option.id for option in question.options]
        texts = [normalize_text(option.text) for option in question.options]
        if ids != ["A", "B", "C", "D"]:
            errors.append(
                ValidationIssue(
                    code="OPTION_IDS_INVALID",
                    message="options must be ordered A-D",
                    question_index=index,
                )
            )
        if len(set(texts)) != 4:
            errors.append(
                ValidationIssue(
                    code="DUPLICATE_OPTION",
                    message="option text must be distinct",
                    question_index=index,
                )
            )
        if len(question.question) > settings.quiz_max_question_length:
            errors.append(
                ValidationIssue(
                    code="QUESTION_TOO_LONG",
                    message="question exceeds limit",
                    question_index=index,
                )
            )
        if any(len(option.text) > settings.quiz_max_option_length for option in question.options):
            errors.append(
                ValidationIssue(
                    code="OPTION_TOO_LONG", message="option exceeds limit", question_index=index
                )
            )
        if len(question.explanation) > settings.quiz_max_explanation_length:
            errors.append(
                ValidationIssue(
                    code="EXPLANATION_TOO_LONG",
                    message="explanation exceeds limit",
                    question_index=index,
                )
            )
        if question.difficulty != request.difficulty:
            issues.append(
                ValidationIssue(
                    code="DIFFICULTY_MISMATCH",
                    message="question difficulty was normalized to the request",
                    question_index=index,
                    severity="WARNING",
                )
            )
            normalized_questions[index] = question.model_copy(update={"difficulty": request.difficulty})
        visible_fields = {
            "question": question.question,
            "explanation": question.explanation,
            **{f"option.{option.id}": option.text for option in question.options},
        }
        scaffold_hits = {
            field: sorted(find_prompt_scaffolding_markers(value))
            for field, value in visible_fields.items()
            if find_prompt_scaffolding_markers(value)
        }
        if scaffold_hits:
            errors.append(
                ValidationIssue(
                    code="PROMPT_SCAFFOLDING_LEAK",
                    message=(
                        "student-visible content references hidden prompt structure: "
                        + ", ".join(sorted(scaffold_hits))
                    ),
                    question_index=index,
                )
            )
        if (
            "```" in question.question
            or "```" in question.explanation
            or any("```" in option.text for option in question.options)
        ):
            errors.append(
                ValidationIssue(
                    code="MARKDOWN_FENCE_NOT_ALLOWED",
                    message="fields must not contain code fences",
                    question_index=index,
                )
            )
        if any(
            phrase in normalize_text(" ".join(option.text for option in question.options))
            for phrase in FORBIDDEN_CHOICES
        ):
            errors.append(
                ValidationIssue(
                    code="FORBIDDEN_OPTION",
                    message="composite/all/none option is forbidden",
                    question_index=index,
                )
            )
        if len(set(question.source_chunk_ids)) != len(question.source_chunk_ids):
            errors.append(
                ValidationIssue(
                    code="DUPLICATE_SOURCE_ID",
                    message="source IDs must be unique",
                    question_index=index,
                )
            )
        if not set(question.source_chunk_ids) <= set(source_map):
            errors.append(
                ValidationIssue(
                    code="UNKNOWN_SOURCE_ID",
                    message="source ID is outside Fact Context",
                    question_index=index,
                )
            )
        cited_text = "\n".join(
            "\n".join(
                (
                    source_map[source_id].lesson_title,
                    source_map[source_id].section_title,
                    source_map[source_id].text,
                )
            )
            for source_id in question.source_chunk_ids
            if source_id in source_map
        )
        correct = next(
            (option.text for option in question.options if option.id == question.correct_option_id), ""
        )
        claims = f"{question.question} {correct} {question.explanation}"
        for year in set(re.findall(r"\b(?:1[0-9]{3}|20[0-9]{2})\b", claims)):
            if year not in cited_text:
                issues.append(
                    ValidationIssue(
                        code="DATE_EVIDENCE_WARNING",
                        message=f"year {year} is absent from cited source",
                        question_index=index,
                        severity="WARNING",
                    )
                )
        proper_names = set(re.findall(r"\b(?:[A-ZĐ][\wÀ-ỹ-]+\s+){1,3}[A-ZĐ][\wÀ-ỹ-]+", claims))
        for name in proper_names:
            if name not in cited_text and len(name) >= 8:
                issues.append(
                    ValidationIssue(
                        code="PROPER_NAME_EVIDENCE_WARNING",
                        message=f"name '{name}' is absent from cited source",
                        question_index=index,
                        severity="WARNING",
                    )
                )
        if errors:
            invalid_indexes.add(index)
            issues.extend(errors)
    duplicate_errors = duplicate_issues(
        normalized_questions,
        request.style_examples,
        settings.quiz_duplicate_similarity_threshold,
    )
    issues.extend(duplicate_errors)
    invalid_indexes.update(
        issue.question_index for issue in duplicate_errors if issue.question_index is not None
    )
    valid = [question for index, question in enumerate(normalized_questions) if index not in invalid_indexes]
    has_errors = any(issue.severity == "ERROR" for issue in issues)
    status: Literal["PASSED", "PASSED_WITH_WARNINGS", "FAILED"] = (
        "FAILED" if has_errors and not valid else "PASSED_WITH_WARNINGS" if issues else "PASSED"
    )
    if valid and has_errors:
        status = "PASSED_WITH_WARNINGS"
    return valid, ValidationSummary(status=status, issues=issues)
