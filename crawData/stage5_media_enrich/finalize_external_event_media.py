#!/usr/bin/env python3
"""Finalize downloaded external-event images and merge them with approved mappings.

Outputs are previews only. This script never writes the repository's live approved config.
It produces:
- external_event_image_candidates.jsonl
- approved_external_event_image_mappings.json
- approved_event_image_mappings_combined_preview.json
- combined_image_candidates.jsonl
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
import urllib.parse


HARD_BLOCKER_STATUSES = {"blocked_data_issue", "blocked_needs_direct_source"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip(): rows.append(json.loads(line))
    return rows


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def repo_relative(path: Path, repo_root: Path) -> str:
    return slash(path.resolve().relative_to(repo_root.resolve()))


def normalize_decisions(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and "decisions" in value and isinstance(value["decisions"], dict):
        return value["decisions"]
    return value if isinstance(value, dict) else {}


def normalize_gates(value: Any) -> list[dict[str, Any]]:
    rows = value.get("gates") if isinstance(value, dict) else value
    return [row for row in (rows or []) if isinstance(row, dict)]


def hard_blockers(gates: Any) -> dict[str, dict[str, Any]]:
    return {
        str(row.get("eventId")): row
        for row in normalize_gates(gates)
        if str(row.get("status") or "") in HARD_BLOCKER_STATUSES and row.get("eventId")
    }


def display_name_for(image: dict[str, Any], event: dict[str, Any]) -> str:
    value = (
        image.get("displayName")
        or image.get("fileTitle")
        or image.get("originalFileName")
        or event.get("title")
        or event.get("eventId")
        or ""
    )
    return str(value).strip()


def original_filename_for(image: dict[str, Any], source_path: Path) -> str:
    value = image.get("originalFileName") or source_path.name
    return str(value).strip()


def resolve_asset_path(value: str, package_root: Path, repo_root: Path) -> Path:
    raw = Path(value)
    candidates: list[Path] = []
    if raw.is_absolute():
        candidates.append(raw)
    else:
        candidates.extend([
            repo_root / raw,
            package_root / raw,
            package_root.parent / raw,
        ])
    for candidate in candidates:
        path = candidate.resolve()
        if path.is_file():
            return path
    raise FileNotFoundError(f"canonical asset missing: {value}")


def used_sort_orders(base_mappings: dict[str, Any]) -> dict[str, set[int]]:
    used: dict[str, set[int]] = {}
    for mapping in base_mappings.get("mappings") or []:
        for target in mapping.get("targets") or []:
            event_id = str(target.get("eventId") or "")
            sort_order = target.get("sortOrder")
            if event_id and isinstance(sort_order, int) and not isinstance(sort_order, bool):
                used.setdefault(event_id, set()).add(sort_order)
    return used


def next_sort_order(used: set[int], desired: int) -> int:
    order = desired if desired > 0 else 1
    while order in used:
        order += 1
    used.add(order)
    return order


def duplicate_hash_groups(manifest: dict[str, Any]) -> dict[str, list[str]]:
    hashes: dict[str, list[str]] = {}
    for event in manifest.get("events") or []:
        event_id = str(event.get("eventId") or "")
        for image in event.get("images") or []:
            digest = str(image.get("sha256") or "")
            if digest:
                hashes.setdefault(digest, []).append(event_id)
    return {digest: rows for digest, rows in hashes.items() if len(set(rows)) > 1}


def build_outputs(
    manifest: dict[str, Any],
    decisions: dict[str, Any],
    base_mappings: dict[str, Any],
    base_candidates: list[dict[str, Any]],
    package_root: Path,
    gates: Any | None = None,
    repo_root: Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    repo_root = (repo_root or Path.cwd()).resolve()
    package_root = package_root.resolve()
    events = {row["eventId"]: row for row in manifest.get("events") or [] if row.get("eventId")}
    approved_event_ids: set[str] = set()
    grouped: dict[str, dict[str, Any]] = {}
    external_candidates: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    hard_blocker_by_event = hard_blockers(gates or {})
    sort_orders_by_event = used_sort_orders(base_mappings)
    skipped_missing: list[str] = []
    excluded_blocked: list[str] = []

    for event_id, event in events.items():
        images = sorted(event.get("images") or [], key=lambda row: (int(row.get("slot") or 0), str(row.get("sourceImage") or "")))
        if event_id in hard_blocker_by_event:
            excluded_blocked.append(event_id)
            continue
        if not images:
            skipped_missing.append(event_id)
            continue
        decision = decisions.get(event_id) or {}
        decision_images = decision.get("images") or []
        approved_event_ids.add(event_id)
        for image_index, image in enumerate(images):
            decision_image = decision_images[image_index] if image_index < len(decision_images) and isinstance(decision_images[image_index], dict) else {}
            verification_url = str(
                decision_image.get("historicalVerificationUrl")
                or image.get("historicalVerificationUrl")
                or ""
            ).strip()
            relation_type = str(decision_image.get("relationType") or image.get("relationType") or "strong_contextual")
            digest = str(image.get("sha256") or "")
            canonical_asset = str(image.get("canonicalAsset") or "")
            if not digest or not canonical_asset:
                errors.append(f"{event_id}: image missing sha256/canonicalAsset")
                continue
            try:
                source_path = resolve_asset_path(canonical_asset, package_root, repo_root)
            except FileNotFoundError:
                errors.append(f"{event_id}: canonical asset missing: {canonical_asset}")
                continue
            repo_source = repo_relative(source_path, repo_root)
            display_name = display_name_for(image, event)
            original_filename = original_filename_for(image, source_path)
            candidate = external_candidates.get(repo_source)
            if candidate is None:
                candidate = {
                    "sourceImage": repo_source,
                    "lessonId": "external-web",
                    "imageId": f"external:{digest[:16]}",
                    "caption": display_name,
                    "contentHash": digest,
                    "extension": str(image.get("extension") or source_path.suffix).lower(),
                    "sourceType": "external-web",
                    "fileSizeBytes": source_path.stat().st_size,
                    "candidateEvents": [],
                    "candidateEventCount": 0,
                    "mappingStatus": "external_reviewed",
                    "validationIssues": [],
                    "sourceMetadata": {
                        "sourcePageUrl": image.get("sourcePageUrl"),
                        "originalSource": image.get("originalSource"),
                        "originalFileName": original_filename,
                        "displayName": display_name,
                        "downloadUrl": image.get("downloadUrl"),
                        "license": image.get("license"),
                        "licenseUrl": image.get("licenseUrl"),
                        "artist": image.get("artist") or image.get("author"),
                        "credit": image.get("credit"),
                        "sourceBackend": image.get("sourceBackend"),
                        "query": image.get("query"),
                    },
                }
                external_candidates[repo_source] = candidate
            verification_urls = candidate["sourceMetadata"].setdefault("historicalVerificationUrls", [])
            if verification_url not in verification_urls:
                verification_urls.append(verification_url)
            mapping = grouped.get(repo_source)
            if mapping is None:
                mapping = {
                    "sourceImage": repo_source,
                    "lessonId": "external-web",
                    "altText": display_name,
                    "status": "approved",
                    "sourceType": "external-web",
                    "sourceMetadata": candidate["sourceMetadata"],
                    "targets": [],
                }
                caption_override = str(decision_image.get("captionOverride") or image.get("captionOverride") or "").strip()
                if caption_override:
                    mapping["captionOverride"] = caption_override
                grouped[repo_source] = mapping
            desired_order = int(image.get("slot") or image.get("sortOrder") or image_index + 1)
            sort_order = next_sort_order(sort_orders_by_event.setdefault(event_id, set()), desired_order)
            mapping["targets"].append(
                {
                    "eventId": event_id,
                    "isThumbnail": False,
                    "sortOrder": sort_order,
                    "reviewNote": (
                        f"[external-web/manual-downloaded] "
                        + (str(decision_image.get("note") or "").strip() or display_name or str(event.get("title") or event_id))
                    ),
                    "overrideReason": "External historical image acquired outside Stage1 and manually reviewed against event content, provenance, and an authoritative historical verification source.",
                    "historicalVerificationUrl": verification_url,
                    "relationType": relation_type,
                }
            )
            if not any(row.get("eventId") == event_id for row in candidate["candidateEvents"]):
                candidate["candidateEvents"].append(
                    {
                        "eventId": event_id,
                        "slug": event_id,
                        "title": event.get("title") or event_id,
                        "eventLevel": "external-reviewed",
                        "displayDate": event.get("displayDate") or "",
                        "parentId": None,
                        "rootId": None,
                        "reason": "external_web_manual_review",
                    }
                )
                candidate["candidateEventCount"] = len(candidate["candidateEvents"])

    external_mappings = sorted(grouped.values(), key=lambda row: row["sourceImage"])
    combined_mappings = list(base_mappings.get("mappings") or []) + external_mappings
    combined_rejected = list(base_mappings.get("rejected") or [])
    combined_candidates = list(base_candidates) + sorted(external_candidates.values(), key=lambda row: row["sourceImage"])

    # Validate no source duplication and one thumbnail per approved event.
    seen_sources: set[str] = set()
    thumbnails: dict[str, str] = {}
    gallery_orders: set[tuple[str, int]] = set()
    for mapping in combined_mappings:
        source = str(mapping.get("sourceImage") or "")
        if source in seen_sources: errors.append(f"duplicate combined sourceImage: {source}")
        seen_sources.add(source)
        for target in mapping.get("targets") or []:
            event_id = str(target.get("eventId") or "")
            if target.get("isThumbnail") is True:
                if event_id in thumbnails: errors.append(f"{event_id}: duplicate thumbnail {thumbnails[event_id]} and {source}")
                thumbnails[event_id] = source
            else:
                order = int(target.get("sortOrder") or 0)
                key = (event_id, order)
                if order < 1: errors.append(f"{event_id}: non-thumbnail sortOrder must be >=1")
                if key in gallery_orders: errors.append(f"{event_id}: duplicate gallery sortOrder {order}")
                gallery_orders.add(key)

    report = {
        "approvedExternalEvents": len(approved_event_ids),
        "skippedMissingExternalEvents": len(skipped_missing),
        "hardBlockedExternalEvents": len(excluded_blocked),
        "hardBlockedEventIds": sorted(excluded_blocked),
        "duplicatePhysicalHashGroupsAllowed": len(duplicate_hash_groups(manifest)),
        "externalMappings": len(external_mappings),
        "externalUniqueAssets": len(external_candidates),
        "externalRelationships": sum(len(m.get("targets") or []) for m in external_mappings),
        "externalThumbnailRelationships": sum(
            1 for mapping in external_mappings for target in (mapping.get("targets") or [])
            if target.get("isThumbnail") is True
        ),
        "externalGalleryRelationships": sum(
            1 for mapping in external_mappings for target in (mapping.get("targets") or [])
            if target.get("isThumbnail") is False
        ),
        "historicallyVerifiedRelationships": sum(
            1 for mapping in external_mappings for target in (mapping.get("targets") or [])
            if target.get("historicalVerificationUrl")
        ),
        "combinedMappings": len(combined_mappings),
        "combinedCandidates": len(combined_candidates),
        "skippedMissingEventIds": sorted(skipped_missing),
        "errors": sorted(errors),
    }
    return (
        {"version": 1, "mappings": external_mappings, "rejected": []},
        {"version": 1, "mappings": combined_mappings, "rejected": combined_rejected},
        sorted(external_candidates.values(), key=lambda row: row["sourceImage"]),
        combined_candidates,
        report,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--decisions", required=True)
    parser.add_argument("--gates", default="")
    parser.add_argument("--base-reviewed-mappings", required=True)
    parser.add_argument("--base-candidates", required=True)
    parser.add_argument("--package-root", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    manifest = load_json(Path(args.manifest))
    decisions = normalize_decisions(load_json(Path(args.decisions)))
    gates = load_json(Path(args.gates)) if args.gates else {}
    base_mappings = load_json(Path(args.base_reviewed_mappings))
    base_candidates = load_jsonl(Path(args.base_candidates))
    out = Path(args.output_dir)
    repo_root = Path(__file__).resolve().parents[2]
    external, combined, external_candidates, combined_candidates, report = build_outputs(
        manifest, decisions, base_mappings, base_candidates, Path(args.package_root).resolve(), gates, repo_root
    )
    write_json(out / "approved_external_event_image_mappings.json", external)
    write_json(out / "approved_event_image_mappings_combined_preview.json", combined)
    write_jsonl(out / "external_event_image_candidates.jsonl", external_candidates)
    write_jsonl(out / "combined_image_candidates.jsonl", combined_candidates)
    write_json(out / "external_media_finalize_report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["errors"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
