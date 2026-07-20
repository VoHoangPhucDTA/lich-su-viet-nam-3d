"""Build the fixed teacher-evaluation sample with explicit provider-call approval."""

from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

from app.config import SERVICE_ROOT, get_settings
from app.generation.evaluation import GenerationCache
from app.generation.models import GenerationRequest, PROMPT_VERSION, SCHEMA_VERSION
from app.generation.service import create_generation_service
from app.retrieval.models import RetrievalRequest

REPOSITORY_ROOT = SERVICE_ROOT.parent
TOOLING_PATH = REPOSITORY_ROOT / "scripts" / "evaluation" / "teacher_evaluation.py"
TOOLING_SPEC = importlib.util.spec_from_file_location("teacher_evaluation_tooling", TOOLING_PATH)
if TOOLING_SPEC is None or TOOLING_SPEC.loader is None:  # pragma: no cover - installation failure
    raise RuntimeError(f"cannot load teacher-evaluation tooling from {TOOLING_PATH}")
TOOLING = importlib.util.module_from_spec(TOOLING_SPEC)
TOOLING_SPEC.loader.exec_module(TOOLING)
load_jsonl = TOOLING.load_jsonl
sha256_value = TOOLING.sha256_value
validate_manifest = TOOLING.validate_manifest
write_jsonl = TOOLING.write_jsonl

MANIFEST_PATH = SERVICE_ROOT / "data" / "evaluation" / "teacher_evaluation_manifest.jsonl"
CACHE_ROOT = SERVICE_ROOT / "storage" / "generation-cache"
OUTPUT_ROOT = REPOSITORY_ROOT / "artifacts" / "teacher-evaluation"


def git_commit() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPOSITORY_ROOT, text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline-preflight", action="store_true", help="Validate/freeze manifest without opening retrieval or Gemini")
    parser.add_argument("--execute", action="store_true", help="Run retrieval and build sample")
    parser.add_argument("--allow-provider-call", action="store_true", help="Allow cache misses to call the production generation provider")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_ROOT)
    args = parser.parse_args()
    if args.offline_preflight == args.execute:
        raise SystemExit("select exactly one of --offline-preflight or --execute")
    manifest_rows = load_jsonl(MANIFEST_PATH)
    manifest_report = validate_manifest(manifest_rows)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.offline_preflight:
        report = {
            "status": "PREFLIGHT_PASSED", **manifest_report,
            "teacherEvaluation": "NOT YET COLLECTED",
            "providerCalled": False,
        }
        (args.output_dir / "sample-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (args.output_dir / "sample-generation-report.md").write_text(
            "# Teacher evaluation sample preflight\n\n- Status: `PREFLIGHT_PASSED`\n"
            f"- Manifest: `{manifest_report['manifestVersion']}`\n- Items: {manifest_report['sampleSize']}\n"
            "- Provider called: no\n- Teacher evaluation: **NOT YET COLLECTED**\n",
            encoding="utf-8",
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    settings = get_settings()
    cache = GenerationCache(CACHE_ROOT)
    service = create_generation_service(settings)
    sample: list[dict] = []
    try:
        for item in manifest_rows:
            started = time.monotonic()
            try:
                request = GenerationRequest(
                    query=item["query"], grade=item["grade"], lessonNumber=item["lessonNumber"],
                    difficulty=item["difficulty"], count=1, topK=item["topK"],
                )
                retrieval = service.retrieval_service.retrieve(RetrievalRequest(
                    query=request.query, grade=request.grade, lessonNumber=request.lesson_number, topK=request.top_k
                ))
                cache_identity = cache.identity(
                    request, retrieval, model=settings.gemini_generation_model,
                    temperature=settings.gemini_generation_temperature,
                )
                response = cache.get(cache_identity)
                cache_hit = response is not None
                if response is None:
                    if not args.allow_provider_call:
                        raise RuntimeError("CACHE_MISS_PROVIDER_CALL_NOT_APPROVED")
                    response = service.generate(request, retrieval_response=retrieval)
                    cache.set(cache_identity, response)
                if len(response.questions) != 1:
                    raise RuntimeError("GENERATED_COUNT_MISMATCH")
                question = response.questions[0]
                question_identity = {
                    "question": question.question,
                    "options": [option.model_dump(by_alias=True) for option in question.options],
                    "correctOptionId": question.correct_option_id,
                    "explanation": question.explanation,
                    "difficulty": question.difficulty.value,
                    "sourceChunkIds": question.source_chunk_ids,
                }
                retrieval_by_id = {result.chunk_id: result for result in retrieval.results}
                sources = [retrieval_by_id[source_id] for source_id in question.source_chunk_ids]
                sample.append({
                    **item, "status": "GENERATED", "cacheHit": cache_hit,
                    "generationModel": response.metadata.generation_model,
                    "promptVersion": response.metadata.prompt_version,
                    "schemaVersion": response.metadata.schema_version,
                    "generationTemperature": settings.gemini_generation_temperature,
                    "sourceChunkIds": question.source_chunk_ids,
                    "sourceChunkHashes": [source.chunk_hash for source in sources],
                    "corpusSha256": response.metadata.corpus_sha256,
                    "collectionName": response.metadata.collection_name,
                    "embeddingModel": response.metadata.embedding_model,
                    "embeddingDimension": response.metadata.embedding_dimension,
                    "generatedQuestionHash": sha256_value(question_identity),
                    "generationCacheIdentity": cache_identity,
                    **question_identity,
                    "sources": [{
                        "chunkId": source.chunk_id, "chunkHash": source.chunk_hash,
                        "lessonTitle": source.lesson_title, "sectionTitle": source.section_title,
                        "pageStart": source.page_start, "pageEnd": source.page_end,
                        "excerpt": source.text[:1200],
                    } for source in sources],
                    "heuristicWarnings": response.warnings,
                    "latencyMs": round((time.monotonic() - started) * 1000, 3),
                })
            except Exception as exc:
                sample.append({
                    **item, "status": "GENERATION_FAILED", "errorCode": str(exc) if str(exc).startswith("CACHE_MISS_") else type(exc).__name__,
                    "latencyMs": round((time.monotonic() - started) * 1000, 3),
                })
    finally:
        service.close()
    write_jsonl(args.output_dir / "sample.jsonl", sample)
    generated = sum(item["status"] == "GENERATED" for item in sample)
    identity = {
        "gitCommit": git_commit(), "corpusSha256": next((item["corpusSha256"] for item in sample if item["status"] == "GENERATED"), None),
        "embeddingModel": settings.gemini_embedding_model, "embeddingDimension": settings.gemini_embedding_dimension,
        "collectionName": settings.chroma_collection_name, "generationModel": settings.gemini_generation_model,
        "promptVersion": PROMPT_VERSION, "schemaVersion": SCHEMA_VERSION,
        "evaluationManifestVersion": manifest_report["manifestVersion"],
        "generationTemperature": settings.gemini_generation_temperature,
        "generationCacheIdentities": [item["generationCacheIdentity"] for item in sample if item["status"] == "GENERATED"],
    }
    report = {
        "status": "COMPLETED" if generated == len(sample) else "COMPLETED_WITH_FAILURES",
        **manifest_report, "generatedItems": generated, "failedItems": len(sample) - generated,
        "failureCodes": dict(Counter(item.get("errorCode") for item in sample if item["status"] == "GENERATION_FAILED")),
        "identity": identity, "teacherEvaluation": "NOT YET COLLECTED",
    }
    (args.output_dir / "sample-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "sample-generation-report.md").write_text(
        "# Teacher evaluation sample generation\n\n"
        f"- Status: `{report['status']}`\n- Generated: {generated}/{len(sample)}\n"
        f"- Failures: {len(sample) - generated}\n- Teacher evaluation: **NOT YET COLLECTED**\n"
        "\nFailures remain part of the experiment and are not silently replaced.\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": report["status"], "generated": generated, "failed": len(sample) - generated}, indent=2))
    return 0 if generated == len(sample) else 1


if __name__ == "__main__":
    raise SystemExit(main())
