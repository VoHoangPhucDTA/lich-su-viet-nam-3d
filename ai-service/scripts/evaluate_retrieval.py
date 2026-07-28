"""Run the controlled Goal 14F retrieval experiment."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.config import SERVICE_ROOT, get_settings
from app.evaluation.retrieval_experiment import (
    EXPERIMENT_METHODS,
    ExperimentPreflightError,
    run_experiment,
)

DEFAULT_BENCHMARK = SERVICE_ROOT / "data" / "evaluation" / "retrieval_benchmark.jsonl"
DEFAULT_HELD_OUT = SERVICE_ROOT / "data" / "evaluation" / "retrieval_held_out_v1.jsonl"
DEFAULT_OUTPUT = SERVICE_ROOT.parent / "artifacts" / "ai-service" / "goal14f"


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--benchmark",
        default=None,
        help="development or an explicit benchmark JSONL path",
    )
    parser.add_argument("--held-out", type=Path, default=None)
    parser.add_argument("--output-root", type=Path, default=None)
    parser.add_argument(
        "--benchmark-role",
        choices=["development"],
        default=None,
        help="Only the development-authored benchmark is available in this repository.",
    )
    parser.add_argument(
        "--methods",
        default=None,
        help="Must contain all four Goal 14F strata; accepted for explicit run manifests.",
    )
    parser.add_argument("--top-k", default=None)
    parser.add_argument("--allow-provider-call", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Run the preserved Goal 14B retrieval-evaluation-v2 contract.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    if args.legacy or (
        not any(
            value is not None
            for value in (
                args.benchmark,
                args.held_out,
                args.output_root,
                args.benchmark_role,
                args.methods,
                args.top_k,
            )
        )
        and not args.allow_provider_call
        and not args.no_cache
    ):
        from scripts.evaluate_retrieval_legacy import main as legacy_main

        return legacy_main()
    settings = get_settings()
    try:
        methods_arg = args.methods or ",".join(
            method.lower().replace("_", "-") for method in EXPERIMENT_METHODS
        )
        top_k_arg = args.top_k or "1,3,5"
        methods = tuple(
            method.strip().upper().replace("-", "_") for method in methods_arg.split(",") if method.strip()
        )
        top_k = tuple(int(value.strip()) for value in top_k_arg.split(",") if value.strip())
        benchmark_arg = args.benchmark or "development"
        benchmark_path = (
            DEFAULT_BENCHMARK if str(benchmark_arg).casefold() == "development" else Path(benchmark_arg)
        )
        result = run_experiment(
            settings,
            benchmark_path=benchmark_path,
            held_out_path=args.held_out or DEFAULT_HELD_OUT,
            output_root=args.output_root or DEFAULT_OUTPUT,
            allow_provider_call=args.allow_provider_call,
            no_cache=args.no_cache,
            methods=methods,
            top_k=top_k,
        )
    except (ExperimentPreflightError, OSError, ValueError) as exc:
        print(json.dumps({"status": "PREFLIGHT_FAILED", "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return (
        0
        if result.get("status")
        in {
            "COMPLETED",
            "PREFLIGHT_ONLY_PROVIDER_CALL_NOT_ALLOWED",
        }
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
