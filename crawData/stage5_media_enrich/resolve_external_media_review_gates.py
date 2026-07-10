#!/usr/bin/env python3
"""Resolve external-media hard blocker gates into review decisions.

This script does not approve anything. It marks only hard-blocked events as
needing replacement/review, leaving duplicate physical images and missing-image
events untouched. Duplicate physical images are reported because current
external policy allows reuse across events.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


HARD_BLOCKER_STATUSES = {"blocked_data_issue", "blocked_needs_direct_source"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
    tmp.replace(path)


def normalize_decisions(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and isinstance(value.get("decisions"), dict):
        return dict(value["decisions"])
    return dict(value) if isinstance(value, dict) else {}


def event_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(row["eventId"]): row for row in manifest.get("events") or [] if row.get("eventId")}


def hard_blockers(gates: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = gates.get("gates") if isinstance(gates, dict) else []
    return {
        str(row.get("eventId")): row
        for row in rows or []
        if str(row.get("status") or "") in HARD_BLOCKER_STATUSES and row.get("eventId")
    }


def duplicate_slots(manifest: dict[str, Any], ingest_report: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    path_to_slot: dict[str, tuple[str, int, str]] = {}
    for event in manifest.get("events") or []:
        event_id = str(event.get("eventId") or "")
        for image in event.get("images") or []:
            local_path = str(image.get("localPath") or "")
            path_to_slot[local_path] = (event_id, int(image.get("slot") or 0), str(image.get("sha256") or ""))
    by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for digest, paths in (ingest_report.get("duplicatePhysicalHashes") or {}).items():
        for path in paths:
            if path not in path_to_slot:
                continue
            event_id, slot, _ = path_to_slot[path]
            by_event[event_id].append({
                "slot": slot,
                "sha256": digest,
                "localPath": path,
                "duplicateGroupSize": len(paths),
            })
    return by_event


def set_event_decision(
    decisions: dict[str, Any],
    event: dict[str, Any],
    status: str,
    reason: str,
    slot_notes: dict[int, str] | None = None,
) -> None:
    event_id = str(event["eventId"])
    existing = decisions.get(event_id)
    if isinstance(existing, dict) and existing.get("status") == "approved":
        raise ValueError(f"Refusing to override approved decision for {event_id}")
    images = []
    for image in event.get("images") or []:
        slot = int(image.get("slot") or len(images) + 1)
        images.append({
            "approved": False,
            "historicalVerificationUrl": str(image.get("historicalVerificationUrl") or ""),
            "relationType": str(image.get("relationType") or "strong_contextual"),
            "note": (slot_notes or {}).get(slot, reason),
        })
    decisions[event_id] = {
        "status": status,
        "reason": reason,
        "images": images,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("crawData/stage5_external_media_enrichment/external_event_image_manifest.json"))
    parser.add_argument("--ingest-report", type=Path, default=Path("crawData/stage5_media_enrich/output/external_folder_ingest_report.json"))
    parser.add_argument("--gates", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_review_gates.json"))
    parser.add_argument("--decisions", type=Path, default=Path("crawData/stage5_external_media_enrichment/external_event_media_review_decisions.json"))
    parser.add_argument("--report-json", type=Path, default=Path("crawData/stage5_media_enrich/output/external_media_gate_resolution_report.json"))
    parser.add_argument("--report-csv", type=Path, default=Path("crawData/stage5_media_enrich/output/external_media_gate_resolution_report.csv"))
    args = parser.parse_args()

    manifest = load_json(args.manifest)
    ingest_report = load_json(args.ingest_report)
    gates = load_json(args.gates)
    decisions = normalize_decisions(load_json(args.decisions) if args.decisions.exists() else {})
    events = event_by_id(manifest)
    blockers = hard_blockers(gates)
    duplicates = duplicate_slots(manifest, ingest_report)
    stale_duplicate_decisions_cleared = 0
    for event_id, decision in list(decisions.items()):
        if event_id in blockers or not isinstance(decision, dict):
            continue
        reason = str(decision.get("reason") or "")
        if decision.get("status") == "needs_replacement" and "duplicate physical image hash" in reason:
            decisions.pop(event_id, None)
            stale_duplicate_decisions_cleared += 1

    rows: list[dict[str, Any]] = []
    for event_id, gate in sorted(blockers.items()):
        event = events.get(event_id)
        if not event:
            rows.append({"eventId": event_id, "action": "error_missing_manifest_event", "reason": gate.get("status")})
            continue
        reason = f"hard_blocker:{gate.get('status')}:{gate.get('category')}: {gate.get('requiredAction')}"
        set_event_decision(decisions, event, "needs_replacement", reason)
        rows.append({
            "eventId": event_id,
            "title": event.get("title"),
            "action": "needs_replacement",
            "reasonType": "hard_blocker",
            "status": gate.get("status"),
            "category": gate.get("category"),
            "detail": gate.get("requiredAction"),
        })

    for event_id, slot_rows in sorted(duplicates.items()):
        event = events.get(event_id)
        if not event:
            rows.append({"eventId": event_id, "action": "error_missing_manifest_event", "reason": "duplicate_hash"})
            continue
        for slot in slot_rows:
            rows.append({
                "eventId": event_id,
                "title": event.get("title"),
                "action": "allowed_duplicate_report_only" if event_id not in blockers else "hard_blocked_duplicate_report_only",
                "reasonType": "duplicate_physical_hash",
                "slot": slot["slot"],
                "sha256": slot["sha256"],
                "detail": f"Duplicate image hash appears in {slot['duplicateGroupSize']} local files; allowed by external policy.",
            })

    missing_event_ids = {str(row.get("eventId")) for row in ingest_report.get("missing") or []}
    hard_event_ids = set(blockers)
    duplicate_event_ids = set(duplicates)
    touched_event_ids = hard_event_ids
    report = {
        "version": 1,
        "automaticApprovals": 0,
        "hardBlockerEvents": len(hard_event_ids),
        "duplicateHashGroups": len(ingest_report.get("duplicatePhysicalHashes") or {}),
        "duplicateAffectedEvents": len(duplicate_event_ids),
        "duplicateEventsMarkedNeedsReplacement": 0,
        "staleDuplicateDecisionsCleared": stale_duplicate_decisions_cleared,
        "eventsMarkedNeedsReplacement": len(touched_event_ids),
        "missingEventsLeftUntouched": len(missing_event_ids - touched_event_ids),
        "decisionFile": str(args.decisions),
        "rows": rows,
    }
    write_json(args.decisions, {"version": 1, "decisions": decisions})
    write_json(args.report_json, report)
    write_csv(args.report_csv, rows, [
        "eventId", "title", "action", "reasonType", "status", "category", "slot", "sha256", "detail",
    ])
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
