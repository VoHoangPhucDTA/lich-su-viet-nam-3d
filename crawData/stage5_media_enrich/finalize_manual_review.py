#!/usr/bin/env python3
"""Finalize Stage5 manual review decisions into approved mapping config.

The command is dry-run by default. It reads manual decisions, candidates,
core events, and the existing approved mapping config, then validates and
previews the merged mapping. The real approved config is written only when
--apply is passed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from validate_approved_mappings import has_likely_mojibake, is_repo_relative_path


SUPPORTED_VERSION = 1
STATUS_APPROVED = "approved"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


@dataclass(frozen=True)
class MergeResult:
    merged: dict[str, Any]
    new_mappings: list[dict[str, Any]]
    warnings: list[str]
    errors: list[str]


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


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    completed = False
    try:
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        os.replace(tmp, path)
        completed = True
    finally:
        if not completed and tmp.exists():
            tmp.unlink()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_repo_path(value: str, repo_root: Path) -> Path:
    if not is_repo_relative_path(value):
        raise ValueError(f"path must be repository-relative without traversal: {value!r}")
    path = (repo_root / value).resolve()
    try:
        path.relative_to(repo_root.resolve())
    except ValueError as exc:
        raise ValueError(f"path escapes repository root: {value!r}") from exc
    return path


def index_by(rows: list[dict[str, Any]], key: str, label: str) -> tuple[dict[str, dict[str, Any]], list[str]]:
    result: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for row in rows:
        value = row.get(key)
        if not value:
            continue
        text = str(value)
        if text in result:
            errors.append(f"duplicate {label}: {text}")
            continue
        result[text] = row
    return result, errors


def candidate_event_ids(candidate: dict[str, Any]) -> set[str]:
    return {
        str(item.get("eventId"))
        for item in candidate.get("candidateEvents") or []
        if isinstance(item, dict) and item.get("eventId")
    }


def mapping_sort_key(mapping: dict[str, Any]) -> tuple[str, str]:
    targets = mapping.get("targets") or []
    first_event = ""
    if targets and isinstance(targets[0], dict):
        first_event = str(targets[0].get("eventId") or "")
    return (str(mapping.get("sourceImage") or ""), first_event)


def validate_text(errors: list[str], label: str, value: Any, *, required: bool = False) -> str:
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
        errors.append(f"{label} contains likely mojibake")
    return text


def validate_merged_mapping(
    *,
    mappings: list[dict[str, Any]],
    candidates_by_source: dict[str, dict[str, Any]],
    events_by_id: dict[str, dict[str, Any]],
    repo_root: Path,
) -> list[str]:
    errors: list[str] = []
    source_to_mapping: dict[str, dict[str, Any]] = {}
    hash_to_source: dict[str, str] = {}
    thumbnail_by_event: dict[str, str] = {}
    relationship_keys: set[tuple[str, str]] = set()

    for index, mapping in enumerate(mappings, start=1):
        if not isinstance(mapping, dict):
            errors.append(f"mapping #{index} must be an object")
            continue
        if "caption" in mapping:
            errors.append(f"mapping #{index}: caption field is not allowed; use captionOverride only")

        source_image = str(mapping.get("sourceImage") or "")
        if not source_image:
            errors.append(f"mapping #{index}: sourceImage must be non-empty")
            continue
        if source_image in source_to_mapping:
            errors.append(f"{source_image}: duplicate source-image mapping")
        source_to_mapping[source_image] = mapping

        try:
            source_path = resolve_repo_path(source_image, repo_root)
        except ValueError as exc:
            errors.append(str(exc))
            source_path = None
        if source_path is not None:
            if not source_path.is_file():
                errors.append(f"{source_image}: source image file does not exist")
            else:
                source_hash = sha256_file(source_path)
                previous_source = hash_to_source.get(source_hash)
                if previous_source and previous_source != source_image:
                    errors.append(
                        f"{source_image}: duplicate physical image hash already approved by {previous_source}"
                    )
                hash_to_source[source_hash] = source_image

        candidate = candidates_by_source.get(source_image)
        if candidate is None:
            errors.append(f"{source_image}: source image not found in candidates")
            valid_candidate_targets: set[str] = set()
        else:
            valid_candidate_targets = candidate_event_ids(candidate)
            expected_hash = str(candidate.get("contentHash") or "")
            if source_path is not None and source_path.is_file() and expected_hash:
                actual_hash = sha256_file(source_path)
                if actual_hash != expected_hash:
                    errors.append(f"{source_image}: candidate contentHash mismatch")

        lesson_id = str(mapping.get("lessonId") or "")
        if candidate is not None and lesson_id != str(candidate.get("lessonId") or ""):
            errors.append(f"{source_image}: lessonId does not match candidate")

        validate_text(errors, f"{source_image}: altText", mapping.get("altText"))
        if "captionOverride" in mapping:
            validate_text(errors, f"{source_image}: captionOverride", mapping.get("captionOverride"), required=True)

        targets = mapping.get("targets")
        if not isinstance(targets, list) or not targets:
            errors.append(f"{source_image}: targets must be a non-empty list")
            continue

        for target in targets:
            if not isinstance(target, dict):
                errors.append(f"{source_image}: target must be an object")
                continue
            event_id = str(target.get("eventId") or "")
            if event_id not in events_by_id:
                errors.append(f"{source_image}: target event does not exist: {event_id}")
            override_reason = validate_text(errors, f"{source_image}: target {event_id} overrideReason", target.get("overrideReason"))
            if candidate is not None and event_id not in valid_candidate_targets and not override_reason.strip():
                errors.append(f"{source_image}: target {event_id} is not an original candidate and lacks overrideReason")
            if (source_image, event_id) in relationship_keys:
                errors.append(f"{source_image}: duplicate relationship for {event_id}")
            relationship_keys.add((source_image, event_id))
            validate_text(errors, f"{source_image}: target {event_id} reviewNote", target.get("reviewNote"), required=True)
            if target.get("isThumbnail") is True:
                previous = thumbnail_by_event.get(event_id)
                if previous and previous != source_image:
                    errors.append(f"{event_id}: thumbnail conflict between {previous} and {source_image}")
                thumbnail_by_event[event_id] = source_image

    return errors


def build_new_mapping(decision: dict[str, Any], candidate: dict[str, Any], events_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    event_id = str(decision.get("eventId") or "")
    if event_id not in events_by_id:
        raise ValueError(f"{decision.get('imageId')}: target event does not exist: {event_id}")
    target: dict[str, Any] = {
        "eventId": event_id,
        "isThumbnail": True,
        "sortOrder": 1,
        "reviewNote": str(decision.get("note") or "")
        or f"Manual review approved {decision.get('imageId')} for {event_id}.",
    }
    if event_id not in candidate_event_ids(candidate):
        target["overrideReason"] = "Manual review selected this event outside the generated candidate set."
    return {
        "sourceImage": slash(candidate.get("sourceImage") or decision.get("sourceImage") or ""),
        "lessonId": str(candidate.get("lessonId") or decision.get("lessonId") or ""),
        "altText": str(candidate.get("alt") or ""),
        "status": STATUS_APPROVED,
        "targets": [target],
    }


def finalize(
    *,
    decisions: dict[str, Any],
    approved: dict[str, Any],
    candidates: list[dict[str, Any]],
    core_events: list[dict[str, Any]],
    repo_root: Path,
) -> MergeResult:
    warnings: list[str] = []
    errors: list[str] = []

    if approved.get("version") != SUPPORTED_VERSION:
        errors.append(f"unsupported approved mapping version: {approved.get('version')!r}")
    if decisions.get("version", SUPPORTED_VERSION) != SUPPORTED_VERSION:
        errors.append(f"unsupported decisions version: {decisions.get('version')!r}")

    candidates_by_id, candidate_id_errors = index_by(candidates, "imageId", "candidate imageId")
    candidates_by_source, candidate_source_errors = index_by(candidates, "sourceImage", "candidate sourceImage")
    events_by_id, event_errors = index_by(core_events, "id", "core event id")
    errors.extend(candidate_id_errors)
    errors.extend(candidate_source_errors)
    errors.extend(event_errors)

    existing_mappings = approved.get("mappings")
    if not isinstance(existing_mappings, list):
        errors.append("approved mappings must contain mappings[]")
        existing_mappings = []

    new_mappings: list[dict[str, Any]] = []
    decision_items = decisions.get("decisions")
    if not isinstance(decision_items, dict):
        errors.append("decisions file must contain decisions{}")
        decision_items = {}

    for image_id, decision in sorted(decision_items.items()):
        if not isinstance(decision, dict):
            errors.append(f"{image_id}: decision must be an object")
            continue
        if decision.get("status") != STATUS_APPROVED:
            continue
        note = validate_text(errors, f"{image_id}: note", decision.get("note"))
        if not note.strip():
            warnings.append(f"{image_id}: approved decision has empty note")
        candidate = candidates_by_id.get(str(image_id))
        if candidate is None:
            errors.append(f"{image_id}: approved decision has no candidate record")
            continue
        if candidate.get("mappingStatus") == "invalid":
            errors.append(f"{image_id}: invalid candidate cannot be approved")
        for field in ("sourceImage", "contentHash", "lessonId"):
            if decision.get(field) not in (None, "", candidate.get(field), str(candidate.get(field) or "")):
                errors.append(f"{image_id}: decision {field} does not match candidate")
        try:
            new_mappings.append(build_new_mapping(decision, candidate, events_by_id))
        except ValueError as exc:
            errors.append(str(exc))

    merged_mappings = [dict(mapping) for mapping in existing_mappings] + new_mappings
    merged_mappings.sort(key=mapping_sort_key)
    merged = {
        "version": SUPPORTED_VERSION,
        "mappings": merged_mappings,
        "rejected": approved.get("rejected") if isinstance(approved.get("rejected"), list) else [],
    }
    errors.extend(
        validate_merged_mapping(
            mappings=merged_mappings,
            candidates_by_source=candidates_by_source,
            events_by_id=events_by_id,
            repo_root=repo_root,
        )
    )
    return MergeResult(merged=merged, new_mappings=sorted(new_mappings, key=mapping_sort_key), warnings=warnings, errors=errors)


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(description="Finalize Stage5 manual review decisions into approved mappings.")
    parser.add_argument("--repo-root", default=str(repo_root))
    parser.add_argument("--decisions", default=str(script_path.parent / "output" / "manual_review_decisions.json"))
    parser.add_argument("--approved-mappings", default=str(script_path.parent / "config" / "approved_event_image_mappings.json"))
    parser.add_argument("--candidates", default=str(script_path.parent / "output" / "image_event_candidates.jsonl"))
    parser.add_argument("--core-events", default=str(repo_root / "crawData" / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"))
    parser.add_argument("--preview-output", default="", help="Optional dry-run preview file. Stdout is used when omitted.")
    parser.add_argument("--apply", action="store_true", help="Write the merged mapping to --approved-mappings.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    decisions_path = Path(args.decisions).resolve()
    approved_path = Path(args.approved_mappings).resolve()
    candidates_path = Path(args.candidates).resolve()
    core_events_path = Path(args.core_events).resolve()

    result = finalize(
        decisions=load_json(decisions_path),
        approved=load_json(approved_path),
        candidates=load_jsonl(candidates_path),
        core_events=load_jsonl(core_events_path),
        repo_root=repo_root,
    )
    report = {
        "apply": bool(args.apply),
        "newMappingCount": len(result.new_mappings),
        "mergedMappingCount": len(result.merged.get("mappings", [])),
        "warnings": sorted(result.warnings),
        "errors": sorted(set(result.errors)),
        "newMappings": result.new_mappings,
        "merged": result.merged,
    }
    if result.errors:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return 1
    if args.apply:
        atomic_write_json(approved_path, result.merged)
        print(f"Applied merged approved mappings: {slash(approved_path.relative_to(repo_root))}")
    elif args.preview_output:
        preview_path = Path(args.preview_output).resolve()
        atomic_write_json(preview_path, report)
        print(f"Dry-run preview written: {slash(preview_path.relative_to(repo_root))}")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
