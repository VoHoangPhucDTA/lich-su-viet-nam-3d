from __future__ import annotations

from stage4_common import DEDUPED_EVENTS, OUTPUT, VIETNAM_KEYWORDS, normalize_text, read_jsonl


def flatten_text(value) -> str:
    if isinstance(value, dict):
        return " ".join(flatten_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(v) for v in value)
    return str(value or "")


def main() -> None:
    rows = read_jsonl(DEDUPED_EVENTS)
    keywords = [(kw, normalize_text(kw)) for kw in VIETNAM_KEYWORDS]
    candidates = []
    world_count = 0
    for row in rows:
        region = ((row.get("classification") or {}).get("region") or "").lower()
        if region == "vietnam" or row.get("_is_dual_region") is True:
            continue
        world_count += 1
        haystack = normalize_text(
            " ".join(
                [
                    flatten_text(row.get("titles")),
                    flatten_text(row.get("textbookContent")),
                    flatten_text((row.get("classification") or {}).get("tags")),
                    flatten_text(row.get("rawPlaceMentions")),
                ]
            )
        )
        hits = [kw for kw, nkw in keywords if nkw and nkw in haystack]
        if hits:
            candidates.append((row, hits))

    lines = [
        "# Vietnam Candidate Review",
        "",
        f"- Total events: {len(rows)}",
        f"- Non-Vietnam/non-dual events scanned: {world_count}",
        f"- Keyword candidates: {len(candidates)}",
        "",
        "Điền các `suggestedId` thật sự thuộc phạm vi lịch sử Việt Nam vào `config/manual_vietnam_include.json`.",
        "",
    ]
    for row, hits in candidates:
        title = ((row.get("titles") or {}).get("primary") or row.get("suggestedId"))
        display_date = ((row.get("chronology") or {}).get("displayDate") or "")
        places = ", ".join(row.get("rawPlaceMentions") or [])
        lines.extend(
            [
                f"## {row.get('suggestedId')}",
                f"- Title: {title}",
                f"- Date: {display_date}",
                f"- eventType: {(row.get('classification') or {}).get('eventType')}",
                f"- Keyword hits: {', '.join(hits)}",
                f"- Places: {places}",
                "",
            ]
        )
    (OUTPUT / "vietnam_candidates_review.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT / 'vietnam_candidates_review.md'} ({len(candidates)} candidates)")


if __name__ == "__main__":
    main()
