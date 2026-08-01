import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import (
    build_teacher_evaluation_sample,
    evaluate_generation,
    evaluate_retrieval_legacy,
    generate_quiz,
    query_retrieval,
)


@pytest.mark.parametrize(
    "parser",
    [query_retrieval.create_parser(), generate_quiz.create_parser()],
)
def test_manual_cli_help_keeps_success_exit_code(parser, capsys) -> None:
    with pytest.raises(SystemExit) as exc_info:
        parser.parse_args(["--help"])

    assert exc_info.value.code == 0
    assert "--query" in capsys.readouterr().out


@pytest.mark.parametrize(
    "parser",
    [query_retrieval.create_parser(), generate_quiz.create_parser()],
)
def test_manual_cli_query_remains_required(parser, capsys) -> None:
    with pytest.raises(SystemExit) as exc_info:
        parser.parse_args([])

    assert exc_info.value.code == 2
    assert "--query" in capsys.readouterr().err


def test_query_retrieval_parser_preserves_flags_and_defaults() -> None:
    args = query_retrieval.create_parser().parse_args(
        [
            "--query",
            "Cách mạng tháng Tám",
            "--grade",
            "12",
            "--lesson-number",
            "6",
            "--document-id",
            "doc-1",
            "--top-k",
            "7",
            "--json",
            "--show-context",
        ]
    )

    assert args.query == "Cách mạng tháng Tám"
    assert args.grade == 12
    assert args.lesson_number == 6
    assert args.document_id == "doc-1"
    assert args.top_k == 7
    assert args.json_output is True
    assert args.show_context is True


def test_generate_quiz_parser_preserves_choices_defaults_and_utf8_path() -> None:
    utf8_windows_path = Path(r"C:\ôn tập\mẫu.json")
    args = generate_quiz.create_parser().parse_args(
        [
            "--query",
            "Chiến thắng Điện Biên Phủ",
            "--style-examples-file",
            str(utf8_windows_path),
        ]
    )

    assert args.difficulty == "MEDIUM"
    assert args.count is None
    assert args.top_k is None
    assert args.style_examples_file == utf8_windows_path
    with pytest.raises(SystemExit) as exc_info:
        generate_quiz.create_parser().parse_args(
            ["--query", "event", "--difficulty", "UNKNOWN"]
        )
    assert exc_info.value.code == 2


@pytest.mark.parametrize(
    ("module", "argv"),
    [
        (query_retrieval, ["--query", "event", "--grade", "9"]),
        (generate_quiz, ["--query", "event", "--grade", "9"]),
    ],
)
def test_invalid_manual_cli_request_returns_two_without_opening_service(
    module,
    argv: list[str],
    monkeypatch,
    capsys,
) -> None:
    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("service must not be opened after request validation fails")

    factory_name = (
        "create_retrieval_service"
        if module is query_retrieval
        else "create_generation_service"
    )
    monkeypatch.setattr(module, factory_name, fail_if_called)

    assert module.main(argv) == 2
    assert "FAILED" in capsys.readouterr().out


def test_generation_evaluation_request_keeps_camel_case_wire_contract() -> None:
    case = evaluate_generation._load_cases()[0]
    request = evaluate_generation._case_request(case)
    payload = request.model_dump(by_alias=True)

    assert payload["lessonNumber"] == case.lesson_number
    assert payload["topK"] == case.top_k
    assert payload["styleExamples"] == [
        style.model_dump(by_alias=True) for style in request.style_examples
    ]
    assert "lesson_number" not in payload


def test_legacy_evaluation_mode_and_filter_aliases_are_stable() -> None:
    assert evaluate_retrieval_legacy._evaluation_mode(2, 0) == "OFFLINE_CACHE_REPLAY"
    assert evaluate_retrieval_legacy._evaluation_mode(0, 2) == "LIVE_CACHE_FILL"
    assert evaluate_retrieval_legacy._evaluation_mode(1, 1) == "MIXED"
    assert evaluate_retrieval_legacy._evaluation_mode(0, 0) == "SYNTHETIC_TEST_DATA"

    record = SimpleNamespace(grade=12, lesson_number=6)
    filters = evaluate_retrieval_legacy._filters_for_mode(
        record, "GRADE_AND_LESSON"
    )
    assert filters.model_dump(by_alias=True) == {
        "grade": 12,
        "lessonNumber": 6,
        "documentId": None,
    }


def test_teacher_sample_offline_preflight_never_opens_runtime(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("offline preflight must not open runtime or provider")

    monkeypatch.setattr(build_teacher_evaluation_sample, "get_settings", fail_if_called)
    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "create_generation_service",
        fail_if_called,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "build_teacher_evaluation_sample",
            "--offline-preflight",
            "--output-dir",
            str(tmp_path),
        ],
    )

    assert build_teacher_evaluation_sample.main() == 0
    report = json.loads((tmp_path / "sample-manifest.json").read_text("utf-8"))
    assert report["status"] == "PREFLIGHT_PASSED"
    assert report["providerCalled"] is False
    assert report["teacherEvaluation"] == "NOT YET COLLECTED"


def test_teacher_sample_cache_miss_without_approval_never_calls_provider(
    tmp_path: Path,
    monkeypatch,
) -> None:
    manifest_item = {
        "evaluationItemId": "teacher-eval-test",
        "query": "event",
        "grade": 12,
        "lessonNumber": 6,
        "difficulty": "MEDIUM",
        "topK": 5,
    }
    captured_sample: list[dict[str, object]] = []

    class FakeCache:
        def identity(self, *_args, **_kwargs) -> str:
            return "cache-identity"

        def get(self, _identity):
            return None

    class FakeRetrievalService:
        def retrieve(self, _request):
            return object()

    class FakeGenerationService:
        retrieval_service = FakeRetrievalService()
        provider_calls = 0

        def generate(self, *_args, **_kwargs):
            self.provider_calls += 1
            raise AssertionError("provider call must remain blocked")

        def close(self) -> None:
            return None

    service = FakeGenerationService()
    settings = SimpleNamespace(
        gemini_generation_model="generation-model",
        gemini_generation_temperature=0.3,
        gemini_embedding_model="embedding-model",
        gemini_embedding_dimension=768,
        chroma_collection_name="collection",
    )

    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "load_jsonl",
        lambda _path: [manifest_item],
    )
    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "validate_manifest",
        lambda _rows: {"manifestVersion": "teacher-evaluation-v1", "sampleSize": 1},
    )
    monkeypatch.setattr(build_teacher_evaluation_sample, "get_settings", lambda: settings)
    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "GenerationCache",
        lambda _path: FakeCache(),
    )
    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "create_generation_service",
        lambda _settings: service,
    )
    monkeypatch.setattr(
        build_teacher_evaluation_sample,
        "write_jsonl",
        lambda _path, rows: captured_sample.extend(rows),
    )
    monkeypatch.setattr(build_teacher_evaluation_sample, "git_commit", lambda: "deadbeef")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "build_teacher_evaluation_sample",
            "--execute",
            "--output-dir",
            str(tmp_path),
        ],
    )

    assert build_teacher_evaluation_sample.main() == 1
    assert service.provider_calls == 0
    assert captured_sample[0]["status"] == "GENERATION_FAILED"
    assert (
        captured_sample[0]["errorCode"]
        == "CACHE_MISS_PROVIDER_CALL_NOT_APPROVED"
    )
