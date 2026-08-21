"""Loading and offline validation for the versioned critical-fact registry."""

import json
import re
from pathlib import Path

from pydantic import ValidationError

from app.corpus.identity import canonical_jsonl_sha256
from app.corpus.loader import iter_corpus
from app.corpus.models import CorpusChunk
from app.factual_guard.models import CriticalFact, CriticalFactRegistry, FactValueType
from app.factual_guard.normalization import (
    extract_normalized_dates,
    normalize_text,
    normalize_typed_value,
    normalized_alias_match,
)


class CriticalFactRegistryError(ValueError):
    """Raised when curated factual data is invalid or detached from its corpus."""


def load_critical_fact_registry(path: Path) -> CriticalFactRegistry:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return CriticalFactRegistry.model_validate(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        raise CriticalFactRegistryError(f"invalid critical-fact registry: {exc}") from exc


def _source_supports_fact(chunk: CorpusChunk, fact: CriticalFact) -> bool:
    text = " ".join((chunk.lessonTitle, chunk.sectionTitle, chunk.text))
    if not normalized_alias_match(text, [fact.subject, *fact.subject_aliases]):
        return False
    if not normalized_alias_match(text, fact.relation_anchors):
        return False
    canonical = normalize_typed_value(fact.canonical_value, fact.value_type)
    if not canonical:
        return False
    if fact.value_type == FactValueType.DATE:
        return canonical in extract_normalized_dates(text)
    if fact.value_type in {FactValueType.YEAR, FactValueType.COUNT}:
        return re.search(rf"(?<!\d){re.escape(canonical)}(?!\d)", text) is not None
    aliases = [fact.canonical_value, *fact.canonical_aliases]
    return normalized_alias_match(text, aliases)


def validate_critical_fact_registry(
    registry: CriticalFactRegistry, corpus_path: Path
) -> dict[str, object]:
    actual_corpus_sha256 = canonical_jsonl_sha256(corpus_path)
    errors: list[str] = []
    if actual_corpus_sha256 != registry.canonical_corpus_sha256:
        errors.append("REGISTRY_CORPUS_MISMATCH")
    facts_by_id = {fact.fact_id: fact for fact in registry.facts}
    if len(facts_by_id) != len(registry.facts):
        errors.append("DUPLICATE_FACT_ID")
    relation_keys = [(normalize_text(fact.subject), fact.relation) for fact in registry.facts]
    if len(set(relation_keys)) != len(relation_keys):
        errors.append("DUPLICATE_OR_CONFLICTING_SUBJECT_RELATION")
    chunks = {chunk.chunkId: chunk for chunk in iter_corpus(corpus_path)}
    resolved_source_count = 0
    for fact in registry.facts:
        declared_documents = set(fact.source_document_ids)
        for chunk_id in fact.source_chunk_ids:
            chunk = chunks.get(chunk_id)
            if chunk is None:
                errors.append(f"MISSING_SOURCE_CHUNK:{fact.fact_id}:{chunk_id}")
                continue
            if not chunk.ragEligible or chunk.containsPendingReview:
                errors.append(f"SOURCE_NOT_ELIGIBLE:{fact.fact_id}:{chunk_id}")
            if chunk.documentId not in declared_documents:
                errors.append(f"SOURCE_DOCUMENT_MISMATCH:{fact.fact_id}:{chunk_id}")
            if chunk.grade != fact.grade or chunk.lessonNumber != fact.lesson_number:
                errors.append(f"SOURCE_LESSON_MISMATCH:{fact.fact_id}:{chunk_id}")
            if not _source_supports_fact(chunk, fact):
                errors.append(f"CANONICAL_VALUE_NOT_SUPPORTED:{fact.fact_id}:{chunk_id}")
            resolved_source_count += 1
    return {
        "status": "PASS" if not errors else "FAIL",
        "registryVersion": registry.registry_version,
        "factCount": len(registry.facts),
        "valueTypes": sorted({fact.value_type.value for fact in registry.facts}),
        "canonicalCorpusSha256": registry.canonical_corpus_sha256,
        "actualCorpusSha256": actual_corpus_sha256,
        "resolvedSourceCount": resolved_source_count,
        "errors": errors,
    }
