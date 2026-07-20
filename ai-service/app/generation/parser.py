"""Strict structured-output parsing without regex repair."""

from pydantic import ValidationError

from app.generation.models import GenerationOutputError
from app.generation.schemas import GeneratedQuestionBatch


def parse_generation_json(raw: str) -> GeneratedQuestionBatch:
    value = raw.strip()
    if not value:
        raise GenerationOutputError("EMPTY_RESPONSE")
    if "```" in value:
        raise GenerationOutputError("MARKDOWN_FENCE_NOT_ALLOWED")
    try:
        return GeneratedQuestionBatch.model_validate_json(value)
    except ValidationError as exc:
        raise GenerationOutputError("INVALID_STRUCTURED_OUTPUT") from exc
