"""Deterministic normalized-token duplicate detection."""

import re
import unicodedata

from app.generation.models import GeneratedQuestion, StyleExample, ValidationIssue


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value).casefold()
    return " ".join(re.findall(r"[\w]+", value, flags=re.UNICODE))


def token_jaccard(left: str, right: str) -> float:
    a = set(normalize_text(left).split())
    b = set(normalize_text(right).split())
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def _option_signature(question: GeneratedQuestion) -> tuple[str, ...]:
    return tuple(sorted(normalize_text(option.text) for option in question.options))


def duplicate_issues(
    questions: list[GeneratedQuestion],
    style_examples: list[StyleExample],
    threshold: float,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for index, current in enumerate(questions):
        for previous in range(index):
            score = token_jaccard(current.question, questions[previous].question)
            same_options = _option_signature(current) == _option_signature(
                questions[previous]
            )
            if score >= threshold or same_options:
                issues.append(
                    ValidationIssue(
                        code="DUPLICATE_WITHIN_BATCH",
                        message=f"question resembles generated item {previous + 1}",
                        question_index=index,
                    )
                )
                break
        for example in style_examples:
            if token_jaccard(current.question, example.question) >= threshold:
                issues.append(
                    ValidationIssue(
                        code="DUPLICATE_STYLE_EXAMPLE",
                        message="question is too similar to a style example",
                        question_index=index,
                    )
                )
                break
    return issues
