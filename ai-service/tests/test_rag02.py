"""Offline adversarial and runtime-integration coverage for the RAG-02 guard."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes.generation import generate_quiz
from app.config import SERVICE_ROOT, Settings
from app.dependencies import get_generation_service
from app.factual_guard import FactualGuard, load_critical_fact_registry
from app.factual_guard.models import FactualDecision, FactualReasonCode
from app.factual_guard.registry import validate_critical_fact_registry
from app.generation.fake import FakeGenerationProvider
from app.generation.models import (
    FactualValidationError,
    GeneratedQuestion,
    GenerationRequest,
)
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationEvaluationTrace, GenerationService
from app.main import create_app
from app.retrieval.models import (
    FactContext,
    RetrievalFilters,
    RetrievalMetadata,
    RetrievalResponse,
    RetrievalResult,
)

CORPUS_SHA256 = "a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2"
BACH_DANG_CHUNK = "kntt-ls11-bai07-12370-c0004-567f989c"
BACH_DANG_DOCUMENT = "kntt-ls11-bai07-12370"
REGISTRY_PATH = SERVICE_ROOT / "data/factual_guard/critical_facts_v1.json"
CORPUS_PATH = SERVICE_ROOT / "data/corpus/sgk_chunks.jsonl"


def settings(tmp_path: Path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "ai_service_internal_token": "internal-test-token",
        "gemini_generation_model": "fake-generation-model",
        "chroma_persist_dir": tmp_path / "chroma",
        "chroma_report_dir": tmp_path / "reports",
        "embedding_output_dir": tmp_path / "embeddings",
        "gemini_generation_repair_attempts": 1,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def source(
    text: str,
    *,
    chunk_id: str = BACH_DANG_CHUNK,
    document_id: str = BACH_DANG_DOCUMENT,
    grade: int = 11,
    lesson_number: int = 7,
) -> RetrievalResult:
    return RetrievalResult(
        rank=1,
        chunkId=chunk_id,
        documentId=document_id,
        grade=grade,
        lessonNumber=lesson_number,
        lessonTitle="Lịch sử Việt Nam",
        sectionTitle="Tư liệu đã kiểm duyệt",
        sectionPath="Bài > Tư liệu",
        pageStart=1,
        pageEnd=1,
        contentTypes="knowledge",
        text=text,
        distance=0.1,
        chunkHash="a" * 64,
    )


def retrieval(*sources: RetrievalResult, corpus_sha256: str = CORPUS_SHA256) -> RetrievalResponse:
    context = "\n\n".join(item.text for item in sources)
    return RetrievalResponse(
        query="Bạch Đằng",
        filters=RetrievalFilters(),
        topK=5,
        candidateCount=len(sources),
        resultCount=len(sources),
        results=list(sources),
        factContext=FactContext(
            text=context,
            sourceChunkIds=[item.chunk_id for item in sources],
            includedChunks=len(sources),
            truncated=False,
            characterCount=len(context),
        ),
        metadata=RetrievalMetadata(
            embeddingModel="fake-embedding",
            embeddingDimension=768,
            corpusSha256=corpus_sha256,
            queryFormatterVersion="test-v1",
            collectionName="test-collection",
            distanceMetric="cosine",
        ),
    )


def bach_dang_question(
    year: int = 938,
    *,
    explanation_year: int | None = None,
    source_ids: list[str] | None = None,
    duration: bool = False,
) -> GeneratedQuestion:
    explanation_year = year if explanation_year is None else explanation_year
    duration_text = ", chấm dứt hơn 1000 năm Bắc thuộc" if duration else ""
    distractors = [value for value in (937, 938, 939, 940) if value != year]
    return GeneratedQuestion.model_validate(
        {
            "question": "Chiến thắng Bạch Đằng của Ngô Quyền diễn ra năm nào?",
            "options": [
                {"id": "A", "text": str(distractors[0])},
                {"id": "B", "text": str(year)},
                {"id": "C", "text": str(distractors[1])},
                {"id": "D", "text": str(distractors[2])},
            ],
            "correctOptionId": "B",
            "explanation": (
                f"Năm {explanation_year}, Ngô Quyền giành chiến thắng trên sông "
                f"Bạch Đằng{duration_text}."
            ),
            "difficulty": "MEDIUM",
            "sourceChunkIds": source_ids or [BACH_DANG_CHUNK],
        }
    )


def guard_result(
    question: GeneratedQuestion,
    *sources: RetrievalResult,
    corpus_sha256: str = CORPUS_SHA256,
):
    guard = FactualGuard.from_path(REGISTRY_PATH)
    return guard.validate_question(
        question,
        list(sources),
        corpus_sha256=corpus_sha256,
        question_index=0,
    )


def canonical_bach_dang_source() -> RetrievalResult:
    return source("Kháng chiến chống quân Nam Hán 938 Ngô Quyền Bạch Đằng (Quảng Ninh).")


def assert_rejected(result, expected: FactualReasonCode) -> None:
    assert result.decision == FactualDecision.REJECT_REGENERATE
    assert expected in result.reason_codes


def test_registry_schema_sources_and_corpus_identity_are_valid() -> None:
    registry = load_critical_fact_registry(REGISTRY_PATH)
    result = validate_critical_fact_registry(registry, CORPUS_PATH)

    assert result["status"] == "PASS"
    assert result["factCount"] == 10
    assert result["valueTypes"] == ["COUNT", "DATE", "PERSON", "YEAR"]
    assert result["resolvedSourceCount"] == 10


@pytest.mark.parametrize("year", [939, 937])
def test_bach_dang_wrong_year_is_rejected(year: int) -> None:
    result, _ = guard_result(bach_dang_question(year), canonical_bach_dang_source())
    assert_rejected(result, FactualReasonCode.FACT_CONTRADICTION)


def test_bach_dang_938_passes_and_false_distractors_are_ignored() -> None:
    result, issues = guard_result(bach_dang_question(), canonical_bach_dang_source())

    assert result.decision == FactualDecision.PASS
    assert not issues
    assert result.covered_claim_count >= 2


def test_answer_explanation_mismatch_is_rejected() -> None:
    result, _ = guard_result(
        bach_dang_question(938, explanation_year=939), canonical_bach_dang_source()
    )
    assert_rejected(result, FactualReasonCode.ANSWER_EXPLANATION_MISMATCH)


def test_duration_1000_is_not_misread_as_event_year() -> None:
    result, _ = guard_result(bach_dang_question(duration=True), canonical_bach_dang_source())
    assert result.decision == FactualDecision.PASS


def test_contextual_reign_end_is_not_misread_as_accession_year() -> None:
    le_source = source(
        "Năm 1460, Lê Thánh Tông lên ngôi trong bối cảnh bộ máy hành chính yếu kém.",
        chunk_id="kntt-ls11-bai13-12390-c0002-dfa004e0",
        document_id="kntt-ls11-bai13-12390",
        lesson_number=13,
    )
    question = GeneratedQuestion.model_validate(
        {
            "question": "Lê Thánh Tông lên ngôi năm nào?",
            "options": [
                {"id": "A", "text": "1460"},
                {"id": "B", "text": "1461"},
                {"id": "C", "text": "1497"},
                {"id": "D", "text": "1500"},
            ],
            "correctOptionId": "A",
            "explanation": "Lê Thánh Tông lên ngôi năm 1460 và trị vì đến năm 1497.",
            "difficulty": "MEDIUM",
            "sourceChunkIds": [le_source.chunk_id],
        }
    )
    result, _ = guard_result(question, le_source)
    assert result.decision == FactualDecision.PASS


def test_count_193_is_typed_as_count_and_passes() -> None:
    un_source = source(
        "Phiên họp năm 2022 của Liên hợp quốc có đại diện 193 quốc gia thành viên.",
        chunk_id="kntt-ls12-bai01-12945-c0001-f1123afd",
        document_id="kntt-ls12-bai01-12945",
        grade=12,
        lesson_number=1,
    )
    question = GeneratedQuestion.model_validate(
        {
            "question": "Năm 2022, Liên hợp quốc có bao nhiêu quốc gia thành viên?",
            "options": [
                {"id": "A", "text": "191"},
                {"id": "B", "text": "192"},
                {"id": "C", "text": "193"},
                {"id": "D", "text": "194"},
            ],
            "correctOptionId": "C",
            "explanation": "Liên hợp quốc có đại diện của 193 quốc gia thành viên.",
            "difficulty": "MEDIUM",
            "sourceChunkIds": [un_source.chunk_id],
        }
    )
    result, _ = guard_result(question, un_source)
    assert result.decision == FactualDecision.PASS


@pytest.mark.parametrize(
    ("date_text", "expected"),
    [
        ("14 tháng 7 năm 1789", FactualDecision.PASS),
        ("15 tháng 7 năm 1789", FactualDecision.REJECT_REGENERATE),
    ],
)
def test_bastille_date_normalization(date_text: str, expected: FactualDecision) -> None:
    bastille_source = source(
        "Ngày 14-7-1789 - Ngày phá ngục Ba-xti, mở đầu Cách mạng tư sản Pháp.",
        chunk_id="kntt-ls11-bai01-12335-c0001-9a647d0a",
        document_id="kntt-ls11-bai01-12335",
        lesson_number=1,
    )
    question = GeneratedQuestion.model_validate(
        {
            "question": "Sự kiện phá ngục Ba-xti diễn ra vào ngày nào?",
            "options": [
                {"id": "A", "text": date_text},
                {"id": "B", "text": "4 tháng 7 năm 1789"},
                {"id": "C", "text": "14 tháng 7 năm 1790"},
                {"id": "D", "text": "15 tháng 7 năm 1790"},
            ],
            "correctOptionId": "A",
            "explanation": f"Phá ngục Ba-xti diễn ra ngày {date_text}.",
            "difficulty": "MEDIUM",
            "sourceChunkIds": [bastille_source.chunk_id],
        }
    )
    result, _ = guard_result(question, bastille_source)
    assert result.decision == expected


def test_corrupted_source_and_generated_wrong_value_is_rejected_by_registry() -> None:
    corrupt = source("Năm 939, Ngô Quyền giành chiến thắng Bạch Đằng.")
    result, _ = guard_result(bach_dang_question(939), corrupt)
    assert_rejected(result, FactualReasonCode.FACT_CONTRADICTION)


def test_canonical_value_with_corrupted_source_is_not_served() -> None:
    corrupt = source("Năm 939, Ngô Quyền giành chiến thắng Bạch Đằng.")
    result, _ = guard_result(bach_dang_question(938), corrupt)
    assert_rejected(result, FactualReasonCode.SOURCE_CONFLICT)


def test_missing_source_claim_is_not_served() -> None:
    missing = source("Đoạn này chỉ nói về một nội dung không liên quan.")
    result, _ = guard_result(bach_dang_question(), missing)
    assert_rejected(result, FactualReasonCode.UNSUPPORTED_CLAIM)


def test_unregistered_source_for_covered_fact_is_not_eligible() -> None:
    unregistered = source(
        "Năm 938, Ngô Quyền giành chiến thắng Bạch Đằng.",
        chunk_id="unregistered-covered-source",
        document_id="unregistered-document",
    )
    question = bach_dang_question(source_ids=[unregistered.chunk_id])
    result, _ = guard_result(question, unregistered)
    assert_rejected(result, FactualReasonCode.SOURCE_NOT_ELIGIBLE)


def test_two_sources_with_conflicting_values_are_not_served() -> None:
    canonical = canonical_bach_dang_source()
    corrupt = source(
        "Năm 939, Ngô Quyền giành chiến thắng Bạch Đằng.",
        chunk_id="fake-conflicting-source",
        document_id="fake-doc",
    )
    question = bach_dang_question(source_ids=[canonical.chunk_id, corrupt.chunk_id])
    result, _ = guard_result(question, canonical, corrupt)
    assert_rejected(result, FactualReasonCode.SOURCE_CONFLICT)


def test_commander_swap_is_rejected() -> None:
    question = GeneratedQuestion.model_validate(
        {
            "question": "Ai là người chỉ huy chiến thắng Bạch Đằng năm 938?",
            "options": [
                {"id": "A", "text": "Lê Hoàn"},
                {"id": "B", "text": "Ngô Quyền"},
                {"id": "C", "text": "Lý Thường Kiệt"},
                {"id": "D", "text": "Trần Quốc Tuấn"},
            ],
            "correctOptionId": "A",
            "explanation": "Lê Hoàn là người chỉ huy chiến thắng Bạch Đằng năm 938.",
            "difficulty": "MEDIUM",
            "sourceChunkIds": [BACH_DANG_CHUNK],
        }
    )
    result, _ = guard_result(question, canonical_bach_dang_source())
    assert_rejected(result, FactualReasonCode.FACT_CONTRADICTION)


def test_uncovered_source_supported_fact_passes_with_unknown_coverage() -> None:
    uncovered_source = source("Năm 1967, ASEAN được thành lập.", chunk_id="asean", document_id="asean")
    question = GeneratedQuestion.model_validate(
        {
            "question": "ASEAN được thành lập năm nào?",
            "options": [
                {"id": "A", "text": "1965"},
                {"id": "B", "text": "1966"},
                {"id": "C", "text": "1967"},
                {"id": "D", "text": "1968"},
            ],
            "correctOptionId": "C",
            "explanation": "ASEAN được thành lập năm 1967.",
            "difficulty": "MEDIUM",
            "sourceChunkIds": [uncovered_source.chunk_id],
        }
    )
    result, issues = guard_result(question, uncovered_source)
    assert result.decision == FactualDecision.PASS
    assert result.reason_codes == [FactualReasonCode.VALIDATION_UNKNOWN]
    assert result.unknown_claim_count == 1
    assert not issues


def test_registry_corpus_mismatch_fails_closed_for_covered_claim() -> None:
    result, _ = guard_result(
        bach_dang_question(), canonical_bach_dang_source(), corpus_sha256="b" * 64
    )
    assert_rejected(result, FactualReasonCode.REGISTRY_CORPUS_MISMATCH)


class StubRetrieval:
    def __init__(self, response: RetrievalResponse) -> None:
        self.response = response

    def retrieve(self, request: object) -> RetrievalResponse:
        return self.response

    def close(self) -> None:
        return None


def service(
    tmp_path: Path,
    outcomes: list[GeneratedQuestionBatch],
    response: RetrievalResponse | None = None,
) -> tuple[GenerationService, FakeGenerationProvider]:
    provider = FakeGenerationProvider(outcomes)
    value = GenerationService(
        settings=settings(tmp_path),
        retrieval_service=StubRetrieval(
            response or retrieval(canonical_bach_dang_source())
        ),  # type: ignore[arg-type]
        provider=provider,
    )
    return value, provider


def batch(question: GeneratedQuestion) -> GeneratedQuestionBatch:
    return GeneratedQuestionBatch(questions=[question])


def test_generation_service_valid_first_attempt_needs_no_repair(tmp_path: Path) -> None:
    value, provider = service(tmp_path, [batch(bach_dang_question())])
    trace = GenerationEvaluationTrace()
    response = value.generate(GenerationRequest(query="Bạch Đằng", count=1), evaluation_trace=trace)

    assert response.metadata.repair_attempts == 0
    assert len(provider.prompts) == 1
    assert trace.factual_validation_status == "PASS"


def test_generation_service_invalid_then_valid_uses_one_bounded_repair(tmp_path: Path) -> None:
    value, provider = service(
        tmp_path, [batch(bach_dang_question(939)), batch(bach_dang_question(938))]
    )
    response = value.generate(GenerationRequest(query="Bạch Đằng", count=1))

    assert response.metadata.repair_attempts == 1
    assert len(provider.prompts) == 2
    assert "FACT_CONTRADICTION" in provider.prompts[1]


def test_generation_service_invalid_after_max_repair_is_controlled_failure(
    tmp_path: Path,
) -> None:
    value, provider = service(
        tmp_path, [batch(bach_dang_question(939)), batch(bach_dang_question(937))]
    )
    with pytest.raises(FactualValidationError):
        value.generate(GenerationRequest(query="Bạch Đằng", count=1))
    assert len(provider.prompts) == 2


def test_generation_service_corrupted_source_never_serves_repaired_output(
    tmp_path: Path,
) -> None:
    corrupt_response = retrieval(source("Năm 939, Ngô Quyền giành chiến thắng Bạch Đằng."))
    value, provider = service(
        tmp_path,
        [batch(bach_dang_question(939)), batch(bach_dang_question(938))],
        corrupt_response,
    )
    with pytest.raises(FactualValidationError):
        value.generate(GenerationRequest(query="Bạch Đằng", count=1))
    assert len(provider.prompts) == 2


def test_api_maps_factual_exhaustion_to_public_safe_controlled_failure(tmp_path: Path) -> None:
    class BrokenService:
        def generate(self, request: GenerationRequest) -> None:
            raise FactualValidationError()

        def close(self) -> None:
            return None

    app = create_app(settings(tmp_path))
    app.dependency_overrides[get_generation_service] = lambda: BrokenService()
    with TestClient(app) as client:
        response = client.post(
            "/ai/quiz/generate",
            json={"query": "Bạch Đằng"},
            headers={"X-Internal-Service-Token": "internal-test-token"},
        )
    assert response.status_code == 502
    assert response.json() == {
        "detail": {
            "code": "FACTUAL_VALIDATION_FAILED",
            "message": "Chưa thể tạo câu hỏi đủ độ tin cậy từ nguồn hiện có.",
        }
    }


def test_production_factual_guard_has_no_rag01_gold_dependency() -> None:
    source_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (SERVICE_ROOT / "app/factual_guard").glob("*.py")
    )
    assert "generation_27_v1" not in source_text
    assert "data/evaluation/rag01" not in source_text
    assert generate_quiz is not None
