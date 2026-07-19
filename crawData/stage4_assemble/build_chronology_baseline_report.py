from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from stage4_common import read_json, read_jsonl, write_json


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
STAGE4A_EVENTS = ROOT / "stage4_assemble" / "output" / "final_events.jsonl"
STAGE4B_CORE_EVENTS = ROOT / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"
STAGE4B_SUPPORTING_EVENTS = ROOT / "stage4b_curate_tree" / "output" / "phase2" / "supporting_items.jsonl"
STAGE5_APPROVED_MAPPINGS = ROOT / "stage5_media_enrich" / "config" / "approved_event_image_mappings.json"
STAGE5_CANDIDATES = ROOT / "stage5_media_enrich" / "output" / "image_event_candidates.jsonl"

OUTPUT_JSON = ROOT / "stage4_assemble" / "output" / "chronology_repair_baseline.json"
OUTPUT_MD = ROOT / "stage4_assemble" / "output" / "chronology_repair_baseline.md"

EXPECTED_AUDIT_COUNTS = {
    "stage4BTotal": 361,
    "integerStartYear": 259,
    "nullStartYear": 102,
    "yearSignalNull": 41,
    "noClearYearNull": 61,
}

MOJIBAKE_MARKERS = ("Ã", "Ä", "Æ", "áº", "á»", "â†", "â€”", "â€“")

SAFE_DETERMINISTIC_IDS = {
    "mien-bac-viet-nam-giai-phong-xay-dung-cnxh",
    "thuc-hien-thong-nhat-dat-nuoc-viet-nam",
    "viet-nam-hoan-tat-muc-tieu-thien-nien-ki",
    "cac-chien-thang-quan-su-1964-1965",
    "cai-cach-ruong-dat-mien-bac",
    "chu-quyen-bien-dao-viet-nam-1858-1918",
    "chu-quyen-bien-dao-viet-nam-1919-1945",
    "chu-quyen-bien-dao-viet-nam-1954-1975",
    "cuoc-tien-cong-chien-luoc-dong-xuan-1953-1954",
    "giai-doan-day-manh-cong-nghiep-hoa-hien-dai-hoa-hoi-nhap-kinh-te-quoc-te-1996-2006",
    "giai-doan-khang-chien-chong-my-1954-1960",
    "giai-doan-khang-chien-chong-my-1961-1965",
    "giai-doan-khang-chien-chong-my-1965-1968",
    "giai-doan-khang-chien-chong-my-1969-1973",
    "giai-doan-khang-chien-chong-my-1973-1975",
    "giai-doan-khoi-dau-cong-cuoc-doi-moi-1986-1995",
    "ke-hoach-nha-nuoc-5-nam-lan-thu-nhat-mien-bac",
    "lien-xo-vien-tro-cho-viet-nam",
    "phong-trao-dong-khoi",
    "hoan-toan-giai-phong-mien-nam-viet-nam",
}

MANUAL_YEAR_SIGNAL_CATEGORIES = {
    "approximate_contextual_range": {
        "cac-chien-dich-tien-cong-quan-doi-viet-nam-1950-1953",
        "cai-cach-le-thanh-tong",
        "chien-luoc-vua-danh-vua-dam-va-van-dong-quoc-te-cong-nhan-mat-tran-dan-toc-giai-phong-mien-nam-viet-nam",
        "chien-thang-duong-14-phuoc-long",
        "ho-chi-minh-keu-goi-nhuong-com-se-ao-tang-gia-san-xuat",
        "ho-chi-minh-ki-sac-lenh-thanh-lap-nha-binh-dan-hoc-vu-va-quy-doc-lap",
        "lien-hop-quoc-vien-tro-viet-nam-1977-1986",
        "viet-nam-mo-co-quan-dai-dien-ngoai-giao-va-thong-tin-o-nuoc-ngoai",
        "vndcch-can-bang-quan-he-voi-lien-xo-trung-quoc-va-van-dong-vien-tro",
        "vndcch-dau-tranh-doi-thi-hanh-hiep-dinh-gio-ne-vo",
        "vndcch-thiet-lap-quan-he-ngoai-giao-voi-lao-campuchia-va-ung-ho-phong-trao-giai-phong-dan-toc",
    },
    "one_sided_before_after": {
        "giai-doan-cuoi-chien-tranh-the-gioi-thu-hai",
        "viet-nam-tham-gia-afta",
        "vndcch-gap-go-dang-cong-san-phap-va-cac-to-chuc-quoc-te",
        "vu-an-le-chi-vien",
    },
    "open_ended": {
        "chu-quyen-bien-dao-viet-nam-1975-den-nay",
        "giai-doan-tiep-tuc-day-manh-cong-nghiep-hoa-hien-dai-hoa-hoi-nhap-quoc-te-sau-rong-2006-nay",
        "viet-nam-to-chuc-hoi-nghi-quoc-te-asean-asem-apec",
    },
    "multiple_separate_ranges": {
        "viet-nam-uy-vien-khong-thuong-truc-hoi-dong-bao-an-lhq",
    },
    "false_positive_or_ancient_duration": {
        "dau-tranh-chong-phong-kien-phuong-bac",
        "su-ra-doi-nha-nuoc-van-lang",
    },
}

NO_CLEAR_YEAR_CATEGORIES = {
    "truly_unknown": {
        "trang-an-duoc-ghi-danh-di-san-the-gioi",
    },
    "named_historical_period": {
        "chinh-quyen-phap-cai-cach-huong-chinh",
        "dinh-tien-le-dong-do-hoa-lu",
        "lang-co-ten-nom-xuat-hien-som-thoi-ly-tran",
        "nha-ly-su-dung-thi-cu-nho-hoc",
        "nha-ly-to-chuc-khoa-thi-nho-hoc-dau-tien",
        "nha-ly-xay-dung-van-mieu",
        "nha-nuoc-can-thiep-manh-lang-xa-thoi-le-so",
        "nha-nuoc-can-thiep-manh-lang-xa-thoi-nguyen",
        "nha-nuoc-pho-mac-lang-xa-thoi-le-trung-hung",
        "nho-giao-du-nhap-viet-nam",
        "phong-trao-can-vuong",
        "thanh-lap-quoc-su-quan-trieu-nguyen",
        "thoi-tran-dat-chuc-xa-quan",
        "tin-nguong-tho-than-dong-co-cung-dinh",
    },
    "century_based": {
        "cai-cach-tran-thu-do",
        "cai-cach-trinh-cuong-dang-ngoai",
        "chu-nom-su-dung-rong-rai",
        "chu-quoc-ngu-xuat-hien",
        "chu-quyen-bien-dao-viet-nam-tu-the-ki-xvi-den-xix",
        "doi-do-ly-cong-uan",
        "doi-moi-dao-duy-tu-dang-trong",
        "hinh-thanh-phat-trien-van-minh-cham-pa",
        "ho-khuc-to-chuc-lai-lang-xa-the-ki-x",
        "khoi-nghia-phung-hung",
        "khung-hoang-cuoi-trieu-tran",
        "le-loi-xay-thanh-luc-nien",
        "mai-thuc-loan-khoi-nghia",
        "nguoi-viet-che-tao-sung-than-co-thuyen-chien",
        "nguyen-hue-dung-chan-chieu-mo-binh-si",
        "nha-duong-dat-don-vi-huong-xa-thoi-bac-thuoc",
        "nha-minh-xam-luoc-dai-ngu",
        "phap-xam-luoc-viet-nam",
        "phong-trao-dong-du",
        "phong-trao-tay-son-bung-no",
        "phu-nam-tro-thanh-vuong-quoc-hung-manh",
        "thanh-lap-cac-dang-cong-san-o-viet-nam-ma-lai-xiem-phi-lip-pin",
        "thanh-lap-lang-xa-huyen-tien-hai-thai-binh",
        "thanh-lap-va-hoat-dong-doi-dan-binh-hoang-sa-bac-hai",
        "thuong-mai-a-au-phat-trien-tai-dai-viet",
        "viet-nam-lao-cam-pu-chia-chuyen-sang-kinh-te-thi-truong-va-cong-nghiep-hoa",
        "vuong-thuc-mau-khoi-nghia-can-vuong",
        "xa-lan-dau-tien-xuat-hien",
        "xa-tro-thanh-ten-goi-pho-bien",
    },
    "bce_or_ancient": {
        "viet-nam-thoi-dung-nuoc",
        "hinh-thanh-khoi-dai-doan-ket-van-lang-au-lac",
        "hinh-thanh-phat-trien-van-minh-phu-nam",
        "hinh-thanh-phat-trien-van-minh-van-lang-au-lac",
        "lang-xa-hinh-thanh-thoi-van-lang-au-lac",
        "van-hoa-sa-huynh",
        "van-hoa-tien-oc-eo",
    },
    "duration_expression": {
        "tan-cong-champa-dai-viet-cuoi-tk14",
        "van-hoa-phung-nguyen",
    },
    "relative_chronology": {
        "khang-chien-thang-loi",
        "tuyen-duong-chi-vien-chien-luoc-tren-bien-mang-ten-chu-tich-ho-chi-minh",
        "viet-nam-dam-phan-ranh-gioi-tren-bien",
        "viet-nam-ki-ket-evfta",
        "viet-nam-ki-ket-hiep-uoc-bien-gioi-trung-quoc",
        "viet-nam-ki-ket-nghi-dinh-thu-ki-o-to",
        "viet-nam-ki-ket-rcep",
        "viet-nam-thoan-thuan-bien-gioi-lao-cam-pu-chia",
    },
}


def canonical_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fingerprint(data: Any) -> str:
    return sha256_text(canonical_json(data))


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def require_file(path: Path, errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"Missing required input file: {rel(path)}")


def event_id(event: dict[str, Any]) -> str:
    return str(event.get("id") or "").strip()


def slug(event: dict[str, Any]) -> str:
    return str(event.get("slug") or "").strip()


def chronology(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("chronology")
    return value if isinstance(value, dict) else {}


def date_obj(event: dict[str, Any], key: str) -> dict[str, Any]:
    value = chronology(event).get(key)
    return value if isinstance(value, dict) else {}


def start_year(event: dict[str, Any]) -> int | None:
    year = date_obj(event, "start").get("year")
    return year if isinstance(year, int) else None


def end_year(event: dict[str, Any]) -> int | None:
    year = date_obj(event, "end").get("year")
    return year if isinstance(year, int) else None


def display_date(event: dict[str, Any]) -> str:
    return str(chronology(event).get("displayDate") or "")


def hierarchy(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("hierarchy")
    return value if isinstance(value, dict) else {}


def textbook_refs(event: dict[str, Any]) -> list[dict[str, Any]]:
    content = event.get("textbookContent")
    if not isinstance(content, dict):
        return []
    refs = content.get("textbookRefs")
    return refs if isinstance(refs, list) else []


def lesson_ids(event: dict[str, Any]) -> list[str]:
    return sorted(str(ref.get("lessonId")) for ref in textbook_refs(event) if ref.get("lessonId") not in (None, ""))


def find_duplicates(values: list[str]) -> list[str]:
    counts = Counter(values)
    return sorted(value for value, count in counts.items() if value and count > 1)


def summarize_dataset(events: list[dict[str, Any]]) -> dict[str, Any]:
    ids = [event_id(event) for event in events]
    slugs = [slug(event) for event in events if slug(event)]
    roots = [event for event in events if not hierarchy(event).get("parentId")]
    return {
        "eventCount": len(events),
        "uniqueEventIdCount": len(set(ids)),
        "duplicateEventIds": find_duplicates(ids),
        "eventIdSetHash": fingerprint(sorted(set(ids))),
        "slugCount": len(slugs),
        "duplicateSlugs": find_duplicates(slugs),
        "rootEventCount": len(roots),
    }


def classify_null_event(event: dict[str, Any]) -> tuple[str, str]:
    eid = event_id(event)
    if eid in SAFE_DETERMINISTIC_IDS:
        return ("year_signal_null", "safe_deterministic_candidate")
    for category, ids in MANUAL_YEAR_SIGNAL_CATEGORIES.items():
        if eid in ids:
            return ("year_signal_null", f"manual_review:{category}")
    for category, ids in NO_CLEAR_YEAR_CATEGORIES.items():
        if eid in ids:
            return ("no_clear_calendar_year_null", category)
    return ("unclassified_null", "other_unclassified")


def classify_null_chronology(core_events: list[dict[str, Any]]) -> dict[str, Any]:
    categories: dict[str, dict[str, list[str]]] = {
        "yearSignalNull": {
            "safeDeterministicCandidate": [],
            "manualReviewCandidate": [],
        },
        "yearSignalManualReviewByCategory": defaultdict(list),
        "noClearCalendarYearNull": {
            "trulyUnknown": [],
            "namedHistoricalPeriod": [],
            "centuryBased": [],
            "bceOrAncient": [],
            "durationExpression": [],
            "relativeChronology": [],
            "otherUnclassified": [],
        },
        "unclassifiedNull": [],
    }
    details: list[dict[str, Any]] = []
    category_name_map = {
        "truly_unknown": "trulyUnknown",
        "named_historical_period": "namedHistoricalPeriod",
        "century_based": "centuryBased",
        "bce_or_ancient": "bceOrAncient",
        "duration_expression": "durationExpression",
        "relative_chronology": "relativeChronology",
        "other_unclassified": "otherUnclassified",
    }
    for event in sorted(core_events, key=event_id):
        if start_year(event) is not None:
            continue
        group, category = classify_null_event(event)
        eid = event_id(event)
        if group == "year_signal_null" and category == "safe_deterministic_candidate":
            categories["yearSignalNull"]["safeDeterministicCandidate"].append(eid)
        elif group == "year_signal_null":
            manual_category = category.split(":", 1)[1]
            categories["yearSignalNull"]["manualReviewCandidate"].append(eid)
            categories["yearSignalManualReviewByCategory"][manual_category].append(eid)
        elif group == "no_clear_calendar_year_null":
            categories["noClearCalendarYearNull"][category_name_map[category]].append(eid)
        else:
            categories["unclassifiedNull"].append(eid)
        details.append(
            {
                "eventId": eid,
                "group": group,
                "category": category,
                "displayDate": display_date(event),
                "datePrecision": chronology(event).get("datePrecision"),
                "parentId": hierarchy(event).get("parentId"),
                "rootId": hierarchy(event).get("rootId"),
            }
        )
    manual_by_category = {
        key: sorted(value)
        for key, value in sorted(categories["yearSignalManualReviewByCategory"].items())
    }
    no_clear = categories["noClearCalendarYearNull"]
    year_signal_count = len(categories["yearSignalNull"]["safeDeterministicCandidate"]) + len(
        categories["yearSignalNull"]["manualReviewCandidate"]
    )
    no_clear_count = sum(len(ids) for ids in no_clear.values())
    return {
        "note": "Reporting-only classification from Phase D0 audit metadata; this does not authorize repair.",
        "yearSignalNullCount": year_signal_count,
        "noClearCalendarYearNullCount": no_clear_count,
        "yearSignalNull": {
            "safeDeterministicCandidateCount": len(categories["yearSignalNull"]["safeDeterministicCandidate"]),
            "safeDeterministicCandidateEventIds": sorted(categories["yearSignalNull"]["safeDeterministicCandidate"]),
            "manualReviewCandidateCount": len(categories["yearSignalNull"]["manualReviewCandidate"]),
            "manualReviewCandidateEventIds": sorted(categories["yearSignalNull"]["manualReviewCandidate"]),
            "manualReviewByCategory": {
                key: {"count": len(value), "eventIds": value}
                for key, value in manual_by_category.items()
            },
        },
        "noClearCalendarYearNull": {
            key: {"count": len(sorted_ids), "eventIds": sorted_ids}
            for key, sorted_ids in ((key, sorted(ids)) for key, ids in no_clear.items())
        },
        "unclassifiedNullCount": len(categories["unclassifiedNull"]),
        "unclassifiedNullEventIds": sorted(categories["unclassifiedNull"]),
        "classifiedNullEventDetails": details,
    }


def chronology_metrics(core_events: list[dict[str, Any]]) -> dict[str, Any]:
    zero_records: list[str] = []
    negative_records: list[dict[str, Any]] = []
    for event in core_events:
        years = [
            value
            for value in (date_obj(event, "start").get("year"), date_obj(event, "end").get("year"))
            if isinstance(value, int)
        ]
        if any(year == 0 for year in years):
            zero_records.append(event_id(event))
        if any(year < 0 for year in years):
            negative_records.append({"eventId": event_id(event), "years": years})
    int_start = [event for event in core_events if start_year(event) is not None]
    null_start = [event for event in core_events if start_year(event) is None]
    int_end = [event for event in core_events if end_year(event) is not None]
    null_end = [event for event in core_events if end_year(event) is None]
    actual = {
        "totalEventCount": len(core_events),
        "integerStartYearCount": len(int_start),
        "nullStartYearCount": len(null_start),
        "integerEndYearCount": len(int_end),
        "nullEndYearCount": len(null_end),
        "canonicalYearZeroCount": len(zero_records),
        "canonicalYearZeroEventIds": sorted(zero_records),
        "negativeBceYearRecordCount": len(negative_records),
        "negativeBceYearRecords": sorted(negative_records, key=lambda item: item["eventId"]),
    }
    actual["previousAuditExpectationComparison"] = {
        "expected": EXPECTED_AUDIT_COUNTS,
        "matchesExpectedCoreCounts": (
            actual["totalEventCount"] == EXPECTED_AUDIT_COUNTS["stage4BTotal"]
            and actual["integerStartYearCount"] == EXPECTED_AUDIT_COUNTS["integerStartYear"]
            and actual["nullStartYearCount"] == EXPECTED_AUDIT_COUNTS["nullStartYear"]
        ),
    }
    return actual


def extract_year_tokens(text: str) -> list[int]:
    return [int(match) for match in re.findall(r"(?<!\d)(\d{3,4})(?!\d)", text or "")]


def hierarchy_baseline(core_events: list[dict[str, Any]]) -> dict[str, Any]:
    null_start = [event for event in core_events if start_year(event) is None]
    parent_source_counts = Counter(str(event.get("_stage4bParentSource") or "none") for event in null_start)
    null_fallback = sorted(
        event_id(event)
        for event in null_start
        if event.get("_stage4bParentSource") == "fallback_root_by_year"
    )
    null_root_1975 = sorted(
        event_id(event)
        for event in null_start
        if hierarchy(event).get("rootId") == "viet-nam-1975-den-nay"
    )
    suspicious_pre1975 = []
    for event in null_start:
        group, _category = classify_null_event(event)
        if group != "year_signal_null":
            continue
        years = extract_year_tokens(display_date(event))
        if years and min(years) < 1975 and hierarchy(event).get("rootId") == "viet-nam-1975-den-nay":
            suspicious_pre1975.append(
                {
                    "eventId": event_id(event),
                    "displayDate": display_date(event),
                    "yearTokens": years,
                    "parentId": hierarchy(event).get("parentId"),
                    "rootId": hierarchy(event).get("rootId"),
                }
            )
    return {
        "nullStartParentSourceCounts": dict(sorted(parent_source_counts.items())),
        "nullStartFallbackRootByYearCount": len(null_fallback),
        "nullStartFallbackRootByYearEventIds": null_fallback,
        "nullStartRootedAtPost1975Count": len(null_root_1975),
        "nullStartRootedAtPost1975EventIds": null_root_1975,
        "yearSignalPre1975RootedAtPost1975Count": len(suspicious_pre1975),
        "yearSignalPre1975RootedAtPost1975Records": sorted(
            suspicious_pre1975, key=lambda item: item["eventId"]
        ),
    }


def db_zero_risk(core_events: list[dict[str, Any]]) -> dict[str, Any]:
    start_zero = []
    effective_zero = []
    for event in sorted(core_events, key=event_id):
        if start_year(event) is not None:
            continue
        group, category = classify_null_event(event)
        record = {"eventId": event_id(event), "group": group, "category": category}
        start_zero.append(record)
        if end_year(event) is None:
            effective_zero.append(record)
    return {
        "simulatedImporterRule": "chronology.start.year == null -> start_year = 0; if end.year is null then effective_end_year = start_year",
        "startYearZeroRiskCount": len(start_zero),
        "startYearZeroRiskRecords": start_zero,
        "effectiveEndYearZeroRiskCount": len(effective_zero),
        "effectiveEndYearZeroRiskRecords": effective_zero,
    }


def textbook_ref_snapshot(events: list[dict[str, Any]]) -> dict[str, Any]:
    by_event = {event_id(event): lesson_ids(event) for event in sorted(events, key=event_id)}
    events_with_refs = {eid: lessons for eid, lessons in by_event.items() if lessons}
    duplicate_refs = {
        event_id(event): sorted(find_duplicates([str(ref.get("lessonId")) for ref in textbook_refs(event)]))
        for event in events
    }
    duplicate_refs = {eid: ids for eid, ids in sorted(duplicate_refs.items()) if ids}
    unique_lessons = sorted({lesson for lessons in by_event.values() for lesson in lessons})
    return {
        "eventToLessonIds": by_event,
        "eventCountWithLessonRefs": len(events_with_refs),
        "uniqueLessonIdCount": len(unique_lessons),
        "uniqueLessonIds": unique_lessons,
        "duplicateLessonRefsByEvent": duplicate_refs,
        "hash": fingerprint(by_event),
    }


def load_stage5_candidates(errors: list[str]) -> dict[str, dict[str, Any]]:
    if not STAGE5_CANDIDATES.exists():
        return {}
    candidates: dict[str, dict[str, Any]] = {}
    try:
        for row in read_jsonl(STAGE5_CANDIDATES):
            source_image = row.get("sourceImage")
            if source_image:
                candidates[str(source_image)] = row
    except Exception as exc:
        errors.append(f"Failed to parse Stage5 candidates: {exc}")
    return candidates


def stage5_snapshot(core_events: list[dict[str, Any]], errors: list[str]) -> dict[str, Any]:
    approved = read_json(STAGE5_APPROVED_MAPPINGS, {})
    candidates_by_source = load_stage5_candidates(errors)
    by_id = {event_id(event): event for event in core_events}
    mappings = approved.get("mappings") if isinstance(approved, dict) else []
    if not isinstance(mappings, list):
        errors.append("Stage5 approved mappings must contain a mappings array.")
        mappings = []
    target_records = []
    target_event_ids: set[str] = set()
    relationship_count = 0
    for mapping in mappings:
        if not isinstance(mapping, dict) or mapping.get("status") != "approved":
            continue
        source_image = str(mapping.get("sourceImage") or "")
        source_lesson_id = str(mapping.get("lessonId") or "")
        candidate = candidates_by_source.get(source_image)
        candidate_events = {
            str(item.get("eventId"))
            for item in (candidate or {}).get("candidateEvents", [])
            if isinstance(item, dict) and item.get("eventId")
        }
        targets = mapping.get("targets") if isinstance(mapping.get("targets"), list) else []
        for target in targets:
            if not isinstance(target, dict):
                continue
            relationship_count += 1
            target_event_id = str(target.get("eventId") or "")
            target_event_ids.add(target_event_id)
            event = by_id.get(target_event_id)
            target_lessons = lesson_ids(event) if event else []
            record = {
                "sourceImage": source_image,
                "sourceLessonId": source_lesson_id,
                "targetEventId": target_event_id,
                "targetExistsInStage4B": event is not None,
                "targetSlug": slug(event) if event else None,
                "targetLessonIds": target_lessons,
                "sourceLessonIdInTargetRefs": source_lesson_id in target_lessons,
                "candidateRecordExists": candidate is not None,
                "candidateLessonIdMatchesApproved": (
                    str((candidate or {}).get("lessonId") or "") == source_lesson_id if candidate else False
                ),
                "targetAppearsInCandidateEvents": target_event_id in candidate_events if candidate else False,
            }
            if not record["targetExistsInStage4B"]:
                errors.append(f"Stage5 approved target missing from Stage4B core events: {target_event_id}")
            target_records.append(record)
    compatibility_identity = [
        {
            "sourceImage": item["sourceImage"],
            "sourceLessonId": item["sourceLessonId"],
            "targetEventId": item["targetEventId"],
            "targetSlug": item["targetSlug"],
            "targetLessonIds": item["targetLessonIds"],
        }
        for item in sorted(target_records, key=lambda row: (row["sourceImage"], row["targetEventId"]))
    ]
    return {
        "approvedImageCount": sum(
            1 for mapping in mappings if isinstance(mapping, dict) and mapping.get("status") == "approved"
        ),
        "approvedImageEventRelationshipCount": relationship_count,
        "targetEventIds": sorted(target_event_ids),
        "targetRecords": sorted(target_records, key=lambda row: (row["sourceImage"], row["targetEventId"])),
        "allTargetsExistInStage4B": all(item["targetExistsInStage4B"] for item in target_records),
        "allSourceLessonIdsMatchTargetRefs": all(item["sourceLessonIdInTargetRefs"] for item in target_records),
        "allApprovedTargetsAppearInCurrentCandidates": all(
            item["targetAppearsInCandidateEvents"] for item in target_records
        ),
        "compatibilityHash": fingerprint(compatibility_identity),
    }


def unrelated_content_baseline(events: list[dict[str, Any]]) -> dict[str, Any]:
    included_paths = [
        "id",
        "slug",
        "entityType",
        "eventLevel",
        "titles",
        "classification",
        "coverage",
        "summary",
        "textbookContent",
        "externalContent",
        "media",
        "associations",
        "display",
        "sourcePolicy",
    ]
    excluded_paths = ["chronology", "hierarchy", "_stage4bParentSource", "_stage4bParentReason"]
    rows = []
    for event in sorted(events, key=event_id):
        rows.append({key: event.get(key) for key in included_paths if key in event})
    return {
        "includedTopLevelPaths": included_paths,
        "excludedTopLevelPaths": excluded_paths,
        "hash": fingerprint(rows),
    }


def scan_mojibake(data: Any, prefix: str = "") -> list[str]:
    findings: list[str] = []
    if isinstance(data, dict):
        for key, value in data.items():
            findings.extend(scan_mojibake(value, f"{prefix}.{key}" if prefix else str(key)))
    elif isinstance(data, list):
        for index, value in enumerate(data):
            findings.extend(scan_mojibake(value, f"{prefix}[{index}]"))
    elif isinstance(data, str) and any(marker in data for marker in MOJIBAKE_MARKERS):
        findings.append(prefix)
    return findings


def build_report() -> tuple[dict[str, Any], str]:
    errors: list[str] = []
    warnings: list[str] = []
    for path in [STAGE4A_EVENTS, STAGE4B_CORE_EVENTS, STAGE5_APPROVED_MAPPINGS]:
        require_file(path, errors)
    if errors:
        return ({"validation": {"fatalErrors": errors, "warnings": warnings}}, "")

    try:
        stage4a_events = read_jsonl(STAGE4A_EVENTS)
        core_events = read_jsonl(STAGE4B_CORE_EVENTS)
    except Exception as exc:
        return ({"validation": {"fatalErrors": [f"Failed to parse JSONL input: {exc}"], "warnings": warnings}}, "")
    supporting_events = read_jsonl(STAGE4B_SUPPORTING_EVENTS) if STAGE4B_SUPPORTING_EVENTS.exists() else []

    empty_ids = [index for index, event in enumerate(core_events, start=1) if not event_id(event)]
    if empty_ids:
        errors.append(f"Stage4B core events contain empty event IDs at rows: {empty_ids[:20]}")

    stage4a_summary = summarize_dataset(stage4a_events)
    stage4b_summary = summarize_dataset(core_events)
    stage4b_summary["coreEventCount"] = len(core_events)
    stage4b_summary["supportingEventCount"] = len(supporting_events)
    chrono = chronology_metrics(core_events)
    null_classification = classify_null_chronology(core_events)
    hierarchy = hierarchy_baseline(core_events)
    db_risk = db_zero_risk(core_events)
    textbook = textbook_ref_snapshot(core_events)
    stage5 = stage5_snapshot(core_events, errors)
    unrelated = unrelated_content_baseline(core_events)

    if stage4b_summary["duplicateEventIds"]:
        warnings.append("Duplicate Stage4B event IDs detected.")
    if stage4b_summary["duplicateSlugs"]:
        warnings.append("Duplicate Stage4B slugs detected.")
    if not chrono["previousAuditExpectationComparison"]["matchesExpectedCoreCounts"]:
        warnings.append("Current Stage4B core chronology counts differ from previous audit expectations.")
    if null_classification["unclassifiedNullCount"]:
        warnings.append("Some null chronology records are unclassified by Phase D0 metadata.")

    approved_mojibake_paths = scan_mojibake(read_json(STAGE5_APPROVED_MAPPINGS, {}))
    if approved_mojibake_paths:
        warnings.append("Suspicious mojibake markers found in Stage5 approved mappings.")

    fingerprints = {
        "stage4BEventIdSetHash": stage4b_summary["eventIdSetHash"],
        "stage4BSlugMappingHash": fingerprint(
            {event_id(event): slug(event) for event in sorted(core_events, key=event_id)}
        ),
        "textbookReferenceHash": textbook["hash"],
        "stage5ApprovedTargetCompatibilityHash": stage5["compatibilityHash"],
        "unrelatedContentBaselineHash": unrelated["hash"],
        "fingerprintAlgorithm": "sha256(canonical JSON with sorted keys and compact separators)",
    }

    report = {
        "schemaVersion": 1,
        "readOnly": True,
        "inputs": {
            "stage4A": rel(STAGE4A_EVENTS),
            "stage4B": rel(STAGE4B_CORE_EVENTS),
            "stage4BSupporting": rel(STAGE4B_SUPPORTING_EVENTS),
            "stage5ApprovedMappings": rel(STAGE5_APPROVED_MAPPINGS),
            "stage5Candidates": rel(STAGE5_CANDIDATES),
        },
        "stage4A": stage4a_summary,
        "stage4B": stage4b_summary,
        "chronology": {
            **chrono,
            "nullChronologyClassification": null_classification,
        },
        "hierarchy": hierarchy,
        "dbZeroRisk": db_risk,
        "textbookReferences": textbook,
        "stage5Compatibility": stage5,
        "fingerprints": fingerprints,
        "unrelatedContentBaseline": unrelated,
        "validation": {
            "fatalErrors": errors,
            "warnings": warnings,
            "suspiciousMojibake": {
                "stage5ApprovedMappingPathCount": len(approved_mojibake_paths),
                "stage5ApprovedMappingPathsSample": approved_mojibake_paths[:50],
            },
        },
    }
    return report, render_markdown(report)


def bullet_ids(ids: list[str]) -> str:
    if not ids:
        return "- None\n"
    return "".join(f"- `{eid}`\n" for eid in ids)


def render_markdown(report: dict[str, Any]) -> str:
    chronology_report = report["chronology"]
    classification = chronology_report["nullChronologyClassification"]
    hierarchy_report = report["hierarchy"]
    db_risk = report["dbZeroRisk"]
    stage5 = report["stage5Compatibility"]
    fingerprints = report["fingerprints"]
    lines = [
        "# Chronology Repair Baseline",
        "",
        "> Generated report. This report does not repair or approve chronology changes.",
        "",
        "## Executive summary",
        "",
        f"- Stage4A events: {report['stage4A']['eventCount']}",
        f"- Stage4B core events: {report['stage4B']['coreEventCount']}",
        f"- Stage4B supporting events: {report['stage4B']['supportingEventCount']}",
        f"- Null Stage4B start years: {chronology_report['nullStartYearCount']}",
        f"- Stage5 approved targets valid: {stage5['allTargetsExistInStage4B']}",
        "",
        "## Chronology counts",
        "",
        "| Metric | Count |",
        "|---|---:|",
        f"| Total Stage4B core events | {chronology_report['totalEventCount']} |",
        f"| Integer start.year | {chronology_report['integerStartYearCount']} |",
        f"| Null start.year | {chronology_report['nullStartYearCount']} |",
        f"| Integer end.year | {chronology_report['integerEndYearCount']} |",
        f"| Null end.year | {chronology_report['nullEndYearCount']} |",
        f"| Canonical chronology year 0 records | {chronology_report['canonicalYearZeroCount']} |",
        f"| Negative/BCE chronology records | {chronology_report['negativeBceYearRecordCount']} |",
        "",
        "## Null chronology classification",
        "",
        "Classification is reporting-only Phase D0 metadata and does not authorize repair.",
        "",
        "| Group | Category | Count |",
        "|---|---|---:|",
        f"| Year-signal null | safe deterministic candidate | {classification['yearSignalNull']['safeDeterministicCandidateCount']} |",
        f"| Year-signal null | manual-review candidate | {classification['yearSignalNull']['manualReviewCandidateCount']} |",
    ]
    for category, payload in classification["noClearCalendarYearNull"].items():
        lines.append(f"| No-clear-calendar-year null | {category} | {payload['count']} |")
    lines.extend(
        [
            f"| Unclassified null | other | {classification['unclassifiedNullCount']} |",
            "",
            "### Safe deterministic candidates",
            "",
            bullet_ids(classification["yearSignalNull"]["safeDeterministicCandidateEventIds"]),
            "### Manual-review candidates",
            "",
            bullet_ids(classification["yearSignalNull"]["manualReviewCandidateEventIds"]),
            "## Hierarchy risk",
            "",
            f"- Null-start fallback_root_by_year count: {hierarchy_report['nullStartFallbackRootByYearCount']}",
            f"- Null-start rooted at `viet-nam-1975-den-nay`: {hierarchy_report['nullStartRootedAtPost1975Count']}",
            f"- Year-signal pre-1975 rooted at `viet-nam-1975-den-nay`: {hierarchy_report['yearSignalPre1975RootedAtPost1975Count']}",
            "",
            "## DB zero-risk simulation",
            "",
            f"- Would become `start_year = 0`: {db_risk['startYearZeroRiskCount']}",
            f"- Would become `effective_end_year = 0`: {db_risk['effectiveEndYearZeroRiskCount']}",
            "",
            "## Stage5 compatibility",
            "",
            f"- Approved image count: {stage5['approvedImageCount']}",
            f"- Approved image-event relationship count: {stage5['approvedImageEventRelationshipCount']}",
            f"- All targets exist in Stage4B: {stage5['allTargetsExistInStage4B']}",
            f"- All source lesson IDs match target refs: {stage5['allSourceLessonIdsMatchTargetRefs']}",
            f"- All approved targets appear in current candidates: {stage5['allApprovedTargetsAppearInCurrentCandidates']}",
            "",
            "| Target event | Slug | Source lesson | Exists | Lesson ref match | Candidate match |",
            "|---|---|---|---:|---:|---:|",
        ]
    )
    for record in stage5["targetRecords"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{record['targetEventId']}`",
                    f"`{record['targetSlug']}`",
                    f"`{record['sourceLessonId']}`",
                    str(record["targetExistsInStage4B"]),
                    str(record["sourceLessonIdInTargetRefs"]),
                    str(record["targetAppearsInCandidateEvents"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Fingerprints",
            "",
            "| Fingerprint | Hash | Protects |",
            "|---|---|---|",
            f"| Stage4B event ID set | `{fingerprints['stage4BEventIdSetHash']}` | Event identity stability |",
            f"| Stage4B slug mapping | `{fingerprints['stage4BSlugMappingHash']}` | Event ID to slug mapping |",
            f"| Textbook references | `{fingerprints['textbookReferenceHash']}` | Event to lesson refs used by Stage5 |",
            f"| Stage5 compatibility | `{fingerprints['stage5ApprovedTargetCompatibilityHash']}` | Approved target identity fields |",
            f"| Unrelated content baseline | `{fingerprints['unrelatedContentBaselineHash']}` | Non-chronology/non-hierarchy content |",
            "",
            "Unrelated-content fingerprint includes: "
            + ", ".join(report["unrelatedContentBaseline"]["includedTopLevelPaths"])
            + ".",
            "",
            "Unrelated-content fingerprint excludes: "
            + ", ".join(report["unrelatedContentBaseline"]["excludedTopLevelPaths"])
            + ".",
            "",
            "## Validation",
            "",
            f"- Fatal errors: {len(report['validation']['fatalErrors'])}",
            f"- Warnings: {len(report['validation']['warnings'])}",
            f"- Suspicious Stage5 approved mapping mojibake path count: {report['validation']['suspiciousMojibake']['stage5ApprovedMappingPathCount']}",
            "",
            "## Important warning",
            "",
            "**This report does not repair or approve chronology changes.**",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    report, markdown = build_report()
    fatal_errors = report.get("validation", {}).get("fatalErrors") or []
    if fatal_errors:
        print("\n".join(fatal_errors), file=sys.stderr)
        return 1
    write_json(OUTPUT_JSON, report)
    OUTPUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_MD.write_text(markdown, encoding="utf-8", newline="\n")
    print(f"Wrote {rel(OUTPUT_JSON)}")
    print(f"Wrote {rel(OUTPUT_MD)}")
    print(f"JSON sha256: {sha256_text(OUTPUT_JSON.read_text(encoding='utf-8'))}")
    print(f"Markdown sha256: {sha256_text(OUTPUT_MD.read_text(encoding='utf-8'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
