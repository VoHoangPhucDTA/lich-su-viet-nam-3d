from __future__ import annotations

import argparse
import copy
import re
from typing import Any

from build_review_reports import lessons_label, markdown_table, write_curation_review, write_merge_proposal
from build_tree import assign_parents, build_forced_collection_nodes, build_tree, merge_approved_groups
from common import (
    CONFIG,
    DISPLAY_REVIEW,
    PHASE1,
    PHASE2,
    date_sort_key,
    ensure_dirs,
    event_text,
    event_title,
    load_events,
    read_json,
    root_period_for_year,
    write_json,
    write_jsonl,
)
from validate_curated_tree import validate_curated_tree


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 4B curation and tree builder")
    parser.add_argument("--phase", choices=["1", "2"], required=True)
    args = parser.parse_args()
    ensure_dirs()
    if args.phase == "1":
        run_phase1()
        return 0
    return run_phase2()


def run_phase1() -> None:
    events = load_events()
    events_by_id = {event["id"]: event for event in events}
    curation_rules = read_json(CONFIG / "curation_rules.json", {})
    merge_groups = _active_merge_groups(read_json(CONFIG / "merge_aliases.json", []), events_by_id)
    parent_rules = read_json(CONFIG / "parent_rules.json", [])
    root_periods = read_json(CONFIG / "root_periods.json", [])
    force_parent = read_json(CONFIG / "force_parent.json", {})

    supporting = build_supporting_suggestions(events, curation_rules)
    remove: list[dict[str, Any]] = []
    parent_suggestions, fallback_rows = build_parent_suggestions(events, root_periods, parent_rules, force_parent)
    display_excerpt = read_display_review_excerpt()

    write_jsonl(PHASE1 / "supporting_suggestions.jsonl", supporting)
    write_jsonl(PHASE1 / "remove_suggestions.jsonl", remove)
    write_jsonl(PHASE1 / "parent_suggestions.jsonl", parent_suggestions)
    (PHASE1 / "curation_review.md").write_text(
        write_curation_review(events, supporting, remove, display_excerpt),
        encoding="utf-8",
        newline="\n",
    )
    (PHASE1 / "merge_log.proposed.md").write_text(
        write_merge_proposal(merge_groups, events_by_id),
        encoding="utf-8",
        newline="\n",
    )
    (PHASE1 / "fallback_to_root_review.md").write_text(
        write_fallback_report(fallback_rows),
        encoding="utf-8",
        newline="\n",
    )
    print(f"Phase 1 complete: {len(events)} input events")
    print(f"- merge groups proposed: {len(merge_groups)}")
    print(f"- supporting suggestions: {len(supporting)}")
    print(f"- fallback-to-root review rows: {len(fallback_rows)}")


def run_phase2() -> int:
    curation_rules = read_json(CONFIG / "curation_rules.json", {})
    if not curation_rules.get("phase2Approved"):
        print("Phase 2 is locked. Set config/curation_rules.json phase2Approved=true after reviewing Phase 1 outputs.")
        return 2

    input_events = load_events()
    root_periods = read_json(CONFIG / "root_periods.json", [])
    merge_groups = read_json(CONFIG / "merge_aliases.json", [])
    parent_rules = read_json(CONFIG / "parent_rules.json", [])
    force_parent = read_json(CONFIG / "force_parent.json", {})
    force_keep = _force_id_set(read_json(CONFIG / "force_keep.json", []))
    force_supporting = _force_id_set(read_json(CONFIG / "force_supporting.json", []))
    force_remove = _force_id_set(read_json(CONFIG / "force_remove.json", []))

    merged_events, merge_logs, merged_aliases = merge_approved_groups(input_events, merge_groups)
    core, supporting, removed = apply_curation_decisions(merged_events, force_keep, force_supporting, force_remove)
    forced_parent_ids = _forced_parent_ids(force_parent)
    forced_parent_ids.update(_forced_collection_ids(force_parent, {period["id"] for period in root_periods}))
    core.extend(build_forced_collection_nodes(core, forced_parent_ids, root_periods))
    assigned = assign_parents(core, root_periods, parent_rules, force_parent)
    nodes, event_tree = build_tree(sorted(assigned, key=date_sort_key), root_periods, curation_rules)

    fallback_count = sum(1 for event in assigned if event.get("_stage4bParentSource") == "fallback_root_by_year")
    review_needed_count = len(_read_jsonl_if_exists(PHASE1 / "supporting_suggestions.jsonl"))
    errors, validation_md = validate_curated_tree(
        nodes,
        removed,
        merged_aliases,
        input_count=len(input_events),
        supporting_count=len(supporting),
        fallback_count=fallback_count,
        review_needed_count=review_needed_count,
    )

    write_jsonl(PHASE2 / "core_events.jsonl", nodes)
    write_jsonl(PHASE2 / "supporting_items.jsonl", supporting)
    write_jsonl(PHASE2 / "removed_events.jsonl", removed)
    write_json(PHASE2 / "event_tree.json", event_tree)
    write_json(PHASE2 / "hierarchy_seed.generated.json", hierarchy_seed(nodes))
    (PHASE2 / "merge_log.md").write_text(write_final_merge_log(merge_logs), encoding="utf-8", newline="\n")
    (PHASE2 / "semantic_validation.md").write_text(validation_md, encoding="utf-8", newline="\n")
    print(f"Phase 2 complete: {len(nodes)} core nodes, {len(errors)} validation errors")
    return 1 if errors else 0


def _active_merge_groups(groups: list[dict[str, Any]], events_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    active = []
    for group in groups:
        ids = [group.get("primaryId"), *(group.get("duplicateIds") or [])]
        if sum(1 for event_id in ids if event_id in events_by_id) >= 2:
            active.append(group)
    return active


def build_supporting_suggestions(events: list[dict[str, Any]], rules: dict[str, Any]) -> list[dict[str, Any]]:
    review_keywords = [str(x) for x in rules.get("reviewOnlyKeywords") or []]
    supporting_subtypes = set(str(x) for x in rules.get("supportingSubtypes") or [])
    display_exclude_ids = parse_display_review_ids(section="Exclude Display")
    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event in events:
        event_id = event["id"]
        text = event_text(event)
        subtype = str((event.get("classification") or {}).get("eventSubtype") or "")
        reasons = []
        confidence = "medium"
        if event_id in display_exclude_ids:
            reasons.append("Có trong Exclude Display của review A2.5.")
            confidence = "high"
        if subtype in supporting_subtypes:
            reasons.append(f"Subtype `{subtype}` thường là tư liệu/minh họa, cần duyệt làm supporting item.")
        matched_keywords = [keyword for keyword in review_keywords if keyword in text]
        if matched_keywords:
            reasons.append("Khớp keyword review-only: " + ", ".join(matched_keywords[:5]))
        if not reasons or event_id in seen:
            continue
        seen.add(event_id)
        suggestions.append({
            "eventId": event_id,
            "title": event_title(event),
            "displayDate": ((event.get("chronology") or {}).get("displayDate") or ""),
            "curationSuggestion": "supporting_item",
            "confidence": confidence,
            "reason": " ".join(reasons),
            "lessons": lessons_label(event),
        })
    return sorted(suggestions, key=lambda x: x["eventId"])


def build_parent_suggestions(
    events: list[dict[str, Any]],
    root_periods: list[dict[str, Any]],
    parent_rules: list[dict[str, Any]],
    force_parent: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    copied = copy.deepcopy(events)
    assigned = assign_parents(copied, root_periods, parent_rules, force_parent)
    suggestions = []
    fallback_rows = []
    for event in sorted(assigned, key=date_sort_key):
        hierarchy = event.get("hierarchy") or {}
        row = {
            "eventId": event["id"],
            "title": event_title(event),
            "displayDate": ((event.get("chronology") or {}).get("displayDate") or ""),
            "suggestedParentId": hierarchy.get("parentId"),
            "rootPeriod": hierarchy.get("rootId"),
            "source": event.get("_stage4bParentSource"),
            "reason": event.get("_stage4bParentReason"),
        }
        suggestions.append(row)
        if row["source"] == "fallback_root_by_year":
            fallback_rows.append({
                **row,
                "suggestedCollection": suggest_collection_name(event),
            })
    return suggestions, fallback_rows


def suggest_collection_name(event: dict[str, Any]) -> str:
    text = event_text(event)
    if "can vuong" in text:
        return "Phong trào Cần Vương"
    if "tay son" in text:
        return "Phong trào Tây Sơn"
    if "hoang sa" in text or "truong sa" in text or "bien dong" in text:
        return "Chủ quyền biển đảo Việt Nam"
    if "le thanh tong" in text:
        return "Cải cách Lê Thánh Tông"
    if "minh mang" in text:
        return "Cải cách Minh Mạng"
    return ""


def write_fallback_report(rows: list[dict[str, Any]]) -> str:
    out = [
        "# Stage 4B Fallback To Root Review",
        "",
        "Các event dưới đây chưa tìm được collection parent cụ thể và đang được đề xuất treo trực tiếp dưới root period.",
        "",
        f"- fallback-to-root count: {len(rows)}",
        "",
    ]
    out.append(markdown_table(
        ["eventId", "title", "displayDate", "rootPeriod", "reason", "suggestedCollection"],
        [
            [
                row["eventId"],
                row["title"],
                row.get("displayDate", ""),
                row.get("rootPeriod", ""),
                row.get("reason", ""),
                row.get("suggestedCollection", ""),
            ]
            for row in rows
        ],
    ))
    out.append("")
    return "\n".join(out)


def parse_display_review_ids(section: str) -> set[str]:
    if not DISPLAY_REVIEW.exists():
        return set()
    text = DISPLAY_REVIEW.read_text(encoding="utf-8")
    pattern = rf"## {re.escape(section)}(?P<body>.*?)(?:\n## |\Z)"
    match = re.search(pattern, text, flags=re.S)
    if not match:
        return set()
    return set(re.findall(r"### `([^`]+)`", match.group("body")))


def read_display_review_excerpt() -> str:
    if not DISPLAY_REVIEW.exists():
        return ""
    lines = DISPLAY_REVIEW.read_text(encoding="utf-8").splitlines()
    return "\n".join(lines[:120])


def apply_curation_decisions(
    events: list[dict[str, Any]],
    force_keep: set[str],
    force_supporting: set[str],
    force_remove: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    core = []
    supporting = []
    removed = []
    for event in events:
        event_id = event["id"]
        if event_id in force_keep:
            core.append(event)
        elif event_id in force_remove:
            row = copy.deepcopy(event)
            row["_stage4bCuration"] = {"role": "removed", "reason": "force_remove.json"}
            removed.append(row)
        elif event_id in force_supporting:
            row = copy.deepcopy(event)
            row["_stage4bCuration"] = {"role": "supporting_item", "reason": "force_supporting.json"}
            supporting.append(row)
        else:
            core.append(event)
    return core, supporting, removed


def _force_id_set(value: Any) -> set[str]:
    if isinstance(value, list):
        out = set()
        for item in value:
            if isinstance(item, str):
                out.add(item)
            elif isinstance(item, dict) and item.get("eventId"):
                out.add(str(item["eventId"]))
        return out
    if isinstance(value, dict):
        return set(str(key) for key in value.keys())
    return set()


def _forced_parent_ids(value: Any) -> set[str]:
    if not isinstance(value, dict):
        return set()
    out: set[str] = set()
    for raw in value.values():
        if isinstance(raw, str):
            out.add(raw)
        elif isinstance(raw, dict) and raw.get("parentId"):
            out.add(str(raw["parentId"]))
    return out


def _forced_collection_ids(value: Any, root_ids: set[str]) -> set[str]:
    if not isinstance(value, dict):
        return set()
    out: set[str] = set()
    for event_id, raw_parent in value.items():
        parent_id = raw_parent if isinstance(raw_parent, str) else raw_parent.get("parentId") if isinstance(raw_parent, dict) else None
        if parent_id in root_ids:
            out.add(str(event_id))
    return out


def hierarchy_seed(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        node["id"]: {
            "parentId": (node.get("hierarchy") or {}).get("parentId"),
            "rootId": (node.get("hierarchy") or {}).get("rootId"),
            "childIds": (node.get("hierarchy") or {}).get("childIds") or [],
            "level": (node.get("hierarchy") or {}).get("level"),
            "orderInParent": (node.get("hierarchy") or {}).get("orderInParent"),
        }
        for node in nodes
    }


def write_final_merge_log(merge_logs: list[dict[str, Any]]) -> str:
    out = ["# Stage 4B Merge Log", ""]
    if not merge_logs:
        out.append("Không có nhóm merge nào được áp dụng.")
        return "\n".join(out) + "\n"
    for log in merge_logs:
        out.extend([
            f"## `{log['primaryId']}`",
            "",
            f"- Merged ids: {', '.join(f'`{x}`' for x in log.get('mergedIds') or [])}",
            f"- Reason: {log.get('reason', '')}",
            "",
            "| old id | old title | old chronology | textbookRefs |",
            "|---|---|---|---|",
        ])
        for row in log.get("oldRows") or []:
            out.append(
                f"| `{row['id']}` | {row.get('title', '')} | "
                f"{row.get('chronology', {})} | {len(row.get('textbookRefs') or [])} |"
            )
        out.append("")
    return "\n".join(out)


def _read_jsonl_if_exists(path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            import json

            rows.append(json.loads(line))
    return rows


if __name__ == "__main__":
    raise SystemExit(main())
