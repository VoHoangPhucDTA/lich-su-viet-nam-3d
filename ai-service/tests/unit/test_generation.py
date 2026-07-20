import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.generation.duplicate_checker import token_jaccard
from app.generation.fake import FakeGenerationProvider
from app.generation.models import (
    GeneratedQuestion,
    GenerationOutputError,
    GenerationRequest,
    InsufficientContextError,
    QuizOption,
    StyleExample,
)
from app.generation.parser import parse_generation_json
from app.generation.prompt_builder import build_generation_prompt
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationService
from app.generation.validators import validate_questions
from app.main import create_app
from app.retrieval.models import (
    FactContext,
    RetrievalFilters,
    RetrievalMetadata,
    RetrievalResponse,
    RetrievalResult,
)


def configured(tmp_path: Path, **overrides) -> Settings:
    values = {
        "gemini_generation_model": "fake-generation-model",
        "chroma_persist_dir": tmp_path / "chroma",
        "chroma_report_dir": tmp_path / "reports",
        "embedding_output_dir": tmp_path / "embeddings",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def source(chunk_id: str = "chunk-1", text: str = "Năm 1945, Cách mạng tháng Tám giành thắng lợi.") -> RetrievalResult:
    return RetrievalResult(
        rank=1,
        chunkId=chunk_id,
        documentId="doc-1",
        grade=12,
        lessonNumber=6,
        lessonTitle="Cách mạng tháng Tám năm 1945",
        sectionTitle="Nguyên nhân thắng lợi",
        sectionPath="Bài 6 > Nguyên nhân thắng lợi",
        pageStart=None,
        pageEnd=None,
        contentTypes="knowledge",
        text=text,
        distance=0.1,
        chunkHash="a" * 64,
    )


def retrieval_response(results=None) -> RetrievalResponse:
    results = [source()] if results is None else results
    ids = [item.chunk_id for item in results]
    text = "\n\n".join(
        f"[SOURCE {index}]\nchunkId: {item.chunk_id}\n\n{item.text}"
        for index, item in enumerate(results, start=1)
    )
    return RetrievalResponse(
        query="query",
        filters=RetrievalFilters(grade=12, lessonNumber=6),
        topK=5,
        candidateCount=5,
        resultCount=len(results),
        results=results,
        factContext=FactContext(
            text=text,
            sourceChunkIds=ids,
            includedChunks=len(ids),
            truncated=False,
            characterCount=len(text),
        ),
        metadata=RetrievalMetadata(
            embeddingModel="gemini-embedding-2",
            embeddingDimension=768,
            corpusSha256="a" * 64,
            queryFormatterVersion="gemini-retrieval-query-v1",
            collectionName="sgk_kntt_history_gemini_v1",
            distanceMetric="cosine",
        ),
    )


class StubRetrieval:
    def __init__(self, response: RetrievalResponse) -> None:
        self.response = response
        self.closed = False

    def retrieve(self, request):
        return self.response

    def close(self):
        self.closed = True


def question(**overrides) -> GeneratedQuestion:
    values = {
        "question": "Sự kiện nào diễn ra vào năm 1945?",
        "options": [
            {"id": "A", "text": "Cách mạng tháng Tám giành thắng lợi"},
            {"id": "B", "text": "ASEAN được thành lập"},
            {"id": "C", "text": "Công cuộc Đổi mới bắt đầu"},
            {"id": "D", "text": "Liên hợp quốc giải thể"},
        ],
        "correctOptionId": "A",
        "explanation": "Nguồn nêu Cách mạng tháng Tám giành thắng lợi năm 1945.",
        "difficulty": "MEDIUM",
        "sourceChunkIds": ["chunk-1"],
    }
    values.update(overrides)
    return GeneratedQuestion.model_validate(values)


def style() -> StyleExample:
    value = question().model_dump(by_alias=True)
    value.pop("sourceChunkIds")
    return StyleExample.model_validate(value)


def test_request_schema_difficulty_and_strict_fields() -> None:
    with pytest.raises(ValidationError):
        GenerationRequest(query=" ")
    with pytest.raises(ValidationError):
        GenerationRequest(query="x", difficulty="UNKNOWN")
    with pytest.raises(ValidationError):
        GenerationRequest(query="x", rawFactContext="forbidden")
    request = GenerationRequest(query="  lịch sử ", difficulty="HARD")
    assert request.query == "lịch sử"
    assert request.difficulty.value == "HARD"


def test_style_schema_requires_exact_four_options() -> None:
    value = style().model_dump(by_alias=True)
    value["options"] = value["options"][:3]
    with pytest.raises(ValidationError):
        StyleExample.model_validate(value)


def test_prompt_sections_isolate_style_and_mark_sources() -> None:
    request = GenerationRequest(query="x", styleExamples=[style()])
    prompt = build_generation_prompt(request, retrieval_response().fact_context, count=1)
    assert "SYSTEM RULES" in prompt
    assert "FACT CONTEXT" in prompt
    assert "STYLE EXAMPLES" in prompt
    assert "STYLE ONLY — NOT A FACT SOURCE" in prompt
    assert "GENERATION REQUEST" in prompt
    assert "PROMPT VERSION: grounded-mcq-v1" in prompt
    assert "[SOURCE chunkId=chunk-1]" in prompt


def test_parser_rejects_fences_and_unknown_fields() -> None:
    raw = GeneratedQuestionBatch(questions=[question()]).model_dump_json(by_alias=True)
    assert parse_generation_json(raw).questions[0].source_chunk_ids == ["chunk-1"]
    with pytest.raises(GenerationOutputError):
        parse_generation_json(f"```json\n{raw}\n```")
    value = json.loads(raw)
    value["unknown"] = True
    with pytest.raises(GenerationOutputError):
        parse_generation_json(json.dumps(value))


def test_structural_source_date_and_duplicate_validation(tmp_path: Path) -> None:
    bad = question(
        options=[
            {"id": "A", "text": "Giống nhau"},
            {"id": "B", "text": "Giống nhau"},
            {"id": "C", "text": "C"},
            {"id": "D", "text": "D"},
        ],
        sourceChunkIds=["unknown"],
    )
    valid, summary = validate_questions(
        [bad], GenerationRequest(query="x"), [source()], configured(tmp_path)
    )
    assert not valid
    codes = {issue.code for issue in summary.issues}
    assert {"DUPLICATE_OPTION", "UNKNOWN_SOURCE_ID"} <= codes
    warning_question = question(question="Sự kiện nào diễn ra năm 1975?")
    _, warning_summary = validate_questions(
        [warning_question], GenerationRequest(query="x"), [source()], configured(tmp_path)
    )
    assert "DATE_EVIDENCE_WARNING" in {issue.code for issue in warning_summary.issues}
    assert token_jaccard("Vai trò của lịch sử?", "Vai trò lịch sử là gì?") > 0.5


def test_service_valid_response_and_partial_policy(tmp_path: Path) -> None:
    provider = FakeGenerationProvider([GeneratedQuestionBatch(questions=[question()])])
    retrieval = StubRetrieval(retrieval_response())
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=retrieval,  # type: ignore[arg-type]
        provider=provider,
    )
    response = service.generate(GenerationRequest(query="x", count=1))
    assert response.metadata.generated_count == 1
    assert response.questions[0].source_chunk_ids == ["chunk-1"]
    assert "FACT CONTEXT" in provider.prompts[0]


def test_invalid_first_generation_repair_succeeds(tmp_path: Path) -> None:
    invalid = question(sourceChunkIds=["unknown"])
    provider = FakeGenerationProvider(
        [GeneratedQuestionBatch(questions=[invalid]), GeneratedQuestionBatch(questions=[question()])]
    )
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )
    response = service.generate(GenerationRequest(query="x", count=1))
    assert response.metadata.repair_attempts == 1
    assert len(provider.prompts) == 2
    assert "REPAIR RULES" in provider.prompts[1]


def test_invalid_repair_is_rejected_and_empty_context_fails(tmp_path: Path) -> None:
    invalid = GeneratedQuestionBatch(questions=[question(sourceChunkIds=["unknown"])])
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=FakeGenerationProvider([invalid, invalid]),
    )
    with pytest.raises(GenerationOutputError):
        service.generate(GenerationRequest(query="x", count=1))
    empty = retrieval_response([])
    empty_service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(empty),  # type: ignore[arg-type]
        provider=FakeGenerationProvider([]),
    )
    with pytest.raises(InsufficientContextError):
        empty_service.generate(GenerationRequest(query="x", count=1))


def test_api_safe_error_mapping(tmp_path: Path, monkeypatch) -> None:
    class BrokenService:
        def generate(self, request):
            raise GenerationOutputError("AIza-hidden-secret")
        def close(self):
            return None
    monkeypatch.setattr("app.api.routes.generation.create_generation_service", lambda _: BrokenService())
    response = TestClient(create_app(configured(tmp_path))).post(
        "/ai/quiz/generate", json={"query": "valid"}
    )
    assert response.status_code == 502
    assert response.json() == {"detail": "Generated output is invalid"}
    assert "AIza-hidden-secret" not in response.text
