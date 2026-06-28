from __future__ import annotations

from stage4_common import DEDUPED_EVENTS, OUTPUT, normalize_text, read_jsonl


STRONG_PATTERNS = [
    "viet nam",
    "dong duong",
    "hoang sa",
    "truong sa",
    "bien dong",
    "nguyen ai quoc",
    "ho chi minh",
    "phan boi chau",
    "phan chau trinh",
    "vndcch",
    "viet minh",
    "asean",
    "gio ne vo",
    "geneve",
    "genève",
    "pa ri",
    "paris",
]

INCLUDE_CONTEXT = [
    "viet nam",
    "dong duong",
    "hoang sa",
    "truong sa",
    "bien dong",
    "nguyen ai quoc",
    "ho chi minh",
    "phan boi chau",
    "phan chau trinh",
    "viet nam dan chu cong hoa",
    "vndcch",
    "sai gon",
    "ha noi",
    "dong duong",
]

CONSIDER_CONTEXT = [
    "asean",
    "lien hop quoc",
    "lao",
    "cam pu chia",
    "dong nam a",
    "my",
    "lien xo",
    "trung quoc",
]

EXCLUDE_HINTS = [
    "an do",
    "trung hoa",
    "la ma",
    "hy lap",
    "anh",
    "bac my",
    "chau au",
    "robot",
    "cach mang cong nghiep",
    "van minh song an",
]


def flatten_text(value) -> str:
    if isinstance(value, dict):
        return " ".join(flatten_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(v) for v in value)
    return str(value or "")


def classify(row: dict) -> tuple[str, list[str]]:
    title_place_text = normalize_text(
        " ".join(
            [
                str(row.get("suggestedId") or ""),
                flatten_text(row.get("titles")),
                flatten_text((row.get("classification") or {}).get("tags")),
                flatten_text(row.get("rawPlaceMentions")),
            ]
        )
    )
    full_text = normalize_text(
        " ".join(
            [
                str(row.get("suggestedId") or ""),
                flatten_text(row.get("titles")),
                flatten_text(row.get("textbookContent")),
                flatten_text((row.get("classification") or {}).get("tags")),
                flatten_text(row.get("rawPlaceMentions")),
            ]
        )
    )
    reasons: list[str] = []
    strong_hits = [pattern for pattern in STRONG_PATTERNS if pattern in full_text]
    direct_include_hits = [pattern for pattern in INCLUDE_CONTEXT if pattern in title_place_text]
    full_include_hits = [pattern for pattern in INCLUDE_CONTEXT if pattern in full_text]
    consider_hits = [pattern for pattern in CONSIDER_CONTEXT if pattern in full_text]
    exclude_hits = [pattern for pattern in EXCLUDE_HINTS if pattern in full_text]

    if direct_include_hits:
        reasons.append("Có dấu hiệu trực tiếp trong id/title/tags/places: " + ", ".join(sorted(set(direct_include_hits))[:6]))
        return "nen_dua", reasons
    if full_include_hits and not exclude_hits:
        reasons.append("Có dấu hiệu Việt Nam trong nội dung và không có dấu hiệu world rõ: " + ", ".join(sorted(set(full_include_hits))[:6]))
        return "can_nhac", reasons
    if full_include_hits and exclude_hits:
        reasons.append(
            "Có nhắc Việt Nam trong nội dung nhưng event có vẻ thuộc ngữ cảnh world: "
            + ", ".join(sorted(set(exclude_hits))[:6])
        )
        return "khong_dua", reasons
    if strong_hits:
        reasons.append("Có keyword mạnh nhưng cần đọc ngữ cảnh SGK: " + ", ".join(sorted(set(strong_hits))[:6]))
        return "can_nhac", reasons
    if consider_hits and not exclude_hits:
        reasons.append("Liên quan khu vực/ngoại giao, cần duyệt tay: " + ", ".join(sorted(set(consider_hits))[:6]))
        return "can_nhac", reasons
    reasons.append(
        "Keyword match có vẻ là ngữ cảnh thế giới/khu vực, không phải event Việt Nam"
        + (": " + ", ".join(sorted(set(exclude_hits))[:6]) if exclude_hits else "")
    )
    return "khong_dua", reasons


def event_line(row: dict, reasons: list[str]) -> list[str]:
    title = ((row.get("titles") or {}).get("primary") or row.get("suggestedId") or "")
    display_date = ((row.get("chronology") or {}).get("displayDate") or "")
    places = ", ".join(row.get("rawPlaceMentions") or [])
    event_type = ((row.get("classification") or {}).get("eventType") or "")
    return [
        f"### `{row.get('suggestedId')}`",
        f"- Title: {title}",
        f"- Date: {display_date}",
        f"- eventType: `{event_type}`",
        f"- Places: {places}",
        f"- Lý do: {'; '.join(reasons)}",
        "",
    ]


def main() -> None:
    groups = {"nen_dua": [], "can_nhac": [], "khong_dua": []}
    for row in read_jsonl(DEDUPED_EVENTS):
        region = ((row.get("classification") or {}).get("region") or "").lower()
        if region == "vietnam" or row.get("_is_dual_region") is True:
            continue
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
        if not any(pattern in normalized for pattern in STRONG_PATTERNS + CONSIDER_CONTEXT):
            continue
        bucket, reasons = classify(row)
        groups[bucket].append((row, reasons))

    lines = [
        "# Vietnam Include Suggestion",
        "",
        "Report này chỉ đề xuất; không tự sửa `config/manual_vietnam_include.json`.",
        "",
        "## Summary",
        "",
        f"- Nên đưa: {len(groups['nen_dua'])}",
        f"- Cân nhắc: {len(groups['can_nhac'])}",
        f"- Không đưa: {len(groups['khong_dua'])}",
        "",
        "## Nên Đưa",
        "",
    ]
    for row, reasons in sorted(groups["nen_dua"], key=lambda item: str(item[0].get("suggestedId"))):
        lines.extend(event_line(row, reasons))
    lines.extend(["## Cần Nhắc", ""])
    for row, reasons in sorted(groups["can_nhac"], key=lambda item: str(item[0].get("suggestedId"))):
        lines.extend(event_line(row, reasons))
    lines.extend(["## Không Đưa", ""])
    for row, reasons in sorted(groups["khong_dua"], key=lambda item: str(item[0].get("suggestedId"))):
        lines.extend(event_line(row, reasons))

    (OUTPUT / "vietnam_include_suggestion.md").write_text("\n".join(lines), encoding="utf-8")
    print(
        {
            "nen_dua": len(groups["nen_dua"]),
            "can_nhac": len(groups["can_nhac"]),
            "khong_dua": len(groups["khong_dua"]),
        }
    )


if __name__ == "__main__":
    main()
