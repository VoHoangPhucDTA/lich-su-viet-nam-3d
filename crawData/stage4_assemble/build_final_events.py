from __future__ import annotations

import json
import re
from collections import defaultdict
from copy import deepcopy
from typing import Any

from stage4_common import (
    CANONICAL_TOP_LEVEL,
    CONFIG,
    DEDUPED_EVENTS,
    EVENT_TYPES,
    GEO_TYPES,
    OUTPUT,
    STAGE4,
    centroid,
    clean_alternatives,
    clean_string_array,
    date_sort_key,
    is_safe_id,
    merge_unique,
    normalize_text,
    read_json,
    read_jsonl,
    slugify,
    write_json,
    write_jsonl,
)


LINEAR_TERMS = [
    "song",
    "phong tuyen",
    "duong",
    "duong mon",
    "kenh",
    "kenh dao",
    "tuyen duong",
]
NATIONWIDE_TERMS = {"viet nam", "toan quoc", "ca nuoc", "nuoc ta"}


def flatten_text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(flatten_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(v) for v in value)
    return str(value or "")


def choose_primary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    def score(row: dict[str, Any]) -> tuple[int, int]:
        merged = row.get("_merged_from") or []
        text_len = len(flatten_text(row.get("textbookContent"))) + len(flatten_text(row.get("summary")))
        return (len(merged), text_len)

    return deepcopy(max(rows, key=score))


def merge_rows(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
    primary = choose_primary(rows)
    collisions: list[str] = []
    event_types = {((r.get("classification") or {}).get("eventType") or "") for r in rows}
    chronologies = {json.dumps(r.get("chronology") or {}, ensure_ascii=False, sort_keys=True) for r in rows}
    if len(event_types - {""}) > 1:
        collisions.append("eventType")
    if len(chronologies - {json.dumps(primary.get('chronology') or {}, ensure_ascii=False, sort_keys=True)}) > 0:
        collisions.append("chronology")

    merged_from = merge_unique(*[r.get("_merged_from") or [r.get("suggestedId")] for r in rows])
    tags = merge_unique(*[((r.get("classification") or {}).get("tags") or []) for r in rows])
    alternatives = merge_unique(*[((r.get("titles") or {}).get("alternatives") or []) for r in rows])
    raw_places = merge_unique(*[r.get("rawPlaceMentions") or [] for r in rows])
    related = merge_unique(*[r.get("relatedMentions") or [] for r in rows])
    primary["_merged_from"] = [str(x) for x in merged_from if x]
    primary.setdefault("classification", {})["tags"] = clean_string_array(tags)
    primary.setdefault("titles", {})["alternatives"] = clean_alternatives(alternatives)
    primary["rawPlaceMentions"] = clean_string_array(raw_places)
    primary["relatedMentions"] = clean_string_array(related)
    return primary, collisions


def load_indexes() -> dict[str, Any]:
    index_dir = OUTPUT / "indexes"
    return {
        "stage2": read_json(index_dir / "stage2_event_index.json", {}),
        "lessons": read_json(index_dir / "lesson_index.json", {}),
        "locations": read_json(index_dir / "location_index.json", {}),
        "gadm": read_json(index_dir / "gadm_index.json", {}),
    }


def make_textbook_refs(row: dict[str, Any], indexes: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    stage2 = indexes["stage2"]
    lessons = indexes["lessons"]
    refs: list[dict[str, Any]] = []
    missing: list[str] = []
    seen: set[str] = set()
    for mid in row.get("_merged_from") or [row.get("suggestedId")]:
        records = stage2.get(str(mid)) or []
        if not records:
            missing.append(str(mid))
        for rec in records:
            grade = rec.get("grade")
            lesson_id = rec.get("lesson_id")
            key = f"{grade}:{lesson_id}"
            lesson = lessons.get(key, {})
            ref_key = f"{grade}:{lesson_id}"
            if ref_key in seen:
                continue
            seen.add(ref_key)
            refs.append(
                {
                    "grade": int(grade) if isinstance(grade, int) or str(grade).isdigit() else grade,
                    "book": lesson.get("book") or "KNTT",
                    "lessonId": str(lesson_id) if lesson_id is not None else "",
                    "lessonTitle": lesson.get("title") or "",
                    "chapter": lesson.get("chapter") or "",
                    "lesson": lesson.get("lesson") or "",
                    "pageRange": lesson.get("pageRange") or {"start": None, "end": None},
                    "url": lesson.get("url") or "",
                    "excerpt": (row.get("textbookContent") or {}).get("canonicalSummary") or "",
                }
            )
    grades = sorted({r["grade"] for r in refs if isinstance(r.get("grade"), int)})
    coverage = {
        "grades": grades,
        "books": sorted({r.get("book") for r in refs if r.get("book")}),
        "lessons": [
            {"grade": r.get("grade"), "lessonId": r.get("lessonId"), "lessonTitle": r.get("lessonTitle")}
            for r in refs
        ],
    }
    return {"coverage": coverage, "textbookRefs": refs}, missing


def location_lookup(name: str, indexes: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    loc_index = indexes["locations"]
    locations = loc_index.get("locations") or {}
    if name in locations:
        return name, locations[name]
    key = normalize_text(name)
    real_name = (loc_index.get("lookup") or {}).get(key)
    if real_name:
        return real_name, locations.get(real_name)
    return None, None


def province_from_text(text: str, indexes: dict[str, Any]) -> str | None:
    gadm = indexes["gadm"]
    lookup = gadm.get("lookup") or {}
    normalized = normalize_text(text)
    if normalized in lookup:
        return lookup[normalized]
    for alias_key, canonical in lookup.items():
        if alias_key and re.search(rf"\b{re.escape(alias_key)}\b", normalized):
            return canonical
    return None


def province_display_name(gadm_name: str, indexes: dict[str, Any]) -> str:
    province = (indexes["gadm"].get("provinces") or {}).get(gadm_name) or {}
    return province.get("provinceName") or gadm_name


def province_gadm_name(display_or_gadm_name: str, indexes: dict[str, Any]) -> str | None:
    provinces = indexes["gadm"].get("provinces") or {}
    if display_or_gadm_name in provinces:
        return display_or_gadm_name
    normalized = normalize_text(display_or_gadm_name)
    for gadm_name, province in provinces.items():
        if normalize_text(province.get("provinceName")) == normalized:
            return gadm_name
    return province_from_text(display_or_gadm_name, indexes)


def classify_place(raw_name: str, indexes: dict[str, Any], region_map: dict[str, list[str]]) -> dict[str, Any]:
    normalized = normalize_text(raw_name)
    if normalized in NATIONWIDE_TERMS:
        return {"kind": "nationwide", "name": raw_name}
    if any(normalized.startswith(term + " ") or normalized == term for term in LINEAR_TERMS):
        return {"kind": "linear", "name": raw_name}
    if normalized in {normalize_text(k) for k in region_map}:
        for key, provinces in region_map.items():
            if normalize_text(key) == normalized:
                return {"kind": "region", "name": raw_name, "provinceNames": provinces}

    loc_name, loc = location_lookup(raw_name, indexes)
    if loc:
        if (loc.get("country") or "").lower() != "vietnam":
            return {"kind": "foreign", "name": raw_name, "location": loc}
        province = province_from_text(loc.get("modern_name") or loc_name or raw_name, indexes)
        has_point = isinstance(loc.get("lat"), (int, float)) and isinstance(loc.get("lng"), (int, float))
        confidence = (loc.get("confidence") or "").lower()
        if province and normalize_text(loc.get("modern_name") or "").startswith(("tinh ", "thanh pho ")):
            return {"kind": "province", "name": raw_name, "provinceName": province, "location": loc}
        if has_point and confidence != "none":
            return {
                "kind": "point",
                "name": raw_name,
                "marker": {"name": raw_name, "lat": loc.get("lat"), "lng": loc.get("lng"), "confidence": confidence or "unknown"},
                "provinceName": province,
                "location": loc,
            }
        if province:
            return {"kind": "province", "name": raw_name, "provinceName": province, "location": loc}
    province = province_from_text(raw_name, indexes)
    if province:
        return {"kind": "province", "name": raw_name, "provinceName": province}
    return {"kind": "invalid", "name": raw_name}


def focus_geometry(geo_type: str, marker: dict[str, Any] | None, markers: list[dict[str, Any]], province_names: list[str], indexes: dict[str, Any]) -> dict[str, Any]:
    gadm_provinces = (indexes["gadm"].get("provinces") or {})
    province_centers = []
    for province_name in province_names:
        gadm_name = province_gadm_name(province_name, indexes)
        if gadm_name in gadm_provinces:
            province_centers.append(gadm_provinces[gadm_name].get("center"))
    province_centers = [p for p in province_centers if p]
    marker_points = markers or ([marker] if marker else [])
    if geo_type == "no_location":
        return {"mode": "auto", "center": None, "zoom": None}
    if geo_type == "point":
        return {"mode": "marker", "center": marker, "zoom": 12}
    if geo_type == "multi_point":
        return {"mode": "bounds", "center": centroid(marker_points), "zoom": 8}
    if geo_type == "polygon":
        return {"mode": "polygon", "center": centroid(province_centers), "zoom": 8}
    if geo_type == "multi_polygon":
        return {"mode": "bounds", "center": centroid(province_centers), "zoom": 6}
    if geo_type == "nationwide":
        return {"mode": "bounds", "center": {"lat": 16.0, "lng": 106.0}, "zoom": 5}
    return {"mode": "bounds", "center": centroid(marker_points + province_centers), "zoom": 7}


def build_map_data(row: dict[str, Any], indexes: dict[str, Any], manual_overrides: dict[str, Any], region_map: dict[str, list[str]], whitelist_ids: set[str]) -> tuple[dict[str, Any], list[str]]:
    event_id = row.get("suggestedId")
    raw_places = clean_string_array(row.get("rawPlaceMentions") or [])
    override = manual_overrides.get(event_id) or {}
    warnings: list[str] = []

    if event_id in whitelist_ids and ((row.get("classification") or {}).get("region") or "").lower() != "vietnam":
        geo_type = "no_location"
        historical_locations = raw_places
        map_data = {
            "geoType": geo_type,
            "historicalLocations": historical_locations,
            "provinceNames": [],
            "gadmRefs": [],
            "marker": None,
            "markers": [],
            "focusGeometry": focus_geometry(geo_type, None, [], [], indexes),
        }
        return map_data, warnings

    classified = [classify_place(p, indexes, region_map) for p in raw_places]
    markers: list[dict[str, Any]] = []
    province_names: list[str] = []
    historical: list[str] = []
    nationwide = False
    for item in classified:
        kind = item["kind"]
        if kind == "nationwide":
            nationwide = True
            historical.append(item["name"])
        elif kind == "point":
            markers.append(item["marker"])
            if item.get("provinceName"):
                province_names.append(item["provinceName"])
        elif kind == "province":
            province_names.append(item["provinceName"])
        elif kind == "region":
            province_names.extend(item.get("provinceNames") or [])
        elif kind in {"linear", "invalid", "foreign"}:
            historical.append(item["name"])

    province_names = [
        province_display_name(name, indexes)
        for name in clean_string_array(province_names)
    ]
    province_set_norm = {normalize_text(p) for p in province_names}
    historical = [h for h in clean_string_array(historical) if normalize_text(h) not in province_set_norm]

    if override:
        geo_type = override.get("geoType")
        if override.get("provinceNames") is not None:
            province_names = [
                province_display_name(name, indexes)
                for name in clean_string_array(override.get("provinceNames"))
            ]
        if override.get("markers") is not None:
            markers = override.get("markers") or []
        if override.get("marker") is not None and not markers:
            markers = [override.get("marker")]
    else:
        geo_type = None

    if not geo_type:
        if nationwide:
            geo_type = "nationwide"
        elif markers and province_names:
            geo_type = "mixed"
        elif len(markers) == 1:
            geo_type = "point"
        elif len(markers) > 1:
            geo_type = "multi_point"
        elif len(province_names) == 1:
            geo_type = "polygon"
        elif len(province_names) > 1:
            geo_type = "multi_polygon"
        else:
            geo_type = "no_location"

    if geo_type not in GEO_TYPES:
        warnings.append(f"{event_id}: invalid geoType override {geo_type}")
        geo_type = "no_location"
    if geo_type == "no_location":
        province_names = []
        markers = []

    gadm_provinces = indexes["gadm"].get("provinces") or {}
    gadm_names = [province_gadm_name(p, indexes) for p in province_names]
    gadm_refs = [
        gadm_provinces[p]["gadmRef"]
        for p in gadm_names
        if p in gadm_provinces and gadm_provinces[p].get("gadmRef")
    ]
    marker = markers[0] if markers else None
    map_data = {
        "geoType": geo_type,
        "historicalLocations": historical,
        "provinceNames": province_names,
        "gadmRefs": gadm_refs,
        "marker": marker,
        "markers": markers if geo_type in {"multi_point", "mixed"} else [],
        "focusGeometry": focus_geometry(geo_type, marker, markers, province_names, indexes),
    }
    return map_data, warnings


def build_hierarchy(events: list[dict[str, Any]], seed: dict[str, Any]) -> None:
    ids = {event["id"] for event in events}
    by_id = {event["id"]: event for event in events}
    children: dict[str, list[str]] = defaultdict(list)
    for event in events:
        conf = seed.get(event["id"]) or {}
        parent_id = conf.get("parentId")
        if parent_id not in ids:
            parent_id = None
        event["hierarchy"] = {
            "rootId": event["id"],
            "parentId": parent_id,
            "childIds": [],
            "level": 0,
            "orderInParent": 0,
        }
        if parent_id:
            children[parent_id].append(event["id"])
    for parent_id, child_ids in children.items():
        child_ids.sort(key=lambda cid: date_sort_key(by_id[cid]))
        by_id[parent_id]["hierarchy"]["childIds"] = child_ids
        for order, child_id in enumerate(child_ids):
            by_id[child_id]["hierarchy"]["orderInParent"] = order

    def assign_root(event_id: str, trail: set[str] | None = None) -> tuple[str, int]:
        trail = trail or set()
        event = by_id[event_id]
        parent_id = event["hierarchy"]["parentId"]
        if not parent_id or parent_id in trail:
            return event_id, 0
        root, level = assign_root(parent_id, trail | {event_id})
        return root, level + 1

    for event in events:
        root, level = assign_root(event["id"])
        event["hierarchy"]["rootId"] = root
        event["hierarchy"]["level"] = level
        event["eventLevel"] = "collection" if event["hierarchy"]["childIds"] else "atomic"


def make_event(row: dict[str, Any], indexes: dict[str, Any], map_data: dict[str, Any], provenance: dict[str, Any]) -> dict[str, Any]:
    sid = str(row.get("suggestedId"))
    event_id = sid if is_safe_id(sid) else slugify(sid)
    titles = row.get("titles") or {}
    classification = deepcopy(row.get("classification") or {})
    classification["tags"] = clean_string_array(classification.get("tags") or [])
    event_type = classification.get("eventType")
    chronology = deepcopy(row.get("chronology") or {})
    summary = deepcopy(row.get("summary") or {})
    textbook_content = deepcopy(row.get("textbookContent") or {})
    textbook_content["keyFacts"] = clean_string_array(textbook_content.get("keyFacts") or [])
    textbook_content["textbookRefs"] = provenance["textbookRefs"]
    event = {
        "id": event_id,
        "slug": event_id,
        "entityType": "event",
        "eventLevel": "atomic",
        "titles": {
            "primary": titles.get("primary") or sid,
            "short": titles.get("short") or titles.get("primary") or sid,
            "alternatives": clean_alternatives(titles.get("alternatives") or []),
        },
        "classification": classification,
        "coverage": provenance["coverage"],
        "chronology": chronology,
        "mapData": map_data,
        "summary": summary,
        "textbookContent": textbook_content,
        "externalContent": {
            "wikipedia": {"title": "", "url": "", "summary": "", "content": ""},
            "wikidata": {"id": "", "url": ""},
            "otherSources": [],
        },
        "media": {"thumbnail": "", "items": []},
        "hierarchy": {"rootId": event_id, "parentId": None, "childIds": [], "level": 0, "orderInParent": 0},
        "associations": {
            "relatedEventIds": [],
            "relatedFigureIds": [],
            "predecessorEventIds": [],
            "successorEventIds": [],
        },
        "display": {
            "showOnMap": map_data.get("geoType") != "no_location",
            "showOnTimeline": True,
            "priority": 0,
        },
        "sourcePolicy": {
            "primarySource": "textbook",
            "supplementalSources": ["wikipedia", "wikidata"],
            "lastUpdated": "",
        },
    }
    if event_type not in EVENT_TYPES:
        event.setdefault("_stage4_eventTypeWarning", event_type)
    return {key: event[key] for key in CANONICAL_TOP_LEVEL if key in event} | {
        key: value for key, value in event.items() if key.startswith("_")
    }


def main() -> None:
    indexes = load_indexes()
    manual_include = set(read_json(CONFIG / "manual_vietnam_include.json", []))
    geotype_overrides = read_json(CONFIG / "manual_geotype_override.json", {})
    hierarchy_seed = read_json(CONFIG / "hierarchy_seed.json", {})
    region_map = read_json(CONFIG / "region_province_map.json", {})

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in read_jsonl(DEDUPED_EVENTS):
        sid = row.get("suggestedId")
        if not sid:
            continue
        region = ((row.get("classification") or {}).get("region") or "").lower()
        keep = region == "vietnam" or row.get("_is_dual_region") is True or sid in manual_include
        if keep:
            groups[str(sid)].append(row)

    final_events: list[dict[str, Any]] = []
    collision_lines = ["# Collision Review", ""]
    collision_count = 0
    map_warnings: list[str] = []
    missing_provenance: list[str] = []
    event_type_warnings: list[str] = []

    for sid, rows in sorted(groups.items()):
        row, collisions = merge_rows(rows)
        if collisions:
            collision_lines.append(f"- `{sid}`: {', '.join(collisions)}")
            collision_count += 1
        provenance, missing = make_textbook_refs(row, indexes)
        missing_provenance.extend([f"{sid}: {mid}" for mid in missing])
        map_data, warnings = build_map_data(row, indexes, geotype_overrides, region_map, manual_include)
        map_warnings.extend(warnings)
        event = make_event(row, indexes, map_data, provenance)
        if event.get("_stage4_eventTypeWarning"):
            event_type_warnings.append(f"- `{event['id']}`: `{event['_stage4_eventTypeWarning']}`")
            del event["_stage4_eventTypeWarning"]
        final_events.append(event)

    final_events.sort(key=date_sort_key)
    build_hierarchy(final_events, hierarchy_seed)
    for order, event in enumerate(final_events):
        if not event["hierarchy"]["parentId"]:
            event["hierarchy"]["orderInParent"] = order

    out_json_dir = OUTPUT / "events_json"
    out_json_dir.mkdir(parents=True, exist_ok=True)
    for path in out_json_dir.glob("*.json"):
        path.unlink()
    for event in final_events:
        write_json(out_json_dir / f"{event['id']}.json", event)
    write_jsonl(OUTPUT / "final_events.jsonl", final_events)

    if len(collision_lines) == 2:
        collision_lines.append("Không phát hiện collision chronology/eventType khi merge trùng suggestedId.")
    (OUTPUT / "collision_review.md").write_text("\n".join(collision_lines) + "\n", encoding="utf-8")
    (OUTPUT / "geocode_unresolved.md").write_text(
        "# Geocode / map warnings\n\n" + ("\n".join(f"- {w}" for w in map_warnings) if map_warnings else "Không có cảnh báo mapData.\n"),
        encoding="utf-8",
    )
    (OUTPUT / "provenance_integrity_report.md").write_text(
        "# Provenance Integrity\n\n"
        + f"- Missing `_merged_from` joins: {len(missing_provenance)}\n"
        + ("\n".join(f"- {m}" for m in missing_provenance[:200]) if missing_provenance else "- Status: PASS\n"),
        encoding="utf-8",
    )
    (OUTPUT / "event_type_review.md").write_text(
        "# Event Type Review\n\n"
        + (
            "\n".join(event_type_warnings)
            if event_type_warnings
            else "Tất cả eventType thuộc enum canonical 6 giá trị.\n"
        ),
        encoding="utf-8",
    )
    (OUTPUT / "hierarchy_review.md").write_text(
        "# Hierarchy Review\n\n"
        + f"- Events: {len(final_events)}\n"
        + f"- Collections: {sum(1 for e in final_events if e['eventLevel'] == 'collection')}\n"
        + f"- Atomic: {sum(1 for e in final_events if e['eventLevel'] == 'atomic')}\n",
        encoding="utf-8",
    )
    (OUTPUT / "media_match_review.md").write_text(
        "# Media Match Review\n\nGĐ4 chỉ sinh skeleton media rỗng deterministic; chưa attach ảnh SGK.\n",
        encoding="utf-8",
    )
    summary = {
        "input_events": len(read_jsonl(DEDUPED_EVENTS)),
        "output_events": len(final_events),
        "manual_vietnam_include": len(manual_include),
        "collisions": collision_count,
        "missing_provenance": len(missing_provenance),
        "event_type_warnings": len(event_type_warnings),
    }
    write_json(OUTPUT / "build_summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
