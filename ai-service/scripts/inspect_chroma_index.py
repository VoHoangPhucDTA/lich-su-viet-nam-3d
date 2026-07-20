"""Inspect the configured persistent Chroma collection without modifying it."""

import json

from scripts.build_chroma_index import create_service
from app.vectorstore.models import VectorstoreError


def main() -> int:
    service = create_service()
    try:
        inspection = service.inspect()
    except (VectorstoreError, OSError, ValueError) as exc:
        print(f"Chroma index inspection FAILED: {type(exc).__name__}: {exc}")
        return 2
    print(json.dumps(inspection.model_dump(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
