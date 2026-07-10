#!/usr/bin/env python3
"""Publish approved Stage 5 media and write enriched event JSONL.

This command is intentionally narrow: it consumes the human-approved mapping
config, candidate metadata, and Stage 4B core events, then emits one Stage5-owned
enriched JSONL file plus content-addressed public image assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SUPPORTED_VERSION = 1
MEDIA_URL_PREFIX = "/media/event-images"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


@dataclass(frozen=True)
class PublishedRelationship:
    source_image: str
    source_hash: str
    extension: str
    public_file: str
    browser_url: str
    target_event: str
    media_ownership: str
    sort_order: int
    effective_caption: str


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def repo_relative(path: Path, repo_root: Path) -> str:
    return slash(path.resolve().relative_to(repo_root.resolve()))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
                raise SystemExit(f"Expected object JSONL record at {path}:{line_no}")
            rows.append(value)
    return rows


def is_repo_relative_path(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    path = Path(value)
    if path.is_absolute():
        return False
    if value.startswith("/") or value.startswith("\\"):
        return False
    if len(value) >= 3 and value[1] == ":" and value[2] in ("/", "\\"):
        return False
    return ".." not in Path(value).parts


def resolved_repo_path(value: str, repo_root: Path) -> Path:
    if not is_repo_relative_path(value):
        raise ValueError(f"path must be repository-relative without traversal: {value!r}")
    path = (repo_root / value).resolve()
    try:
        path.relative_to(repo_root.resolve())
    except ValueError as exc:
        raise ValueError(f"path escapes repository root: {value!r}") from exc
    return path


def build_index(rows: list[dict[str, Any]], key: str, label: str) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    duplicates: list[str] = []
    for row in rows:
        value = row.get(key)
        if value is None:
            continue
        text = str(value)
        if text in index:
            duplicates.append(text)
            continue
        index[text] = row
    if duplicates:
        raise ValueError(f"Duplicate {label}: {', '.join(sorted(duplicates))}")
    return index


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(description="Publish approved Stage 5 media.")
    parser.add_argument(
        "--core-events",
        default=str(repo_root / "crawData" / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"),
    )
    parser.add_argument(
        "--approved-mappings",
        default=str(script_path.parent / "config" / "approved_event_image_mappings.json"),
    )
    parser.add_argument(
        "--candidates",
        default=str(script_path.parent / "output" / "image_event_candidates.jsonl"),
    )
    parser.add_argument(
        "--output-events",
        default=str(script_path.parent / "output" / "enriched_core_events.jsonl"),
    )
    parser.add_argument(
        "--public-media-dir",
        default=str(repo_root / "frontend" / "public" / "media" / "event-images"),
    )
    parser.add_argument(
        "--summary",
        default=str(script_path.parent / "output" / "published_media_summary.json"),
    )
    return parser.parse_args()


def normalize_extension(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("candidate extension must be a non-empty string")
    ext = value.strip().lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if "/" in ext or "\\" in ext or ".." in ext:
        raise ValueError(f"invalid extension: {value!r}")
    return ext


def validate_and_plan(
    approved: dict[str, Any],
    candidates_by_source: dict[str, dict[str, Any]],
    events_by_id: dict[str, dict[str, Any]],
    repo_root: Path,
    public_media_dir: Path,
) -> list[PublishedRelationship]:
    if approved.get("version") != SUPPORTED_VERSION:
        raise ValueError(f"Unsupported approved mapping version: {approved.get('version')!r}")
    mappings = approved.get("mappings")
    if not isinstance(mappings, list):
        raise ValueError("approved mappings must contain mappings[]")

    relationships: list[PublishedRelationship] = []
    seen_images: set[str] = set()
    seen_relationships: set[tuple[str, str]] = set()
    thumbnail_by_event: dict[str, str] = {}
    sort_order_by_event: dict[tuple[str, int], str] = {}

    for index, mapping in enumerate(mappings, start=1):
        if not isinstance(mapping, dict):
            raise ValueError(f"mapping #{index} must be an object")
        if mapping.get("status") != "approved":
            continue

        source_image = mapping.get("sourceImage")
        if not isinstance(source_image, str) or not source_image.strip():
            raise ValueError(f"mapping #{index} sourceImage must be a non-empty string")
        if source_image in seen_images:
            raise ValueError(f"duplicate approved image entry: {source_image}")
        seen_images.add(source_image)

        source_path = resolved_repo_path(source_image, repo_root)
        if not source_path.is_file():
            raise ValueError(f"source image file does not exist: {source_image}")

        candidate = candidates_by_source.get(source_image)
        if candidate is None:
            raise ValueError(f"source image not found in candidate artifact: {source_image}")

        lesson_id = str(mapping.get("lessonId") or "")
        if lesson_id != str(candidate.get("lessonId") or ""):
            raise ValueError(
                f"{source_image}: lessonId {lesson_id!r} does not match candidate {candidate.get('lessonId')!r}"
            )

        source_hash = sha256_file(source_path)
        candidate_hash = str(candidate.get("contentHash") or "")
        if source_hash != candidate_hash:
            raise ValueError(f"{source_image}: source hash mismatch: {source_hash} != {candidate_hash}")

        extension = normalize_extension(candidate.get("extension") or source_path.suffix)
        if extension != source_path.suffix.lower():
            raise ValueError(f"{source_image}: candidate extension {extension!r} does not match source suffix")

        public_file_path = public_media_dir / f"{source_hash}{extension}"
        public_file = repo_relative(public_file_path, repo_root)
        browser_url = f"{MEDIA_URL_PREFIX}/{source_hash}{extension}"
        effective_caption = str(mapping.get("captionOverride") or candidate.get("caption") or "")

        targets = mapping.get("targets")
        if not isinstance(targets, list) or not targets:
            raise ValueError(f"{source_image}: approved mapping must have targets[]")
        for target in targets:
            if not isinstance(target, dict):
                raise ValueError(f"{source_image}: target must be an object")
            event_id = str(target.get("eventId") or "")
            if event_id not in events_by_id:
                raise ValueError(f"{source_image}: target event does not exist: {event_id}")
            if (source_image, event_id) in seen_relationships:
                raise ValueError(f"{source_image}: duplicate relationship for target {event_id}")
            seen_relationships.add((source_image, event_id))

            is_thumbnail = target.get("isThumbnail")
            if not isinstance(is_thumbnail, bool):
                raise ValueError(f"{source_image}: target {event_id} isThumbnail must be boolean")
            sort_order = target.get("sortOrder")
            if not isinstance(sort_order, int) or isinstance(sort_order, bool) or sort_order <= 0:
                raise ValueError(f"{source_image}: target {event_id} sortOrder must be a positive integer")
            sort_key = (event_id, int(sort_order))
            previous_sort = sort_order_by_event.get(sort_key)
            if previous_sort is not None:
                raise ValueError(f"{event_id}: duplicate sortOrder {sort_order}: {previous_sort}, {source_image}")
            sort_order_by_event[sort_key] = source_image

            if is_thumbnail:
                previous = thumbnail_by_event.get(event_id)
                if previous is not None:
                    raise ValueError(f"{event_id}: more than one approved thumbnail: {previous}, {source_image}")
                thumbnail_by_event[event_id] = source_image

            relationships.append(
                PublishedRelationship(
                    source_image=source_image,
                    source_hash=source_hash,
                    extension=extension,
                    public_file=public_file,
                    browser_url=browser_url,
                    target_event=event_id,
                    media_ownership="thumbnail" if is_thumbnail else "item",
                    sort_order=int(sort_order),
                    effective_caption=effective_caption,
                )
            )

    relationships.sort(key=lambda item: (item.target_event, item.source_image))
    return relationships


def publish_assets(relationships: list[PublishedRelationship], repo_root: Path) -> None:
    for relationship in relationships:
        source_path = resolved_repo_path(relationship.source_image, repo_root)
        destination = (repo_root / relationship.public_file).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            existing_hash = sha256_file(destination)
            if existing_hash != relationship.source_hash:
                raise ValueError(
                    f"hash collision or stale public asset at {repo_relative(destination, repo_root)}: "
                    f"{existing_hash} != {relationship.source_hash}"
                )
            continue
        shutil.copyfile(source_path, destination)
        copied_hash = sha256_file(destination)
        if copied_hash != relationship.source_hash:
            raise ValueError(f"published asset hash mismatch: {repo_relative(destination, repo_root)}")


def enrich_events(
    events: list[dict[str, Any]],
    relationships: list[PublishedRelationship],
) -> tuple[list[dict[str, Any]], list[str]]:
    by_target: dict[str, list[PublishedRelationship]] = {}
    for relationship in relationships:
        by_target.setdefault(relationship.target_event, []).append(relationship)
    changed: list[str] = []

    for event in events:
        event_id = str(event.get("id") or "")
        target_relationships = by_target.get(event_id)
        if not target_relationships:
            continue

        media = event.get("media")
        if media is None:
            media = {}
            event["media"] = media
        if not isinstance(media, dict):
            raise ValueError(f"{event_id}: media must be an object")

        current_thumbnail = media.get("thumbnail")
        items = media.get("items")
        if items is None:
            items = []
        if not isinstance(items, list):
            raise ValueError(f"{event_id}: media.items must be a list")
        existing_urls = {
            str(item.get("url"))
            for item in items
            if isinstance(item, dict) and item.get("url")
        }

        thumbnail_relationships = [r for r in target_relationships if r.media_ownership == "thumbnail"]
        if len(thumbnail_relationships) > 1:
            raise ValueError(f"{event_id}: more than one planned thumbnail")
        if thumbnail_relationships:
            relationship = thumbnail_relationships[0]
            if isinstance(current_thumbnail, str) and current_thumbnail.strip() and current_thumbnail != relationship.browser_url:
                raise ValueError(f"{event_id}: conflicting existing thumbnail {current_thumbnail!r}")
            if relationship.browser_url in existing_urls:
                raise ValueError(f"{event_id}: thumbnail URL already appears in media.items[]")
            media["thumbnail"] = relationship.browser_url

        gallery_relationships = sorted(
            (r for r in target_relationships if r.media_ownership != "thumbnail"),
            key=lambda r: (r.sort_order, r.source_image),
        )
        for relationship in gallery_relationships:
            if media.get("thumbnail") == relationship.browser_url:
                raise ValueError(f"{event_id}: gallery URL duplicates thumbnail")
            if relationship.browser_url in existing_urls:
                raise ValueError(f"{event_id}: duplicate gallery URL {relationship.browser_url}")
            items.append(
                {
                    "type": "image",
                    "url": relationship.browser_url,
                    "caption": relationship.effective_caption,
                    "sortOrder": relationship.sort_order,
                }
            )
            existing_urls.add(relationship.browser_url)

        items.sort(key=lambda item: (
            int(item.get("sortOrder") or 10**9) if isinstance(item, dict) else 10**9,
            str(item.get("url") or "") if isinstance(item, dict) else "",
        ))
        media["items"] = items
        changed.append(event_id)

    missing = sorted(set(by_target) - set(changed))
    if missing:
        raise ValueError(f"approved target events were not enriched: {', '.join(missing)}")
    return events, changed


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    completed = False
    try:
        with tmp.open("w", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False, sort_keys=False, separators=(",", ":")))
                handle.write("\n")
        os.replace(tmp, path)
        completed = True
    finally:
        if not completed and tmp.exists():
            tmp.unlink()


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    completed = False
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        os.replace(tmp, path)
        completed = True
    finally:
        if not completed and tmp.exists():
            tmp.unlink()


def build_summary(
    relationships: list[PublishedRelationship],
    changed_events: list[str],
    output_events: Path,
    repo_root: Path,
) -> dict[str, Any]:
    return {
        "version": 1,
        "outputEvents": repo_relative(output_events, repo_root),
        "approvedImages": len({item.source_image for item in relationships}),
        "relationships": len(relationships),
        "targetEvents": len({item.target_event for item in relationships}),
        "thumbnailRelationships": sum(1 for item in relationships if item.media_ownership == "thumbnail"),
        "changedEvents": sorted(changed_events),
        "entries": [
            {
                "sourceImage": item.source_image,
                "sourceHash": item.source_hash,
                "publishedFile": item.public_file,
                "browserUrl": item.browser_url,
                "targetEvent": item.target_event,
                "mediaOwnership": item.media_ownership,
                "sortOrder": item.sort_order,
                "caption": item.effective_caption,
            }
            for item in relationships
        ],
    }


def main() -> int:
    args = parse_args()
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2].resolve()

    core_events_path = Path(args.core_events).resolve()
    approved_path = Path(args.approved_mappings).resolve()
    candidates_path = Path(args.candidates).resolve()
    output_events_path = Path(args.output_events).resolve()
    public_media_dir = Path(args.public_media_dir).resolve()
    summary_path = Path(args.summary).resolve()

    approved = load_json(approved_path)
    if not isinstance(approved, dict):
        raise SystemExit("approved mapping root must be an object")
    candidates = load_jsonl(candidates_path)
    events = load_jsonl(core_events_path)

    try:
        candidates_by_source = build_index(candidates, "sourceImage", "candidate source image")
        events_by_id = build_index(events, "id", "event id")
        relationships = validate_and_plan(approved, candidates_by_source, events_by_id, repo_root, public_media_dir)
        if not relationships:
            raise ValueError("no approved relationships to publish")
        publish_assets(relationships, repo_root)
        enriched_events, changed_events = enrich_events(events, relationships)
        summary = build_summary(relationships, changed_events, output_events_path, repo_root)
        write_jsonl_atomic(output_events_path, enriched_events)
        write_json_atomic(summary_path, summary)
    except Exception as exc:
        print(f"Stage5 media publish failed: {exc}", file=sys.stderr)
        return 1

    print(f"Published assets: {len({item.public_file for item in relationships})}")
    print(f"Enriched events: {len(changed_events)}")
    print(f"Wrote {repo_relative(output_events_path, repo_root)}")
    print(f"Wrote {repo_relative(summary_path, repo_root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
