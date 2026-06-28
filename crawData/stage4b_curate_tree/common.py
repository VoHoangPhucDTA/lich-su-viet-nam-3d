from __future__ import annotations

import copy
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STAGE4B = ROOT / "stage4b_curate_tree"
CONFIG = STAGE4B / "config"
OUTPUT = STAGE4B / "output"
PHASE1 = OUTPUT / "phase1"
PHASE2 = OUTPUT / "phase2"
FINAL_EVENTS = ROOT / "stage4_assemble" / "output" / "final_events.jsonl"
DISPLAY_REVIEW = ROOT / "stage4_assemble" / "output" / "event_display_review.md"


ROOT_PERIOD_IDS = [
    "viet-nam-thoi-dung-nuoc",
    "bac-thuoc-va-dau-tranh-gianh-doc-lap",
    "viet-nam-tu-the-ki-x-den-xv",
    "viet-nam-tu-the-ki-xvi-den-xix",
    "viet-nam-1858-1918",
    "viet-nam-1919-1945",
    "viet-nam-1945-1954",
    "viet-nam-1954-1975",
    "viet-nam-1975-den-nay",
]

CANONICAL_TOP_LEVEL = [
    "id",
    "slug",
    "entityType",
    "eventLevel",
    "titles",
    "classification",
    "coverage",
    "chronology",
    "mapData",
    "summary",
    "textbookContent",
    "externalContent",
    "media",
    "hierarchy",
    "associations",
    "display",
    "sourcePolicy",
]


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return copy.deepcopy(default)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            f.write("\n")


def chronology_year(event: dict[str, Any]) -> int | None:
    year = (((event.get("chronology") or {}).get("start") or {}).get("year"))
    return year if isinstance(year, int) else None


def date_sort_key(event: dict[str, Any]) -> tuple[int, int, int, str]:
    start = ((event.get("chronology") or {}).get("start") or {})
    year = start.get("year")
    month = start.get("month")
    day = start.get("day")
    return (
        year if isinstance(year, int) else 999999,
        month if isinstance(month, int) else 99,
        day if isinstance(day, int) else 99,
        str(event.get("id", "")),
    )


def root_period_for_year(year: int | None) -> str:
    if year is None:
        return "viet-nam-1975-den-nay"
    if year < -111:
        return "viet-nam-thoi-dung-nuoc"
    if year < 938:
        return "bac-thuoc-va-dau-tranh-gianh-doc-lap"
    if year <= 1500:
        return "viet-nam-tu-the-ki-x-den-xv"
    if year <= 1857:
        return "viet-nam-tu-the-ki-xvi-den-xix"
    if year <= 1918:
        return "viet-nam-1858-1918"
    if year <= 1945:
        return "viet-nam-1919-1945"
    if year <= 1954:
        return "viet-nam-1945-1954"
    if year <= 1975:
        return "viet-nam-1954-1975"
    return "viet-nam-1975-den-nay"


def event_title(event: dict[str, Any]) -> str:
    return str(((event.get("titles") or {}).get("primary")) or event.get("id", ""))


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def event_text(event: dict[str, Any]) -> str:
    fields: list[str] = [
        event.get("id", ""),
        event_title(event),
        ((event.get("titles") or {}).get("short") or ""),
        ((event.get("chronology") or {}).get("displayDate") or ""),
        ((event.get("textbookContent") or {}).get("canonicalSummary") or ""),
        ((event.get("textbookContent") or {}).get("significance") or ""),
    ]
    fields.extend((event.get("classification") or {}).get("tags") or [])
    for lesson in (event.get("coverage") or {}).get("lessons") or []:
        fields.append(str(lesson.get("lessonTitle") or ""))
    return normalize_text(" ".join(str(x) for x in fields if x))


def merge_unique_list(*values: Any) -> list[Any]:
    out: list[Any] = []
    seen: set[str] = set()
    for seq in values:
        if not isinstance(seq, list):
            continue
        for item in seq:
            key = json.dumps(item, ensure_ascii=False, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def set_path(obj: dict[str, Any], dotted_path: str, value: Any) -> None:
    cur: dict[str, Any] = obj
    parts = dotted_path.split(".")
    for part in parts[:-1]:
        child = cur.get(part)
        if not isinstance(child, dict):
            child = {}
            cur[part] = child
        cur = child
    cur[parts[-1]] = value


def ensure_dirs() -> None:
    for path in [CONFIG, PHASE1, PHASE2]:
        path.mkdir(parents=True, exist_ok=True)


def load_events() -> list[dict[str, Any]]:
    return read_jsonl(FINAL_EVENTS)
