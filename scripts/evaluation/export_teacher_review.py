from __future__ import annotations

import argparse
from pathlib import Path

from teacher_evaluation import export_review_package, load_jsonl


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a blinded, offline teacher review package")
    parser.add_argument("--sample", type=Path, default=Path("artifacts/teacher-evaluation/sample.jsonl"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/teacher-evaluation"))
    parser.add_argument("--evaluator-id", required=True, help="Pseudonym such as GV01")
    parser.add_argument("--seed", required=True, help="Study seed; value is not written to output")
    args = parser.parse_args()
    report = export_review_package(load_jsonl(args.sample), args.output_dir, args.evaluator_id, args.seed)
    print(f"Exported {report['items']} blinded items for {report['evaluatorId']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
