from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path
from typing import Any

STAGE4_DIR = Path(__file__).resolve().parents[1] / "stage4_assemble"
if str(STAGE4_DIR) not in sys.path:
    sys.path.insert(0, str(STAGE4_DIR))

from geo_contract import map_data_errors  # noqa: E402
from common import ROOT_PERIOD_IDS, root_period_for_year

SILENT_ROOT_WARNING_EXCEPTIONS = {
    "my-can-thiep-vao-dong-duong",
}


def validate_curated_tree(
    core_events: list[dict[str, Any]],
    removed_events: list[dict[str, Any]],
    merged_aliases: dict[str, str],
    input_count: int,
    supporting_count: int,
    fallback_count: int,
    review_needed_count: int,
) -> tuple[list[str], str]:
    errors_by_section: dict[str, list[str]] = {
        "Geography Contract Validation": [],
        "Display Type Validation": [],
        "Tree Link Validation": [],
        "Root Chain Validation": [],
        "General Validation": [],
    }
    warnings: list[str] = []
    by_id: dict[str, dict[str, Any]] = {}
    slug_counts: Counter[str] = Counter()
    id_counts: Counter[str] = Counter()

    for event in core_events:
        event_id = str(event.get("id") or "")
        by_id[event_id] = event
        id_counts[event_id] += 1
        slug_counts[str(event.get("slug") or "")] += 1

    for event_id, count in id_counts.items():
        if count > 1:
            errors_by_section["General Validation"].append(f"duplicate id: {event_id}")
    for slug, count in slug_counts.items():
        if slug and count > 1:
            errors_by_section["General Validation"].append(f"duplicate slug: {slug}")

    removed_ids = {event.get("id") for event in removed_events}
    for removed_id in removed_ids:
        if removed_id in by_id:
            errors_by_section["General Validation"].append(f"removed event still appears in core_events: {removed_id}")
    for alias_id in merged_aliases:
        if alias_id in by_id:
            errors_by_section["General Validation"].append(f"merged duplicate id still appears in core_events: {alias_id}")

    root_ids = set(ROOT_PERIOD_IDS)
    for event in core_events:
        event_id = event["id"]
        hierarchy = event.get("hierarchy") or {}
        child_ids = hierarchy.get("childIds") or []
        parent_id = hierarchy.get("parentId")
        root_id = hierarchy.get("rootId")
        level = hierarchy.get("level")
        geo_type = ((event.get("mapData") or {}).get("geoType") or "no_location")
        display = event.get("display") or {}

        errors_by_section["Geography Contract Validation"].extend(
            map_data_errors(str(event_id), event.get("mapData") or {})
        )
        errors_by_section["Display Type Validation"].extend(_display_errors(event))
        if geo_type == "no_location" and display.get("showOnMap") is True:
            errors_by_section["Display Type Validation"].append(f"no_location but showOnMap=true: {event_id}")

        if event.get("eventLevel") == "atomic" and child_ids:
            errors_by_section["Tree Link Validation"].append(f"atomic has childIds: {event_id}")
        if event.get("eventLevel") == "collection" and not child_ids and event_id not in root_ids:
            errors_by_section["Tree Link Validation"].append(f"collection has no childIds: {event_id}")
        if parent_id is None and event_id not in root_ids:
            errors_by_section["Tree Link Validation"].append(f"non-root has parentId=null: {event_id}")
        if parent_id is not None and parent_id not in by_id:
            errors_by_section["Tree Link Validation"].append(f"parentId points to missing node: {event_id} -> {parent_id}")
        if root_id not in root_ids:
            errors_by_section["Root Chain Validation"].append(f"rootId is not one of fixed root periods: {event_id} -> {root_id}")
        if event_id in root_ids and level != 0:
            errors_by_section["Root Chain Validation"].append(f"root period level is not 0: {event_id}")

        for child_id in child_ids:
            child = by_id.get(child_id)
            if not child:
                errors_by_section["Tree Link Validation"].append(f"childId points to missing node: {event_id} -> {child_id}")
                continue
            if (child.get("hierarchy") or {}).get("parentId") != event_id:
                errors_by_section["Tree Link Validation"].append(f"child parentId does not point back: {event_id} -> {child_id}")

        warning = _chronology_root_warning(event)
        if warning:
            warnings.append(warning)

    for event in core_events:
        event_id = event["id"]
        hierarchy = event.get("hierarchy") or {}
        parent_id = hierarchy.get("parentId")
        if parent_id in by_id:
            parent = by_id[parent_id]
            parent_hierarchy = parent.get("hierarchy") or {}
            parent_child_ids = parent_hierarchy.get("childIds") or []
            if event_id not in parent_child_ids:
                errors_by_section["Tree Link Validation"].append(f"parent childIds does not contain node: {parent_id} -> {event_id}")
            parent_level = parent_hierarchy.get("level")
            level = hierarchy.get("level")
            if isinstance(parent_level, int) and level != parent_level + 1:
                errors_by_section["Root Chain Validation"].append(f"level is not parent.level + 1: {event_id}")
            if hierarchy.get("rootId") != parent_hierarchy.get("rootId"):
                errors_by_section["Root Chain Validation"].append(
                    f"rootId does not match parent chain: {event_id} root={hierarchy.get('rootId')} parentRoot={parent_hierarchy.get('rootId')}"
                )

    errors_by_section["Tree Link Validation"].extend(_cycle_errors(by_id))
    errors = [error for section_errors in errors_by_section.values() for error in section_errors]
    report = _semantic_report(
        core_events,
        input_count=input_count,
        supporting_count=supporting_count,
        removed_count=len(removed_events),
        merged_count=len(set(merged_aliases.values())),
        fallback_count=fallback_count,
        review_needed_count=review_needed_count,
        errors_by_section=errors_by_section,
        warnings=warnings,
    )
    return errors, report


def _display_errors(event: dict[str, Any]) -> list[str]:
    event_id = event.get("id")
    display = event.get("display")
    if not isinstance(display, dict):
        return [f"display is not object: {event_id}"]
    errors: list[str] = []
    for field in ["showOnMap", "showOnTimeline", "showOnOverviewTimeline", "featured"]:
        if not isinstance(display.get(field), bool):
            errors.append(f"display.{field} is not boolean: {event_id} -> {type(display.get(field)).__name__}")
    priority = display.get("priority")
    if not isinstance(priority, (int, float)) or isinstance(priority, bool):
        errors.append(f"display.priority is not number: {event_id} -> {type(priority).__name__}")
    return errors


def _chronology_root_warning(event: dict[str, Any]) -> str | None:
    if event.get("_synthetic"):
        return None
    if event.get("id") in SILENT_ROOT_WARNING_EXCEPTIONS:
        return None
    chronology = event.get("chronology") or {}
    start = chronology.get("start") or {}
    end = chronology.get("end") or {}
    start_year = start.get("year")
    end_year = end.get("year") if isinstance(end, dict) else None
    if not isinstance(start_year, int):
        return None
    root_id = (event.get("hierarchy") or {}).get("rootId")
    expected_start_root = root_period_for_year(start_year)
    expected_end_root = root_period_for_year(end_year) if isinstance(end_year, int) else expected_start_root
    if root_id == expected_start_root or root_id == expected_end_root:
        return None
    if root_id == "viet-nam-1975-den-nay" and start_year < 1975:
        return f"root chronology warning: {event['id']} startYear={start_year} is under viet-nam-1975-den-nay"
    if expected_start_root != expected_end_root:
        return f"cross-period chronology exception: {event['id']} startRoot={expected_start_root}, endRoot={expected_end_root}, assignedRoot={root_id}"
    return f"root chronology warning: {event['id']} expectedRoot={expected_start_root}, assignedRoot={root_id}"


def _cycle_errors(by_id: dict[str, dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    for event_id in by_id:
        seen: set[str] = set()
        cur = event_id
        while cur:
            if cur in seen:
                errors.append(f"cycle detected at {event_id}")
                break
            seen.add(cur)
            cur = ((by_id.get(cur) or {}).get("hierarchy") or {}).get("parentId")
    return errors


def _semantic_report(
    core_events: list[dict[str, Any]],
    input_count: int,
    supporting_count: int,
    removed_count: int,
    merged_count: int,
    fallback_count: int,
    review_needed_count: int,
    errors_by_section: dict[str, list[str]],
    warnings: list[str],
) -> str:
    errors = [error for section_errors in errors_by_section.values() for error in section_errors]
    synthetic_roots = [event for event in core_events if event.get("_synthetic") and event["id"] in ROOT_PERIOD_IDS]
    synthetic_collections = [event for event in core_events if event.get("_syntheticCollection")]
    total_synthetic = [event for event in core_events if event.get("_synthetic")]
    collections = [event for event in core_events if event.get("eventLevel") == "collection"]
    atomic = [event for event in core_events if event.get("eventLevel") == "atomic"]
    no_location = [event for event in core_events if ((event.get("mapData") or {}).get("geoType") == "no_location")]
    featured = [event for event in core_events if (event.get("display") or {}).get("showOnOverviewTimeline")]
    mixed = [event for event in core_events if ((event.get("mapData") or {}).get("geoType") == "mixed")]
    mixed_marker_only = [
        event
        for event in mixed
        if (event.get("mapData") or {}).get("markers")
        and not (event.get("mapData") or {}).get("gadmRefs")
        and not (event.get("mapData") or {}).get("provinceNames")
    ]
    rows = [
        ("input event count", input_count),
        ("core event count", len(core_events)),
        ("supporting item count", supporting_count),
        ("removed count", removed_count),
        ("root period count", len([event for event in core_events if event["id"] in ROOT_PERIOD_IDS])),
        ("synthetic root count", len(synthetic_roots)),
        ("synthetic collection count", len(synthetic_collections)),
        ("total synthetic count", len(total_synthetic)),
        ("collection count", len(collections)),
        ("atomic count", len(atomic)),
        ("no_location core count", len(no_location)),
        ("featured overview timeline count", len(featured)),
        ("duplicate groups merged", merged_count),
        ("fallback-to-root count", fallback_count),
        ("review-needed count", review_needed_count),
        ("mixed geoType count", len(mixed)),
        ("mixed events with only markers and no polygon", len(mixed_marker_only)),
        ("validation errors", len(errors)),
        ("validation warnings", len(warnings)),
    ]
    out = ["# Stage 4B Semantic Validation", "", "| Metric | Value |", "|---|---|"]
    out.extend(f"| {name} | {value} |" for name, value in rows)

    for section in [
        "Geography Contract Validation",
        "Display Type Validation",
        "Tree Link Validation",
        "Root Chain Validation",
        "General Validation",
    ]:
        out.extend(["", f"## {section}", ""])
        section_errors = errors_by_section.get(section) or []
        out.extend([f"- {error}" for error in section_errors] if section_errors else ["Không có lỗi."])

    out.extend(["", "## Semantic Root Warnings", ""])
    out.extend([f"- {warning}" for warning in warnings] if warnings else ["Không có warning."])

    out.extend(["", "## Mixed GeoType Review", ""])
    if mixed_marker_only:
        out.append("Các event `mixed` dưới đây chỉ có markers và không có polygon; suggested geoType = `multi_point`.")
        out.extend(f"- {event['id']}" for event in mixed_marker_only)
    else:
        out.append("Không có event `mixed` chỉ có markers và không có polygon.")
    out.append("")
    return "\n".join(out)
