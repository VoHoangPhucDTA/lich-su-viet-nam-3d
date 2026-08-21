"""Import an owner-completed RAG-01 review template without provider access."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.evaluation.rag01 import validate_human_review_import  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, required=True, help="JSON review template completed by an owner"
    )
    parser.add_argument(
        "--queue", type=Path, required=True, help="The exact pair-aware human-review queue JSON"
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    queue_payload: Any = json.loads(args.queue.read_text(encoding="utf-8"))
    queue_items = queue_payload.get("items", []) if isinstance(queue_payload, dict) else queue_payload
    if not isinstance(queue_items, list) or not all(isinstance(item, dict) for item in queue_items):
        raise ValueError("queue must be a JSON list or an object with an items list")

    payload: Any = json.loads(args.input.read_text(encoding="utf-8"))
    reviews = payload.get("reviews", []) if isinstance(payload, dict) else payload
    if not isinstance(reviews, list) or not all(isinstance(item, dict) for item in reviews):
        raise ValueError("input must be a JSON list or an object with a reviews list")

    output_dir = args.output_dir.resolve()
    aggregate = validate_human_review_import(queue_items, reviews)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "human-review-aggregate.json").write_text(
        json.dumps(aggregate, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    markdown = [
        "# RAG-01 human review aggregate",
        "",
        f"Expected queue count: {aggregate['expectedQueueCount']}",
        f"Reviewed count: {aggregate['reviewedCount']}",
        f"Missing review count: {aggregate['missingReviewCount']}",
        f"Complete: {aggregate['complete']}",
        f"Adjudicated pass: {aggregate['adjudicatedPassCount']}",
        f"Adjudicated fail: {aggregate['adjudicatedFailCount']}",
        "",
        "By mode:",
        *[
            f"- {mode}: reviewed={summary['reviewed']}; pass={summary['pass']}; "
            f"fail={summary['fail']}; passRate={summary['passRate']}"
            for mode, summary in aggregate["byMode"].items()
        ],
        "",
        "Provider calls: 0 (offline import)",
    ]
    (output_dir / "human-review-aggregate.md").write_text("\n".join(markdown) + "\n", encoding="utf-8")
    print(json.dumps(aggregate, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
