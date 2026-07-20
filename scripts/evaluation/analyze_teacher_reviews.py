from __future__ import annotations

import argparse
from pathlib import Path

from teacher_evaluation import (
    EvaluationValidationError,
    analyze_reviews,
    load_jsonl,
    write_analysis,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze validated teacher reviews")
    parser.add_argument("--sample", type=Path, default=Path("artifacts/teacher-evaluation/sample.jsonl"))
    parser.add_argument("--reviews", type=Path, default=Path("artifacts/teacher-evaluation/results/teacher-reviews.jsonl"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/teacher-evaluation"))
    args = parser.parse_args()
    if not args.reviews.is_file():
        print("Teacher evaluation: NOT YET COLLECTED")
        return 2
    try:
        report = analyze_reviews(load_jsonl(args.sample), load_jsonl(args.reviews))
    except EvaluationValidationError as exc:
        print(str(exc))
        return 2
    write_analysis(report, args.output_dir)
    print(f"Analysis complete: reviews={report['reviewCount']} evaluators={report['evaluatorCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
