"""Provider abstraction for network-free generation tests."""

from typing import Protocol

from app.generation.schemas import GeneratedQuestionBatch


class GenerationProvider(Protocol):
    model: str

    def generate_structured(self, prompt: str) -> GeneratedQuestionBatch: ...

    def close(self) -> None: ...
