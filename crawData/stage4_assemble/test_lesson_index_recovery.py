from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from prepare_indexes import (  # noqa: E402
    GRADE_FILES,
    LessonIndexError,
    apply_lesson_title_overrides,
    build_lesson_index,
    index_lesson_title_overrides,
    read_textbook_lessons,
    validate_all_title_overrides_applied,
)


VALID_TARGETS = {"12:12945", "12:12948"}


def lesson(lesson_id="12945", title="BÀI 1  LIÊN HỢP QUỐC"):
    return {
        "lesson_id": lesson_id,
        "book": "KNTT",
        "chapter": "Chu de 1",
        "lesson": "Bai 1",
        "title": title,
        "page_title": title,
        "url": f"https://example.test/bai-{lesson_id}.html",
        "blocks": [{"type": "paragraph", "text": "Nội dung", "page": 1}],
        "images": [],
    }


def source_file(path: Path, lessons: list[dict]):
    path.write_text(json.dumps({"lessons": lessons}, ensure_ascii=False), encoding="utf-8")


def config(*overrides):
    return {"version": 1, "overrides": list(overrides)}


def override(lesson_id="12945", title="BÀI 1: LIÊN HỢP QUỐC"):
    return {
        "grade": 12,
        "lessonId": lesson_id,
        "title": title,
        "recoveryMode": "downstream_artifact_recovery",
        "reason": "Recovered from reviewed downstream artifacts.",
    }


def write_config(path: Path, payload: dict):
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def expect_error(label, fn, message_part=None):
    try:
        fn()
    except LessonIndexError as exc:
        if message_part and message_part not in str(exc):
            raise AssertionError(f"{label}: expected {message_part!r}, got {exc!r}")
        print(f"[OK] {label}: rejected ({exc})")
        return
    raise AssertionError(f"{label}: expected LessonIndexError")


def run_tests():
    # 1. All real Stage1 paths resolve.
    for grade, path in GRADE_FILES.items():
        rows = read_textbook_lessons(path, grade)
        assert rows, f"grade {grade} should have lessons"
    print("[OK] real Stage1 paths resolve")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        empty_config = root / "empty.json"
        write_config(empty_config, config())

        # 2. Missing required grade file fails.
        expect_error(
            "missing required grade file",
            lambda: build_lesson_index({12: root / "missing.json"}, empty_config, minimum_lesson_count=1),
            "Missing required textbook source",
        )

        # 3. Malformed source fails.
        malformed = root / "malformed.json"
        malformed.write_text("{", encoding="utf-8")
        expect_error(
            "malformed source",
            lambda: build_lesson_index({12: malformed}, empty_config, minimum_lesson_count=1),
            "Malformed textbook source JSON",
        )

        # 4. Missing lessons fails.
        missing_lessons = root / "missing_lessons.json"
        missing_lessons.write_text("{}", encoding="utf-8")
        expect_error(
            "missing lessons",
            lambda: build_lesson_index({12: missing_lessons}, empty_config, minimum_lesson_count=1),
            "missing lessons array",
        )

        # 5. Empty lessons fails.
        empty_lessons = root / "empty_lessons.json"
        source_file(empty_lessons, [])
        expect_error(
            "empty lessons",
            lambda: build_lesson_index({12: empty_lessons}, empty_config, minimum_lesson_count=1),
            "empty lessons array",
        )

        # 6. Duplicate composite lesson identity fails.
        duplicate = root / "duplicate.json"
        source_file(duplicate, [lesson(), lesson()])
        expect_error(
            "duplicate composite lesson identity",
            lambda: build_lesson_index({12: duplicate}, empty_config, minimum_lesson_count=1),
            "Duplicate composite lesson identities",
        )

        # 7. Valid empty config.
        assert index_lesson_title_overrides(config(), VALID_TARGETS) == {}
        print("[OK] valid empty config")

        # 8. Valid one-title recovery override.
        indexed = index_lesson_title_overrides(config(override()), VALID_TARGETS)
        assert indexed["12:12945"]["title"] == "BÀI 1: LIÊN HỢP QUỐC"
        print("[OK] valid one-title recovery override")

        # 9. Correct Vietnamese canonical title.
        vi = override("12948", "BÀI 2: TRẬT TỰ THẾ GIỚI TRONG CHIẾN TRANH LẠNH")
        index_lesson_title_overrides(config(vi), VALID_TARGETS)
        print("[OK] valid Vietnamese canonical title")

        # Invalid config cases.
        expect_error("unsupported version", lambda: index_lesson_title_overrides({"version": 2, "overrides": []}, VALID_TARGETS), "Unsupported")
        expect_error("unknown top-level key", lambda: index_lesson_title_overrides({"version": 1, "overrides": [], "note": ""}, VALID_TARGETS), "unknown keys")
        bad = override()
        bad["note"] = ""
        expect_error("unknown override key", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "unknown keys")
        expect_error("duplicate target", lambda: index_lesson_title_overrides(config(override(), override()), VALID_TARGETS), "Duplicate")
        expect_error("unknown target lesson", lambda: index_lesson_title_overrides(config(override("99999")), VALID_TARGETS), "unknown lesson target")
        bad = override()
        bad["title"] = ""
        expect_error("empty title", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "title")
        bad = override()
        bad["recoveryMode"] = "manual"
        expect_error("unsupported recoveryMode", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "recoveryMode")
        bad = override()
        bad["reason"] = ""
        expect_error("empty reason", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "reason")
        bad = override()
        bad["grade"] = True
        expect_error("boolean grade", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "grade")
        bad = override(title="HÃ¬nh corrupted")
        expect_error("mojibake", lambda: index_lesson_title_overrides(config(bad), VALID_TARGETS), "mojibake")

        # 20. Override changes only title.
        lessons = {"12:12945": lesson(), "12:12948": lesson("12948", "BÀI 2  TRẬT TỰ THẾ GIỚI")}
        before = copy.deepcopy(lessons)
        counts = apply_lesson_title_overrides(lessons, indexed)
        assert lessons["12:12945"]["title"] == "BÀI 1: LIÊN HỢP QUỐC"
        for key, value in before["12:12945"].items():
            if key != "title":
                assert lessons["12:12945"][key] == value
        print("[OK] override changes only title")

        # 21. Non-target lesson remains identical.
        assert lessons["12:12948"] == before["12:12948"]
        print("[OK] non-target lesson remains identical")

        # 22. Every override is applied exactly once.
        assert counts == {"12:12945": 1}
        validate_all_title_overrides_applied(counts)
        print("[OK] every override applied exactly once")

        # 23. Same input + config gives identical output twice.
        source = root / "source.json"
        title_config = root / "title_config.json"
        source_file(source, [lesson(), lesson("12948", "BÀI 2  TRẬT TỰ THẾ GIỚI")])
        write_config(title_config, config(override()))
        first, first_report = build_lesson_index({12: source}, title_config, minimum_lesson_count=2)
        second, second_report = build_lesson_index({12: source}, title_config, minimum_lesson_count=2)
        assert first == second
        assert first_report == second_report
        print("[OK] deterministic lesson index recovery")

    print("=== TAT CA LESSON INDEX RECOVERY TEST PASS ===")


if __name__ == "__main__":
    run_tests()
