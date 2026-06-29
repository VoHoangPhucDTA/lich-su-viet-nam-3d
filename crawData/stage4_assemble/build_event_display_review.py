from __future__ import annotations

import json
import re
from typing import Any

from stage4_common import CONFIG, OUTPUT, normalize_text, read_json, read_jsonl, write_json


FINAL_EVENTS = OUTPUT / "final_events.jsonl"

MAJOR_SUBTYPES = {
    "uprising",
    "war",
    "battle",
    "campaign",
    "invasion",
    "occupation",
    "resistance",
    "treaty",
    "agreement",
    "declaration",
    "conference",
    "reform",
    "administrative_reform",
    "administration",
    "policy",
    "decree",
    "establishment",
    "formation",
    "state_formation",
    "organization_founding",
    "organization-founding",
    "accession",
    "relocation",
    "election",
    "legislation",
    "diplomatic_activity",
    "negotiation",
    "alliance",
    "mission",
    "recognition",
    "aid",
}

LIKELY_CHILD_SUBTYPES = {
    "congress",
    "publication",
    "education",
    "construction",
    "creation",
    "phase",
    "ritual",
    "ceremony",
    "commemoration",
    "designation",
    "literary_work",
    "historical_writing",
    "court-intrigue",
    "power-struggle",
    "foreign-intervention",
    "civilization_development",
    "archaeological_culture",
}

NOISE_SUBTYPES = {
    "archaeological-dating",
    "festival",
}

NOISE_TITLE_PATTERNS = [
    "xac dinh nien dai",
    "le khai mac ngay hoi",
    "ngay hoi van hoa the thao du lich",
    "bieu dien dan ca",
    "phat hanh tem",
]

MAJOR_TITLE_PATTERNS = [
    "cach mang",
    "khoi nghia",
    "khang chien",
    "chien dich",
    "chien thang",
    "hiep dinh",
    "hiep uoc",
    "tuyen ngon",
    "thanh lap",
    "doi moi",
    "chu quyen",
    "hoang sa",
    "truong sa",
    "viet nam gia nhap",
    "dien bien phu",
    "tong tien cong",
]


def read_events() -> list[dict[str, Any]]:
    return read_jsonl(FINAL_EVENTS)


def start_year(event: dict[str, Any]) -> int | None:
    year = (((event.get("chronology") or {}).get("start") or {}).get("year"))
    return year if isinstance(year, int) else None


def lesson_ids(event: dict[str, Any]) -> set[str]:
    return {str(item.get("lessonId")) for item in (event.get("coverage") or {}).get("lessons", []) if item.get("lessonId")}


def is_method_lesson_only(event: dict[str, Any]) -> bool:
    ids = lesson_ids(event)
    return bool(ids) and ids <= {"12122", "12126", "12128"}


def has_pattern(text: str, patterns: list[str]) -> bool:
    return any(pattern in text for pattern in patterns)


def classify_display(event: dict[str, Any], manual_excludes: set[str]) -> tuple[str, list[str]]:
    event_id = event["id"]
    subtype = normalize_text((event.get("classification") or {}).get("eventSubtype") or "").replace(" ", "-")
    title = normalize_text((event.get("titles") or {}).get("primary") or "")
    summary_text = normalize_text(
        " ".join(
            [
                (event.get("summary") or {}).get("homepageSummary") or "",
                (event.get("textbookContent") or {}).get("canonicalSummary") or "",
            ]
        )
    )
    year = start_year(event)
    reasons: list[str] = []

    if event_id in manual_excludes:
        return "exclude_display", ["Có trong config/display_exclude_seed.json"]

    if subtype in NOISE_SUBTYPES:
        reasons.append(f"subtype `{subtype}` là nhiễu minh hoạ")
        return "exclude_display", reasons
    if has_pattern(title, NOISE_TITLE_PATTERNS):
        reasons.append("title khớp pattern minh hoạ/ngày hội/nghiên cứu")
        return "exclude_display", reasons
    if is_method_lesson_only(event) and subtype in {"discovery", "publication"}:
        reasons.append("chỉ xuất hiện ở bài phương pháp/sử học và subtype là ví dụ minh hoạ")
        return "exclude_display", reasons
    if year and year >= 1990 and subtype in {"festival", "commemoration", "designation"} and not has_pattern(title, MAJOR_TITLE_PATTERNS):
        reasons.append("sự kiện văn hoá/ghi danh/kỷ niệm đương đại, không phải mốc lịch sử lớn")
        return "exclude_display", reasons
    if re.search(r"\b(di vat|khuon duc|mui ten dong)\b", title) and subtype in {"discovery", "archaeological-dating"}:
        reasons.append("di vật/khảo cổ được nhắc như ví dụ, không phải biến cố lịch sử độc lập")
        return "exclude_display", reasons

    if subtype in MAJOR_SUBTYPES or has_pattern(title, MAJOR_TITLE_PATTERNS):
        reasons.append("biến cố/tiến trình lịch sử lớn hoặc ngoại giao/chính trị/quân sự")
        return "keep_major", reasons

    if subtype in LIKELY_CHILD_SUBTYPES:
        reasons.append(f"subtype `{subtype}` nên giữ làm mảnh con để hierarchy xử lý")
        return "keep_child", reasons

    if is_method_lesson_only(event):
        reasons.append("chỉ xuất hiện ở bài phương pháp/sử học; cần duyệt tay")
        return "review", reasons

    if "minh hoa" in summary_text or "vi du" in summary_text:
        reasons.append("summary có dấu hiệu ví dụ minh hoạ; cần duyệt tay")
        return "review", reasons

    reasons.append("không khớp rule mạnh; giữ để duyệt tay")
    return "review", reasons


def render_event(event: dict[str, Any], reasons: list[str]) -> list[str]:
    lessons = [
        f"{item.get('grade')}:{item.get('lessonId')} {item.get('lessonTitle')}"
        for item in (event.get("coverage") or {}).get("lessons", [])
    ]
    return [
        f"### `{event['id']}`",
        f"- Title: {(event.get('titles') or {}).get('primary')}",
        f"- Date: {(event.get('chronology') or {}).get('displayDate')}",
        f"- Type/Subtype: {(event.get('classification') or {}).get('eventType')} / {(event.get('classification') or {}).get('eventSubtype')}",
        f"- Lessons: {'; '.join(lessons)}",
        f"- Reason: {'; '.join(reasons)}",
        "",
    ]


def main() -> None:
    manual_excludes = set(read_json(CONFIG / "display_exclude_seed.json", []))
    groups: dict[str, list[tuple[dict[str, Any], list[str]]]] = {
        "keep_major": [],
        "keep_child": [],
        "exclude_display": [],
        "review": [],
    }
    for event in read_events():
        bucket, reasons = classify_display(event, manual_excludes)
        groups[bucket].append((event, reasons))

    suggestion = {
        "exclude_display": sorted(event["id"] for event, _ in groups["exclude_display"]),
        "review": sorted(event["id"] for event, _ in groups["review"]),
    }
    write_json(OUTPUT / "display_exclude_suggestion.json", suggestion)

    lines = [
        "# Event Display Review",
        "",
        "GĐ4.A2.5 chỉ đề xuất eligibility hiển thị; chưa tự sửa `final_events.jsonl`.",
        "",
        "## Summary",
        "",
        f"- keep_major: {len(groups['keep_major'])}",
        f"- keep_child: {len(groups['keep_child'])}",
        f"- exclude_display: {len(groups['exclude_display'])}",
        f"- review: {len(groups['review'])}",
        "",
    ]
    for bucket, title in [
        ("exclude_display", "Exclude Display"),
        ("review", "Needs Human Review"),
        ("keep_child", "Keep Child"),
        ("keep_major", "Keep Major"),
    ]:
        lines.extend([f"## {title}", ""])
        for event, reasons in sorted(groups[bucket], key=lambda item: item[0]["id"]):
            lines.extend(render_event(event, reasons))

    (OUTPUT / "event_display_review.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({key: len(value) for key, value in groups.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
