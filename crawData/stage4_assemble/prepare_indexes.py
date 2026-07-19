from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from stage4_common import (
    CONFIG,
    DEDUPED_EVENTS,
    GADM_GEOJSON,
    GRADE_FILES,
    LOCATIONS_DICT,
    OUTPUT,
    STAGE2_EVENTS,
    centroid,
    normalize_text,
    read_json,
    read_jsonl,
    write_json,
)

SUPPORTED_TITLE_OVERRIDE_VERSION = 1
TITLE_OVERRIDES = CONFIG / "lesson_title_overrides.json"
MIN_EXPECTED_LESSON_COUNT = 47
ALLOWED_TITLE_RECOVERY_MODES = {"downstream_artifact_recovery"}
TITLE_OVERRIDE_CONFIG_KEYS = {"version", "overrides"}
TITLE_OVERRIDE_KEYS = {"grade", "lessonId", "title", "recoveryMode", "reason"}
MOJIBAKE_MARKERS = ("HÃ¬nh", "Chá»§", "Ä‘", "â€“", "�")


class LessonIndexError(ValueError):
    pass


GADM_NAME_DISPLAY = {
    "AnGiang": "An Giang",
    "BàRịa-VũngTàu": "Bà Rịa - Vũng Tàu",
    "BạcLiêu": "Bạc Liêu",
    "BắcGiang": "Bắc Giang",
    "BắcKạn": "Bắc Kạn",
    "BắcNinh": "Bắc Ninh",
    "BếnTre": "Bến Tre",
    "BìnhDương": "Bình Dương",
    "BìnhPhước": "Bình Phước",
    "BìnhThuận": "Bình Thuận",
    "BìnhĐịnh": "Bình Định",
    "CaoBằng": "Cao Bằng",
    "CàMau": "Cà Mau",
    "CầnThơ": "Cần Thơ",
    "GiaLai": "Gia Lai",
    "HoàBình": "Hoà Bình",
    "HàGiang": "Hà Giang",
    "HàNam": "Hà Nam",
    "HàNội": "Hà Nội",
    "HàTĩnh": "Hà Tĩnh",
    "HưngYên": "Hưng Yên",
    "HảiDương": "Hải Dương",
    "HảiPhòng": "Hải Phòng",
    "HậuGiang": "Hậu Giang",
    "HồChíMinh": "Hồ Chí Minh",
    "KhánhHòa": "Khánh Hòa",
    "KiênGiang": "Kiên Giang",
    "KonTum": "Kon Tum",
    "LaiChâu": "Lai Châu",
    "LongAn": "Long An",
    "LàoCai": "Lào Cai",
    "LâmĐồng": "Lâm Đồng",
    "LạngSơn": "Lạng Sơn",
    "NamĐịnh": "Nam Định",
    "NghệAn": "Nghệ An",
    "NinhBình": "Ninh Bình",
    "NinhThuận": "Ninh Thuận",
    "PhúThọ": "Phú Thọ",
    "PhúYên": "Phú Yên",
    "QuảngBình": "Quảng Bình",
    "QuảngNam": "Quảng Nam",
    "QuảngNgãi": "Quảng Ngãi",
    "QuảngNinh": "Quảng Ninh",
    "QuảngTrị": "Quảng Trị",
    "SócTrăng": "Sóc Trăng",
    "SơnLa": "Sơn La",
    "ThanhHóa": "Thanh Hóa",
    "TháiBình": "Thái Bình",
    "TháiNguyên": "Thái Nguyên",
    "ThừaThiênHuế": "Thừa Thiên Huế",
    "TiềnGiang": "Tiền Giang",
    "TràVinh": "Trà Vinh",
    "TuyênQuang": "Tuyên Quang",
    "TâyNinh": "Tây Ninh",
    "VĩnhLong": "Vĩnh Long",
    "VĩnhPhúc": "Vĩnh Phúc",
    "YênBái": "Yên Bái",
    "ĐiệnBiên": "Điện Biên",
    "ĐàNẵng": "Đà Nẵng",
    "ĐắkLắk": "Đắk Lắk",
    "ĐắkNông": "Đắk Nông",
    "ĐồngNai": "Đồng Nai",
    "ĐồngTháp": "Đồng Tháp",
}


def iter_coords(geometry: dict[str, Any]) -> list[dict[str, float]]:
    coords: list[dict[str, float]] = []

    def walk(value: Any) -> None:
        if (
            isinstance(value, list)
            and len(value) >= 2
            and isinstance(value[0], (int, float))
            and isinstance(value[1], (int, float))
        ):
            coords.append({"lng": float(value[0]), "lat": float(value[1])})
            return
        if isinstance(value, list):
            for child in value:
                walk(child)

    walk((geometry or {}).get("coordinates"))
    return coords


def page_range(blocks: list[dict[str, Any]]) -> dict[str, int | None]:
    pages = [b.get("page") for b in blocks if isinstance(b.get("page"), int)]
    return {"start": min(pages) if pages else None, "end": max(pages) if pages else None}


def read_textbook_lessons(path: Path, grade: int) -> list[dict[str, Any]]:
    if not path.exists():
        raise LessonIndexError(f"Missing required textbook source for grade {grade}: {path}")
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise LessonIndexError(f"Malformed textbook source JSON for grade {grade}: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise LessonIndexError(f"Textbook source for grade {grade} must be an object: {path}")
    lessons = data.get("lessons")
    if not isinstance(lessons, list):
        raise LessonIndexError(f"Textbook source for grade {grade} missing lessons array: {path}")
    if not lessons:
        raise LessonIndexError(f"Textbook source for grade {grade} has empty lessons array: {path}")
    return lessons


def validate_source_lesson(lesson: Any, grade: int, path: Path, index: int) -> str:
    context = f"{path} lesson #{index}"
    if not isinstance(lesson, dict):
        raise LessonIndexError(f"{context} must be an object")
    lesson_id = lesson.get("lesson_id")
    if lesson_id is None or not str(lesson_id).strip():
        raise LessonIndexError(f"{context} missing required lesson_id")
    if not ((isinstance(lesson.get("title"), str) and lesson.get("title", "").strip()) or (isinstance(lesson.get("page_title"), str) and lesson.get("page_title", "").strip())):
        raise LessonIndexError(f"{context} missing required title/page_title")
    for key in ("chapter", "lesson", "url"):
        if not isinstance(lesson.get(key), str) or not lesson.get(key, "").strip():
            raise LessonIndexError(f"{context} missing required {key}")
    if "blocks" not in lesson or not isinstance(lesson["blocks"], list):
        raise LessonIndexError(f"{context} missing required blocks list")
    return f"{grade}:{lesson_id}"


def load_lesson_title_overrides(path: Path, valid_targets: set[str]) -> dict[str, dict[str, Any]]:
    if not path.exists():
        raise LessonIndexError(f"Missing lesson title override config: {path}")
    try:
        with path.open("r", encoding="utf-8") as f:
            config = json.load(f)
    except json.JSONDecodeError as exc:
        raise LessonIndexError(f"Malformed lesson title override config: {path}: {exc}") from exc
    return index_lesson_title_overrides(config, valid_targets)


def index_lesson_title_overrides(config: Any, valid_targets: set[str]) -> dict[str, dict[str, Any]]:
    validate_title_override_config_shape(config)
    indexed: dict[str, dict[str, Any]] = {}
    for index, override in enumerate(config["overrides"], start=1):
        validate_title_override(override, valid_targets, f"override #{index}")
        key = f"{override['grade']}:{override['lessonId'].strip()}"
        if key in indexed:
            raise LessonIndexError(f"Duplicate lesson title override target: {key}")
        indexed[key] = dict(override)
    return indexed


def validate_title_override_config_shape(config: Any) -> None:
    if not isinstance(config, dict):
        raise LessonIndexError("lesson_title_overrides config must be an object")
    extra = sorted(set(config) - TITLE_OVERRIDE_CONFIG_KEYS)
    if extra:
        raise LessonIndexError(f"lesson_title_overrides config has unknown keys: {', '.join(extra)}")
    if "version" not in config:
        raise LessonIndexError("lesson_title_overrides config missing required field: version")
    if isinstance(config["version"], bool) or config["version"] != SUPPORTED_TITLE_OVERRIDE_VERSION:
        raise LessonIndexError(f"Unsupported lesson_title_overrides version: {config['version']!r}")
    if "overrides" not in config:
        raise LessonIndexError("lesson_title_overrides config missing required field: overrides")
    if not isinstance(config["overrides"], list):
        raise LessonIndexError("lesson_title_overrides.overrides must be a list")


def validate_title_override(override: Any, valid_targets: set[str], context: str) -> None:
    if not isinstance(override, dict):
        raise LessonIndexError(f"{context}: override must be an object")
    extra = sorted(set(override) - TITLE_OVERRIDE_KEYS)
    if extra:
        raise LessonIndexError(f"{context}: unknown keys: {', '.join(extra)}")
    for key in TITLE_OVERRIDE_KEYS:
        if key not in override:
            raise LessonIndexError(f"{context}: missing required field: {key}")
    grade = override["grade"]
    if isinstance(grade, bool) or not isinstance(grade, int):
        raise LessonIndexError(f"{context}: grade must be an integer")
    lesson_id = override["lessonId"]
    if not isinstance(lesson_id, str) or not lesson_id.strip():
        raise LessonIndexError(f"{context}: lessonId must be a non-empty string")
    title = override["title"]
    if not isinstance(title, str) or not title.strip():
        raise LessonIndexError(f"{context}: title must be a non-empty string")
    recovery_mode = override["recoveryMode"]
    if recovery_mode not in ALLOWED_TITLE_RECOVERY_MODES:
        raise LessonIndexError(f"{context}: unsupported recoveryMode: {recovery_mode}")
    reason = override["reason"]
    if not isinstance(reason, str) or not reason.strip():
        raise LessonIndexError(f"{context}: reason must be a non-empty string")
    _reject_mojibake(title, f"{context}.title")
    _reject_mojibake(reason, f"{context}.reason")
    target = f"{grade}:{lesson_id.strip()}"
    if target not in valid_targets:
        raise LessonIndexError(f"{context}: unknown lesson target: {target}")


def apply_lesson_title_overrides(lessons: dict[str, Any], overrides: dict[str, dict[str, Any]]) -> dict[str, int]:
    applied_counts = {key: 0 for key in overrides}
    for key, override in overrides.items():
        lessons[key]["title"] = override["title"].strip()
        applied_counts[key] += 1
    validate_all_title_overrides_applied(applied_counts)
    return applied_counts


def validate_all_title_overrides_applied(applied_counts: dict[str, int]) -> None:
    unused = sorted(key for key, count in applied_counts.items() if count == 0)
    repeated = sorted(key for key, count in applied_counts.items() if count > 1)
    if unused:
        raise LessonIndexError(f"Lesson title overrides were not applied: {', '.join(unused)}")
    if repeated:
        raise LessonIndexError(f"Lesson title overrides applied more than once: {', '.join(repeated)}")


def _reject_mojibake(value: str, context: str) -> None:
    if any(marker in value for marker in MOJIBAKE_MARKERS):
        raise LessonIndexError(f"{context} contains suspicious mojibake")


def build_lesson_index(
    grade_files: dict[int, Path] | None = None,
    title_override_path: Path = TITLE_OVERRIDES,
    minimum_lesson_count: int = MIN_EXPECTED_LESSON_COUNT,
) -> tuple[dict[str, Any], dict[str, Any]]:
    grade_files = grade_files or GRADE_FILES
    lessons: dict[str, Any] = {}
    grade_counts: dict[int, int] = {}
    duplicates: list[str] = []
    for grade, path in sorted(grade_files.items()):
        path = Path(path)
        source_lessons = read_textbook_lessons(path, grade)
        grade_counts[int(grade)] = len(source_lessons)
        for index, lesson in enumerate(source_lessons, start=1):
            key = validate_source_lesson(lesson, int(grade), path, index)
            if key in lessons:
                duplicates.append(key)
            blocks = lesson.get("blocks") or []
            text_blocks = [
                {"type": b.get("type"), "text": b.get("text", ""), "page": b.get("page")}
                for b in blocks
                if isinstance(b, dict) and b.get("text")
            ]
            lessons[key] = {
                "grade": int(grade),
                "lesson_id": str(lesson.get("lesson_id")),
                "book": lesson.get("book") or "KNTT",
                "chapter": lesson.get("chapter") or "",
                "lesson": lesson.get("lesson") or "",
                "topic": lesson.get("topic") or "",
                "title": lesson.get("title") or lesson.get("page_title") or "",
                "url": lesson.get("url") or "",
                "pageRange": page_range(blocks),
                "images": lesson.get("images") or [],
                "textBlocks": text_blocks[:400],
            }
    if duplicates:
        raise LessonIndexError(f"Duplicate composite lesson identities: {', '.join(sorted(duplicates))}")
    if len(lessons) < minimum_lesson_count:
        raise LessonIndexError(
            f"Lesson index is severely incomplete: {len(lessons)} lessons, expected at least {minimum_lesson_count}"
        )
    title_overrides = load_lesson_title_overrides(title_override_path, set(lessons))
    applied_counts = apply_lesson_title_overrides(lessons, title_overrides)
    report = {
        "grade_counts": grade_counts,
        "lesson_count": len(lessons),
        "duplicate_composite_identities": len(duplicates),
        "title_overrides_configured": len(title_overrides),
        "title_overrides_applied": sum(applied_counts.values()),
        "title_overrides_unused": sum(1 for count in applied_counts.values() if count == 0),
    }
    return lessons, report


def build_stage2_index() -> dict[str, Any]:
    by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in read_jsonl(STAGE2_EVENTS):
        sid = row.get("suggestedId")
        if sid:
            by_id[str(sid)].append(
                {
                    "suggestedId": sid,
                    "grade": row.get("grade"),
                    "lesson_id": str(row.get("lesson_id")) if row.get("lesson_id") is not None else None,
                    "confidence": row.get("confidence"),
                    "titles": row.get("titles") or {},
                    "rawPlaceMentions": row.get("rawPlaceMentions") or [],
                }
            )
    return dict(by_id)


def build_gadm_index() -> dict[str, Any]:
    geo = read_json(GADM_GEOJSON, {"features": []})
    aliases = read_json(CONFIG / "province_aliases.json", {})
    provinces: dict[str, Any] = {}
    lookup: dict[str, str] = {}
    for feature in geo.get("features", []):
        props = feature.get("properties") or {}
        name = props.get("NAME_1")
        if not name:
            continue
        c = centroid(iter_coords(feature.get("geometry") or {}))
        provinces[name] = {
            "provinceName": GADM_NAME_DISPLAY.get(name, name),
            "gadmName": name,
            "gadmRef": props.get("GID_1"),
            "center": c,
            "properties": props,
        }
        lookup[normalize_text(name)] = name
        lookup[normalize_text(name.replace(" ", ""))] = name
    for alias, canonical in aliases.items():
        if canonical in provinces:
            lookup[normalize_text(alias)] = canonical
    return {"provinces": provinces, "lookup": lookup}


def build_location_index() -> dict[str, Any]:
    locations = read_json(LOCATIONS_DICT, {})
    overrides = read_json(CONFIG / "manual_coords_override.json", {})
    if "Đá Chữ Thập" not in locations and "Chữ Thập" in locations:
        locations["Đá Chữ Thập"] = dict(locations["Chữ Thập"])
    for name, override in overrides.items():
        base = dict(locations.get(name, {}))
        base.update(override)
        locations[name] = base
    lookup = {normalize_text(name): name for name in locations}
    return {"locations": locations, "lookup": lookup}


def main() -> None:
    out_dir = OUTPUT / "indexes"
    out_dir.mkdir(parents=True, exist_ok=True)
    lesson_index, lesson_report = build_lesson_index()
    stage2_index = build_stage2_index()
    gadm_index = build_gadm_index()
    location_index = build_location_index()
    deduped = read_jsonl(DEDUPED_EVENTS)
    summary = {
        "stage3_events": len(deduped),
        "stage2_unique_ids": len(stage2_index),
        "lessons": len(lesson_index),
        "lesson_grade_counts": lesson_report["grade_counts"],
        "lesson_duplicate_composite_identities": lesson_report["duplicate_composite_identities"],
        "lesson_title_overrides_configured": lesson_report["title_overrides_configured"],
        "lesson_title_overrides_applied": lesson_report["title_overrides_applied"],
        "lesson_title_overrides_unused": lesson_report["title_overrides_unused"],
        "locations": len(location_index["locations"]),
        "gadm_provinces": len(gadm_index["provinces"]),
    }
    write_json(out_dir / "lesson_index.json", lesson_index)
    write_json(out_dir / "stage2_event_index.json", stage2_index)
    write_json(out_dir / "gadm_index.json", gadm_index)
    write_json(out_dir / "location_index.json", location_index)
    write_json(out_dir / "prepare_summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
