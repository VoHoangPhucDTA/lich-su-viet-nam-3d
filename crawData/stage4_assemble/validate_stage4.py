from __future__ import annotations

import json
import sys
from collections import Counter
from typing import Any

from stage4_common import (
    CANONICAL_TOP_LEVEL,
    CONFIG,
    DEDUPED_EVENTS,
    EVENT_TYPES,
    GEO_TYPES,
    OUTPUT,
    read_json,
    read_jsonl,
)


ASSOCIATION_KEYS = {"relatedEventIds", "relatedFigureIds", "predecessorEventIds", "successorEventIds"}


def is_string_array(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def validate() -> tuple[list[str], list[str], list[dict[str, Any]], dict[str, int]]:
    path = OUTPUT / "final_events.jsonl"
    events = read_jsonl(path)
    gadm_index = read_json(OUTPUT / "indexes" / "gadm_index.json", {})
    glued_gadm_names = {
        gadm_name
        for gadm_name, province in (gadm_index.get("provinces") or {}).items()
        if gadm_name != province.get("provinceName")
    }
    errors: list[str] = []
    warnings: list[str] = []
    ids = [event.get("id") for event in events]
    id_set = set(ids)
    counts = Counter(ids)
    manual_include = set(read_json(CONFIG / "manual_vietnam_include.json", []))
    baseline_ids = set()
    raw_vietnam_rows = 0
    for row in read_jsonl(DEDUPED_EVENTS):
        sid = row.get("suggestedId")
        region = ((row.get("classification") or {}).get("region") or "").lower()
        if sid and (region == "vietnam" or row.get("_is_dual_region") is True or sid in manual_include):
            baseline_ids.add(str(sid))
            if region == "vietnam" or row.get("_is_dual_region") is True:
                raw_vietnam_rows += 1

    if len(events) < len(baseline_ids):
        errors.append(f"Output count {len(events)} < unique filter baseline {len(baseline_ids)}")
    for event_id, count in counts.items():
        if count > 1:
            errors.append(f"Duplicate id: {event_id}")

    slugs = [event.get("slug") for event in events]
    for slug, count in Counter(slugs).items():
        if count > 1:
            errors.append(f"Duplicate slug: {slug}")

    for event in events:
        event_id = event.get("id", "<missing>")
        keys = list(event.keys())
        if keys != CANONICAL_TOP_LEVEL:
            errors.append(f"{event_id}: top-level keys mismatch: {keys}")
        if any(str(k).startswith("_") for k in event.keys()):
            errors.append(f"{event_id}: contains internal/debug top-level key")
        if event.get("entityType") != "event":
            errors.append(f"{event_id}: entityType must be event")
        if event.get("eventLevel") not in {"atomic", "collection"}:
            errors.append(f"{event_id}: invalid eventLevel {event.get('eventLevel')}")

        classification = event.get("classification") or {}
        event_type = classification.get("eventType")
        if event_type not in EVENT_TYPES:
            errors.append(f"{event_id}: eventType outside canonical enum: {event_type}")
        if not is_string_array(classification.get("tags")):
            errors.append(f"{event_id}: classification.tags must be string[]")

        coverage = event.get("coverage") or {}
        if not isinstance(coverage.get("grades"), list) or not all(isinstance(g, int) for g in coverage.get("grades", [])):
            errors.append(f"{event_id}: coverage.grades must be int[]")
        if not coverage.get("grades"):
            errors.append(f"{event_id}: coverage.grades is empty")

        titles = event.get("titles") or {}
        if not is_string_array(titles.get("alternatives")):
            errors.append(f"{event_id}: titles.alternatives must be string[]")

        textbook = event.get("textbookContent") or {}
        if "textbookRefs" not in textbook:
            errors.append(f"{event_id}: missing textbookContent.textbookRefs")
        if "textbookRefs" in event:
            errors.append(f"{event_id}: textbookRefs must not be top-level")
        if not is_string_array(textbook.get("keyFacts", [])):
            errors.append(f"{event_id}: textbookContent.keyFacts must be string[]")

        external = event.get("externalContent") or {}
        if not all(k in external for k in ("wikipedia", "wikidata", "otherSources")):
            errors.append(f"{event_id}: externalContent skeleton incomplete")
        media = event.get("media") or {}
        if "thumbnail" not in media or "items" not in media or not isinstance(media.get("items"), list):
            errors.append(f"{event_id}: media skeleton incomplete")

        source_policy = event.get("sourcePolicy") or {}
        if not isinstance(source_policy.get("supplementalSources"), list):
            errors.append(f"{event_id}: sourcePolicy.supplementalSources must be array")

        associations = event.get("associations") or {}
        if set(associations.keys()) != ASSOCIATION_KEYS:
            errors.append(f"{event_id}: associations must contain exactly {sorted(ASSOCIATION_KEYS)}")
        for key in ASSOCIATION_KEYS:
            if not isinstance(associations.get(key), list):
                errors.append(f"{event_id}: associations.{key} must be array")
            elif key != "relatedFigureIds":
                for ref_id in associations.get(key, []):
                    if ref_id not in id_set:
                        errors.append(f"{event_id}: dangling association {key} -> {ref_id}")

        hierarchy = event.get("hierarchy") or {}
        parent_id = hierarchy.get("parentId")
        root_id = hierarchy.get("rootId")
        child_ids = hierarchy.get("childIds")
        if parent_id is not None and parent_id not in id_set:
            errors.append(f"{event_id}: dangling parentId {parent_id}")
        if root_id not in id_set:
            errors.append(f"{event_id}: dangling rootId {root_id}")
        if not isinstance(child_ids, list):
            errors.append(f"{event_id}: hierarchy.childIds must be array")
        else:
            for child_id in child_ids:
                if child_id not in id_set:
                    errors.append(f"{event_id}: dangling childId {child_id}")

        map_data = event.get("mapData") or {}
        geo_type = map_data.get("geoType")
        if geo_type == "multi_region":
            errors.append(f"{event_id}: multi_region is forbidden in GĐ4 canonical data")
        if geo_type not in GEO_TYPES:
            errors.append(f"{event_id}: invalid geoType {geo_type}")
        marker = map_data.get("marker")
        markers = map_data.get("markers")
        province_names = map_data.get("provinceNames")
        gadm_refs = map_data.get("gadmRefs")
        if not isinstance(markers, list):
            errors.append(f"{event_id}: mapData.markers must be array")
        if not is_string_array(province_names):
            errors.append(f"{event_id}: mapData.provinceNames must be string[]")
        else:
            for province_name in province_names:
                if province_name in glued_gadm_names:
                    errors.append(f"{event_id}: provinceName appears glued: {province_name}")
        if not is_string_array(gadm_refs):
            errors.append(f"{event_id}: mapData.gadmRefs must be string[]")
        if geo_type == "point":
            if not marker or not isinstance(marker.get("lat"), (int, float)) or not isinstance(marker.get("lng"), (int, float)):
                errors.append(f"{event_id}: point requires marker lat/lng")
        if geo_type == "multi_point" and not markers:
            errors.append(f"{event_id}: multi_point requires markers[]")
        if geo_type == "polygon" and len(gadm_refs or []) != 1:
            errors.append(f"{event_id}: polygon requires exactly 1 gadmRef")
        if geo_type == "multi_polygon" and len(gadm_refs or []) < 2:
            errors.append(f"{event_id}: multi_polygon requires >=2 gadmRefs")
        if geo_type == "mixed" and (not markers or len(gadm_refs or []) < 1):
            errors.append(f"{event_id}: mixed requires markers[] and >=1 gadmRef")
        if geo_type == "no_location" and (marker or markers or province_names or gadm_refs):
            errors.append(f"{event_id}: no_location must not carry marker/province/gadm")
        focus = map_data.get("focusGeometry")
        if not isinstance(focus, dict) or "mode" not in focus or "center" not in focus or "zoom" not in focus:
            errors.append(f"{event_id}: focusGeometry skeleton invalid")

    by_id = {event["id"]: event for event in events if event.get("id")}
    for event in events:
        seen: set[str] = set()
        current = event.get("id")
        while current:
            if current in seen:
                errors.append(f"{event.get('id')}: hierarchy cycle detected at {current}")
                break
            seen.add(current)
            parent = ((by_id.get(current) or {}).get("hierarchy") or {}).get("parentId")
            current = parent

    metrics = {"raw_vietnam_rows": raw_vietnam_rows, "unique_filter_baseline": len(baseline_ids)}
    return errors, warnings, events, metrics


def main() -> None:
    errors, warnings, events, metrics = validate()
    geo_counts = Counter((event.get("mapData") or {}).get("geoType") for event in events)
    event_type_counts = Counter((event.get("classification") or {}).get("eventType") for event in events)
    lines = [
        "# Stage 4 Validation",
        "",
        f"- Status: {'FAIL' if errors else 'PASS'}",
        f"- Events: {len(events)}",
        f"- Raw Vietnam/dual rows before merge: {metrics['raw_vietnam_rows']}",
        f"- Unique filter baseline after merge: {metrics['unique_filter_baseline']}",
        f"- Errors: {len(errors)}",
        f"- Warnings: {len(warnings)}",
        "",
        "## geoType Counts",
        "",
    ]
    for key, value in sorted(geo_counts.items()):
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## eventType Counts", ""])
    for key, value in sorted(event_type_counts.items()):
        lines.append(f"- `{key}`: {value}")
    if errors:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in errors[:500])
    if warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings[:500])
    (OUTPUT / "validation_stage4.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"status": "FAIL" if errors else "PASS", "events": len(events), "errors": len(errors)}, ensure_ascii=False, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
