"""Validate stored source identities against the active production Chroma collection."""

from typing import Any

from app.config import Settings
from app.provenance.models import (
    ProvenanceValidationRequest,
    ProvenanceValidationResponse,
    SourceValidationResult,
)
from app.retrieval.models import RetrievalNotReadyError
from app.retrieval.service import _expected_collection_metadata
from app.vectorstore.chroma_client import (
    close_persistent_client,
    collection_exists,
    create_persistent_client,
    get_collection,
    validate_collection_contract,
)
from app.vectorstore.models import CollectionCompatibilityError


def validate_provenance(
    request: ProvenanceValidationRequest,
    settings: Settings,
    *,
    expected_metadata: dict[str, Any] | None = None,
    collection: Any | None = None,
) -> ProvenanceValidationResponse:
    expected = expected_metadata or _expected_collection_metadata(settings)
    corpus_matches = request.corpus_sha256 == expected.get("corpusSha256")
    collection_matches = request.collection_name == settings.chroma_collection_name
    embedding_matches = (
        request.embedding_model == settings.gemini_embedding_model
        and request.embedding_dimension == settings.gemini_embedding_dimension
    )
    errors: list[str] = []
    if not corpus_matches:
        errors.append("CORPUS_MISMATCH")
    if not collection_matches:
        errors.append("COLLECTION_MISMATCH")
    if not embedding_matches:
        errors.append("EMBEDDING_CONTRACT_MISMATCH")

    requested_ids = [source.chunk_id for source in request.sources]
    if len(set(requested_ids)) != len(requested_ids):
        errors.append("DUPLICATE_SOURCE_ID")

    client = None
    if collection is None:
        if not (settings.chroma_persist_dir / "chroma.sqlite3").is_file():
            raise RetrievalNotReadyError("Chroma persistence is not ready")
        client = create_persistent_client(settings.chroma_persist_dir)
        if not collection_exists(client, settings.chroma_collection_name):
            raise RetrievalNotReadyError("Retrieval collection does not exist")
        collection = get_collection(client, settings.chroma_collection_name)
    try:
        try:
            validate_collection_contract(
                collection, expected, settings.chroma_distance_metric
            )
        except CollectionCompatibilityError as exc:
            raise RetrievalNotReadyError("Retrieval collection contract is incompatible") from exc
        raw = collection.get(ids=list(dict.fromkeys(requested_ids)), include=["metadatas"])
    finally:
        if client is not None:
            close_persistent_client(client)

    metadata_by_id = {
        str(chunk_id): metadata
        for chunk_id, metadata in zip(raw.get("ids") or [], raw.get("metadatas") or [], strict=False)
        if isinstance(metadata, dict)
    }
    source_results: list[SourceValidationResult] = []
    for source in request.sources:
        metadata = metadata_by_id.get(source.chunk_id)
        exists = metadata is not None
        hash_matches = exists and metadata.get("chunkHash") == source.chunk_hash
        pending = bool(metadata and metadata.get("containsPendingReview", False))
        if not exists:
            errors.append("SOURCE_MISSING")
        elif not hash_matches:
            errors.append("SOURCE_CHANGED")
        if pending:
            errors.append("SOURCE_NOT_ELIGIBLE")
        source_results.append(SourceValidationResult(
            chunkId=source.chunk_id,
            chunkHash=metadata.get("chunkHash") if metadata else None,
            exists=exists,
            hashMatches=hash_matches,
            pendingReview=pending,
            documentId=metadata.get("documentId") if metadata else None,
            grade=metadata.get("grade") if metadata else None,
            lessonNumber=metadata.get("lessonNumber") if metadata else None,
            lessonTitle=metadata.get("lessonTitle") if metadata else None,
            sectionTitle=metadata.get("sectionTitle") if metadata else None,
            pageStart=metadata.get("pageStart") if metadata else None,
            pageEnd=metadata.get("pageEnd") if metadata else None,
        ))
    unique_errors = list(dict.fromkeys(errors))
    return ProvenanceValidationResponse(
        valid=not unique_errors,
        corpusMatches=corpus_matches,
        collectionMatches=collection_matches,
        embeddingContractMatches=embedding_matches,
        sources=source_results,
        errors=unique_errors,
    )
