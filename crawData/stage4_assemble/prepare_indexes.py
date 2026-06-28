from __future__ import annotations

import json
from collections import defaultdict
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


def build_lesson_index() -> dict[str, Any]:
    lessons: dict[str, Any] = {}
    for grade, path in GRADE_FILES.items():
        data = read_json(path, {})
        for lesson in data.get("lessons", []):
            key = f"{grade}:{lesson.get('lesson_id')}"
            blocks = lesson.get("blocks") or []
            text_blocks = [
                {"type": b.get("type"), "text": b.get("text", ""), "page": b.get("page")}
                for b in blocks
                if b.get("text")
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
    return lessons


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
    lesson_index = build_lesson_index()
    stage2_index = build_stage2_index()
    gadm_index = build_gadm_index()
    location_index = build_location_index()
    deduped = read_jsonl(DEDUPED_EVENTS)
    summary = {
        "stage3_events": len(deduped),
        "stage2_unique_ids": len(stage2_index),
        "lessons": len(lesson_index),
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
