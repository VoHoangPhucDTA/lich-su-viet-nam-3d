from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

from geo_contract import GEO_TYPES


ROOT = Path(__file__).resolve().parents[1]
STAGE4 = ROOT / "stage4_assemble"
CONFIG = STAGE4 / "config"
OUTPUT = STAGE4 / "output"

STAGE3_REVIEW = ROOT / "stage3_dedup" / "stage3_review_submission"
DEDUPED_EVENTS = STAGE3_REVIEW / "deduped_events.jsonl"
LOCATIONS_DICT = STAGE3_REVIEW / "locations_dict.json"
STAGE2_EVENTS = ROOT / "stage2_extract" / "output" / "event_candidates.jsonl"
GADM_GEOJSON = ROOT.parent / "MVP_KLTN" / "public" / "geojson" / "vietnam-provinces.json"

GRADE_FILES = {
    10: ROOT / "stage1_crawl" / "lich_su_10_kntt.json",
    11: ROOT / "stage1_crawl" / "lich_su_11_kntt.json",
    12: ROOT / "stage1_crawl" / "lich_su_12_kntt.json",
}

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

EVENT_TYPES = {
    "military",
    "political",
    "diplomatic",
    "economic",
    "cultural",
    "social",
}

VIETNAM_KEYWORDS = [
    "Việt Nam",
    "Giơ-ne-vơ",
    "Geneve",
    "Genève",
    "Pa-ri",
    "Paris",
    "ASEAN",
    "Đông Dương",
    "Hoàng Sa",
    "Trường Sa",
    "Lào",
    "Cam-pu-chia",
    "Đông Nam Á",
]

MERGE_MARKER_RE = re.compile(
    r"^(tr[uù]ng[_\s-]*sgk\d*|trung[_\s-]*sgk\d*|sgk\d*|merged?|merge)$",
    re.IGNORECASE,
)

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+){2,}$")
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
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
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            f.write("\n")


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[.,/_–—\-()]+", " ", text)
    text = re.sub(r"\b(tp|thanh pho|tinh|huyen|quan|xa|thi tran|thi xa)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: str) -> str:
    text = normalize_text(value)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "event"


def is_safe_id(value: Any) -> bool:
    return bool(SAFE_ID_RE.match(str(value or "")))


def clean_string_array(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        s = str(raw).strip()
        if not s:
            continue
        if MERGE_MARKER_RE.match(normalize_text(s)):
            continue
        key = normalize_text(s)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def clean_alternatives(values: Any) -> list[str]:
    out = []
    for s in clean_string_array(values):
        if SLUG_RE.match(s):
            continue
        out.append(s)
    return out


def merge_unique(*lists: Any) -> list[Any]:
    out: list[Any] = []
    seen: set[str] = set()
    for values in lists:
        if not isinstance(values, list):
            continue
        for item in values:
            key = json.dumps(item, ensure_ascii=False, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def date_sort_key(event: dict[str, Any]) -> tuple[int, int, int, str]:
    start = ((event.get("chronology") or {}).get("start") or {})
    year = start.get("year")
    month = start.get("month")
    day = start.get("day")
    return (
        int(year) if isinstance(year, int) else 999999,
        int(month) if isinstance(month, int) else 99,
        int(day) if isinstance(day, int) else 99,
        event.get("id", ""),
    )


def _legacy_float_sum(values: list[float]) -> float:
    total = 0.0
    for value in values:
        total += value
    return total


def centroid(points: list[dict[str, Any]]) -> dict[str, float] | None:
    valid = [
        p
        for p in points
        if isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float))
    ]
    if not valid:
        return None
    lats = [float(p["lat"]) for p in valid]
    lngs = [float(p["lng"]) for p in valid]
    return {
        "lat": round(_legacy_float_sum(lats) / len(valid), 6),
        "lng": round(_legacy_float_sum(lngs) / len(valid), 6),
    }


def haversine_like_distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    if not a or not b:
        return math.inf
    return abs(float(a.get("lat", 0)) - float(b.get("lat", 0))) + abs(
        float(a.get("lng", 0)) - float(b.get("lng", 0))
    )
