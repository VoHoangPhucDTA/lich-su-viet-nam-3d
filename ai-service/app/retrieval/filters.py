"""Validated exact metadata filters for Chroma queries."""

from typing import Any

from app.retrieval.models import RawChromaCandidate, RetrievalFilters


def build_chroma_where(filters: RetrievalFilters) -> dict[str, Any] | None:
    clauses: list[dict[str, Any]] = []
    if filters.grade is not None:
        clauses.append({"grade": {"$eq": filters.grade}})
    if filters.lesson_number is not None:
        clauses.append({"lessonNumber": {"$eq": filters.lesson_number}})
    if filters.document_id is not None:
        clauses.append({"documentId": {"$eq": filters.document_id}})
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def candidate_matches_filters(
    candidate: RawChromaCandidate, filters: RetrievalFilters
) -> bool:
    return (
        (filters.grade is None or candidate.grade == filters.grade)
        and (
            filters.lesson_number is None
            or candidate.lesson_number == filters.lesson_number
        )
        and (
            filters.document_id is None
            or candidate.document_id == filters.document_id
        )
    )
