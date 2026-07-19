"""Build resumable Gemini embeddings for the canonical SGK corpus."""

import argparse
import json

from app.config import get_settings
from app.core.exceptions import CorpusError
from app.core.logging import configure_logging
from app.embedding.gemini import GeminiEmbeddingProvider
from app.embedding.models import EmbeddingError
from app.embedding.service import EmbeddingService


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", action="store_true", default=True)
    parser.add_argument("--no-resume", dest="resume", action="store_false")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--include-pending-review", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    settings = get_settings()
    configure_logging(settings.log_level)
    service = EmbeddingService(
        corpus_path=settings.sgk_chunks_path,
        output_root=settings.embedding_output_dir,
        checkpoint_root=settings.embedding_checkpoint_dir,
        model=settings.gemini_embedding_model,
        dimension=settings.gemini_embedding_dimension,
        batch_size=settings.gemini_embedding_batch_size,
    )
    provider = None
    if not args.dry_run:
        provider = GeminiEmbeddingProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_embedding_model,
            dimension=settings.gemini_embedding_dimension,
            max_retries=settings.gemini_embedding_max_retries,
            retry_min_seconds=settings.gemini_embedding_retry_min_seconds,
            retry_max_seconds=settings.gemini_embedding_retry_max_seconds,
        )
    try:
        manifest = service.run(
            provider,
            dry_run=args.dry_run,
            limit=args.limit,
            resume=args.resume,
            force=args.force,
            include_pending_review=args.include_pending_review,
        )
    except (CorpusError, EmbeddingError, ValueError, OSError) as exc:
        print(f"Embedding build FAILED: {type(exc).__name__}: {exc}")
        return 2
    finally:
        if provider is not None:
            provider.close()

    print(json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2))
    if not args.dry_run:
        print(f"Output: {service.store.output_dir}")
        print(f"Checkpoint: {service.store.checkpoint_dir}")
    return 1 if manifest.failedRecords else 0


if __name__ == "__main__":
    raise SystemExit(main())
