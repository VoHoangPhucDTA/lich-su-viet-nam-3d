#!/usr/bin/env python3
"""Verify Stage5 approved media outputs without hardcoded slice counts.

Default checks are file-based and safe: approved config -> enriched JSONL ->
public assets. Optional DB/API snapshot files can be supplied later by an
integration phase; this script never opens DB or network connections.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


MEDIA_URL_PREFIX = "/media/event-images"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"Required JSON file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse JSON file {path}: {exc}") from exc


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"Required JSONL file not found: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"Could not parse JSONL {path}:{line_no}: {exc}") from exc
            if not isinstance(value, dict):
                raise SystemExit(f"Expected object at {path}:{line_no}")
            rows.append(value)
    return rows


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_relative(path: Path, repo_root: Path) -> str:
    return slash(path.resolve().relative_to(repo_root.resolve()))


def public_url_for_source(source_image: str, repo_root: Path) -> tuple[str, str, str]:
    source_path = (repo_root / source_image).resolve()
    if not source_path.is_file():
        raise ValueError(f"{source_image}: source image file does not exist")
    source_hash = sha256_file(source_path)
    ext = source_path.suffix.lower()
    if not ext:
        raise ValueError(f"{source_image}: source image has no extension")
    return source_hash, f"frontend/public/media/event-images/{source_hash}{ext}", f"{MEDIA_URL_PREFIX}/{source_hash}{ext}"


def approved_relationships(approved: dict[str, Any], repo_root: Path) -> list[dict[str, Any]]:
    mappings = approved.get("mappings")
    if not isinstance(mappings, list):
        raise ValueError("approved mapping config must contain mappings[]")
    relationships: list[dict[str, Any]] = []
    for mapping in mappings:
        if not isinstance(mapping, dict) or mapping.get("status") != "approved":
            continue
        source_image = str(mapping.get("sourceImage") or "")
        source_hash, public_file, browser_url = public_url_for_source(source_image, repo_root)
        targets = mapping.get("targets")
        if not isinstance(targets, list) or not targets:
            raise ValueError(f"{source_image}: approved mapping must have targets[]")
        for target in targets:
            if not isinstance(target, dict):
                raise ValueError(f"{source_image}: target must be an object")
            event_id = str(target.get("eventId") or "")
            relationships.append(
                {
                    "sourceImage": source_image,
                    "sourceHash": source_hash,
                    "publicFile": public_file,
                    "browserUrl": browser_url,
                    "targetEvent": event_id,
                    "isThumbnail": target.get("isThumbnail") is True,
                    "sortOrder": target.get("sortOrder"),
                }
            )
    relationships.sort(key=lambda item: (item["targetEvent"], item["sourceImage"], item["browserUrl"]))
    return relationships


def index_events(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    events: dict[str, dict[str, Any]] = {}
    for row in rows:
        event_id = row.get("id")
        if not event_id:
            continue
        text = str(event_id)
        if text in events:
            raise ValueError(f"duplicate event id: {text}")
        events[text] = row
    return events


def event_media_urls(event: dict[str, Any]) -> tuple[str, list[str]]:
    media = event.get("media") or {}
    if not isinstance(media, dict):
        return "", []
    thumbnail = media.get("thumbnail") if isinstance(media.get("thumbnail"), str) else ""
    item_urls = [
        str(item.get("url"))
        for item in media.get("items") or []
        if isinstance(item, dict) and item.get("url")
    ]
    return thumbnail, item_urls


def verify_files(
    *,
    relationships: list[dict[str, Any]],
    core_events: list[dict[str, Any]],
    enriched_events: list[dict[str, Any]],
    public_media_dir: Path,
    repo_root: Path,
) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    core_by_id = index_events(core_events)
    enriched_by_id = index_events(enriched_events)
    approved_targets = {item["targetEvent"] for item in relationships}

    if set(core_by_id) != set(enriched_by_id):
        errors.append("enriched event id set differs from core events")

    for relationship in relationships:
        event_id = relationship["targetEvent"]
        event = enriched_by_id.get(event_id)
        if event is None:
            errors.append(f"{event_id}: approved target missing from enriched output")
            continue
        thumbnail, item_urls = event_media_urls(event)
        if relationship["isThumbnail"]:
            if thumbnail != relationship["browserUrl"]:
                errors.append(f"{event_id}: thumbnail mismatch {thumbnail!r} != {relationship['browserUrl']!r}")
            if relationship["browserUrl"] in item_urls:
                errors.append(f"{event_id}: thumbnail URL duplicated in media.items[]")
        else:
            if relationship["browserUrl"] not in item_urls:
                errors.append(f"{event_id}: non-thumbnail URL missing from media.items[]")

        public_path = (repo_root / relationship["publicFile"]).resolve()
        if not public_path.is_file():
            errors.append(f"{relationship['publicFile']}: public asset missing")
        elif sha256_file(public_path) != relationship["sourceHash"]:
            errors.append(f"{relationship['publicFile']}: public asset hash mismatch")

    for event_id, enriched in enriched_by_id.items():
        if event_id in approved_targets:
            continue
        core = core_by_id.get(event_id)
        if core is None:
            continue
        core_media = core.get("media")
        enriched_media = enriched.get("media")
        if core_media != enriched_media:
            errors.append(f"{event_id}: non-target media changed")

    duplicate_relationships = len({(item["targetEvent"], item["browserUrl"], item["isThumbnail"]) for item in relationships})
    if duplicate_relationships != len(relationships):
        errors.append("duplicate approved media relationships detected")

    summary = {
        "approvedImages": len({item["sourceImage"] for item in relationships}),
        "relationships": len(relationships),
        "targetEvents": len({item["targetEvent"] for item in relationships}),
        "thumbnailRelationships": sum(1 for item in relationships if item["isThumbnail"]),
        "nonThumbnailRelationships": sum(1 for item in relationships if not item["isThumbnail"]),
        "publicAssets": len({item["publicFile"] for item in relationships}),
        "enrichedEvents": len(enriched_events),
        "coreEvents": len(core_events),
        "publicMediaDir": repo_relative(public_media_dir, repo_root),
    }
    return errors, summary


def verify_db_snapshot(relationships: list[dict[str, Any]], snapshot: Any) -> list[str]:
    errors: list[str] = []
    rows = snapshot.get("eventMedia") if isinstance(snapshot, dict) else snapshot
    if not isinstance(rows, list):
        return ["DB snapshot must be a list or an object with eventMedia[]"]
    for relationship in relationships:
        matches = [
            row for row in rows
            if isinstance(row, dict)
            and str(row.get("eventId") or row.get("event_id") or "") == relationship["targetEvent"]
            and str(row.get("url") or "") == relationship["browserUrl"]
            and bool(row.get("isThumbnail", row.get("is_thumbnail", False))) == relationship["isThumbnail"]
        ]
        if len(matches) != 1:
            errors.append(f"{relationship['targetEvent']}: expected exactly one DB media row for {relationship['browserUrl']}")
    return errors


def verify_api_snapshot(relationships: list[dict[str, Any]], snapshot: Any) -> list[str]:
    errors: list[str] = []
    rows = snapshot.get("events") if isinstance(snapshot, dict) else snapshot
    if not isinstance(rows, list):
        return ["API snapshot must be a list or an object with events[]"]
    by_id = {str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id")}
    for relationship in relationships:
        event = by_id.get(relationship["targetEvent"])
        if event is None:
            errors.append(f"{relationship['targetEvent']}: missing from API snapshot")
            continue
        media = event.get("media") or {}
        thumbnail = media.get("thumbnail") if isinstance(media, dict) else None
        if relationship["isThumbnail"] and thumbnail != relationship["browserUrl"]:
            errors.append(f"{relationship['targetEvent']}: API thumbnail mismatch")
    return errors


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(description="Verify Stage5 approved media pipeline outputs.")
    parser.add_argument("--repo-root", default=str(repo_root))
    parser.add_argument("--approved-mappings", default=str(script_path.parent / "config" / "approved_event_image_mappings.json"))
    parser.add_argument("--core-events", default=str(repo_root / "crawData" / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"))
    parser.add_argument("--enriched-events", default=str(script_path.parent / "output" / "enriched_core_events.jsonl"))
    parser.add_argument("--public-media-dir", default=str(repo_root / "frontend" / "public" / "media" / "event-images"))
    parser.add_argument("--db-media-json", default="", help="Optional exported DB media rows; no DB connection is opened.")
    parser.add_argument("--api-events-json", default="", help="Optional real API response snapshot; no network call is made.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    relationships = approved_relationships(load_json(Path(args.approved_mappings).resolve()), repo_root)
    errors, summary = verify_files(
        relationships=relationships,
        core_events=load_jsonl(Path(args.core_events).resolve()),
        enriched_events=load_jsonl(Path(args.enriched_events).resolve()),
        public_media_dir=Path(args.public_media_dir).resolve(),
        repo_root=repo_root,
    )
    if args.db_media_json:
        errors.extend(verify_db_snapshot(relationships, load_json(Path(args.db_media_json).resolve())))
    if args.api_events_json:
        errors.extend(verify_api_snapshot(relationships, load_json(Path(args.api_events_json).resolve())))
    report = {"summary": summary, "errors": sorted(errors)}
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
