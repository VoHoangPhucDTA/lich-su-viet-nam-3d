"""Run one safe, read-only Gemini embedding diagnostic request."""

import argparse
import json
import os
from collections.abc import Callable
from typing import Any

from google import genai
from google.genai import types

from app.config import get_settings
from app.corpus.loader import iter_corpus
from app.embedding.base import validate_vectors
from app.embedding.formatter import RetrievalFormatter
from app.embedding.gemini import (
    build_content,
    build_contents,
    error_context,
    is_api_key_failover_error,
)


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        required=True,
        choices=("plain", "single-content", "multi-content", "corpus"),
    )
    parser.add_argument("--limit", type=int, default=1)
    return parser


def _custom_base_url_configured() -> bool:
    names = (
        "GOOGLE_GEMINI_BASE_URL",
        "GOOGLE_VERTEX_BASE_URL",
        "GOOGLE_GENAI_BASE_URL",
        "GEMINI_API_BASE_URL",
        "GOOGLE_API_BASE_URL",
    )
    return any(bool(os.getenv(name, "").strip()) for name in names)


def _safe_config(settings: Any, mode: str) -> dict[str, Any]:
    return {
        "mode": mode,
        "apiKeyConfigured": settings.gemini_configured,
        "apiKeyCount": len(settings.gemini_api_keys),
        "backend": "Gemini Developer API",
        "vertexAi": False,
        "customBaseUrlConfigured": _custom_base_url_configured(),
        "model": settings.gemini_embedding_model,
        "dimension": settings.gemini_embedding_dimension,
    }


def _request_input(mode: str, limit: int, settings: Any) -> tuple[Any, int, list[str]]:
    if mode == "plain":
        return "Hello world", 1, []
    if mode == "single-content":
        return build_content("title: Test | text: Hello world"), 1, []
    if mode == "multi-content":
        samples = ["Hello world", "Lịch sử Việt Nam", "Cách mạng tháng Tám"]
        return build_contents(samples), len(samples), []
    if limit != 1:
        raise ValueError("The corpus diagnostic is intentionally limited to 1 chunk")
    chunk = next(
        chunk for chunk in iter_corpus(settings.sgk_chunks_path)
        if not chunk.containsPendingReview
    )
    document = RetrievalFormatter().format_document(chunk)
    return build_content(document), 1, [chunk.chunkId]


def main(
    argv: list[str] | None = None,
    *,
    client_factory: Callable[..., Any] = genai.Client,
) -> int:
    args = create_parser().parse_args(argv)
    settings = get_settings()
    summary = _safe_config(settings, args.mode)
    if not settings.gemini_configured:
        summary.update({"status": "SKIPPED", "reason": "GEMINI_API_KEY is missing"})
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 2

    client = None
    active_key = ""
    try:
        contents, expected_count, chunk_ids = _request_input(
            args.mode, args.limit, settings
        )
        summary["requestItemCount"] = expected_count
        response = None
        for key_position, active_key in enumerate(settings.gemini_api_keys, start=1):
            client = client_factory(api_key=active_key, vertexai=False)
            try:
                response = client.models.embed_content(
                    model=settings.gemini_embedding_model,
                    contents=contents,
                    config=types.EmbedContentConfig(
                        output_dimensionality=settings.gemini_embedding_dimension
                    ),
                )
                summary["selectedKeyPosition"] = key_position
                break
            except Exception as exc:
                if is_api_key_failover_error(exc) and key_position < len(
                    settings.gemini_api_keys
                ):
                    client.close()
                    client = None
                    continue
                raise
        if response is None:
            raise RuntimeError("No Gemini API key produced a response")
        vectors = [list(item.values or []) for item in response.embeddings or []]
        validate_vectors(vectors, expected_count, settings.gemini_embedding_dimension)
        summary.update(
            {
                "status": "PASSED",
                "responseEmbeddingCount": len(vectors),
                "responseDimensions": [len(vector) for vector in vectors],
                "chunkIds": chunk_ids,
            }
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        context = error_context(
            exc,
            api_key=active_key,
            model=settings.gemini_embedding_model,
            dimension=settings.gemini_embedding_dimension,
            stage=f"diagnostic:{args.mode}",
        )
        summary.update({"status": "FAILED", "error": context})
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 2
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    raise SystemExit(main())
