#!/usr/bin/env python3
"""Build a deterministic acquisition plan for Stage5 events that still have no approved image.

This script does not fetch the network. It computes the exact missing event set from:
- Stage4B/Stage5 core events
- the fully re-reviewed approved mappings

The generated plan is then consumed by download_external_event_images.py.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def tokens(text: str) -> list[str]:
    stop = {
        "va", "cua", "o", "tai", "trong", "tu", "den", "nam", "thoi", "giai", "doan",
        "su", "viec", "mot", "cac", "cho", "voi", "duoc", "vietnam", "viet", "nam",
    }
    raw = re.findall(r"[a-z0-9]+", fold(text))
    return [t for t in raw if len(t) >= 3 and t not in stop]


SOURCE_FAMILIES: dict[str, dict[str, Any]] = {
    "ancient_medieval": {
        "preferredVerificationDomains": [
            "baotanglichsu.vn", "disanvanhoa.gov.vn", "bvhttdl.gov.vn", "qdnd.vn",
            "nhandan.vn", "unesco.org", "whc.unesco.org",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["hiện vật", "di tích", "bảo tàng", "tranh lịch sử", "lược đồ"],
    },
    "early_modern": {
        "preferredVerificationDomains": [
            "baotanglichsu.vn", "luutru.gov.vn", "disanvanhoa.gov.vn", "nhandan.vn", "qdnd.vn",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["chân dung", "di tích", "sắc phong", "bản đồ", "tranh lịch sử"],
    },
    "colonial": {
        "preferredVerificationDomains": [
            "baotanglichsu.vn", "luutru.gov.vn", "hochiminh.vn", "nhandan.vn", "qdnd.vn",
            "vietnamplus.vn", "gallica.bnf.fr", "loc.gov",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["ảnh tư liệu", "chân dung", "bản đồ", "văn bản", "di tích"],
    },
    "revolutionary": {
        "preferredVerificationDomains": [
            "hochiminh.vn", "tulieuvankien.dangcongsan.vn", "dangcongsan.vn", "baotanglichsu.vn",
            "nhandan.vn", "qdnd.vn", "vietnamplus.vn", "luutru.gov.vn",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["ảnh tư liệu", "chân dung", "hội nghị", "văn kiện", "báo chí"],
    },
    "war_1945_1975": {
        "preferredVerificationDomains": [
            "btlsqsvn.org.vn", "qdnd.vn", "nhandan.vn", "vietnamplus.vn", "hochiminh.vn",
            "baotanglichsu.vn", "luutru.gov.vn", "loc.gov", "archives.gov",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["ảnh tư liệu", "chiến dịch", "lược đồ", "bảo tàng", "phóng viên chiến trường"],
    },
    "post_1975": {
        "preferredVerificationDomains": [
            "chinhphu.vn", "dangcongsan.vn", "tulieuvankien.dangcongsan.vn", "quochoi.vn",
            "mofa.gov.vn", "vietnamplus.vn", "nhandan.vn", "un.org", "unphoto.un.org",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["ảnh tư liệu", "lễ ký", "hội nghị", "văn kiện", "sự kiện"],
    },
    "maritime": {
        "preferredVerificationDomains": [
            "mofa.gov.vn", "biengioilanhtho.gov.vn", "mod.gov.vn", "qdnd.vn", "chinhphu.vn",
            "vietnamplus.vn", "luutru.gov.vn",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["bản đồ", "hải đồ", "đảo", "quần đảo", "chủ quyền", "ảnh tư liệu"],
    },
    "diplomacy": {
        "preferredVerificationDomains": [
            "mofa.gov.vn", "chinhphu.vn", "vietnamplus.vn", "nhandan.vn", "un.org", "asean.org",
            "apec.org", "europa.eu",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["lễ ký", "hội nghị", "đoàn đại biểu", "quan hệ ngoại giao", "ảnh tư liệu"],
    },
    "culture_language": {
        "preferredVerificationDomains": [
            "baotanglichsu.vn", "bvhttdl.gov.vn", "disanvanhoa.gov.vn", "vnfam.vn", "unesco.org",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["hiện vật", "di sản", "văn bản cổ", "bảo tàng", "tranh minh họa"],
    },
    "broad_period": {
        "preferredVerificationDomains": [
            "baotanglichsu.vn", "nhandan.vn", "qdnd.vn", "vietnamplus.vn", "luutru.gov.vn",
        ],
        "assetBackends": ["wikipedia_page", "commons_search"],
        "contextTerms": ["toàn cảnh lịch sử", "ảnh tư liệu", "bản đồ lịch sử", "hiện vật tiêu biểu"],
    },
}


def family_for(event: dict[str, Any]) -> str:
    title = fold(str(event.get("titles", {}).get("primary", "")))
    root = str(event.get("hierarchy", {}).get("rootId") or "")
    level = int(event.get("hierarchy", {}).get("level") or 0)

    if level == 0:
        return "broad_period"
    if any(k in title for k in ["hoang sa", "truong sa", "bien dao", "vung bien", "tham luc dia", "lanh hai", "hai li"]):
        return "maritime"
    if any(k in title for k in ["doi ngoai", "quan he", "lien hop quoc", "asean", "apec", "asem", "evfta", "rcep", "ngoai giao", "hiep dinh thuong mai"]):
        return "diplomacy"
    if any(k in title for k in ["chu nom", "chu quoc ngu", "nho giao", "tin nguong", "van hoa phung nguyen", "quoc su quan"]):
        return "culture_language"
    if root == "viet-nam-thoi-dung-nuoc" or root == "bac-thuoc-va-dau-tranh-gianh-doc-lap" or root == "viet-nam-tu-the-ki-x-den-xv":
        return "ancient_medieval"
    if root == "viet-nam-tu-the-ki-xvi-den-xix":
        return "early_modern"
    if root == "viet-nam-1858-1918":
        return "colonial"
    if root == "viet-nam-1919-1945":
        return "revolutionary"
    if root in {"viet-nam-1945-1954", "viet-nam-1954-1975"}:
        return "war_1945_1975"
    if root == "viet-nam-1975-den-nay":
        return "post_1975"
    return "broad_period"


def query_hints(event: dict[str, Any], family: str, by_id: dict[str, dict[str, Any]]) -> list[str]:
    title = str(event.get("titles", {}).get("primary") or event.get("id"))
    date = str(event.get("chronology", {}).get("displayDate") or "").strip()
    locations = event.get("mapData", {}).get("historicalLocations") or []
    parent_id = event.get("hierarchy", {}).get("parentId")
    parent_title = ""
    if parent_id and parent_id in by_id:
        parent_title = str(by_id[parent_id].get("titles", {}).get("primary") or "")
    facts = event.get("textbookContent", {}).get("keyFacts") or []
    fact_text = " ".join(str(x) for x in facts[:2])
    ctx = SOURCE_FAMILIES[family]["contextTerms"]

    queries = [title]
    if date:
        queries.append(f"{title} {date}")
    if locations:
        queries.append(f"{title} {locations[0]}")
    elif parent_title and parent_title != title:
        queries.append(f"{title} {parent_title}")
    if fact_text:
        queries.append(f"{title} {fact_text[:140]}")
    queries.extend(f"{title} {term}" for term in ctx[:2])

    seen: set[str] = set()
    out: list[str] = []
    for query in queries:
        compact = re.sub(r"\s+", " ", query).strip()
        key = fold(compact)
        if compact and key not in seen:
            out.append(compact)
            seen.add(key)
    return out[:6]


def build_plan(core_events: list[dict[str, Any]], reviewed: dict[str, Any]) -> dict[str, Any]:
    covered: set[str] = set()
    for mapping in reviewed.get("mappings") or []:
        if not isinstance(mapping, dict) or mapping.get("status") != "approved":
            continue
        for target in mapping.get("targets") or []:
            if isinstance(target, dict) and target.get("eventId"):
                covered.add(str(target["eventId"]))

    by_id = {str(event["id"]): event for event in core_events if event.get("id")}
    missing = [event for event in core_events if str(event.get("id")) not in covered]
    events: list[dict[str, Any]] = []
    for event in missing:
        event_id = str(event["id"])
        family = family_for(event)
        policy = SOURCE_FAMILIES[family]
        events.append(
            {
                "eventId": event_id,
                "title": event.get("titles", {}).get("primary") or event_id,
                "shortTitle": event.get("titles", {}).get("short") or "",
                "displayDate": event.get("chronology", {}).get("displayDate") or "",
                "eventLevel": event.get("eventLevel") or "",
                "rootId": event.get("hierarchy", {}).get("rootId"),
                "parentId": event.get("hierarchy", {}).get("parentId"),
                "historicalLocations": event.get("mapData", {}).get("historicalLocations") or [],
                "provinceNames": event.get("mapData", {}).get("provinceNames") or [],
                "canonicalSummary": event.get("textbookContent", {}).get("canonicalSummary") or "",
                "keyFacts": event.get("textbookContent", {}).get("keyFacts") or [],
                "sourceFamily": family,
                "preferredVerificationDomains": policy["preferredVerificationDomains"],
                "assetBackends": policy["assetBackends"],
                "queries": query_hints(event, family, by_id),
                "requiredImages": 2,
                "slots": [
                    {
                        "slot": 1,
                        "role": "thumbnail",
                        "isThumbnail": True,
                        "minimumRelation": "strong_contextual",
                    },
                    {
                        "slot": 2,
                        "role": "gallery",
                        "isThumbnail": False,
                        "sortOrder": 2,
                        "minimumRelation": "strong_contextual",
                    },
                ],
            }
        )

    return {
        "version": 1,
        "policyVersion": "2026-07-09",
        "coreEventCount": len(core_events),
        "coveredByReviewedMappings": len(covered),
        "missingEventCount": len(events),
        "requiredImageAssignments": len(events) * 2,
        "sourceFamilies": SOURCE_FAMILIES,
        "events": events,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--core-events", required=True)
    parser.add_argument("--reviewed-mappings", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--by-event-root", default="")
    args = parser.parse_args()

    plan = build_plan(load_jsonl(Path(args.core_events)), load_json(Path(args.reviewed_mappings)))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.by_event_root:
        root = Path(args.by_event_root)
        root.mkdir(parents=True, exist_ok=True)
        for event in plan["events"]:
            folder = root / event["eventId"]
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "event.json").write_text(
                json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            source_stub = {
                "eventId": event["eventId"],
                "status": "pending_download",
                "images": [],
                "expected": ["image_01.<ext>", "image_02.<ext>"],
            }
            (folder / "sources.json").write_text(
                json.dumps(source_stub, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
    print(json.dumps({k: plan[k] for k in ["coreEventCount", "coveredByReviewedMappings", "missingEventCount", "requiredImageAssignments"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
