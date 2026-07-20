"""Run one read-only production retrieval query."""

import argparse
import json
import sys

from pydantic import ValidationError

from app.config import get_settings
from app.retrieval.models import RetrievalError, RetrievalRequest
from app.retrieval.service import create_retrieval_service


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True)
    parser.add_argument("--grade", type=int)
    parser.add_argument("--lesson-number", type=int)
    parser.add_argument("--document-id")
    parser.add_argument("--top-k", type=int)
    parser.add_argument("--json", dest="json_output", action="store_true")
    parser.add_argument("--show-context", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = create_parser().parse_args(argv)
    try:
        request = RetrievalRequest(
            query=args.query,
            grade=args.grade,
            lessonNumber=args.lesson_number,
            documentId=args.document_id,
            topK=args.top_k,
        )
        service = create_retrieval_service(get_settings())
        try:
            response = service.retrieve(request)
        finally:
            service.close()
    except (ValidationError, RetrievalError, ValueError, OSError) as exc:
        print(f"Retrieval FAILED: {type(exc).__name__}: {exc}")
        return 2

    payload = response.model_dump(by_alias=True)
    if not args.show_context:
        payload["factContext"]["text"] = "[hidden; pass --show-context]"
    if args.json_output or args.show_context:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(
            f"Results: {response.result_count}/{response.top_k}; "
            f"candidates={response.candidate_count}"
        )
        for result in response.results:
            print(
                f"{result.rank}. {result.chunk_id} "
                f"grade={result.grade} lesson={result.lesson_number} "
                f"distance={result.distance:.6f}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
