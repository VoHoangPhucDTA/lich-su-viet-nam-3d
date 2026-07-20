from __future__ import annotations

import argparse
from pathlib import Path

from teacher_evaluation import import_reviews, load_jsonl


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate teacher review CSV without correcting invalid data")
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--sample", type=Path, default=Path("artifacts/teacher-evaluation/sample.jsonl"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/teacher-evaluation"))
    args = parser.parse_args()
    _, report = import_reviews(args.reviews, load_jsonl(args.sample), args.output_dir)
    print(f"Teacher review import: {report['status']} valid={report['validRows']} invalid={report['invalidRows']}")
    return 0 if report["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
