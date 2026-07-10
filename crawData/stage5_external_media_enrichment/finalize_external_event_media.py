#!/usr/bin/env python3
"""Finalize approved external-event images and merge them with the re-reviewed mappings.

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
from collections import defaultdict
from pathlib import Path
from typing import Any
import urllib.parse


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


def normalize_decisions(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and "decisions" in value and isinstance(value["decisions"], dict):
        return value["decisions"]
    return value if isinstance(value, dict) else {}


def trusted_url(url: str, domains: list[str]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower().strip(".")
    except Exception:
        return False
    return any(host == domain.lower() or host.endswith("." + domain.lower()) for domain in domains)


def build_outputs(
    manifest: dict[str, Any], decisions: dict[str, Any], base_mappings: dict[str, Any], base_candidates: list[dict[str, Any]], package_root: Path
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    events = {row["eventId"]: row for row in manifest.get("events") or [] if row.get("eventId")}
    approved_event_ids: set[str] = set()
    grouped: dict[str, dict[str, Any]] = {}
    external_candidates: dict[str, dict[str, Any]] = {}
    errors: list[str] = []

    for event_id, event in events.items():
        decision = decisions.get(event_id) or {}
        if decision.get("status") != "approved":
            continue
        images = event.get("images") or []
        decision_images = decision.get("images") or []
        if len(images) != 2:
            errors.append(f"{event_id}: approved event must have exactly two downloaded images")
            continue
        if decision_images and (len(decision_images) != 2 or not all(bool(x.get("approved")) for x in decision_images if isinstance(x, dict))):
            errors.append(f"{event_id}: event approved but not both image slots are approved")
            continue
        approved_event_ids.add(event_id)
        for image_index, image in enumerate(images):
            decision_image = decision_images[image_index] if image_index < len(decision_images) and isinstance(decision_images[image_index], dict) else {}
            verification_url = str(
                decision_image.get("historicalVerificationUrl")
                or image.get("historicalVerificationUrl")
                or ""
            ).strip()
            trusted_domains = [str(x) for x in (image.get("preferredVerificationDomains") or []) if x]
            if not verification_url:
                errors.append(f"{event_id}: slot {image_index + 1} missing historical verification URL")
                continue
            if trusted_domains and not trusted_url(verification_url, trusted_domains):
                errors.append(
                    f"{event_id}: slot {image_index + 1} verification URL is outside trusted domains: {verification_url}"
                )
                continue
            relation_type = str(decision_image.get("relationType") or image.get("relationType") or "strong_contextual")
            if relation_type not in {"direct", "strong_contextual"}:
                errors.append(f"{event_id}: slot {image_index + 1} invalid relationType {relation_type!r}")
                continue
            digest = str(image.get("sha256") or "")
            canonical_asset = str(image.get("canonicalAsset") or "")
            if not digest or not canonical_asset:
                errors.append(f"{event_id}: image missing sha256/canonicalAsset")
                continue
            source_path = (package_root.parent / canonical_asset).resolve()
            if not source_path.is_file():
                errors.append(f"{event_id}: canonical asset missing: {canonical_asset}")
                continue
            repo_source = f"crawData/stage5_media_enrich/external_event_images/assets/{source_path.name}"
            candidate = external_candidates.get(repo_source)
            if candidate is None:
                candidate = {
                    "sourceImage": repo_source,
                    "lessonId": "external-web",
                    "imageId": f"external:{digest[:16]}",
                    "caption": str(image.get("fileTitle") or event.get("title") or ""),
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
                        "downloadUrl": image.get("downloadUrl"),
                        "license": image.get("license"),
                        "licenseUrl": image.get("licenseUrl"),
                        "artist": image.get("artist"),
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
                    "altText": str(image.get("fileTitle") or event.get("title") or ""),
                    "status": "approved",
                    "sourceType": "external-web",
                    "sourceMetadata": candidate["sourceMetadata"],
                    "targets": [],
                }
                grouped[repo_source] = mapping
            mapping["targets"].append(
                {
                    "eventId": event_id,
                    "isThumbnail": bool(image.get("isThumbnail")),
                    "sortOrder": int(image.get("sortOrder") or (1 if image.get("isThumbnail") else 2)),
                    "reviewNote": (
                        f"[web_{relation_type}/manual-approved] "
                        + (str(decision_image.get("note") or "").strip() or str(event.get("title") or event_id))
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
        "externalMappings": len(external_mappings),
        "externalUniqueAssets": len(external_candidates),
        "externalRelationships": sum(len(m.get("targets") or []) for m in external_mappings),
        "historicallyVerifiedRelationships": sum(
            1 for mapping in external_mappings for target in (mapping.get("targets") or [])
            if target.get("historicalVerificationUrl")
        ),
        "combinedMappings": len(combined_mappings),
        "combinedCandidates": len(combined_candidates),
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
    parser.add_argument("--base-reviewed-mappings", required=True)
    parser.add_argument("--base-candidates", required=True)
    parser.add_argument("--package-root", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    manifest = load_json(Path(args.manifest))
    decisions = normalize_decisions(load_json(Path(args.decisions)))
    base_mappings = load_json(Path(args.base_reviewed_mappings))
    base_candidates = load_jsonl(Path(args.base_candidates))
    out = Path(args.output_dir)
    external, combined, external_candidates, combined_candidates, report = build_outputs(
        manifest, decisions, base_mappings, base_candidates, Path(args.package_root).resolve()
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
