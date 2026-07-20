"""Deterministic fake provider used only by tests."""

from collections import deque

from app.generation.schemas import GeneratedQuestionBatch


class FakeGenerationProvider:
    def __init__(self, outcomes: list[GeneratedQuestionBatch | Exception]) -> None:
        self.model = "fake-generation-model"
        self.outcomes = deque(outcomes)
        self.prompts: list[str] = []
        self.closed = False

    def generate_structured(self, prompt: str) -> GeneratedQuestionBatch:
        self.prompts.append(prompt)
        if not self.outcomes:
            raise RuntimeError("fake provider has no configured outcome")
        value = self.outcomes.popleft()
        if isinstance(value, Exception):
            raise value
        return value

    def close(self) -> None:
        self.closed = True
