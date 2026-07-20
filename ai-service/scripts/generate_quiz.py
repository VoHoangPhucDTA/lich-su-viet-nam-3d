"""Generate grounded MCQs through retrieval and structured Gemini output."""

import argparse
import json
from pathlib import Path
import sys

from pydantic import TypeAdapter, ValidationError

from app.config import get_settings
from app.generation.models import GenerationError, GenerationRequest, StyleExample
from app.generation.service import create_generation_service
from app.retrieval.models import RetrievalError


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True)
    parser.add_argument("--grade", type=int)
    parser.add_argument("--lesson-number", type=int)
    parser.add_argument("--document-id")
    parser.add_argument("--difficulty", choices=["EASY", "MEDIUM", "HARD"], default="MEDIUM")
    parser.add_argument("--count", type=int)
    parser.add_argument("--top-k", type=int)
    parser.add_argument("--style-examples-file", type=Path)
    parser.add_argument("--json", dest="json_output", action="store_true")
    parser.add_argument("--show-sources", action="store_true")
    return parser


def _load_styles(path: Path | None) -> list[StyleExample]:
    if path is None:
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[StyleExample]).validate_python(value)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = create_parser().parse_args(argv)
    try:
        request = GenerationRequest(
            query=args.query,
            grade=args.grade,
            lessonNumber=args.lesson_number,
            documentId=args.document_id,
            difficulty=args.difficulty,
            count=args.count,
            topK=args.top_k,
            styleExamples=_load_styles(args.style_examples_file),
        )
        service = create_generation_service(get_settings())
        try:
            response = service.generate(request)
        finally:
            service.close()
    except (OSError, json.JSONDecodeError, ValidationError, ValueError, GenerationError, RetrievalError) as exc:
        print(f"Generation FAILED: {type(exc).__name__}: {exc}")
        return 2
    payload = response.model_dump(by_alias=True)
    if not args.show_sources:
        payload["sources"] = [{"chunkId": item["chunkId"]} for item in payload["sources"]]
    if args.json_output or args.show_sources:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(
            f"Generated: {response.metadata.generated_count}/"
            f"{response.metadata.requested_count}; repairs={response.metadata.repair_attempts}"
        )
        for index, question in enumerate(response.questions, start=1):
            print(f"{index}. {question.question}")
            for option in question.options:
                print(f"   {option.id}. {option.text}")
            print(f"   Correct: {question.correct_option_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
