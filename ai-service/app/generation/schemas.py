"""Strict schema sent to and parsed from Gemini structured output."""

from pydantic import Field

from app.generation.models import GeneratedQuestion, StrictCamelModel


class GeneratedQuestionBatch(StrictCamelModel):
    questions: list[GeneratedQuestion] = Field(min_length=1)
