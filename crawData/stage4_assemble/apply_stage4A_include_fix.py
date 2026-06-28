from __future__ import annotations

import json
from typing import Any

from build_vietnam_include_suggestion import (
    CONSIDER_CONTEXT,
    STRONG_PATTERNS,
    classify,
    flatten_text,
)
from stage4_common import CONFIG, DEDUPED_EVENTS, OUTPUT, normalize_text, read_jsonl, write_json


FORCED_INCLUDE_IDS = {
    "viet-minh-hop-tac-oss-1945",
    "giang-van-minh-di-su-nha-minh",
    "hiep-uoc-hoa-phap-1946",
}

DIRECT_VIETNAM_TERMS = [
    "viet nam",
    "viet minh",
    "vndcch",
    "viet nam dan chu cong hoa",
    "ho chi minh",
    "nguyen ai quoc",
    "phan boi chau",
    "phan chau trinh",
    "ly thuong kiet",
    "dai viet",
    "an nam",
    "ha noi",
    "sai gon",
    "hoang sa",
    "truong sa",
    "bien dong",
]


def searchable_text(row: dict[str, Any], include_content: bool = True) -> str:
    parts = [
        str(row.get("suggestedId") or ""),
        flatten_text(row.get("titles")),
        flatten_text((row.get("classification") or {}).get("tags")),
        flatten_text(row.get("rawPlaceMentions")),
    ]
    if include_content:
        parts.append(flatten_text(row.get("textbookContent")))
    return normalize_text(" ".join(parts))


def is_candidate_row(row: dict[str, Any]) -> bool:
    normalized = normalize_text(
        " ".join(
            [
                str(row.get("suggestedId") or ""),
                flatten_text(row.get("titles")),
                flatten_text(row.get("textbookContent")),
                flatten_text(row.get("rawPlaceMentions")),
            ]
        )
    )
    return any(pattern in normalized for pattern in STRONG_PATTERNS + CONSIDER_CONTEXT)


def title_of(row: dict[str, Any]) -> str:
    return ((row.get("titles") or {}).get("primary") or row.get("suggestedId") or "")


def check_asean_1995(rows: list[dict[str, Any]]) -> tuple[list[str], set[str]]:
    matches: list[dict[str, Any]] = []
    for row in rows:
        text = searchable_text(row)
        is_direct_phrase = "viet nam gia nhap asean" in text
        is_member_phrase = "thanh vien asean" in text or "gia nhap asean" in text
        is_1995_asean = "1995" in text and "asean" in text
        if is_direct_phrase or is_member_phrase or is_1995_asean:
            matches.append(row)

    add_to_include: set[str] = set()
    lines = [
        "# Missing ASEAN Check",
        "",
        "Search scope: id, titles, tags, textbookContent in 680 GĐ3 events.",
        "",
    ]
    if not matches:
        lines.extend(
            [
                "## Result",
                "",
                "Không tồn tại event `Việt Nam gia nhập ASEAN 1995` trong 680 event.",
                "Kết luận: lỗ hổng nội dung từ GĐ1/GĐ2; không tự thêm event mới.",
            ]
        )
        return lines, add_to_include

    lines.extend(["## Matches", ""])
    for row in matches:
        sid = str(row.get("suggestedId"))
        region = ((row.get("classification") or {}).get("region") or "")
        display_date = ((row.get("chronology") or {}).get("displayDate") or "")
        lines.append(f"- `{sid}` | {title_of(row)} | region=`{region}` | date={display_date}")
        if sid == "viet-nam-gia-nhap-asean" and region != "vietnam":
            add_to_include.add(sid)

    existing_vn = [
        row
        for row in matches
        if row.get("suggestedId") == "viet-nam-gia-nhap-asean"
        and ((row.get("classification") or {}).get("region") or "").lower() == "vietnam"
    ]
    lines.extend(["", "## Result", ""])
    if existing_vn:
        lines.append(
            "(b) Event `viet-nam-gia-nhap-asean` tồn tại và `region=vietnam`, nên đã nằm trong 321 output hiện tại. Không thêm vào whitelist."
        )
    elif add_to_include:
        lines.append(
            "(c) Event tồn tại nhưng không phải `region=vietnam`; đã đưa ID có thật vào danh sách include."
        )
    else:
        lines.append(
            "Có match ASEAN/1995 nhưng không có event trực tiếp `viet-nam-gia-nhap-asean`; không tự thêm event mới."
        )
    return lines, add_to_include


def keep_consider(row: dict[str, Any]) -> tuple[bool, str]:
    text = searchable_text(row, include_content=False)
    hits = [term for term in DIRECT_VIETNAM_TERMS if term in text]
    if hits:
        return True, "Giữ vì id/title/tags/places có dấu hiệu Việt Nam trực tiếp: " + ", ".join(hits[:4])
    return False, "Loại vì chỉ là bối cảnh ASEAN/LHQ/khu vực hoặc lịch sử nước ngoài, không có Việt Nam tham gia trực tiếp."


def main() -> None:
    rows = read_jsonl(DEDUPED_EVENTS)
    by_id = {str(row.get("suggestedId")): row for row in rows if row.get("suggestedId")}

    asean_lines, asean_include_ids = check_asean_1995(rows)
    (OUTPUT / "missing_asean_check.md").write_text("\n".join(asean_lines) + "\n", encoding="utf-8")

    groups: dict[str, list[dict[str, Any]]] = {"nen_dua": [], "can_nhac": [], "khong_dua": []}
    for row in rows:
        region = ((row.get("classification") or {}).get("region") or "").lower()
        if region == "vietnam" or row.get("_is_dual_region") is True:
            continue
        if not is_candidate_row(row):
            continue
        bucket, _ = classify(row)
        groups[bucket].append(row)

    missing_forced = sorted(FORCED_INCLUDE_IDS - set(by_id))
    found_forced = sorted(FORCED_INCLUDE_IDS & set(by_id))

    kept_consider: list[tuple[dict[str, Any], str]] = []
    removed_consider: list[tuple[dict[str, Any], str]] = []
    for row in sorted(groups["can_nhac"], key=lambda item: str(item.get("suggestedId"))):
        keep, reason = keep_consider(row)
        if keep:
            kept_consider.append((row, reason))
        else:
            removed_consider.append((row, reason))

    include_ids = {
        str(row.get("suggestedId"))
        for row in groups["nen_dua"]
        if row.get("suggestedId")
    }
    include_ids.update(found_forced)
    include_ids.update(asean_include_ids)
    include_ids.update(str(row.get("suggestedId")) for row, _ in kept_consider if row.get("suggestedId"))
    include_ids = {sid for sid in include_ids if sid in by_id}

    write_json(CONFIG / "manual_vietnam_include.json", sorted(include_ids))

    external_ids = []
    for sid in sorted(include_ids):
        places = by_id[sid].get("rawPlaceMentions") or []
        region = ((by_id[sid].get("classification") or {}).get("region") or "").lower()
        text = searchable_text(by_id[sid], include_content=False)
        if region != "vietnam" and not any(term in text for term in ["ha noi", "sai gon", "hoang sa", "truong sa", "bien dong"]):
            external_ids.append(sid)

    lines = [
        "# Manual Vietnam Include Decision",
        "",
        "Đề tài: thuần lịch sử Việt Nam. Không giữ bối cảnh ASEAN/Đông Nam Á/LHQ chung nếu Việt Nam không tham gia trực tiếp.",
        "",
        "## Summary",
        "",
        f"- Nhóm `nên đưa` lấy từ suggestion: {len(groups['nen_dua'])}",
        f"- Forced include tồn tại: {len(found_forced)}",
        f"- Forced include thiếu: {len(missing_forced)}",
        f"- ASEAN 1995 thêm từ check: {len(asean_include_ids)}",
        f"- `cần nhắc` được giữ: {len(kept_consider)}",
        f"- `cần nhắc` bị loại: {len(removed_consider)}",
        f"- Tổng manual include unique: {len(include_ids)}",
        "",
        "## Forced Include Verification",
        "",
    ]
    for sid in found_forced:
        row = by_id[sid]
        lines.append(f"- ADD `{sid}` | {title_of(row)} | region=`{(row.get('classification') or {}).get('region')}`")
    for sid in missing_forced:
        lines.append(f"- MISSING `{sid}` | Không thêm vì không tồn tại trong dataset.")

    lines.extend(["", "## Cần Nhắc Được Giữ", ""])
    if kept_consider:
        for row, reason in kept_consider:
            lines.append(f"- KEEP `{row.get('suggestedId')}` | {title_of(row)} | {reason}")
    else:
        lines.append("- Không có.")

    lines.extend(["", "## Cần Nhắc Bị Loại", ""])
    for row, reason in removed_consider:
        lines.append(f"- DROP `{row.get('suggestedId')}` | {title_of(row)} | {reason}")

    lines.extend(["", "## Include Ngoài Lãnh Thổ VN Cần GĐ4.D Gán no_location", ""])
    if external_ids:
        for sid in external_ids:
            row = by_id[sid]
            lines.append(f"- `{sid}` | {title_of(row)}")
    else:
        lines.append("- Không có.")

    (OUTPUT / "manual_vietnam_include_decision.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "nen_dua": len(groups["nen_dua"]),
                "forced_found": len(found_forced),
                "forced_missing": missing_forced,
                "asean_added": sorted(asean_include_ids),
                "kept_consider": len(kept_consider),
                "removed_consider": len(removed_consider),
                "manual_include": len(include_ids),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
