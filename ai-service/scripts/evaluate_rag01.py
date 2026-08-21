"""RAG-01 evaluation harness with explicit owner-gated live adapters.

The default path validates only the immutable offline benchmark and writes a
``NOT_RUN_REQUIRES_OWNER_AUTH`` result. The live path is reachable only with
``--allow-provider-call`` and delegates to the production retrieval service and
Gemini generation provider without using benchmark gold data as runtime input.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.corpus.identity import canonical_jsonl_sha256  # noqa: E402
from app.evaluation.rag01 import (  # noqa: E402
    NOT_RUN_REQUIRES_OWNER_AUTH,
    PAIRED_PROMPT_VERSION,
    READY_FOR_OWNER_PROVIDER_RUN,
    EvaluationGenerationPolicy,
    ProviderBudget,
    Rag01Cache,
    Rag01LiveHarness,
    SharedEvaluationGenerationRunner,
    aggregate_generation_results,
    aggregate_paired_results,
    aggregate_retrieval_results,
    build_human_review_queue,
    load_jsonl,
    paired_comparison_metadata,
    render_human_review_queue_markdown,
    require_provider_call,
    sanitize_generation_result,
    sanitize_retrieval_result,
    validate_generation_dataset,
    validate_retrieval_dataset,
)

ROOT = SERVICE_ROOT
CORPUS = ROOT / "data" / "corpus" / "sgk_chunks.jsonl"
DATASET = ROOT / "data" / "evaluation" / "rag01"
REVIEW = ROOT.parent / "docs" / "review" / "fix-teacher" / "rag01-evaluation-baseline-corrected-v4"


def corpus_rows() -> dict[str, dict[str, Any]]:
    return {row["chunkId"]: row for row in load_jsonl(CORPUS)}


def corpus_sha256(path: Path = CORPUS) -> str:
    return canonical_jsonl_sha256(path)


def _trace_payload(trace: Any) -> dict[str, Any]:
    return {key: value for key, value in vars(trace).items() if not key.startswith("_")}


class ProductionRag01Adapters:
    """Real production adapters, instantiated only after the owner gate."""

    def __init__(self, settings: Any, budget: ProviderBudget) -> None:
        from app.generation.service import create_generation_service
        from app.retrieval.service import create_retrieval_service

        self.settings = settings
        self.retrieval_service = create_retrieval_service(settings)
        self.generation_service = create_generation_service(settings)
        self.policy = EvaluationGenerationPolicy(
            model=settings.gemini_generation_model,
            temperature=settings.gemini_generation_temperature,
            max_output_tokens=settings.gemini_generation_max_output_tokens,
            schema_version="grounded-mcq-schema-v1",
            max_retries=settings.gemini_generation_max_retries,
            repair_attempts=settings.gemini_generation_repair_attempts,
        )
        self.generation_runner = SharedEvaluationGenerationRunner(
            provider=self.generation_service.provider,
            settings=settings,
            policy=self.policy,
            budget=budget,
        )

    def retrieve(self, case: dict[str, Any]) -> dict[str, Any]:
        from app.retrieval.models import RetrievalEvaluationTrace, RetrievalRequest

        request = RetrievalRequest(
            query=case["query"],
            grade=case.get("grade"),
            lesson_number=case.get("lessonNumber"),
            top_k=case.get("topK", self.settings.rag_default_top_k),
        )
        trace = RetrievalEvaluationTrace()
        started = time.perf_counter()
        response = self.retrieval_service.retrieve(request, evaluation_trace=trace)
        return {
            "actualRetrievedIds": [item.chunk_id for item in response.results],
            "actualRetrievedDocumentIds": [item.document_id for item in response.results],
            "actualContextChunkIds": response.fact_context.source_chunk_ids,
            "actualContextText": response.fact_context.text,
            "response": response.model_dump(by_alias=True),
            "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            "retryCount": 0,
            "retrievalTrace": _trace_payload(trace),
        }

    def rag_generate(self, case: dict[str, Any], retrieval: dict[str, Any] | None) -> dict[str, Any]:
        from app.generation.models import Difficulty, GenerationRequest, GenerationUseCase
        from app.retrieval.models import RetrievalResponse

        if retrieval is None or not retrieval.get("response"):
            raise ValueError(f"missing live retrieval response for {case['caseId']}")
        request = GenerationRequest(
            query=case["query"],
            grade=case.get("grade"),
            lesson_number=case.get("lessonNumber"),
            difficulty=Difficulty(case["difficulty"]),
            count=case.get("count", 1),
            top_k=case.get("topK", self.settings.rag_default_top_k),
            generation_use_case=GenerationUseCase.EVALUATION,
        )
        started = time.perf_counter()
        response = RetrievalResponse.model_validate(retrieval["response"])
        generated = self.generation_runner.generate(
            request,
            retrieval_response=response,
            mode="rag",
        )
        return {
            "questions": generated["questions"],
            "actualRetrievedIds": retrieval.get("actualRetrievedIds", []),
            "actualContextChunkIds": retrieval.get("actualContextChunkIds", []),
            "actualContextText": retrieval.get("actualContextText", ""),
            "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            "retryCount": generated["retryCount"],
            "generationRepairAttempts": generated["generationRepairAttempts"],
            "providerAttemptCountKnown": generated["providerAttemptCountKnown"],
        }

    def gemini_only_generate(
        self, case: dict[str, Any], retrieval: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        del retrieval
        from app.generation.models import Difficulty, GenerationRequest, GenerationUseCase

        request = GenerationRequest(
            query=case["query"],
            grade=case.get("grade"),
            lesson_number=case.get("lessonNumber"),
            difficulty=Difficulty(case["difficulty"]),
            count=case.get("count", 1),
            top_k=case.get("topK", self.settings.rag_default_top_k),
            generation_use_case=GenerationUseCase.EVALUATION,
        )
        started = time.perf_counter()
        generated = self.generation_runner.generate(
            request,
            retrieval_response=None,
            mode="gemini-only",
        )
        return {
            "questions": generated["questions"],
            "actualRetrievedIds": [],
            "actualContextChunkIds": [],
            "actualContextText": "",
            "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            "retryCount": generated["retryCount"],
            "generationRepairAttempts": generated["generationRepairAttempts"],
            "providerAttemptCountKnown": generated["providerAttemptCountKnown"],
        }

    def close(self) -> None:
        self.generation_service.close()
        self.retrieval_service.close()


def _live_harness(
    settings: Any, corpus: dict[str, dict[str, Any]], args: argparse.Namespace
) -> tuple[Rag01LiveHarness, ProductionRag01Adapters]:
    budget = ProviderBudget(args.max_provider_calls)
    adapters = ProductionRag01Adapters(settings, budget)
    retrieval_config = {
        "topK": settings.rag_default_top_k,
        "maxTopK": settings.rag_max_top_k,
        "candidateMultiplier": settings.rag_candidate_multiplier,
        "maxCandidates": settings.rag_max_candidates,
        "maxChunksPerDocument": settings.rag_max_chunks_per_document,
        "contextMaxChars": settings.rag_context_max_chars,
        "contextMaxChunks": settings.rag_context_max_chunks,
    }
    retrieval_fingerprint = hashlib.sha256(
        json.dumps(retrieval_config, sort_keys=True).encode("utf-8")
    ).hexdigest()
    harness = Rag01LiveHarness(
        cache=Rag01Cache(args.cache_dir),
        model_config={
            "embeddingModel": settings.gemini_embedding_model,
            "generationModel": settings.gemini_generation_model,
        },
        prompt_version=PAIRED_PROMPT_VERSION,
        schema_version="grounded-mcq-schema-v1",
        corpus_hash=corpus_sha256(),
        retrieval_config_fingerprint=retrieval_fingerprint,
        retry_policy={
            "embeddingMaxRetries": settings.gemini_embedding_max_retries,
            "generationMaxRetries": settings.gemini_generation_max_retries,
            "generationRepairAttempts": settings.gemini_generation_repair_attempts,
        },
        corpus=corpus,
        retrieval_adapter=adapters.retrieve,
        rag_generation_adapter=adapters.rag_generate,
        gemini_only_generation_adapter=adapters.gemini_only_generate,
        provider_budget=budget,
    )
    return harness, adapters


def _write_human_review_queue(output_dir: Path, items: list[dict[str, Any]], status: str) -> None:
    payload = {"status": status, "items": items, "reviewCount": len(items), "providerCalls": 0}
    (output_dir / "human-review-queue.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (output_dir / "human-review-queue.md").write_text(
        render_human_review_queue_markdown(items), encoding="utf-8"
    )


def run_live(
    args: argparse.Namespace,
    corpus: dict[str, dict[str, Any]],
    retrieval: list[dict[str, Any]],
    generation: list[dict[str, Any]],
) -> dict[str, Any]:
    from app.config import get_settings

    require_provider_call(True)
    harness, adapters = _live_harness(get_settings(), corpus, args)
    try:
        if args.mode == "retrieval-60":
            results = harness.run_retrieval(retrieval, allow_provider_call=True)
            sanitized = [sanitize_retrieval_result(item, corpus) for item in results]
            return {
                "status": "COMPLETED",
                "scores": aggregate_retrieval_results(results),
                "caseResults": sanitized,
                "humanReviewItems": [],
                "providerBudget": harness.provider_budget.snapshot() if harness.provider_budget else None,
                "policy": adapters.policy.snapshot(),
            }
        if args.mode == "generation-27":
            mode = "gemini-only" if args.baseline == "gemini-only" else "rag"
            raw_results = harness.run_generation(generation, mode=mode, allow_provider_call=True)
            sanitized = [sanitize_generation_result(item, corpus) for item in raw_results]
            return {
                "status": "COMPLETED",
                "scores": aggregate_generation_results(raw_results),
                "caseResults": sanitized,
                "humanReviewItems": build_human_review_queue(raw_results),
                "providerBudget": harness.provider_budget.snapshot() if harness.provider_budget else None,
                "policy": adapters.policy.snapshot(),
            }
        rag = harness.run_generation(generation, mode="rag", allow_provider_call=True)
        gemini_only = harness.run_generation(generation, mode="gemini-only", allow_provider_call=True)
        return {
            "status": "COMPLETED",
            "scores": aggregate_paired_results(rag, gemini_only),
            "ragCaseResults": [sanitize_generation_result(item, corpus) for item in rag],
            "geminiOnlyCaseResults": [sanitize_generation_result(item, corpus) for item in gemini_only],
            "humanReviewItems": build_human_review_queue(rag) + build_human_review_queue(gemini_only),
            "providerBudget": harness.provider_budget.snapshot() if harness.provider_budget else None,
            "policy": adapters.policy.snapshot(),
        }
    finally:
        adapters.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("retrieval-60", "generation-27", "paired-baseline"), required=True)
    parser.add_argument("--baseline", choices=("rag", "gemini-only"), default="rag")
    parser.add_argument(
        "--allow-provider-call", action="store_true", help="Required owner gate; absent by default."
    )
    parser.add_argument(
        "--max-provider-calls",
        type=int,
        default=0,
        help="Hard owner budget for retrieval/generation/repair invocations; default is zero.",
    )
    parser.add_argument("--output-dir", type=Path, default=REVIEW)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "storage" / "evaluation-cache" / "rag01")
    args = parser.parse_args()

    if args.max_provider_calls < 0:
        parser.error("--max-provider-calls must be >= 0")
    if args.allow_provider_call and args.max_provider_calls <= 0:
        parser.error("--max-provider-calls must be positive when --allow-provider-call is used")

    corpus = corpus_rows()
    retrieval = load_jsonl(DATASET / "retrieval_60_v1.jsonl")
    generation = load_jsonl(DATASET / "generation_27_v1.jsonl")
    retrieval_summary = validate_retrieval_dataset(retrieval, set(corpus))
    generation_summary = validate_generation_dataset(generation, corpus)
    if args.allow_provider_call:
        live = run_live(args, corpus, retrieval, generation)
        status = live.pop("status", READY_FOR_OWNER_PROVIDER_RUN)
        provider_calls: int | str | None = None
    else:
        status = NOT_RUN_REQUIRES_OWNER_AUTH
        provider_calls = 0
        live = {
            "LIVE_RUNNER_IMPLEMENTED": True,
            "scores": None,
            "note": (
                "No provider request is attempted by this default invocation; "
                "owner-gated live scores are absent."
            ),
        }
    human_items = live.pop("humanReviewItems", [])
    result: dict[str, Any] = {
        "status": status,
        "mode": args.mode,
        "baseline": args.baseline if args.mode == "generation-27" else None,
        "providerCallGate": "EXPLICIT --allow-provider-call REQUIRED",
        "retrievalDataset": retrieval_summary,
        "generationDataset": generation_summary,
        "cachePolicy": "OWNER_LOCAL_CACHE_EXCLUDED_FROM_SHAREABLE_OUTPUT",
        **paired_comparison_metadata(),
        **live,
    }
    if provider_calls is not None:
        result["providerCalls"] = provider_calls
    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_name = {
        "retrieval-60": "retrieval-60-results.json",
        "generation-27": f"generation-27-{args.baseline}-results.json",
        "paired-baseline": "paired-baseline-results.json",
    }[args.mode]
    (args.output_dir / output_name).write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    _write_human_review_queue(args.output_dir, human_items, status)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
