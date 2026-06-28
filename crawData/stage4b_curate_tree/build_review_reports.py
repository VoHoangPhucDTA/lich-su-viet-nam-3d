from __future__ import annotations

from collections import Counter
from typing import Any

from common import event_title


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    out = ["| " + " | ".join(headers) + " |"]
    out.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        out.append("| " + " | ".join(str(cell).replace("\n", " ") for cell in row) + " |")
    return "\n".join(out)


def lessons_label(event: dict[str, Any]) -> str:
    lessons = []
    for lesson in (event.get("coverage") or {}).get("lessons") or []:
        grade = lesson.get("grade", "")
        lesson_id = lesson.get("lessonId", "")
        title = lesson.get("lessonTitle", "")
        lessons.append(f"{grade}:{lesson_id} {title}".strip())
    return "; ".join(lessons)


def write_curation_review(
    events: list[dict[str, Any]],
    supporting: list[dict[str, Any]],
    remove: list[dict[str, Any]],
    display_review_excerpt: str,
) -> str:
    type_counts = Counter((event.get("classification") or {}).get("eventType", "") for event in events)
    rows = [
        ["Input events", len(events)],
        ["Supporting suggestions", len(supporting)],
        ["Remove suggestions", len(remove)],
        ["Event types", ", ".join(f"{k}: {v}" for k, v in sorted(type_counts.items()))],
    ]
    out = [
        "# Stage 4B Curation Review",
        "",
        "Phase 1 chỉ đề xuất. Không có event nào bị chuyển sang supporting/removed cho đến khi config được duyệt.",
        "",
        "## Summary",
        "",
        markdown_table(["Metric", "Value"], rows),
        "",
        "## Supporting Suggestions",
        "",
    ]
    if supporting:
        out.append(markdown_table(
            ["eventId", "title", "date", "confidence", "reason"],
            [
                [
                    item["eventId"],
                    item["title"],
                    item.get("displayDate", ""),
                    item.get("confidence", ""),
                    item.get("reason", ""),
                ]
                for item in supporting
            ],
        ))
    else:
        out.append("Không có suggestion.")
    out.extend(["", "## Remove Suggestions", ""])
    if remove:
        out.append(markdown_table(
            ["eventId", "title", "date", "confidence", "reason"],
            [
                [
                    item["eventId"],
                    item["title"],
                    item.get("displayDate", ""),
                    item.get("confidence", ""),
                    item.get("reason", ""),
                ]
                for item in remove
            ],
        ))
    else:
        out.append("Không có suggestion remove tự động.")
    out.extend([
        "",
        "## A2.5 Display Review Input",
        "",
        "Đã đọc `stage4_assemble/output/event_display_review.md` nếu tồn tại và hợp nhất phần đầu vào review này.",
        "",
        display_review_excerpt.strip() or "Không tìm thấy nội dung A2.5.",
        "",
    ])
    return "\n".join(out)


def write_merge_proposal(
    groups: list[dict[str, Any]],
    events_by_id: dict[str, dict[str, Any]],
) -> str:
    out = [
        "# Stage 4B Proposed Merge Log",
        "",
        "Phase 1 chỉ đề xuất merge. Phase 2 mới áp dụng khi `phase2Approved=true`.",
        "",
    ]
    for group in groups:
        primary_id = group["primaryId"]
        duplicate_ids = group.get("duplicateIds") or []
        primary = events_by_id.get(primary_id, {})
        out.extend([
            f"## `{primary_id}`",
            "",
            f"- Primary title: {event_title(primary)}",
            f"- Duplicate ids: {', '.join(f'`{x}`' for x in duplicate_ids)}",
            f"- Reason: {group.get('reason', '')}",
            "",
            "| id | title | displayDate | textbookRefs |",
            "|---|---|---|---|",
        ])
        for event_id in [primary_id, *duplicate_ids]:
            event = events_by_id.get(event_id, {})
            refs = (event.get("textbookContent") or {}).get("textbookRefs") or []
            out.append(
                f"| `{event_id}` | {event_title(event)} | "
                f"{((event.get('chronology') or {}).get('displayDate') or '')} | {len(refs)} |"
            )
        out.append("")
    return "\n".join(out)
