"""Validate the curated factual-guard registry against the canonical corpus."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.factual_guard.registry import (  # noqa: E402
    load_critical_fact_registry,
    validate_critical_fact_registry,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--registry",
        type=Path,
        default=SERVICE_ROOT / "data/factual_guard/critical_facts_v1.json",
    )
    parser.add_argument(
        "--corpus",
        type=Path,
        default=SERVICE_ROOT / "data/corpus/sgk_chunks.jsonl",
    )
    args = parser.parse_args()
    registry = load_critical_fact_registry(args.registry.resolve())
    result = validate_critical_fact_registry(registry, args.corpus.resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
