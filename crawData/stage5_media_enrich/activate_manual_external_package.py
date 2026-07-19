#!/usr/bin/env python3
"""Activate a stabilized manual external-image package as the local review queue.

This script reads package metadata only. It does not extract image binaries,
download remote files, publish assets, import DB rows, or modify approved
mappings. Its job is to make the package queue usable by the existing manual
download and ingest tools.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


QUEUE_NAME = "MASTER_QUEUE_NORMALIZED.json"
GATES_NAME = "REVIEW_GATES_ALL.json"
SUMMARY_NAME = "STABILIZATION_SUMMARY.json"
REPORT_NAME = "VALIDATION_REPORT.txt"

BLOCKED_STATUSES = {"blocked_data_issue", "blocked_needs_direct_source"}
REVIEW_STATUSES = {
    "awaiting_manual_download",
    "awaiting_manual_download_candidate_independence_review",
    "awaiting_manual_download_scoped",
    "awaiting_manual_document_source",
    *BLOCKED_STATUSES,
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: scalar(row.get(field)) for field in fields})
    tmp.replace(path)


def read_package_json(zip_path: Path, suffix: str) -> Any:
    with zipfile.ZipFile(zip_path) as archive:
        matches = [name for name in archive.namelist() if name.endswith("/" + suffix) or name == suffix]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one {suffix} in {zip_path}, found {len(matches)}")
        return json.loads(archive.read(matches[0]).decode("utf-8"))


def read_package_text(zip_path: Path, suffix: str) -> str:
    with zipfile.ZipFile(zip_path) as archive:
        matches = [name for name in archive.namelist() if name.endswith("/" + suffix) or name == suffix]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one {suffix} in {zip_path}, found {len(matches)}")
        return archive.read(matches[0]).decode("utf-8", errors="replace")


def load_plan_events(plan_path: Path) -> dict[str, dict[str, Any]]:
    plan = load_json(plan_path)
    events = {}
    for index, row in enumerate(plan.get("events") or []):
        copy = dict(row)
        copy["_planIndex"] = index
        events[str(row["eventId"])] = copy
    return events


def safe_event_dir(media_root: Path, folder: str, event_id: str) -> Path:
    if not folder.startswith("by_event/"):
        raise ValueError(f"{event_id}: package folder must start with by_event/: {folder}")
    if "\\" in folder or re.search(r"(^|/)\.\.($|/)", folder):
        raise ValueError(f"{event_id}: unsafe folder path: {folder}")
    expected = f"by_event/{event_id}"
    if folder != expected:
        raise ValueError(f"{event_id}: folder mismatch, expected {expected}, got {folder}")
    path = (media_root / folder).resolve()
    root = (media_root / "by_event").resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"{event_id}: folder escapes by_event root") from exc
    return path


def normalized_queue_row(row: dict[str, Any], gate: dict[str, Any] | None) -> dict[str, Any]:
    slot = int(row["slot"])
    status = str(row.get("downloadStatus") or "")
    return {
        "eventIndex": int(row["eventIndex"]),
        "eventId": str(row["eventId"]),
        "title": str(row.get("title") or ""),
        "chronology": str(row.get("displayDate") or ""),
        "eventLevel": str(row.get("eventLevel") or ""),
        "sourceFamily": str(row.get("sourceFamily") or ""),
        "folder": str(row.get("folder") or ""),
        "slot": slot,
        "role": "thumbnail" if slot == 1 else "gallery",
        "suggestedFilename": str(row.get("suggestedFilename") or f"image_{slot:02d}.<determine-after-download>"),
        "relationType": str(row.get("relationType") or ""),
        "confidence": str(row.get("confidence") or ""),
        "imageTitle": str(row.get("imageTitle") or ""),
        "assetPageUrl": str(row.get("assetPageUrl") or ""),
        "assetFileUrl": str(row.get("assetFileUrl") or ""),
        "previewUrl": str(row.get("previewUrl") or ""),
        "sourceDomain": str(row.get("sourceDomain") or ""),
        "author": str(row.get("author") or ""),
        "license": str(row.get("license") or ""),
        "licenseUrl": str(row.get("licenseUrl") or ""),
        "requiredAttribution": str(row.get("requiredAttribution") or ""),
        "historicalVerificationUrl": str(row.get("historicalVerificationUrl") or ""),
        "historicalReason": str(row.get("historicalReason") or ""),
        "downloadStatus": status,
        "reviewerNotes": str(row.get("reviewerNotes") or ""),
        "preferredVerificationDomains": str(row.get("preferredVerificationDomains") or ""),
        "gateStatus": str(gate.get("status") if gate else ""),
        "gateSeverity": str(gate.get("severity") if gate else ""),
        "gateCategory": str(gate.get("category") if gate else ""),
        "gateProblem": str(gate.get("problem") if gate else ""),
        "gateRequiredAction": str(gate.get("requiredAction") if gate else ""),
        "manualApprovalAllowed": status not in BLOCKED_STATUSES,
        "packageReviewRequired": status != "awaiting_manual_download",
    }


def validate_package(queue: list[dict[str, Any]], gates: list[dict[str, Any]], summary: dict[str, Any], plan_events: dict[str, dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if len(queue) != int(summary.get("candidates", -1)):
        errors.append(f"queue count {len(queue)} != summary candidates {summary.get('candidates')}")
    event_ids = {str(row.get("eventId")) for row in queue}
    if len(event_ids) != int(summary.get("events", -1)):
        errors.append(f"event count {len(event_ids)} != summary events {summary.get('events')}")
    missing_from_plan = sorted(event_ids - set(plan_events))
    extra_plan = sorted(set(plan_events) - event_ids)
    if missing_from_plan:
        errors.append(f"package events missing from current plan: {missing_from_plan[:10]}")
    if extra_plan:
        errors.append(f"current plan events missing from package: {extra_plan[:10]}")
    by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in queue:
        by_event[str(row.get("eventId"))].append(row)
        status = str(row.get("downloadStatus") or "")
        if status not in REVIEW_STATUSES:
            errors.append(f"{row.get('eventId')}: unknown downloadStatus {status!r}")
    for event_id, rows in by_event.items():
        slots = sorted(int(row.get("slot")) for row in rows)
        if slots != [1, 2]:
            errors.append(f"{event_id}: expected slots [1, 2], got {slots}")
        for row in rows:
            try:
                safe_event_dir(Path("."), str(row.get("folder") or ""), event_id)
            except Exception as exc:
                errors.append(str(exc))
    gate_event_ids = {str(row.get("eventId")) for row in gates}
    for row in gates:
        if str(row.get("status") or "") not in REVIEW_STATUSES:
            errors.append(f"{row.get('eventId')}: gate has unknown status {row.get('status')!r}")
    if not gate_event_ids.issubset(event_ids):
        errors.append("some gate event IDs are not present in queue")
    if summary.get("validationPassed") is not True:
        errors.append("package summary validationPassed is not true")
    if int(summary.get("concreteAssetFiles", -1)) != 0:
        errors.append("package unexpectedly contains concreteAssetFiles")
    if summary.get("importReady") is not False:
        errors.append("package importReady must be false for manual-download queue activation")
    return errors


def write_event_folder(media_root: Path, event_id: str, rows: list[dict[str, Any]], gate: dict[str, Any] | None) -> None:
    event_dir = safe_event_dir(media_root, rows[0]["folder"], event_id)
    event_dir.mkdir(parents=True, exist_ok=True)
    event_meta = {
        "eventId": event_id,
        "eventIndex": rows[0]["eventIndex"],
        "title": rows[0]["title"],
        "displayDate": rows[0]["chronology"],
        "sourceFamily": rows[0]["sourceFamily"],
        "status": "blocked" if any(row["downloadStatus"] in BLOCKED_STATUSES for row in rows) else "pending_manual_download",
        "package": "stage5_manual_external_images_stabilized_v2",
    }
    write_json(event_dir / "event.json", event_meta)
    write_json(event_dir / "sources.json", {
        "eventId": event_id,
        "eventIndex": rows[0]["eventIndex"],
        "status": event_meta["status"],
        "reviewGate": gate,
        "manualDownloadQueue": rows,
        "expected": [row["suggestedFilename"] for row in sorted(rows, key=lambda item: int(item["slot"]))],
    })
    lines = [
        f"# Manual download instructions for {event_id}",
        "",
        f"Title: {rows[0]['title']}",
        f"Display date: {rows[0]['chronology']}",
        "",
    ]
    if gate:
        lines.extend([
            "## Review gate",
            f"- Status: {gate.get('status')}",
            f"- Severity: {gate.get('severity')}",
            f"- Category: {gate.get('category')}",
            f"- Problem: {gate.get('problem')}",
            f"- Required action: {gate.get('requiredAction')}",
            "",
        ])
    for row in sorted(rows, key=lambda item: int(item["slot"])):
        blocked = row["downloadStatus"] in BLOCKED_STATUSES
        lines.extend([
            f"## Slot {row['slot']} - {row['role']}",
            f"- Queue status: {row['downloadStatus']}",
            f"- Save as: `{row['suggestedFilename']}`",
            f"- Image title: {row['imageTitle']}",
            f"- Asset page: {row['assetPageUrl'] or 'UNRESOLVED'}",
            f"- Asset file URL: {row['assetFileUrl'] or 'open asset page and choose concrete reusable file page first'}",
            f"- License: {row['license']}",
            f"- Historical verification URL: {row['historicalVerificationUrl']}",
            f"- Relation type: {row['relationType']}",
            f"- Manual approval allowed now: {'no' if blocked else 'yes, after file/license/source verification'}",
            f"- Notes: {row['historicalReason'] or row['reviewerNotes']}",
            "",
        ])
    (event_dir / "DOWNLOAD_INSTRUCTIONS.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def build_outputs(args: argparse.Namespace) -> dict[str, Any]:
    queue_raw = read_package_json(args.package, QUEUE_NAME)
    gates = read_package_json(args.package, GATES_NAME)
    summary = read_package_json(args.package, SUMMARY_NAME)
    validation_report = read_package_text(args.package, REPORT_NAME)
    plan_events = load_plan_events(args.plan)
    errors = validate_package(queue_raw, gates, summary, plan_events)
    gate_by_event = {str(row.get("eventId")): row for row in gates}
    queue = [normalized_queue_row(row, gate_by_event.get(str(row.get("eventId")))) for row in queue_raw]
    queue.sort(key=lambda row: (int(row["eventIndex"]), int(row["slot"])))
    by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in queue:
        by_event[row["eventId"]].append(row)
    status_counts = Counter(row["downloadStatus"] for row in queue)
    package_stats = {
        "version": 1,
        "sourcePackage": str(args.package),
        "eventCount": len(by_event),
        "candidateSlotCount": len(queue),
        "statusCounts": dict(sorted(status_counts.items())),
        "gateCount": len(gates),
        "blockedEventCount": len({row["eventId"] for row in queue if row["downloadStatus"] in BLOCKED_STATUSES}),
        "manualDownloadSlotCount": sum(1 for row in queue if row["downloadStatus"] not in BLOCKED_STATUSES),
        "binaryDownloads": 0,
        "importReady": False,
        "validationErrors": errors,
        "packageSummary": summary,
        "packageValidationReportExcerpt": validation_report[:2000],
    }
    if errors:
        return package_stats

    write_json(args.queue_json, {"version": 1, "source": "stage5_manual_external_images_stabilized_v2", "rows": queue})
    write_csv(args.queue_csv, queue, [
        "eventIndex", "eventId", "title", "chronology", "eventLevel", "sourceFamily", "folder",
        "slot", "role", "suggestedFilename", "relationType", "confidence", "imageTitle",
        "assetPageUrl", "assetFileUrl", "previewUrl", "sourceDomain", "author", "license",
        "licenseUrl", "requiredAttribution", "historicalVerificationUrl", "historicalReason",
        "downloadStatus", "reviewerNotes", "preferredVerificationDomains", "gateStatus",
        "gateSeverity", "gateCategory", "gateProblem", "gateRequiredAction",
        "manualApprovalAllowed", "packageReviewRequired",
    ])
    write_json(args.gates_json, {"version": 1, "source": "stage5_manual_external_images_stabilized_v2", "gates": gates})
    for event_id, rows in sorted(by_event.items(), key=lambda item: int(item[1][0]["eventIndex"])):
        write_event_folder(args.media_root, event_id, rows, gate_by_event.get(event_id))
    guide_lines = [
        "# Manual external package download guide",
        "",
        "This queue came from `stage5_manual_external_images_stabilized_v2.zip`.",
        "No image binaries were extracted or downloaded by this activation step.",
        "",
        "For each non-blocked slot:",
        "1. Open the asset page in a browser.",
        "2. Choose a concrete reusable image file page.",
        "3. Verify license, attribution, and historical relevance.",
        "4. Save the binary manually into the event folder as `image_01.<ext>` or `image_02.<ext>`.",
        "5. Run the ingest command after a batch is downloaded.",
        "",
        "Blocked rows must not be approved until their gate is resolved.",
        "",
        "```powershell",
        "python -X utf8 crawData/stage5_media_enrich/ingest_manual_external_images.py --resume",
        "```",
        "",
        "## Counts",
    ]
    for key, count in sorted(status_counts.items()):
        guide_lines.append(f"- {key}: {count}")
    args.guide.parent.mkdir(parents=True, exist_ok=True)
    args.guide.write_text("\n".join(guide_lines).rstrip() + "\n", encoding="utf-8")
    write_json(args.summary_json, package_stats)
    return package_stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--plan", type=Path, default=Path("crawData/stage5_media_enrich/output/event_source_plan.json"))
    parser.add_argument("--media-root", type=Path, default=Path("crawData/stage5_media_enrich/external_event_images"))
    parser.add_argument("--queue-json", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.json"))
    parser.add_argument("--queue-csv", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.csv"))
    parser.add_argument("--gates-json", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_review_gates.json"))
    parser.add_argument("--summary-json", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_package_activation_summary.json"))
    parser.add_argument("--guide", type=Path, default=Path("crawData/stage5_media_enrich/output/MANUAL_DOWNLOAD_GUIDE.md"))
    args = parser.parse_args()
    stats = build_outputs(args)
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))
    return 1 if stats.get("validationErrors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
