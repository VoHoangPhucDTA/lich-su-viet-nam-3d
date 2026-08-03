import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.dependencies import get_generation_service
from app.generation.diagnostics import DIAGNOSTICS_ENV
from app.generation.duplicate_checker import token_jaccard
from app.generation.fake import FakeGenerationProvider
from app.generation.models import (
    Difficulty,
    GeneratedQuestion,
    GenerationOutputError,
    GenerationRequest,
    GenerationUseCase,
    InsufficientContextError,
    StyleExample,
    ValidationIssue,
)
from app.generation.parser import parse_generation_json
from app.generation.prompt_builder import build_generation_prompt
from app.generation.repair import build_repair_prompt
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationEvaluationTrace, GenerationService
from app.generation.validators import (
    find_prompt_scaffolding_markers,
    validate_questions,
)
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
        "ai_service_internal_token": "internal-test-token",
        "gemini_generation_model": "fake-generation-model",
        "chroma_persist_dir": tmp_path / "chroma",
        "chroma_report_dir": tmp_path / "reports",
        "embedding_output_dir": tmp_path / "embeddings",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def source(
    chunk_id: str = "chunk-1", text: str = "Năm 1945, Cách mạng tháng Tám giành thắng lợi."
) -> RetrievalResult:
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
    with pytest.raises(ValidationError):
        GenerationRequest(query="x", generationModel="arbitrary-model")
    request = GenerationRequest(query="  lịch sử ", difficulty="HARD")
    assert request.query == "lịch sử"
    assert request.difficulty.value == "HARD"
    assert request.generation_use_case == GenerationUseCase.OTHER_INTERNAL
    assert request.canary_subject is None


def test_internal_routing_fields_use_closed_contract_and_normalize_subject() -> None:
    request = GenerationRequest(
        query="history",
        generationUseCase="SELF_PRACTICE",
        canarySubject="  user-1  ",
    )

    assert request.generation_use_case == GenerationUseCase.SELF_PRACTICE
    assert request.canary_subject == "user-1"
    with pytest.raises(ValidationError):
        GenerationRequest(query="history", generationUseCase="UNKNOWN")


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
    assert "PROMPT VERSION: grounded-mcq-v2" in prompt
    assert "[SOURCE chunkId=chunk-1]" in prompt
    assert "Học sinh không nhìn thấy prompt" in prompt


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
    valid, summary = validate_questions([bad], GenerationRequest(query="x"), [source()], configured(tmp_path))
    assert not valid
    codes = {issue.code for issue in summary.issues}
    assert {"DUPLICATE_OPTION", "UNKNOWN_SOURCE_ID"} <= codes
    warning_question = question(question="Sự kiện nào diễn ra năm 1975?")
    _, warning_summary = validate_questions(
        [warning_question], GenerationRequest(query="x"), [source()], configured(tmp_path)
    )
    assert "DATE_EVIDENCE_WARNING" in {issue.code for issue in warning_summary.issues}
    assert token_jaccard("Vai trò của lịch sử?", "Vai trò lịch sử là gì?") > 0.5


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("question", "FACT   CONTEXT cho biết sự kiện nào?"),
        ("explanation", "Theo đoạn trích trên, đáp án A là đúng."),
        ("option", "The provided context"),
        ("question", "Theo đoạn trích, được cung cấp: sự kiện nào?"),
    ],
)
def test_scaffolding_marker_is_error_in_every_visible_field(tmp_path: Path, field: str, value: str) -> None:
    overrides = {}
    if field == "option":
        options = question().model_dump(by_alias=True)["options"]
        options[1]["text"] = value
        overrides["options"] = options
    else:
        overrides[field] = value
    valid, summary = validate_questions(
        [question(**overrides)],
        GenerationRequest(query="x"),
        [source()],
        configured(tmp_path),
    )
    assert not valid
    issue = next(item for item in summary.issues if item.code == "PROMPT_SCAFFOLDING_LEAK")
    assert issue.severity == "ERROR"


def test_scaffolding_detection_avoids_legitimate_historical_terms(
    tmp_path: Path,
) -> None:
    legitimate = question(question="Nguồn sử liệu nào phản ánh vai trò của tư liệu lịch sử?")
    valid, summary = validate_questions(
        [legitimate],
        GenerationRequest(query="x"),
        [source()],
        configured(tmp_path),
    )
    assert valid == [legitimate]
    assert "PROMPT_SCAFFOLDING_LEAK" not in {issue.code for issue in summary.issues}
    assert not find_prompt_scaffolding_markers(legitimate.question)


def test_difficulty_mismatch_is_warning_and_normalized_without_repair(
    tmp_path: Path,
) -> None:
    provider = FakeGenerationProvider([GeneratedQuestionBatch(questions=[question(difficulty="HARD")])])
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )
    response = service.generate(GenerationRequest(query="x", count=1, difficulty="MEDIUM"))
    assert response.questions[0].difficulty == Difficulty.MEDIUM
    assert response.metadata.repair_attempts == 0
    assert response.warnings == ["DIFFICULTY_MISMATCH"]
    assert len(provider.prompts) == 1


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


def test_scaffolding_repair_receives_issue_and_returns_clean_question(
    tmp_path: Path,
) -> None:
    invalid = question(explanation="Theo FACT CONTEXT, đáp án A đúng.")
    provider = FakeGenerationProvider(
        [
            GeneratedQuestionBatch(questions=[invalid]),
            GeneratedQuestionBatch(questions=[question()]),
        ]
    )
    trace = GenerationEvaluationTrace()
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )
    response = service.generate(
        GenerationRequest(query="x", count=1),
        evaluation_trace=trace,
    )
    assert len(provider.prompts) == 2
    assert "PROMPT_SCAFFOLDING_LEAK" in provider.prompts[1]
    assert "nội dung tự chứa" in provider.prompts[1]
    assert not find_prompt_scaffolding_markers(response.questions[0].question)
    assert not find_prompt_scaffolding_markers(response.questions[0].explanation)
    assert trace.repair_attempt_count == trace.repair_success_count == 1
    assert trace.repair_failure_count == 0


def _diagnostic_payloads(caplog: pytest.LogCaptureFixture, event: str) -> list[dict]:
    return [
        json.loads(record.getMessage().split("payload=", 1)[1])
        for record in caplog.records
        if f"event={event} payload=" in record.getMessage()
    ]


@pytest.mark.parametrize(
    ("field", "expected_field", "expected_option", "expected_category"),
    [
        ("question", "QUESTION", None, "FACT_CONTEXT_LABEL"),
        ("option", "OPTION", 1, "INSTRUCTION_REFERENCE"),
        ("explanation", "EXPLANATION", None, "PASSAGE_REFERENCE"),
    ],
)
def test_diagnostics_trace_scaffolding_field_without_content(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    field: str,
    expected_field: str,
    expected_option: int | None,
    expected_category: str,
) -> None:
    overrides: dict[str, object] = {}
    leaked_text = ""
    if field == "question":
        leaked_text = "FACT CONTEXT cho biết sự kiện nào?"
        overrides["question"] = leaked_text
    elif field == "explanation":
        leaked_text = "Theo đoạn trích trên, đáp án A đúng."
        overrides["explanation"] = leaked_text
    else:
        leaked_text = "The provided context"
        options = question().model_dump(by_alias=True)["options"]
        options[1]["text"] = leaked_text
        overrides["options"] = options
    provider = FakeGenerationProvider(
        [
            GeneratedQuestionBatch(questions=[question(**overrides)]),
            GeneratedQuestionBatch(questions=[question()]),
        ]
    )
    monkeypatch.setenv(DIAGNOSTICS_ENV, "true")
    caplog.set_level(logging.INFO, logger="app.generation.diagnostics")
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )

    response = service.generate(GenerationRequest(query="x", count=1))

    traces = _diagnostic_payloads(caplog, "generation.repair_trace")
    matching = next(item for item in traces if item["outputField"] == expected_field)
    assert matching["issueCode"] == "PROMPT_SCAFFOLDING_LEAK"
    assert matching["issueSeverity"] == "ERROR"
    assert matching["optionIndex"] == expected_option
    assert matching["markerCategory"] == expected_category
    assert matching["repairAttemptNumber"] == 1
    assert len(provider.prompts) == 2
    assert response.metadata.repair_attempts == 1
    assert leaked_text not in caplog.text
    assert "REPAIR RULES" not in caplog.text


def test_warning_does_not_trigger_repair_diagnostics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv(DIAGNOSTICS_ENV, "true")
    caplog.set_level(logging.INFO, logger="app.generation.diagnostics")
    provider = FakeGenerationProvider(
        [GeneratedQuestionBatch(questions=[question(difficulty="HARD")])]
    )
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )

    response = service.generate(
        GenerationRequest(query="x", count=1, difficulty="MEDIUM")
    )

    assert response.metadata.repair_attempts == 0
    assert len(provider.prompts) == 1
    assert not _diagnostic_payloads(caplog, "generation.repair_trace")
    decision = _diagnostic_payloads(caplog, "generation.repair_decision")[0]
    assert decision["initialValidationIssueCount"] == 1
    assert decision["repairEligibleIssueCount"] == 0
    assert decision["repairTriggered"] is False
    assert decision["repairProviderCalled"] is False
    assert decision["finalValid"] is True


def test_diagnostic_issue_order_and_default_off_public_contract(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv(DIAGNOSTICS_ENV, "true")
    caplog.set_level(logging.INFO, logger="app.generation.diagnostics")
    invalid = question(
        question="FACT CONTEXT cho biết sự kiện nào?",
        sourceChunkIds=["unknown"],
    )
    provider = FakeGenerationProvider(
        [
            GeneratedQuestionBatch(questions=[invalid]),
            GeneratedQuestionBatch(questions=[question()]),
        ]
    )
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )
    response = service.generate(GenerationRequest(query="x", count=1))
    codes = [
        item["issueCode"]
        for item in _diagnostic_payloads(caplog, "generation.repair_trace")
    ]
    assert codes == ["PROMPT_SCAFFOLDING_LEAK", "UNKNOWN_SOURCE_ID"]
    assert set(response.model_dump(by_alias=True)) == {
        "questions",
        "sources",
        "metadata",
        "warnings",
    }

    caplog.clear()
    monkeypatch.delenv(DIAGNOSTICS_ENV)
    disabled_provider = FakeGenerationProvider(
        [
            GeneratedQuestionBatch(questions=[invalid]),
            GeneratedQuestionBatch(questions=[question()]),
        ]
    )
    disabled_service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=disabled_provider,
    )
    disabled_service.generate(GenerationRequest(query="x", count=1))
    assert not _diagnostic_payloads(caplog, "generation.repair_trace")
    assert not _diagnostic_payloads(caplog, "generation.repair_decision")


def test_parse_failure_trace_uses_stable_code_and_one_repair(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv(DIAGNOSTICS_ENV, "true")
    caplog.set_level(logging.INFO, logger="app.generation.diagnostics")
    provider = FakeGenerationProvider(
        [
            GenerationOutputError("AIza-hidden-secret", raw_output="private output"),
            GeneratedQuestionBatch(questions=[question()]),
        ]
    )
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )

    response = service.generate(GenerationRequest(query="x", count=1))

    traces = _diagnostic_payloads(caplog, "generation.repair_trace")
    assert [item["issueCode"] for item in traces] == ["STRUCTURED_OUTPUT_FAILURE"]
    assert traces[0]["outputField"] == "ROOT"
    assert response.metadata.repair_attempts == 1
    assert len(provider.prompts) == 2
    assert "AIza-hidden-secret" not in caplog.text
    assert "private output" not in caplog.text


@pytest.mark.parametrize(
    ("kind", "expected_code"),
    [
        ("within", "DUPLICATE_WITHIN_BATCH"),
        ("style", "DUPLICATE_STYLE_EXAMPLE"),
    ],
)
def test_duplicate_errors_are_traced_but_invalid_questions_are_not_public(
    tmp_path: Path, kind: str, expected_code: str
) -> None:
    initial_questions = [question(), question()] if kind == "within" else [question()]
    repaired = question(question="Nguyên nhân trực tiếp của thắng lợi năm 1945 là gì?")
    provider = FakeGenerationProvider(
        [
            GeneratedQuestionBatch(questions=initial_questions),
            GeneratedQuestionBatch(questions=[repaired]),
        ]
    )
    trace = GenerationEvaluationTrace()
    service = GenerationService(
        settings=configured(tmp_path),
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=provider,
    )
    request = GenerationRequest(
        query="x",
        count=1,
        styleExamples=[style()] if kind == "style" else [],
    )
    response = service.generate(request, evaluation_trace=trace)
    assert expected_code in {issue.code for issue in trace.validation_issues}
    assert [item.question for item in response.questions] == [repaired.question]
    assert expected_code not in response.warnings


def test_repair_prompt_preserves_source_contract_instruction() -> None:
    prompt = build_repair_prompt(
        "original",
        "{}",
        [
            ValidationIssue(
                code="PROMPT_SCAFFOLDING_LEAK",
                message="hidden context",
                questionIndex=0,
            )
        ],
        retrieval_response().fact_context,
    )
    assert "PROMPT_SCAFFOLDING_LEAK" in prompt
    assert "sourceChunkIds hợp lệ" in prompt


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

    app = create_app(configured(tmp_path))
    app.dependency_overrides[get_generation_service] = lambda: BrokenService()
    with TestClient(app) as client:
        response = client.post(
            "/ai/quiz/generate",
            json={"query": "valid"},
            headers={"X-Internal-Service-Token": "internal-test-token"},
        )
    assert response.status_code == 502
    assert response.json() == {"detail": "Generated output is invalid"}
    assert "AIza-hidden-secret" not in response.text


def test_generation_route_requires_internal_token(tmp_path: Path) -> None:
    client = TestClient(create_app(configured(tmp_path)))
    path = "/ai/quiz/generate"
    assert client.post(path, json={"query": "valid"}).status_code == 401
    assert (
        client.post(
            path,
            json={"query": "valid"},
            headers={"X-Internal-Service-Token": "wrong"},
        ).status_code
        == 401
    )


def test_generation_route_fails_closed_when_internal_token_is_unconfigured(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(configured(tmp_path, ai_service_internal_token="")))
    response = client.post("/ai/quiz/generate", json={"query": "valid"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Internal authentication is not configured"}
