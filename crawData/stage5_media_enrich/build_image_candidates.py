#!/usr/bin/env python3
"""Build Stage 5 image-to-event candidate analysis.

This script is intentionally read-only with respect to Stage 1 and Stage 4B
source data. It generates review artifacts under the Stage 5 output directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any


GRADES = ("10", "11", "12")
STATUS_SINGLE = "single_candidate"
STATUS_AMBIGUOUS = "ambiguous"
STATUS_UNRESOLVED = "unresolved"
STATUS_INVALID = "invalid"


@dataclass(frozen=True)
class Paths:
    repo_root: Path
    stage1_dir: Path
    core_events_path: Path
    output_dir: Path

    @property
    def candidates_path(self) -> Path:
        return self.output_dir / "image_event_candidates.jsonl"

    @property
    def review_path(self) -> Path:
        return self.output_dir / "image_event_candidates_review.md"

    @property
    def summary_path(self) -> Path:
        return self.output_dir / "image_candidate_summary.json"


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def repo_relative(path: Path, repo_root: Path) -> str:
    return slash(path.resolve().relative_to(repo_root.resolve()))


def md_relative(target: Path, from_file: Path) -> str:
    return slash(os.path.relpath(target.resolve(), from_file.parent.resolve()))


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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_image_index(src: str, fallback: int) -> int:
    stem = Path(src).stem
    digits = "".join(ch for ch in stem if ch.isdigit())
    if digits:
        try:
            return int(digits)
        except ValueError:
            pass
    return fallback


def image_id_for(grade: int, lesson_id: str, src: str, index: int) -> str:
    stem = Path(src).stem if src and src != "#" else f"record_{index:02d}"
    return f"grade_{grade}:{lesson_id}:{stem}"


def normalize_candidate_event(event: dict[str, Any], reason: str) -> dict[str, Any]:
    title = ((event.get("titles") or {}).get("primary") or event.get("id") or "").strip()
    chronology = event.get("chronology") or {}
    hierarchy = event.get("hierarchy") or {}
    return {
        "eventId": event.get("id"),
        "slug": event.get("slug"),
        "title": title,
        "eventLevel": event.get("eventLevel"),
        "displayDate": chronology.get("displayDate"),
        "parentId": hierarchy.get("parentId"),
        "rootId": hierarchy.get("rootId"),
        "reason": reason,
    }


def build_event_indexes(core_events: list[dict[str, Any]]) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    lesson_to_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    issues: list[str] = []
    seen_event_ids: set[str] = set()

    for event_index, event in enumerate(core_events, start=1):
        event_id = event.get("id")
        if not event_id:
            issues.append(f"core event record #{event_index} is missing id")
            continue
        if event_id in seen_event_ids:
            issues.append(f"duplicate core event id: {event_id}")
        seen_event_ids.add(event_id)

        refs = ((event.get("textbookContent") or {}).get("textbookRefs") or [])
        if not isinstance(refs, list):
            issues.append(f"{event_id}: textbookContent.textbookRefs is not a list")
            continue
        for ref_index, ref in enumerate(refs, start=1):
            if not isinstance(ref, dict):
                issues.append(f"{event_id}: textbook ref #{ref_index} is not an object")
                continue
            lesson_id = ref.get("lessonId")
            if lesson_id is None or str(lesson_id).strip() == "":
                issues.append(f"{event_id}: textbook ref #{ref_index} missing lessonId")
                continue
            lesson_to_events[str(lesson_id)].append(event)

    for lesson_id, events in lesson_to_events.items():
        events.sort(key=lambda item: (str(item.get("id") or ""), str((item.get("titles") or {}).get("primary") or "")))

    return dict(sorted(lesson_to_events.items())), issues


def load_lessons(stage1_dir: Path) -> list[dict[str, Any]]:
    lessons: list[dict[str, Any]] = []
    for grade in GRADES:
        path = stage1_dir / f"lich_su_{grade}_kntt.json"
        data = load_json(path)
        file_lessons = data.get("lessons")
        if not isinstance(file_lessons, list):
            raise SystemExit(f"Expected lessons[] in {path}")
        for lesson in file_lessons:
            if not isinstance(lesson, dict):
                raise SystemExit(f"Expected lesson object in {path}")
            lesson["_sourceFile"] = repo_relative(path, stage1_dir.parents[1])
            lessons.append(lesson)
    return lessons


def is_malformed_src(src: str) -> bool:
    if not src or src.strip() == "":
        return True
    if src.strip() == "#":
        return True
    normalized = slash(src)
    if normalized.startswith("http://") or normalized.startswith("https://"):
        return True
    if normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized:
        return True
    return False


def build_candidates(paths: Paths) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    lessons = load_lessons(paths.stage1_dir)
    core_events = load_jsonl(paths.core_events_path)
    lesson_to_events, event_index_issues = build_event_indexes(core_events)

    records: list[dict[str, Any]] = []
    image_lessons: set[str] = set()
    lesson_image_counts: Counter[str] = Counter()

    for lesson in sorted(lessons, key=lambda item: (int(item.get("grade") or 0), str(item.get("lesson_id") or ""))):
        grade_raw = lesson.get("grade")
        lesson_id = str(lesson.get("lesson_id") or "")
        if not lesson_id:
            raise SystemExit("Stage1 lesson is missing lesson_id")
        try:
            grade = int(grade_raw)
        except (TypeError, ValueError) as exc:
            raise SystemExit(f"Stage1 lesson {lesson_id} has invalid grade: {grade_raw}") from exc

        images = lesson.get("images") or []
        if not isinstance(images, list):
            raise SystemExit(f"Stage1 lesson {lesson_id} images is not a list")
        if images:
            image_lessons.add(lesson_id)

        for order, image in enumerate(images, start=1):
            if not isinstance(image, dict):
                raise SystemExit(f"Stage1 lesson {lesson_id} image #{order} is not an object")
            src = str(image.get("src") or "")
            alt = str(image.get("alt") or "")
            caption = str(image.get("caption") or "")
            image_index = parse_image_index(src, order)
            lesson_image_counts[lesson_id] += 1
            validation_issues: list[str] = []

            source_image_abs: Path | None = None
            source_image_rel: str | None = None
            extension: str | None = None
            file_size: int | None = None
            content_hash: str | None = None

            if is_malformed_src(src):
                validation_issues.append("invalid_src")
            else:
                source_image_abs = paths.stage1_dir / slash(src)
                source_image_rel = repo_relative(source_image_abs, paths.repo_root)
                extension = source_image_abs.suffix.lower() or None
                if not source_image_abs.exists() or not source_image_abs.is_file():
                    validation_issues.append("missing_file")
                else:
                    file_size = source_image_abs.stat().st_size
                    content_hash = sha256_file(source_image_abs)
                    extension = source_image_abs.suffix.lower()

            if caption.strip() == "":
                validation_issues.append("missing_caption")
            if alt.strip() == "":
                validation_issues.append("empty_alt")

            candidate_events = [
                normalize_candidate_event(event, "lesson_id_match")
                for event in lesson_to_events.get(lesson_id, [])
            ]

            if "invalid_src" in validation_issues or "missing_file" in validation_issues:
                mapping_status = STATUS_INVALID
            elif len(candidate_events) == 1:
                mapping_status = STATUS_SINGLE
            elif len(candidate_events) > 1:
                mapping_status = STATUS_AMBIGUOUS
            else:
                mapping_status = STATUS_UNRESOLVED
                validation_issues.append("lesson_id_not_referenced_by_core_events")

            record = {
                "imageId": image_id_for(grade, lesson_id, src, order),
                "grade": grade,
                "lessonId": lesson_id,
                "lessonTitle": lesson.get("title") or "",
                "lessonUrl": lesson.get("url") or "",
                "imageOrder": order,
                "imageIndex": image_index,
                "sourceSrc": src,
                "sourceImage": source_image_rel,
                "caption": caption,
                "alt": alt,
                "extension": extension,
                "fileSizeBytes": file_size,
                "contentHash": content_hash,
                "candidateEvents": candidate_events,
                "candidateEventCount": len(candidate_events),
                "mappingStatus": mapping_status,
                "validationIssues": sorted(set(validation_issues)),
            }
            records.append(record)

    add_duplicate_groups(records)
    summary = build_summary(paths, lessons, core_events, lesson_to_events, image_lessons, records, event_index_issues)
    return records, summary


def add_duplicate_groups(records: list[dict[str, Any]]) -> None:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        content_hash = record.get("contentHash")
        if content_hash:
            by_hash[str(content_hash)].append(record)

    for content_hash, group in by_hash.items():
        if len(group) <= 1:
            continue
        source_images = [item.get("sourceImage") for item in group if item.get("sourceImage")]
        for record in group:
            record["duplicateGroup"] = {
                "contentHash": content_hash,
                "duplicateCount": len(group),
                "otherSourceImages": sorted(path for path in source_images if path != record.get("sourceImage")),
            }
            issues = set(record.get("validationIssues") or [])
            issues.add("duplicate_physical_image")
            record["validationIssues"] = sorted(issues)


def build_summary(
    paths: Paths,
    lessons: list[dict[str, Any]],
    core_events: list[dict[str, Any]],
    lesson_to_events: dict[str, list[dict[str, Any]]],
    image_lessons: set[str],
    records: list[dict[str, Any]],
    event_index_issues: list[str],
) -> dict[str, Any]:
    status_counts = Counter(record["mappingStatus"] for record in records)
    valid_records = [record for record in records if record["mappingStatus"] != STATUS_INVALID]
    records_with_files = [record for record in records if record.get("contentHash")]
    hash_counts = Counter(record["contentHash"] for record in records_with_files)
    duplicate_hashes = sorted(hash_value for hash_value, count in hash_counts.items() if count > 1)
    duplicate_groups = []
    for hash_value in duplicate_hashes:
        group = [record for record in records_with_files if record["contentHash"] == hash_value]
        duplicate_groups.append({
            "contentHash": hash_value,
            "duplicateCount": len(group),
            "sourceImages": sorted(record["sourceImage"] for record in group if record.get("sourceImage")),
        })

    candidate_counts = [record["candidateEventCount"] for record in valid_records]
    file_sizes = [record["fileSizeBytes"] for record in records_with_files if record.get("fileSizeBytes") is not None]
    largest = sorted(
        (
            {
                "sourceImage": record["sourceImage"],
                "imageId": record["imageId"],
                "fileSizeBytes": record["fileSizeBytes"],
                "contentHash": record["contentHash"],
            }
            for record in records_with_files
        ),
        key=lambda item: (-int(item["fileSizeBytes"]), str(item["sourceImage"])),
    )[:10]

    lesson_event_counts = {lesson_id: len(events) for lesson_id, events in lesson_to_events.items()}
    image_lesson_ids_found = sorted(lesson_id for lesson_id in image_lessons if lesson_id in lesson_to_events)
    image_lesson_ids_not_found = sorted(lesson_id for lesson_id in image_lessons if lesson_id not in lesson_to_events)

    issue_counts = Counter(issue for record in records for issue in record.get("validationIssues", []))
    total_bytes = sum(file_sizes)

    return {
        "inputs": {
            "stage1Dir": repo_relative(paths.stage1_dir, paths.repo_root),
            "coreEvents": repo_relative(paths.core_events_path, paths.repo_root),
            "coreEventRecords": len(core_events),
        },
        "lessonsAndImages": {
            "stage1LessonRecords": len(lessons),
            "lessonsWithImageRecords": len(image_lessons),
            "totalImageJsonRecords": len(records),
            "validLocalImageFiles": len(records_with_files),
            "invalidRecords": status_counts.get(STATUS_INVALID, 0),
            "missingFiles": issue_counts.get("missing_file", 0),
        },
        "mappingCoverage": {
            "singleCandidateImages": status_counts.get(STATUS_SINGLE, 0),
            "ambiguousImages": status_counts.get(STATUS_AMBIGUOUS, 0),
            "unresolvedImages": status_counts.get(STATUS_UNRESOLVED, 0),
            "invalidImages": status_counts.get(STATUS_INVALID, 0),
            "uniqueLessonIdsWithImages": len(image_lessons),
            "imageLessonIdsFoundInCoreRefs": len(image_lesson_ids_found),
            "imageLessonIdsNotFoundInCoreRefs": len(image_lesson_ids_not_found),
            "imageLessonIdsNotFound": image_lesson_ids_not_found,
        },
        "candidateCardinality": {
            "minCandidateCount": min(candidate_counts) if candidate_counts else 0,
            "maxCandidateCount": max(candidate_counts) if candidate_counts else 0,
            "averageCandidateCount": round(mean(candidate_counts), 4) if candidate_counts else 0,
            "lessonsMappingToMultipleEvents": sum(1 for count in lesson_event_counts.values() if count > 1),
            "imageLessonsMappingToMultipleEvents": sum(
                1
                for lesson_id in image_lessons
                if lesson_event_counts.get(lesson_id, 0) > 1
            ),
        },
        "duplicateAnalysis": {
            "uniquePhysicalImageHashes": len(hash_counts),
            "duplicatePhysicalImageGroups": len(duplicate_groups),
            "imageRecordsInDuplicateGroups": sum(group["duplicateCount"] for group in duplicate_groups),
            "groups": duplicate_groups,
        },
        "fileSizeAnalysis": {
            "totalValidImageBytes": total_bytes,
            "totalValidImageMiB": round(total_bytes / (1024 * 1024), 4),
            "averageImageSizeBytes": round(mean(file_sizes), 2) if file_sizes else 0,
            "largestImageSizeBytes": max(file_sizes) if file_sizes else 0,
            "topLargestImageFiles": largest,
        },
        "validationIssueCounts": dict(sorted(issue_counts.items())),
        "eventIndexIssues": event_index_issues,
    }


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=False, separators=(",", ":")))
            handle.write("\n")


def write_summary(path: Path, summary: dict[str, Any]) -> None:
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def format_bytes(value: int | None) -> str:
    if value is None:
        return "n/a"
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.2f} MiB"
    if value >= 1024:
        return f"{value / 1024:.1f} KiB"
    return f"{value} B"


def group_records(records: list[dict[str, Any]]) -> dict[int, dict[str, list[dict[str, Any]]]]:
    grouped: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for record in records:
        grouped[int(record["grade"])][str(record["lessonId"])].append(record)
    for lessons in grouped.values():
        for lesson_records in lessons.values():
            lesson_records.sort(key=lambda item: (int(item["imageOrder"]), str(item["sourceSrc"])))
    return grouped


def write_review(path: Path, records: list[dict[str, Any]], summary: dict[str, Any], repo_root: Path) -> None:
    lines: list[str] = []
    lines.append("# Stage 5 Image Event Candidate Review")
    lines.append("")
    lines.append("> Generated file. Candidate mappings are not approved data and must not be imported or displayed directly.")
    lines.append("")

    lessons = summary["lessonsAndImages"]
    coverage = summary["mappingCoverage"]
    duplicates = summary["duplicateAnalysis"]
    sizes = summary["fileSizeAnalysis"]
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Stage1 lesson records: {lessons['stage1LessonRecords']}")
    lines.append(f"- Lessons with image records: {lessons['lessonsWithImageRecords']}")
    lines.append(f"- Total image JSON records: {lessons['totalImageJsonRecords']}")
    lines.append(f"- Valid local image files: {lessons['validLocalImageFiles']}")
    lines.append(f"- Invalid records: {lessons['invalidRecords']}")
    lines.append(f"- Missing files: {lessons['missingFiles']}")
    lines.append(f"- Single-candidate images: {coverage['singleCandidateImages']}")
    lines.append(f"- Ambiguous images: {coverage['ambiguousImages']}")
    lines.append(f"- Unresolved images: {coverage['unresolvedImages']}")
    lines.append(f"- Invalid images: {coverage['invalidImages']}")
    lines.append(f"- Duplicate physical image groups: {duplicates['duplicatePhysicalImageGroups']}")
    lines.append(f"- Total valid image size: {sizes['totalValidImageMiB']} MiB")
    lines.append("")

    if summary.get("eventIndexIssues"):
        lines.append("## Event Index Warnings")
        lines.append("")
        for issue in summary["eventIndexIssues"]:
            lines.append(f"- {issue}")
        lines.append("")

    lines.append("## Candidate Review")
    lines.append("")
    grouped = group_records(records)
    for grade in sorted(grouped):
        lines.append(f"### Grade {grade}")
        lines.append("")
        for lesson_id in sorted(grouped[grade], key=lambda value: (int(value) if value.isdigit() else 10**9, value)):
            lesson_records = grouped[grade][lesson_id]
            lesson_title = lesson_records[0].get("lessonTitle") or ""
            lines.append(f"#### Lesson {lesson_id}: {lesson_title}")
            lines.append("")
            for record in lesson_records:
                lines.append(f"##### {record['imageId']}")
                lines.append("")
                lines.append(f"- Status: `{record['mappingStatus']}`")
                lines.append(f"- Source src: `{record['sourceSrc']}`")
                lines.append(f"- Source image: `{record.get('sourceImage') or 'n/a'}`")
                lines.append(f"- Image order: {record['imageOrder']}")
                lines.append(f"- File size: {format_bytes(record.get('fileSizeBytes'))}")
                short_hash = (record.get("contentHash") or "")[:16] or "n/a"
                lines.append(f"- Content hash: `{short_hash}`")
                caption = record.get("caption") or ""
                lines.append(f"- Caption: {caption if caption.strip() else '_missing_'}")
                alt = record.get("alt") or ""
                lines.append(f"- Alt: {alt if alt.strip() else '_empty_'}")
                issues = record.get("validationIssues") or []
                lines.append(f"- Validation issues: {', '.join(f'`{issue}`' for issue in issues) if issues else 'none'}")
                duplicate = record.get("duplicateGroup")
                if duplicate:
                    others = ", ".join(f"`{item}`" for item in duplicate.get("otherSourceImages", []))
                    lines.append(f"- Duplicate physical image: {duplicate['duplicateCount']} records share this hash; other files: {others}")
                source_image = record.get("sourceImage")
                if source_image and record.get("contentHash"):
                    preview_target = repo_root / source_image
                    lines.append("")
                    lines.append(f"![Image preview]({md_relative(preview_target, path)})")
                else:
                    lines.append("")
                    lines.append("_Preview unavailable for invalid or missing image._")
                lines.append("")
                lines.append("Candidate events:")
                events = record.get("candidateEvents") or []
                if events:
                    for event in events:
                        display_date = event.get("displayDate") or "n/a"
                        lines.append(f"- `{event.get('eventId')}` - {event.get('title')} ({display_date}); reason: `{event.get('reason')}`")
                else:
                    lines.append("- none")
                lines.append("")

    lines.append("## Duplicate Physical Image Groups")
    lines.append("")
    if duplicates["groups"]:
        for group in duplicates["groups"]:
            lines.append(f"- `{group['contentHash'][:16]}` ({group['duplicateCount']} records)")
            for source in group["sourceImages"]:
                lines.append(f"  - `{source}`")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Largest Image Files")
    lines.append("")
    for item in sizes["topLargestImageFiles"]:
        lines.append(f"- `{item['sourceImage']}` - {format_bytes(item['fileSizeBytes'])} - `{item['contentHash'][:16]}`")
    lines.append("")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    parser = argparse.ArgumentParser(description="Build Stage 5 image-event candidate artifacts.")
    parser.add_argument("--stage1-dir", default=str(repo_root / "crawData" / "stage1_crawl"))
    parser.add_argument(
        "--core-events",
        default=str(repo_root / "crawData" / "stage4b_curate_tree" / "output" / "phase2" / "core_events.jsonl"),
    )
    parser.add_argument("--output-dir", default=str(script_path.parent / "output"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    paths = Paths(
        repo_root=repo_root,
        stage1_dir=(Path(args.stage1_dir) if Path(args.stage1_dir).is_absolute() else repo_root / args.stage1_dir).resolve(),
        core_events_path=(Path(args.core_events) if Path(args.core_events).is_absolute() else repo_root / args.core_events).resolve(),
        output_dir=(Path(args.output_dir) if Path(args.output_dir).is_absolute() else repo_root / args.output_dir).resolve(),
    )
    paths.output_dir.mkdir(parents=True, exist_ok=True)

    records, summary = build_candidates(paths)
    records.sort(key=lambda item: (int(item["grade"]), int(item["lessonId"]) if str(item["lessonId"]).isdigit() else 10**9, str(item["lessonId"]), int(item["imageOrder"]), str(item["sourceSrc"])))

    write_jsonl(paths.candidates_path, records)
    write_summary(paths.summary_path, summary)
    write_review(paths.review_path, records, summary, paths.repo_root)

    print(f"Wrote {repo_relative(paths.candidates_path, paths.repo_root)}")
    print(f"Wrote {repo_relative(paths.review_path, paths.repo_root)}")
    print(f"Wrote {repo_relative(paths.summary_path, paths.repo_root)}")
    print(json.dumps({
        "totalImageJsonRecords": summary["lessonsAndImages"]["totalImageJsonRecords"],
        "singleCandidateImages": summary["mappingCoverage"]["singleCandidateImages"],
        "ambiguousImages": summary["mappingCoverage"]["ambiguousImages"],
        "unresolvedImages": summary["mappingCoverage"]["unresolvedImages"],
        "invalidImages": summary["mappingCoverage"]["invalidImages"],
    }, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
