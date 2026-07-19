#!/usr/bin/env python3
"""Validate human-approved Stage 5 image-event mappings."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


SUPPORTED_VERSION = 1

# These are mojibake fragments seen when Vietnamese UTF-8 is decoded through
# Latin-1 or Windows-1252-like paths one or more times. Keep this conservative:
# it targets known corruption families, not non-ASCII text in general.
MOJIBAKE_PATTERNS = (
    "\u00c3\u00ac",  # i with grave rendered as A-tilde + symbol
    "\u00c3\u00a0",
    "\u00c3\u00a1",
    "\u00c3\u00a2",
    "\u00c3\u00a3",
    "\u00c3\u00a8",
    "\u00c3\u00a9",
    "\u00c3\u00aa",
    "\u00c3\u00b2",
    "\u00c3\u00b3",
    "\u00c3\u00b4",
    "\u00c3\u00b9",
    "\u00c3\u00ba",
    "\u00c4\u0090",  # capital D with stroke rendered through mojibake
    "\u00c4\u0091",  # small d with stroke rendered through mojibake
    "\u00c4\u00a9",
    "\u00c6\u00a1",  # o horn rendered as AE + symbol
    "\u00c6\u00b0",  # u horn rendered as AE + degree
    "\u00e1\u00ba",  # Vietnamese combining families rendered as a-acute + symbol
    "\u00e1\u00bb",
    "\u00e2\u20ac",  # punctuation rendered as a-circumflex + euro...
    "\u00c3\u0192\u00c2",  # second-generation A-tilde/florin/A-circumflex
    "\u00c3\u0192\u00c6\u2019",  # third-generation A-tilde/florin/AE/florin
    "\u00c3\u201e\u00c2",
    "\u00c3\u201e\u00e2\u20ac",
    "\u00c3\u00a2\u00e2\u20ac",
    "\u00c3\u00a2\u00e2\u201a",
    "\u00c2\u0090",
    "\u00c2\u009d",
    "\u00c2\u00ac",
    "\u00c2\u00a7",
    "\u00c2\u00bb",
    "\u00c2\u00ab",
    "\u00c2\u00ba",
    "\u00c2\u00a1",
    "\u00c2\u00a0",
    "\u00ef\u00bf\u00bd",
    "\u00c3\u00af\u00c2\u00bf\u00c2\u00bd",
    "\ufffd",
)


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def repo_relative(path: Path, repo_root: Path) -> str:
    return slash(path.resolve().relative_to(repo_root.resolve()))


def text_preview(text: str, limit: int = 80) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 3]}..."


def has_likely_mojibake(text: str) -> bool:
    return any(pattern in text for pattern in MOJIBAKE_PATTERNS)


def validate_human_text(
    errors: list[str],
    source_image: str,
    field: str,
    value: Any,
    *,
    required: bool = False,
    context: str = "",
) -> str:
    label = f"{source_image}: {context}{field}" if context else f"{source_image}: {field}"
    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value
    else:
        errors.append(f"{label} must be a string")
        text = str(value)
    if required and not text.strip():
        errors.append(f"{label} must be non-empty")
    if text and has_likely_mojibake(text):
        errors.append(f"{label} contains likely mojibake: {text_preview(text)!r}")
    return text


def run_self_test_mojibake() -> int:
    bad_examples = [
        "H\u00c3\u0192\u00c2\u00acnh 1",
        "Ch\u00c3\u00a1\u00c2\u00bb\u00c2\u00a7 t\u00c3\u00a1\u00c2\u00bb\u00e2\u20ac\u00b9ch",
        "H\u00c3\u00a1\u00c2\u00bb\u00e2\u20ac\u0153 Ch\u00c3\u0192\u00c2\u00ad Minh",
        "\u00c3\u201e\u00e2\u20ac\u02dc\u00c3\u00a1\u00c2\u00bb\u00c2\u008dc",
        "Tuy\u00c3\u0192\u00c2\u00aan ng\u00c3\u0192\u00c2\u00b4n",
        "\u00c3\u201e\u00c2\u0090\u00c3\u00a1\u00c2\u00bb\u00e2\u201e\u00a2c l\u00c3\u00a1\u00c2\u00ba\u00c2\u00adp",
        "Qu\u00c3\u00a1\u00c2\u00ba\u00c2\u00a3ng tr\u00c3\u2020\u00c2\u00b0\u00c3\u00a1\u00c2\u00bb\u00c2\u009dng",
        "\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u0153",
        "\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d",
        "H\u00c3\u0192\u00c6\u2019\u00c3\u201a\u00c2\u00acnh",
        "Ch\u00c3\u0192\u00c2\u00a1\u00c3\u201a\u00c2\u00bb\u00c3\u201a\u00c2\u00a7",
        "\u00c3\u0192\u00e2\u20ac\u017e\u00c3\u00a2\u00e2\u201a\u00ac\u00cb\u0153",
        "\u00c3\u0192\u00c2\u00a2\u00c3\u00a2\u00e2\u20ac\u0161\u00c2\u00ac\u00c3\u00a2\u00e2\u201a\u00ac\u00c5\u201c",
        "\u00ef\u00bf\u00bd",
        "\ufffd",
        (
            "H\u00c3\u0192\u00c2\u00acnh 1. Ch\u00c3\u00a1\u00c2\u00bb\u00c2\u00a7 t\u00c3\u00a1\u00c2\u00bb\u00e2\u20ac\u00b9ch "
            "H\u00c3\u00a1\u00c2\u00bb\u00e2\u20ac\u0153 Ch\u00c3\u0192\u00c2\u00ad Minh \u00c3\u201e\u00e2\u20ac\u02dc\u00c3\u00a1\u00c2\u00bb\u00c2\u008dc "
            "Tuy\u00c3\u0192\u00c2\u00aan ng\u00c3\u0192\u00c2\u00b4n \u00c3\u201e\u00c2\u0090\u00c3\u00a1\u00c2\u00bb\u00e2\u201e\u00a2c "
            "l\u00c3\u00a1\u00c2\u00ba\u00c2\u00adp t\u00c3\u00a1\u00c2\u00ba\u00c2\u00a1i Qu\u00c3\u00a1\u00c2\u00ba\u00c2\u00a3ng "
            "tr\u00c3\u2020\u00c2\u00b0\u00c3\u00a1\u00c2\u00bb\u00c2\u009dng Ba \u00c3\u201e\u00c2\u0090\u00c3\u0192\u00c2\u00acnh"
        ),
    ]
    good_examples = [
        "H\u00ecnh 1. Ch\u1ee7 t\u1ecbch H\u1ed3 Ch\u00ed Minh \u0111\u1ecdc Tuy\u00ean ng\u00f4n \u0110\u1ed9c l\u1eadp t\u1ea1i Qu\u1ea3ng tr\u01b0\u1eddng Ba \u0110\u00ecnh",
        "H\u00ecnh 2. Di t\u00edch \u0110\u00ecnh T\u00e2n Tr\u00e0o \u2013 n\u01a1i di\u1ec5n ra \u0110\u1ea1i h\u1ed9i Qu\u1ed1c d\u00e2n (1945)",
        "H\u00ecnh 3. Nh\u00e2n d\u00e2n H\u00e0 N\u1ed9i chi\u1ebfm Ph\u1ee7 Kh\u00e2m sai (19-8-1945)",
        "H\u00ecnh 4. Nh\u00e2n d\u00e2n S\u00e0i G\u00f2n m\u00edt tinh m\u1eebng kh\u1edfi ngh\u0129a gi\u00e0nh th\u1eafng l\u1ee3i (25 \u2013 8 \u2013 1945)",
        "\u201cTuy\u00ean ng\u00f4n \u0110\u1ed9c l\u1eadp\u201d \u2014 H\u00e0 N\u1ed9i",
    ]
    failures: list[str] = []
    for example in bad_examples:
        if not has_likely_mojibake(example):
            failures.append(f"Did not reject mojibake example: {example!r}")
    for example in good_examples:
        if has_likely_mojibake(example):
            failures.append(f"Rejected valid UTF-8 example: {example!r}")
    if failures:
        print("Mojibake self-test failed")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Mojibake self-test passed")
    return 0


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
    records: list[dict[str, Any]] = []
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
            records.append(value)
    return records


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
    parts = Path(value).parts
    return ".." not in parts


def build_candidate_index(records: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    by_source: dict[str, dict[str, Any]] = {}
    duplicate_sources: list[str] = []
    for record in records:
        source = record.get("sourceImage")
        if not source:
            continue
        if source in by_source:
            duplicate_sources.append(str(source))
            continue
        by_source[str(source)] = record
    return by_source, duplicate_sources


def build_event_index(core_events: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    by_id: dict[str, dict[str, Any]] = {}
    duplicate_ids: list[str] = []
    missing_ids = 0
    for event in core_events:
        event_id = event.get("id")
        if not event_id:
            missing_ids += 1
            continue
        if event_id in by_id:
            duplicate_ids.append(str(event_id))
            continue
        by_id[str(event_id)] = event
    issues = [f"duplicate core event id: {event_id}" for event_id in sorted(duplicate_ids)]
    if missing_ids:
        issues.append(f"core events missing id: {missing_ids}")
    return by_id, issues


def event_title(event: dict[str, Any] | None) -> str:
    if not event:
        return ""
    return str((event.get("titles") or {}).get("primary") or event.get("id") or "")


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(description="Validate Stage 5 approved image mappings.")
    parser.add_argument(
        "--approved-mappings",
        default=str(script_path.parent / "config" / "approved_event_image_mappings.json"),
    )
    parser.add_argument(
        "--candidates",
        default=str(script_path.parent / "output" / "image_event_candidates.jsonl"),
    )
    parser.add_argument(
        "--core-events",
        default=str(repo_root / "crawData" / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"),
    )
    parser.add_argument(
        "--self-test-mojibake",
        action="store_true",
        help="Run mojibake detector assertions without reading mapping files.",
    )
    return parser.parse_args()


def resolve_path(value: str, repo_root: Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else repo_root / path


def validate() -> int:
    args = parse_args()
    if args.self_test_mojibake:
        return run_self_test_mojibake()

    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    approved_path = resolve_path(args.approved_mappings, repo_root).resolve()
    candidates_path = resolve_path(args.candidates, repo_root).resolve()
    core_events_path = resolve_path(args.core_events, repo_root).resolve()

    errors: list[str] = []
    warnings: list[str] = []
    relationships: list[tuple[str, str, int, bool]] = []
    target_events: set[str] = set()
    thumbnails_by_event: dict[str, list[str]] = defaultdict(list)
    sort_orders_by_event: dict[tuple[str, int], list[str]] = defaultdict(list)
    approved_by_event: dict[str, list[str]] = defaultdict(list)
    effective_caption_by_source: dict[str, str] = {}
    seen_images: set[str] = set()
    seen_relationships: set[tuple[str, str]] = set()

    approved = load_json(approved_path)
    candidate_records = load_jsonl(candidates_path)
    core_events = load_jsonl(core_events_path)

    candidates_by_source, duplicate_candidate_sources = build_candidate_index(candidate_records)
    event_by_id, event_index_issues = build_event_index(core_events)
    for issue in duplicate_candidate_sources:
        errors.append(f"Candidate source image appears more than once: {issue}")
    errors.extend(event_index_issues)

    if not isinstance(approved, dict):
        errors.append("Approved mapping root must be an object")
        approved = {}

    version = approved.get("version")
    if version != SUPPORTED_VERSION:
        errors.append(f"Unsupported approved mapping version: {version!r}")

    mappings = approved.get("mappings")
    rejected = approved.get("rejected")
    if not isinstance(mappings, list):
        errors.append("Approved mapping field 'mappings' must be a list")
        mappings = []
    if not isinstance(rejected, list):
        errors.append("Approved mapping field 'rejected' must be a list")

    for index, mapping in enumerate(mappings, start=1):
        if not isinstance(mapping, dict):
            errors.append(f"Mapping #{index} must be an object")
            continue

        source_image = mapping.get("sourceImage")
        if not isinstance(source_image, str) or not source_image.strip():
            errors.append(f"Mapping #{index} sourceImage must be non-empty")
            continue
        if not is_repo_relative_path(source_image):
            errors.append(f"{source_image}: sourceImage must be repository-relative")
        else:
            source_path = repo_root / source_image
            if not source_path.exists() or not source_path.is_file():
                errors.append(f"{source_image}: source image file does not exist")

        if source_image in seen_images:
            errors.append(f"{source_image}: duplicate approved image entry")
        seen_images.add(source_image)

        candidate = candidates_by_source.get(source_image)
        if candidate is None:
            errors.append(f"{source_image}: source image not found in candidate artifact exactly once")
            candidate_events: set[str] = set()
        else:
            candidate_events = {str(event.get("eventId")) for event in candidate.get("candidateEvents", []) if event.get("eventId")}
            if candidate.get("mappingStatus") == "invalid":
                errors.append(f"{source_image}: candidate record is invalid")
            lesson_id = str(mapping.get("lessonId") or "")
            if lesson_id != str(candidate.get("lessonId") or ""):
                errors.append(f"{source_image}: lessonId {lesson_id!r} does not match candidate lessonId {candidate.get('lessonId')!r}")

        if "caption" in mapping:
            errors.append(
                f"{source_image}: stale caption field is not allowed; source captions live in candidate artifact. "
                "Use captionOverride only for intentional edits."
            )

        caption_override = ""
        if "captionOverride" in mapping:
            caption_override = validate_human_text(errors, source_image, "captionOverride", mapping.get("captionOverride"), required=True)

        candidate_caption = ""
        if candidate is not None:
            candidate_caption = str(candidate.get("caption") or "")
        effective_caption_by_source[source_image] = caption_override.strip() if caption_override.strip() else candidate_caption

        alt_text = validate_human_text(errors, source_image, "altText", mapping.get("altText"))
        if not alt_text.strip():
            warnings.append(f"{source_image}: altText is empty")

        targets = mapping.get("targets")
        if not isinstance(targets, list) or not targets:
            errors.append(f"{source_image}: targets must be a non-empty list")
            continue

        for target_index, target in enumerate(targets, start=1):
            if not isinstance(target, dict):
                errors.append(f"{source_image}: target #{target_index} must be an object")
                continue
            event_id = str(target.get("eventId") or "")
            if not event_id:
                errors.append(f"{source_image}: target #{target_index} eventId is empty")
                continue
            target_events.add(event_id)

            if event_id not in event_by_id:
                errors.append(f"{source_image}: target event does not exist in core_events.jsonl: {event_id}")

            override_reason = validate_human_text(
                errors,
                source_image,
                "overrideReason",
                target.get("overrideReason"),
                context=f"target {event_id} ",
            )
            if candidate is not None and event_id not in candidate_events and not override_reason.strip():
                errors.append(f"{source_image}: target event {event_id} is not in candidateEvents[] and no overrideReason was provided")

            relationship_key = (source_image, event_id)
            if relationship_key in seen_relationships:
                errors.append(f"{source_image}: duplicate approved relationship for event {event_id}")
            seen_relationships.add(relationship_key)

            is_thumbnail = target.get("isThumbnail")
            if not isinstance(is_thumbnail, bool):
                errors.append(f"{source_image}: target {event_id} isThumbnail must be boolean")
                is_thumbnail = False

            sort_order = target.get("sortOrder")
            if not isinstance(sort_order, int) or isinstance(sort_order, bool) or sort_order <= 0:
                errors.append(f"{source_image}: target {event_id} sortOrder must be a positive integer")
                sort_order = -1

            validate_human_text(
                errors,
                source_image,
                "reviewNote",
                target.get("reviewNote"),
                required=True,
                context=f"target {event_id} ",
            )

            relationships.append((source_image, event_id, int(sort_order), bool(is_thumbnail)))
            approved_by_event[event_id].append(source_image)
            if is_thumbnail:
                thumbnails_by_event[event_id].append(source_image)
            if sort_order != -1:
                sort_orders_by_event[(event_id, int(sort_order))].append(source_image)

    for event_id, images in sorted(thumbnails_by_event.items()):
        if len(images) > 1:
            errors.append(f"{event_id}: more than one approved thumbnail: {', '.join(sorted(images))}")

    for (event_id, sort_order), images in sorted(sort_orders_by_event.items()):
        if len(images) > 1:
            errors.append(f"{event_id}: duplicate sortOrder {sort_order}: {', '.join(sorted(images))}")

    print("Approved mapping validation")
    print(f"- approved image count: {len(mappings)}")
    print(f"- approved image-event relationship count: {len(relationships)}")
    print(f"- target event count: {len(target_events)}")
    print(f"- thumbnail count: {sum(1 for _, _, _, is_thumbnail in relationships if is_thumbnail)}")
    print(f"- warning count: {len(warnings)}")
    print(f"- error count: {len(errors)}")
    print("")
    print("Approved images by target event:")
    if approved_by_event:
        for event_id in sorted(approved_by_event):
            title = event_title(event_by_id.get(event_id))
            print(f"- {event_id} - {title}")
            for source_image in sorted(approved_by_event[event_id]):
                print(f"  - {source_image}")
                print(f"    caption: {effective_caption_by_source.get(source_image, '')}")
    else:
        print("- none")

    if warnings:
        print("")
        print("Warnings:")
        for warning in sorted(warnings):
            print(f"- {warning}")

    if errors:
        print("")
        print("Errors:")
        for error in sorted(errors):
            print(f"- {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(validate())
