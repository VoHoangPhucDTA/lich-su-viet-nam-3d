from __future__ import annotations

import copy
from typing import Any

from common import (
    CANONICAL_TOP_LEVEL,
    date_sort_key,
    event_text,
    event_title,
    merge_unique_list,
    root_period_for_year,
)
from synthetic_chronology_repair import apply_synthetic_chronology_override


def normalize_display(node: dict[str, Any], root_ids: set[str], overview_ids: set[str]) -> None:
    display = node.setdefault("display", {})
    if not isinstance(display, dict):
        display = {}
        node["display"] = display
    hierarchy = node.get("hierarchy") or {}
    child_ids = hierarchy.get("childIds") or []
    geo_type = ((node.get("mapData") or {}).get("geoType") or "no_location")
    is_root = node.get("id") in root_ids
    is_featured = is_root or node.get("id") in overview_ids

    current_priority = display.get("priority", 0)
    if not isinstance(current_priority, (int, float)) or isinstance(current_priority, bool):
        current_priority = 0

    if is_root:
        display["showOnMap"] = True
        display["showOnTimeline"] = True
        display["showOnOverviewTimeline"] = True
        display["featured"] = True
        display["priority"] = 100
        return

    display["showOnMap"] = geo_type != "no_location"
    display["showOnTimeline"] = True
    display["featured"] = bool(is_featured)
    display["showOnOverviewTimeline"] = bool(is_featured or (child_ids and hierarchy.get("level") == 1))
    if display["featured"]:
        display["priority"] = max(float(current_priority), 50)
    else:
        display["priority"] = current_priority


def merge_approved_groups(
    events: list[dict[str, Any]],
    merge_groups: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    by_id = {event["id"]: copy.deepcopy(event) for event in events}
    merged_logs: list[dict[str, Any]] = []
    alias_to_primary: dict[str, str] = {}

    for group in merge_groups:
        primary_id = group.get("primaryId")
        duplicate_ids = list(group.get("duplicateIds") or [])
        if not primary_id:
            continue
        present_ids = [event_id for event_id in [primary_id, *duplicate_ids] if event_id in by_id]
        if len(present_ids) < 2:
            continue
        if primary_id not in by_id:
            primary_id = present_ids[0]
        primary = by_id[primary_id]
        old_rows = []
        for event_id in present_ids:
            event = by_id[event_id]
            old_rows.append({
                "id": event_id,
                "title": event_title(event),
                "chronology": copy.deepcopy(event.get("chronology")),
                "textbookRefs": copy.deepcopy((event.get("textbookContent") or {}).get("textbookRefs") or []),
            })
            if event_id == primary_id:
                continue
            _merge_into_primary(primary, event)
            alias_to_primary[event_id] = primary_id
            del by_id[event_id]
        merged_logs.append({
            "primaryId": primary_id,
            "mergedIds": [event_id for event_id in present_ids if event_id != primary_id],
            "reason": group.get("reason", ""),
            "oldRows": old_rows,
        })

    return list(by_id.values()), merged_logs, alias_to_primary


def _merge_into_primary(primary: dict[str, Any], duplicate: dict[str, Any]) -> None:
    primary_titles = primary.setdefault("titles", {})
    duplicate_titles = duplicate.get("titles") or {}
    alternatives = merge_unique_list(
        primary_titles.get("alternatives"),
        duplicate_titles.get("alternatives"),
        [duplicate_titles.get("primary"), duplicate_titles.get("short")],
    )
    primary_titles["alternatives"] = [x for x in alternatives if x and x != primary_titles.get("primary")]

    primary_class = primary.setdefault("classification", {})
    duplicate_class = duplicate.get("classification") or {}
    primary_class["tags"] = merge_unique_list(primary_class.get("tags"), duplicate_class.get("tags"))

    primary_coverage = primary.setdefault("coverage", {})
    duplicate_coverage = duplicate.get("coverage") or {}
    primary_coverage["grades"] = sorted(set(primary_coverage.get("grades") or []) | set(duplicate_coverage.get("grades") or []))
    primary_coverage["books"] = merge_unique_list(primary_coverage.get("books"), duplicate_coverage.get("books"))
    primary_coverage["lessons"] = merge_unique_list(primary_coverage.get("lessons"), duplicate_coverage.get("lessons"))

    primary_textbook = primary.setdefault("textbookContent", {})
    duplicate_textbook = duplicate.get("textbookContent") or {}
    for field in ["canonicalSummary", "detailedNarrative", "significance"]:
        if not primary_textbook.get(field) and duplicate_textbook.get(field):
            primary_textbook[field] = duplicate_textbook[field]
    primary_textbook["keyFacts"] = merge_unique_list(primary_textbook.get("keyFacts"), duplicate_textbook.get("keyFacts"))
    primary_textbook["textbookRefs"] = merge_unique_list(
        primary_textbook.get("textbookRefs"), duplicate_textbook.get("textbookRefs")
    )


def build_synthetic_roots(root_periods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    roots = []
    for idx, period in enumerate(root_periods):
        period_id = period["id"]
        roots.append({
            "id": period_id,
            "slug": period_id,
            "entityType": "event",
            "eventLevel": "collection",
            "_synthetic": True,
            "titles": {
                "primary": period["title"],
                "short": period.get("short") or period["title"],
                "alternatives": [],
            },
            "classification": {
                "eventType": "political",
                "eventSubtype": "period",
                "region": "vietnam",
                "tags": ["giai đoạn lịch sử", "Việt Nam"],
            },
            "coverage": {"grades": [], "books": [], "lessons": []},
            "chronology": {
                "start": {"year": period.get("startYear"), "month": None, "day": None},
                "end": {"year": period.get("endYear"), "month": None, "day": None} if period.get("endYear") else None,
                "datePrecision": "period",
                "displayDate": period["short"],
                "isApproximate": False,
            },
            "mapData": {
                "geoType": "nationwide",
                "historicalLocations": ["Việt Nam"],
                "provinceNames": [],
                "gadmRefs": [],
                "marker": None,
                "markers": [],
                "focusGeometry": {"mode": "bounds", "center": {"lat": 16.0, "lng": 106.0}, "zoom": 5},
            },
            "summary": {
                "homepageTitle": period["title"],
                "homepageSummary": f"Giai đoạn {period['title']} trong cây sự kiện lịch sử Việt Nam.",
                "cardSummary": period["short"],
            },
            "textbookContent": {
                "canonicalSummary": f"Nút điều hướng tổng hợp cho {period['title']}.",
                "detailedNarrative": None,
                "significance": None,
                "keyFacts": [],
                "textbookRefs": [],
            },
            "externalContent": {"wikipedia": {"title": "", "url": "", "summary": "", "content": ""}, "wikidata": {"id": "", "url": ""}, "otherSources": []},
            "media": {"thumbnail": "", "items": []},
            "hierarchy": {"rootId": period_id, "parentId": None, "childIds": [], "level": 0, "orderInParent": idx},
            "associations": {"relatedEventIds": [], "relatedFigureIds": [], "predecessorEventIds": [], "successorEventIds": []},
            "display": {"showOnMap": True, "showOnTimeline": True, "showOnOverviewTimeline": True, "featured": True, "priority": 100},
            "sourcePolicy": {"primarySource": "derived", "supplementalSources": [], "lastUpdated": ""},
        })
    return roots


def build_forced_collection_nodes(
    existing_events: list[dict[str, Any]],
    forced_parent_ids: set[str],
    root_periods: list[dict[str, Any]],
    chronology_overrides: dict[str, dict[str, Any]] | None = None,
    chronology_override_counts: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    nodes = []
    for parent_id in synthetic_collection_target_ids(existing_events, forced_parent_ids, root_periods):
        node = _synthetic_collection_node(parent_id, root_periods)
        nodes.append(apply_synthetic_chronology_override(node, parent_id, chronology_overrides, chronology_override_counts))
    return nodes


def synthetic_collection_target_ids(
    existing_events: list[dict[str, Any]],
    forced_parent_ids: set[str],
    root_periods: list[dict[str, Any]],
) -> list[str]:
    existing_ids = {event["id"] for event in existing_events}
    root_ids = {period["id"] for period in root_periods}
    return sorted(parent_id for parent_id in forced_parent_ids if parent_id not in existing_ids and parent_id not in root_ids)


def _synthetic_collection_node(collection_id: str, root_periods: list[dict[str, Any]]) -> dict[str, Any]:
    root_id = _root_from_collection_id(collection_id)
    if root_id not in {period["id"] for period in root_periods}:
        root_id = "viet-nam-1975-den-nay"
    title = _title_from_id(collection_id)
    return {
        "id": collection_id,
        "slug": collection_id,
        "entityType": "event",
        "eventLevel": "collection",
        "_synthetic": True,
        "_syntheticCollection": True,
        "titles": {"primary": title, "short": title, "alternatives": []},
        "classification": {
            "eventType": "political",
            "eventSubtype": "collection",
            "region": "vietnam",
            "tags": ["nhóm sự kiện", "Stage 4B"],
        },
        "coverage": {"grades": [], "books": [], "lessons": []},
        "chronology": {
            "start": {"year": None, "month": None, "day": None},
            "end": None,
            "datePrecision": "period",
            "displayDate": title,
            "isApproximate": True,
        },
        "mapData": {
            "geoType": "nationwide",
            "historicalLocations": ["Việt Nam"],
            "provinceNames": [],
            "gadmRefs": [],
            "marker": None,
            "markers": [],
            "focusGeometry": {"mode": "bounds", "center": {"lat": 16.0, "lng": 106.0}, "zoom": 5},
        },
        "summary": {
            "homepageTitle": title,
            "homepageSummary": f"Nhóm sự kiện {title}.",
            "cardSummary": title,
        },
        "textbookContent": {
            "canonicalSummary": f"Nút collection dẫn xuất từ force_parent.json cho nhóm {title}.",
            "detailedNarrative": None,
            "significance": None,
            "keyFacts": [],
            "textbookRefs": [],
        },
        "externalContent": {"wikipedia": {"title": "", "url": "", "summary": "", "content": ""}, "wikidata": {"id": "", "url": ""}, "otherSources": []},
        "media": {"thumbnail": "", "items": []},
        "hierarchy": {"rootId": root_id, "parentId": root_id, "childIds": [], "level": 1, "orderInParent": 0},
        "associations": {"relatedEventIds": [], "relatedFigureIds": [], "predecessorEventIds": [], "successorEventIds": []},
        "display": {"showOnMap": True, "showOnTimeline": True, "showOnOverviewTimeline": True, "featured": True, "priority": 50},
        "sourcePolicy": {"primarySource": "derived", "supplementalSources": [], "lastUpdated": ""},
    }


def _root_from_collection_id(collection_id: str) -> str:
    suffix_map = {
        "1858-1918": "viet-nam-1858-1918",
        "1919-1945": "viet-nam-1919-1945",
        "1945-1954": "viet-nam-1945-1954",
        "1954-1975": "viet-nam-1954-1975",
        "1975-den-nay": "viet-nam-1975-den-nay",
        "tu-the-ki-xvi-den-xix": "viet-nam-tu-the-ki-xvi-den-xix",
    }
    for suffix, root_id in suffix_map.items():
        if collection_id.endswith(suffix):
            return root_id
    if collection_id == "phong-trao-can-vuong":
        return "viet-nam-1858-1918"
    return "viet-nam-1975-den-nay"


def _title_from_id(collection_id: str) -> str:
    known = {
        "chu-quyen-bien-dao-viet-nam-1858-1918": "Chủ quyền biển đảo Việt Nam 1858-1918",
        "chu-quyen-bien-dao-viet-nam-1919-1945": "Chủ quyền biển đảo Việt Nam 1919-1945",
        "chu-quyen-bien-dao-viet-nam-1954-1975": "Chủ quyền biển đảo Việt Nam 1954-1975",
        "chu-quyen-bien-dao-viet-nam-1975-den-nay": "Chủ quyền biển đảo Việt Nam 1975 đến nay",
        "chu-quyen-bien-dao-viet-nam-tu-the-ki-xvi-den-xix": "Chủ quyền biển đảo Việt Nam thế kỉ XVI-XIX",
        "phong-trao-can-vuong": "Phong trào Cần Vương",
    }
    if collection_id in known:
        return known[collection_id]
    return " ".join(part.capitalize() for part in collection_id.replace("-", " ").split())


def assign_parents(
    events: list[dict[str, Any]],
    root_periods: list[dict[str, Any]],
    parent_rules: list[dict[str, Any]],
    force_parent: dict[str, Any],
) -> list[dict[str, Any]]:
    root_ids = {period["id"] for period in root_periods}
    by_id = {event["id"]: event for event in events}
    for event in events:
        event_id = event["id"]
        year = (((event.get("chronology") or {}).get("start") or {}).get("year"))
        fallback_root = root_period_for_year(year if isinstance(year, int) else None)
        parent_id = None
        source = "fallback_root_by_year"
        reason = "Không tìm thấy collection parent cụ thể; gán theo root period dựa trên năm."

        forced = force_parent.get(event_id) if isinstance(force_parent, dict) else None
        if isinstance(forced, str) and (forced in by_id or forced in root_ids):
            parent_id = forced
            source = "force_parent"
            reason = "Gán theo force_parent.json."
        elif isinstance(forced, dict) and forced.get("parentId") in (set(by_id) | root_ids):
            parent_id = forced["parentId"]
            source = "force_parent"
            reason = forced.get("reason") or "Gán theo force_parent.json."
        else:
            text = event_text(event)
            for rule in parent_rules:
                candidate_parent = rule.get("parentId")
                if candidate_parent == event_id or candidate_parent not in by_id:
                    continue
                min_year = rule.get("minYear")
                if isinstance(min_year, int) and (not isinstance(year, int) or year < min_year):
                    continue
                keywords = [str(x) for x in rule.get("keywordsAny") or []]
                if any(keyword in text for keyword in keywords):
                    parent_id = candidate_parent
                    source = "parent_rules"
                    reason = rule.get("reason") or "Khớp parent_rules.json."
                    fallback_root = rule.get("rootId") or fallback_root
                    break

        if parent_id is None:
            parent_id = fallback_root
        if parent_id in root_ids:
            root_id = parent_id
        else:
            root_id = _root_for_parent(parent_id, by_id, fallback_root)
        event["_stage4bParentSource"] = source
        event["_stage4bParentReason"] = reason
        event.setdefault("hierarchy", {})
        event["hierarchy"].update({"parentId": parent_id, "rootId": root_id, "childIds": [], "level": None, "orderInParent": 0})
    return events


def _root_for_parent(parent_id: str, by_id: dict[str, dict[str, Any]], fallback_root: str) -> str:
    parent = by_id.get(parent_id)
    if not parent:
        return fallback_root
    year = (((parent.get("chronology") or {}).get("start") or {}).get("year"))
    return root_period_for_year(year if isinstance(year, int) else None)


def build_tree(
    real_events: list[dict[str, Any]],
    root_periods: list[dict[str, Any]],
    curation_rules: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    nodes = build_synthetic_roots(root_periods) + [copy.deepcopy(event) for event in real_events]
    by_id = {node["id"]: node for node in nodes}
    root_ids = {period["id"] for period in root_periods}

    for node in nodes:
        node.setdefault("hierarchy", {}).setdefault("childIds", [])
        node["hierarchy"]["childIds"] = []

    for node in nodes:
        parent_id = (node.get("hierarchy") or {}).get("parentId")
        if parent_id and parent_id in by_id:
            by_id[parent_id]["hierarchy"]["childIds"].append(node["id"])

    def set_level(node_id: str, level: int, root_id: str) -> None:
        node = by_id[node_id]
        node["hierarchy"]["level"] = level
        node["hierarchy"]["rootId"] = root_id
        children = sorted(node["hierarchy"]["childIds"], key=lambda child_id: date_sort_key(by_id[child_id]))
        node["hierarchy"]["childIds"] = children
        for order, child_id in enumerate(children):
            child = by_id[child_id]
            child["hierarchy"]["orderInParent"] = order
            set_level(child_id, level + 1, root_id)

    for order, root_id in enumerate([period["id"] for period in root_periods]):
        by_id[root_id]["hierarchy"]["orderInParent"] = order
        set_level(root_id, 0, root_id)

    overview_ids = set(curation_rules.get("overviewParentIds") or [])
    for node in nodes:
        child_ids = node["hierarchy"]["childIds"]
        node["eventLevel"] = "collection" if child_ids else "atomic"
        if node["id"] in root_ids:
            node["eventLevel"] = "collection"
        normalize_display(node, root_ids, overview_ids)

    event_tree = {
        "roots": [tree_node(by_id[period["id"]], by_id) for period in root_periods],
        "rootIds": [period["id"] for period in root_periods],
    }
    return [_canonical_order(node) for node in nodes], event_tree


def tree_node(node: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": node["id"],
        "title": event_title(node),
        "eventLevel": node.get("eventLevel"),
        "level": (node.get("hierarchy") or {}).get("level"),
        "children": [tree_node(by_id[child_id], by_id) for child_id in (node.get("hierarchy") or {}).get("childIds") or []],
    }


def _canonical_order(node: dict[str, Any]) -> dict[str, Any]:
    ordered = {key: node[key] for key in CANONICAL_TOP_LEVEL if key in node}
    for key, value in node.items():
        if key not in ordered and key.startswith("_"):
            ordered[key] = value
    return ordered
