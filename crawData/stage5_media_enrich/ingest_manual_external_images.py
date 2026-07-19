#!/usr/bin/env python3
"""Ingest manually downloaded external Stage5 images.

The script scans local event folders only. It never downloads remote assets and
never approves an image automatically. It computes hashes, copies verified files
into the content-addressed local assets directory, and writes a manifest for the
existing review/finalize tools.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import shutil
import urllib.parse
from pathlib import Path
from typing import Any


ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_MIME_PREFIX = "image/"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_plan_events(plan_path: Path) -> list[dict[str, Any]]:
    plan = load_json(plan_path)
    events = list(plan.get("events") or [])
    for index, event in enumerate(events, start=1):
        event["_eventIndex"] = index
    return events


def selected_events(events: list[dict[str, Any]], event_ids: list[str], start_index: int, limit: int | None) -> list[dict[str, Any]]:
    if event_ids:
        wanted = set(event_ids)
        return [event for event in events if event.get("eventId") in wanted]
    start = max(0, start_index)
    end = None if limit is None else start + limit
    return events[start:end]


def event_dir_for(media_root: Path, event_id: str) -> Path:
    path = (media_root / "by_event" / event_id).resolve()
    root = (media_root / "by_event").resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Refusing path outside by_event root: {path}") from exc
    return path


def detect_slot_files(event_dir: Path, slot: int) -> list[Path]:
    stem = f"image_{slot:02d}"
    rows: list[Path] = []
    for path in event_dir.glob(stem + ".*"):
        if path.is_file() and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS:
            rows.append(path)
    return sorted(rows, key=lambda p: p.name)


def all_image_files(event_dir: Path) -> list[Path]:
    rows: list[Path] = []
    for path in event_dir.iterdir() if event_dir.exists() else []:
        if path.is_file() and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS:
            rows.append(path)
    return sorted(rows, key=lambda p: (p.stat().st_mtime, p.name.lower()))


def slot_files_with_original_name_fallback(event_dir: Path) -> tuple[dict[int, list[Path]], list[str]]:
    """Return slot files.

    Preferred naming remains image_01.* / image_02.*. If no preferred names are
    present, two arbitrary local image files are assigned by stable file order so
    reviewers can keep downloaded filenames. Ambiguous extra files are reported.
    """
    preferred = {1: detect_slot_files(event_dir, 1), 2: detect_slot_files(event_dir, 2)}
    if preferred[1] or preferred[2]:
        extras = []
        preferred_paths = {path.resolve() for paths in preferred.values() for path in paths}
        for path in all_image_files(event_dir):
            if path.resolve() not in preferred_paths:
                extras.append(str(path))
        return preferred, extras
    images = all_image_files(event_dir)
    assigned = {1: images[:1], 2: images[1:2]}
    extras = [str(path) for path in images[2:]]
    return assigned, extras


def caption_from_filename(path: Path) -> str:
    stem = urllib.parse.unquote(path.stem)
    stem = re.sub(r"^\d+px[-_ ]+", "", stem, flags=re.I)
    stem = re.sub(r"^File[-_: ]+", "", stem, flags=re.I)
    stem = re.sub(r"\([^)]*(?:jpg|jpeg|png|webp|svg|commons|wikipedia)[^)]*\)", "", stem, flags=re.I)
    stem = stem.replace("_", " ").replace("-", " ")
    stem = re.sub(r"\b(?:jpg|jpeg|png|webp|svg)\b", "", stem, flags=re.I)
    stem = re.sub(r"\s+", " ", stem).strip(" ._-")
    if not stem:
        return path.stem
    return stem[:1].upper() + stem[1:]


def image_mime(path: Path) -> str:
    guess = mimetypes.guess_type(path.name)[0] or ""
    return guess


def copy_canonical(source: Path, assets_dir: Path, digest: str) -> Path:
    ext = source.suffix.lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    target = assets_dir / f"{digest}.{ext}"
    if target.exists():
        if sha256_file(target) != digest:
            raise ValueError(f"Hash collision or corrupted canonical asset: {target}")
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if sha256_file(target) != digest:
        raise ValueError(f"Copied asset hash mismatch: {target}")
    return target


def queue_rows(queue_path: Path) -> dict[tuple[str, int], dict[str, Any]]:
    if not queue_path.exists():
        return {}
    value = load_json(queue_path)
    rows = value.get("rows") if isinstance(value, dict) else []
    return {(str(row.get("eventId")), int(row.get("slot"))): row for row in rows if row.get("eventId") and row.get("slot")}


def build_manifest(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    events = selected_events(load_plan_events(args.plan), args.event_id, args.start_index, args.limit)
    queue = queue_rows(args.queue)
    assets_dir = args.media_root / "assets"
    manifest_events: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    unexpected: list[str] = []
    duplicate_hashes: dict[str, list[str]] = {}
    hash_to_paths: dict[str, list[str]] = {}

    for event in events:
        event_id = str(event["eventId"])
        event_dir = event_dir_for(args.media_root, event_id)
        event_images: list[dict[str, Any]] = []
        expected_names: set[str] = set()
        slot_files, extra_files = slot_files_with_original_name_fallback(event_dir)
        unexpected.extend(extra_files)
        for slot in (1, 2):
            files = slot_files.get(slot, [])
            if not files:
                missing.append({"eventId": event_id, "slot": slot, "expected": f"image_{slot:02d}.<jpg|png|webp>"})
                continue
            if len(files) > 1:
                unexpected.extend(str(path) for path in files[1:])
            source = files[0]
            expected_names.add(source.name)
            mime = image_mime(source)
            if mime and not mime.startswith(ALLOWED_MIME_PREFIX):
                unexpected.append(str(source))
                continue
            digest = sha256_file(source)
            canonical = copy_canonical(source, assets_dir, digest)
            hash_to_paths.setdefault(digest, []).append(str(source))
            meta = queue.get((event_id, slot), {})
            event_images.append({
                "slot": slot,
                "role": "thumbnail" if slot == 1 else "gallery",
                "isThumbnail": slot == 1,
                "sortOrder": 1 if slot == 1 else 2,
                "localPath": str(source),
                "sourceImage": str(source),
                "canonicalAsset": str(canonical),
                "sha256": digest,
                "extension": canonical.suffix.lower().lstrip("."),
                "mimeType": mime,
                "fileTitle": caption_from_filename(source) or meta.get("imageTitle") or source.name,
                "originalFileName": source.name,
                "sourcePageUrl": meta.get("assetPageUrl") or "",
                "downloadUrl": meta.get("assetFileUrl") or "",
                "previewUrl": meta.get("previewUrl") or "",
                "license": meta.get("license") or "",
                "licenseUrl": meta.get("licenseUrl") or "",
                "author": meta.get("author") or "",
                "requiredAttribution": meta.get("requiredAttribution") or "",
                "historicalVerificationUrl": meta.get("historicalVerificationUrl") or "",
                "relationType": meta.get("relationType") or "strong_contextual",
                "reviewStatus": "pending",
            })
        for path in sorted(event_dir.glob("image_*.*")):
            if path.is_file() and path.name not in expected_names and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS:
                unexpected.append(str(path))
        manifest_events.append({
            "eventId": event_id,
            "title": event.get("title"),
            "displayDate": event.get("displayDate"),
            "requiredImages": 2,
            "images": sorted(event_images, key=lambda row: int(row["slot"])),
        })
    for digest, paths in hash_to_paths.items():
        if len(paths) > 1:
            duplicate_hashes[digest] = paths
    manifest = {
        "version": 1,
        "source": "manual_external_image_ingest",
        "events": manifest_events,
    }
    report = {
        "version": 1,
        "eventCount": len(events),
        "eventsWithTwoImages": sum(1 for event in manifest_events if len(event["images"]) == 2),
        "imageCount": sum(len(event["images"]) for event in manifest_events),
        "missing": missing,
        "unexpected": sorted(unexpected),
        "duplicatePhysicalHashes": duplicate_hashes,
        "automaticApprovals": 0,
    }
    return manifest, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=Path("crawData/stage5_media_enrich/output/event_source_plan.json"))
    parser.add_argument("--media-root", type=Path, default=Path("crawData/stage5_media_enrich/external_event_images"))
    parser.add_argument("--queue", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.json"))
    parser.add_argument("--manifest", type=Path, default=Path("crawData/stage5_media_enrich/external_event_images/external_event_image_manifest.json"))
    parser.add_argument("--report", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_image_ingest_report.json"))
    parser.add_argument("--event-id", action="append", default=[])
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", action="store_true", help="Accepted for runbook compatibility; scanning is idempotent.")
    args = parser.parse_args()
    manifest, report = build_manifest(args)
    write_json(args.manifest, manifest)
    write_json(args.report, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not report["unexpected"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
