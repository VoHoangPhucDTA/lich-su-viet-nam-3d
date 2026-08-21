"""Deterministic source-aware checks for curated high-risk historical claims."""

import re
from collections import defaultdict
from pathlib import Path

from app.factual_guard.models import (
    ClaimLocation,
    CriticalFact,
    CriticalFactRegistry,
    ExtractedClaim,
    FactualDecision,
    FactualGuardResult,
    FactualReasonCode,
    FactValueType,
)
from app.factual_guard.normalization import (
    extract_normalized_dates,
    normalize_text,
    normalize_typed_value,
    normalized_alias_match,
)
from app.factual_guard.registry import load_critical_fact_registry
from app.generation.models import GeneratedQuestion, ValidationIssue
from app.retrieval.models import RetrievalResult

YEAR_TOKEN = r"(?<!\d)(\d{3,4})(?!\d)"
COUNT_TOKEN = r"(?<!\d)(\d{1,4})(?!\d)"
PERSON_TOKEN = r"([A-ZĐÀ-Ỹ][\wÀ-ỹ-]+(?:\s+[A-ZĐÀ-Ỹ][\wÀ-ỹ-]+){1,4})"


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"[.!?;\n]+", text) if part.strip()]


def _aliases(fact: CriticalFact) -> list[str]:
    return [fact.subject, *fact.subject_aliases]


def _has_subject(text: str, fact: CriticalFact) -> bool:
    return normalized_alias_match(text, _aliases(fact))


def _relation_intent(stem: str, fact: CriticalFact) -> bool:
    if not _has_subject(stem, fact):
        return False
    value = normalize_text(stem)
    anchors = {
        "event_year": ("năm nào", "diễn ra", "thời gian"),
        "commander": ("ai", "người chỉ huy", "do ai", "lãnh đạo"),
        "event_date": ("ngày nào", "ngày bao nhiêu", "thời gian"),
        "accession_year": ("lên ngôi",),
        "establishment_year": ("thành lập",),
        "conference_year": ("diễn ra", "năm nào", "thời gian"),
        "member_count_2022": ("bao nhiêu", "số quốc gia", "quốc gia thành viên"),
        "resolution_adoption_year": ("nghị quyết", "thông qua", "ban hành"),
        "commemoration_year": ("kỉ niệm", "kỷ niệm", "đánh dấu"),
        "campaign_year": ("năm nào", "thời gian", "diễn ra"),
    }
    return any(anchor in value for anchor in anchors.get(fact.relation, ()))


def _bare_values(text: str, fact: CriticalFact) -> set[str]:
    if fact.value_type == FactValueType.DATE:
        return extract_normalized_dates(text)
    if fact.value_type == FactValueType.YEAR:
        return {str(int(value)) for value in re.findall(YEAR_TOKEN, text)}
    if fact.value_type == FactValueType.COUNT:
        return {str(int(value)) for value in re.findall(COUNT_TOKEN, text)}
    if fact.value_type in {FactValueType.PERSON, FactValueType.PLACE}:
        value = normalize_typed_value(text, fact.value_type)
        return {value} if value else set()
    return set()


def _year_values(text: str, fact: CriticalFact, *, source: bool) -> set[str]:
    values: set[str] = set()
    for sentence in _sentences(text):
        if not _has_subject(sentence, fact):
            continue
        normalized = normalize_text(sentence)
        patterns: dict[str, tuple[str, ...]] = {
            "event_year": (
                rf"(?:diễn ra|xảy ra|giành chiến thắng)[^.!?]{{0,45}}?năm\s+{YEAR_TOKEN}",
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,90}}?(?:bạch đằng|bach dang)",
            ),
            "accession_year": (
                rf"lên ngôi[^.!?]{{0,20}}?năm\s+{YEAR_TOKEN}",
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,70}}?lên ngôi",
            ),
            "establishment_year": (
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,60}}?(?:được\s+)?thành lập",
                rf"(?:được\s+)?thành lập[^.!?]{{0,25}}?năm\s+{YEAR_TOKEN}",
            ),
            "conference_year": (
                rf"(?:diễn ra|hội nghị)[^.!?]{{0,60}}?(?:năm\s+)?{YEAR_TOKEN}",
            ),
            "resolution_adoption_year": (
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,100}}?(?:ban hành|thông qua)[^.!?]{{0,40}}?nghị quyết",
                rf"(?:ban hành|thông qua)[^.!?]{{0,60}}?nghị quyết[^.!?]{{0,50}}?năm\s+{YEAR_TOKEN}",
            ),
            "commemoration_year": (
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,90}}?(?:kỉ niệm|kỷ niệm|đánh dấu)",
                rf"(?:kỉ niệm|kỷ niệm|đánh dấu)[^.!?]{{0,90}}?năm\s+{YEAR_TOKEN}",
            ),
            "campaign_year": (
                rf"chiến dịch[^.!?]{{0,80}}?(?:năm\s+)?{YEAR_TOKEN}",
                rf"năm\s+{YEAR_TOKEN}[^.!?]{{0,80}}?chiến dịch",
            ),
        }
        for pattern in patterns.get(fact.relation, ()):
            values.update(str(int(item)) for item in re.findall(pattern, normalized))
        if source and fact.relation == "event_year":
            # Handles the canonical compact table row: 938 Ngô Quyền Bạch Đằng.
            table_pattern = rf"{YEAR_TOKEN}\s+ngô quyền\s+bạch đằng"
            values.update(str(int(item)) for item in re.findall(table_pattern, normalized))
    return values


def _person_values(text: str, fact: CriticalFact, *, source: bool) -> set[str]:
    if not _has_subject(text, fact):
        return set()
    normalized = normalize_text(text)
    canonical_aliases = [fact.canonical_value, *fact.canonical_aliases]
    values = {
        normalize_typed_value(alias, fact.value_type)
        for alias in canonical_aliases
        if normalize_text(alias) in normalized
    }
    patterns = (
        rf"do\s+{PERSON_TOKEN}\s+(?:lãnh đạo|chỉ huy)",
        rf"người\s+chỉ huy\s+(?:là\s+)?{PERSON_TOKEN}",
        rf"{PERSON_TOKEN}\s+(?:là\s+)?(?:người\s+)?(?:chỉ huy|lãnh đạo)",
    )
    for pattern in patterns:
        for match in re.findall(pattern, text):
            value = normalize_typed_value(match, fact.value_type)
            if value:
                values.add(value)
    if source:
        table_pattern = rf"\b\d{{3,4}}\s+{PERSON_TOKEN}\s+Bạch Đằng"
        for match in re.findall(table_pattern, text):
            value = normalize_typed_value(match, fact.value_type)
            if value:
                values.add(value)
    return values


def _extract_values(text: str, fact: CriticalFact, *, source: bool = False) -> set[str]:
    if not _has_subject(text, fact):
        return set()
    if fact.value_type == FactValueType.DATE:
        return extract_normalized_dates(text)
    if fact.value_type == FactValueType.YEAR:
        return _year_values(text, fact, source=source)
    if fact.value_type == FactValueType.COUNT:
        values: set[str] = set()
        for sentence in _sentences(text):
            if _has_subject(sentence, fact):
                values.update(
                    str(int(item))
                    for item in re.findall(rf"{COUNT_TOKEN}\s+quốc gia(?:\s+thành viên)?", sentence)
                )
        return values
    if fact.value_type == FactValueType.PERSON:
        return _person_values(text, fact, source=source)
    return set()


def _claims_for_question(
    question: GeneratedQuestion, registry: CriticalFactRegistry
) -> list[ExtractedClaim]:
    correct = next(
        option.text for option in question.options if option.id == question.correct_option_id
    )
    claims: list[ExtractedClaim] = []
    for fact in registry.facts:
        locations = (
            (ClaimLocation.STEM, _extract_values(question.question, fact)),
            (ClaimLocation.EXPLANATION, _extract_values(question.explanation, fact)),
        )
        for location, values in locations:
            claims.extend(
                ExtractedClaim(
                    fact_id=fact.fact_id,
                    relation=fact.relation,
                    value_type=fact.value_type,
                    normalized_value=value,
                    location=location,
                )
                for value in values
            )
        if _relation_intent(question.question, fact):
            claims.extend(
                ExtractedClaim(
                    fact_id=fact.fact_id,
                    relation=fact.relation,
                    value_type=fact.value_type,
                    normalized_value=value,
                    location=ClaimLocation.CORRECT_OPTION,
                )
                for value in _bare_values(correct, fact)
            )
    unique = {
        (claim.fact_id, claim.normalized_value, claim.location): claim for claim in claims
    }
    return list(unique.values())


class FactualGuard:
    """Validate covered assertions against retrieved evidence and a curated registry."""

    def __init__(self, registry: CriticalFactRegistry) -> None:
        self.registry = registry
        self._facts = {fact.fact_id: fact for fact in registry.facts}

    @classmethod
    def from_path(cls, path: Path) -> "FactualGuard":
        return cls(load_critical_fact_registry(path))

    def validate_question(
        self,
        question: GeneratedQuestion,
        sources: list[RetrievalResult],
        *,
        corpus_sha256: str,
        question_index: int,
    ) -> tuple[FactualGuardResult, list[ValidationIssue]]:
        claims = _claims_for_question(question, self.registry)
        cited = {
            source.chunk_id: source
            for source in sources
            if source.chunk_id in question.source_chunk_ids
        }
        source_ids = sorted(cited)
        if not claims:
            return (
                FactualGuardResult(
                    decision=FactualDecision.PASS,
                    reason_codes=[FactualReasonCode.VALIDATION_UNKNOWN],
                    source_ids=source_ids,
                    covered_claim_count=0,
                    unknown_claim_count=1,
                ),
                [],
            )
        reasons: set[FactualReasonCode] = set()
        fact_ids = sorted({claim.fact_id for claim in claims})
        if corpus_sha256 != self.registry.canonical_corpus_sha256:
            reasons.add(FactualReasonCode.REGISTRY_CORPUS_MISMATCH)
        grouped: dict[str, list[ExtractedClaim]] = defaultdict(list)
        for claim in claims:
            grouped[claim.fact_id].append(claim)
        for fact_id, fact_claims in grouped.items():
            fact = self._facts[fact_id]
            canonical = normalize_typed_value(fact.canonical_value, fact.value_type)
            if any(claim.normalized_value != canonical for claim in fact_claims):
                reasons.add(FactualReasonCode.FACT_CONTRADICTION)
            correct_values = {
                claim.normalized_value
                for claim in fact_claims
                if claim.location == ClaimLocation.CORRECT_OPTION
            }
            explanation_values = {
                claim.normalized_value
                for claim in fact_claims
                if claim.location == ClaimLocation.EXPLANATION
            }
            if correct_values and explanation_values and correct_values != explanation_values:
                reasons.add(FactualReasonCode.ANSWER_EXPLANATION_MISMATCH)
            source_values: set[str] = set()
            for source in cited.values():
                values_from_source = _extract_values(source.text, fact, source=True)
                registered_chunk_with_wrong_document = (
                    source.chunk_id in fact.source_chunk_ids
                    and source.document_id not in fact.source_document_ids
                )
                if registered_chunk_with_wrong_document:
                    reasons.add(FactualReasonCode.SOURCE_NOT_ELIGIBLE)
                if values_from_source and source.chunk_id not in fact.source_chunk_ids:
                    reasons.add(FactualReasonCode.SOURCE_NOT_ELIGIBLE)
                source_values.update(values_from_source)
            claim_values = {claim.normalized_value for claim in fact_claims}
            if not source_values:
                reasons.add(FactualReasonCode.UNSUPPORTED_CLAIM)
            elif len(source_values) > 1 or not claim_values <= source_values:
                reasons.add(FactualReasonCode.SOURCE_CONFLICT)
        ordered_reasons = [code for code in FactualReasonCode if code in reasons]
        issues = [
            ValidationIssue(
                code=reason.value,
                message=(
                    f"factual guard rejected covered claim; factIds={','.join(fact_ids)}"
                ),
                question_index=question_index,
            )
            for reason in ordered_reasons
        ]
        return (
            FactualGuardResult(
                decision=(
                    FactualDecision.REJECT_REGENERATE
                    if reasons
                    else FactualDecision.PASS
                ),
                reason_codes=ordered_reasons,
                fact_ids_checked=fact_ids,
                source_ids=source_ids,
                covered_claim_count=len(claims),
                unknown_claim_count=0,
            ),
            issues,
        )
