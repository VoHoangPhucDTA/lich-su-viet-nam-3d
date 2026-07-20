"""Domain exceptions with actionable corpus error details."""

from pathlib import Path


class CorpusError(Exception):
    """Base class for corpus processing errors."""


class CorpusFileNotFoundError(CorpusError):
    def __init__(self, path: Path) -> None:
        self.path = path
        super().__init__(f"Corpus file does not exist: {path}")


class CorpusLineError(CorpusError):
    def __init__(self, line_number: int, message: str) -> None:
        self.line_number = line_number
        super().__init__(f"Corpus line {line_number}: {message}")


class CorpusJsonDecodeError(CorpusLineError):
    """Raised when a JSONL line is not valid JSON."""


class CorpusSchemaError(CorpusLineError):
    """Raised when a JSON object does not match the corpus schema."""
