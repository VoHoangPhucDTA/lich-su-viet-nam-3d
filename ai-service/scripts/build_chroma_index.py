"""Validate production embeddings and build an idempotent Chroma index."""

import argparse
import json

from app.config import get_settings
from app.embedding.checkpoint import sanitize_artifact_name
from app.embedding.formatter import FORMATTER_VERSION
from app.vectorstore.artifact_validator import EmbeddingArtifactValidator
from app.vectorstore.index_service import ChromaIndexService
from app.vectorstore.models import VectorstoreError


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--recreate", action="store_true")
    return parser


def create_service() -> ChromaIndexService:
    settings = get_settings()
    artifact_dir = settings.embedding_output_dir / sanitize_artifact_name(
        settings.gemini_embedding_model,
        settings.gemini_embedding_dimension,
    )
    validator = EmbeddingArtifactValidator(
        corpus_path=settings.sgk_chunks_path,
        artifact_dir=artifact_dir,
        expected_model=settings.gemini_embedding_model,
        expected_dimension=settings.gemini_embedding_dimension,
        expected_formatter_version=FORMATTER_VERSION,
    )
    return ChromaIndexService(
        validator=validator,
        persist_dir=settings.chroma_persist_dir,
        report_dir=settings.chroma_report_dir,
        collection_name=settings.chroma_collection_name,
        distance_metric=settings.chroma_distance_metric,
        batch_size=settings.chroma_upsert_batch_size,
    )


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    service = create_service()
    if args.recreate:
        print(
            "RECREATE requested: only collection "
            f"'{service.collection_name}' may be deleted."
        )
    try:
        report = service.build(
            dry_run=args.dry_run,
            limit=args.limit,
            recreate=args.recreate,
        )
    except (VectorstoreError, OSError, ValueError) as exc:
        print(f"Chroma index build FAILED: {type(exc).__name__}: {exc}")
        return 2
    print(json.dumps(report.model_dump(), ensure_ascii=False, indent=2))
    if not args.dry_run:
        print(f"Report: {service.report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
