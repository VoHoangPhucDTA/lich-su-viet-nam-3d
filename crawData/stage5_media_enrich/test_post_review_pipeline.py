#!/usr/bin/env python3
"""Focused tests for post-review Stage5 pipeline preparation.

All fixtures are synthetic. These tests do not read or write the live manual
review decisions, proposed mappings, or real approved config.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from finalize_manual_review import finalize, load_json, main as finalize_main
from verify_media_pipeline import approved_relationships, verify_api_snapshot, verify_db_snapshot, verify_files


class PostReviewPipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.stage5 = self.root / "crawData/stage5_media_enrich"
        self.output = self.stage5 / "output"
        self.config = self.stage5 / "config"
        self.images = self.root / "crawData/stage1_crawl/images/grade_12/900"
        self.core_path = self.root / "crawData/stage4b_curate_tree/output/phase2/core_events.jsonl"
        self.public_dir = self.root / "frontend/public/media/event-images"
        self.output.mkdir(parents=True)
        self.config.mkdir(parents=True)
        self.images.mkdir(parents=True)
        self.core_path.parent.mkdir(parents=True)
        self.public_dir.mkdir(parents=True)

        self.img_existing = self.write_image("img_existing.png", b"existing-image")
        self.img_one = self.write_image("img_one.png", b"new-image-one")
        self.img_two = self.write_image("img_two.png", b"new-image-two")
        self.img_duplicate = self.write_image("img_duplicate.png", b"new-image-one")

        self.events = [
            self.event("event-existing"),
            self.event("event-one"),
            self.event("event-two"),
            self.event("event-three"),
        ]
        self.write_jsonl(self.core_path, self.events)
        self.candidates = [
            self.candidate("existing", self.img_existing, "event-existing"),
            self.candidate("one", self.img_one, "event-one"),
            self.candidate("two", self.img_two, "event-two"),
            self.candidate("duplicate", self.img_duplicate, "event-three"),
        ]
        self.candidates_path = self.output / "image_event_candidates.jsonl"
        self.write_jsonl(self.candidates_path, self.candidates)
        self.approved = {
            "version": 1,
            "mappings": [
                self.mapping(self.img_existing, "event-existing"),
            ],
            "rejected": [],
        }
        self.approved_path = self.config / "approved_event_image_mappings.json"
        self.write_json(self.approved_path, self.approved)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_image(self, name: str, payload: bytes) -> str:
        path = self.images / name
        path.write_bytes(payload)
        return slash(path.relative_to(self.root))

    def event(self, event_id: str, thumbnail: str = "") -> dict[str, object]:
        return {
            "id": event_id,
            "slug": event_id,
            "titles": {"primary": event_id},
            "chronology": {"start": {"year": 1945}, "end": {"year": None}},
            "textbookContent": {"textbookRefs": [{"lessonId": "900"}]},
            "hierarchy": {"rootId": "root", "parentId": "root", "level": 1, "orderInParent": 1},
            "media": {"thumbnail": thumbnail, "items": []},
        }

    def candidate(self, image_id: str, source_image: str, event_id: str) -> dict[str, object]:
        path = self.root / source_image
        return {
            "imageId": image_id,
            "sourceImage": source_image,
            "lessonId": "900",
            "alt": f"Alt {image_id}",
            "caption": f"Caption {image_id}",
            "contentHash": sha256(path),
            "extension": ".png",
            "mappingStatus": "single_candidate",
            "candidateEvents": [{"eventId": event_id}],
        }

    @staticmethod
    def mapping(source_image: str, event_id: str) -> dict[str, object]:
        return {
            "sourceImage": source_image,
            "lessonId": "900",
            "altText": "Alt",
            "status": "approved",
            "targets": [
                {
                    "eventId": event_id,
                    "isThumbnail": True,
                    "sortOrder": 1,
                    "reviewNote": "Synthetic approval.",
                }
            ],
        }

    @staticmethod
    def decisions(*items: tuple[str, str]) -> dict[str, object]:
        return {
            "version": 1,
            "decisions": {
                image_id: {
                    "imageId": image_id,
                    "sourceImage": source_image,
                    "contentHash": "",
                    "lessonId": "900",
                    "status": "approved",
                    "eventId": event_id,
                    "note": "Manual synthetic approval.",
                }
                for image_id, source_image, event_id in items
            },
            "history": [],
        }

    @staticmethod
    def write_json(path: Path, payload: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")

    def test_finalizer_dry_run_merges_without_writing_real_config(self) -> None:
        before = self.approved_path.read_text(encoding="utf-8")
        result = finalize(
            decisions=self.decisions(("one", self.img_one, "event-one"), ("two", self.img_two, "event-two")),
            approved=self.approved,
            candidates=self.candidates,
            core_events=self.events,
            repo_root=self.root,
        )
        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.new_mappings), 2)
        self.assertEqual(len(result.merged["mappings"]), 3)
        self.assertEqual(self.approved_path.read_text(encoding="utf-8"), before)

    def test_finalizer_apply_requires_explicit_flag(self) -> None:
        decisions_path = self.output / "synthetic_decisions.json"
        preview_path = self.output / "synthetic_preview.json"
        self.write_json(decisions_path, self.decisions(("one", self.img_one, "event-one")))
        import sys

        old_argv = sys.argv
        try:
            sys.argv = [
                "finalize_manual_review.py",
                "--repo-root",
                str(self.root),
                "--decisions",
                str(decisions_path),
                "--approved-mappings",
                str(self.approved_path),
                "--candidates",
                str(self.candidates_path),
                "--core-events",
                str(self.core_path),
                "--preview-output",
                str(preview_path),
            ]
            self.assertEqual(finalize_main(), 0)
            self.assertEqual(len(load_json(self.approved_path)["mappings"]), 1)
            sys.argv.append("--apply")
            self.assertEqual(finalize_main(), 0)
            self.assertEqual(len(load_json(self.approved_path)["mappings"]), 2)
        finally:
            sys.argv = old_argv

    def test_finalizer_rejects_duplicate_source_hash_unknown_target_thumbnail_conflict_and_caption_field(self) -> None:
        bad_approved = {
            "version": 1,
            "mappings": [
                self.mapping(self.img_one, "event-one"),
                self.mapping(self.img_duplicate, "event-three"),
                {**self.mapping(self.img_two, "event-one"), "caption": "Do not copy captions"},
                self.mapping(self.img_existing, "missing-event"),
            ],
            "rejected": [],
        }
        result = finalize(
            decisions={"version": 1, "decisions": {}, "history": []},
            approved=bad_approved,
            candidates=self.candidates,
            core_events=self.events,
            repo_root=self.root,
        )
        combined = "\n".join(result.errors)
        self.assertIn("duplicate physical image hash", combined)
        self.assertIn("caption field is not allowed", combined)
        self.assertIn("target event does not exist", combined)
        self.assertIn("thumbnail conflict", combined)

    def test_dynamic_verifier_validates_enriched_json_public_assets_db_and_api_snapshots(self) -> None:
        merged = {
            "version": 1,
            "mappings": [
                self.mapping(self.img_one, "event-one"),
                self.mapping(self.img_two, "event-two"),
            ],
            "rejected": [],
        }
        relationships = approved_relationships(merged, self.root)
        for relationship in relationships:
            source = self.root / relationship["sourceImage"]
            public = self.root / relationship["publicFile"]
            public.parent.mkdir(parents=True, exist_ok=True)
            public.write_bytes(source.read_bytes())
        by_id = {event["id"]: dict(event) for event in self.events}
        for relationship in relationships:
            event = dict(by_id[relationship["targetEvent"]])
            event["media"] = {"thumbnail": relationship["browserUrl"], "items": []}
            by_id[relationship["targetEvent"]] = event
        enriched = [by_id[str(event["id"])] for event in self.events]
        errors, summary = verify_files(
            relationships=relationships,
            core_events=self.events,
            enriched_events=enriched,
            public_media_dir=self.public_dir,
            repo_root=self.root,
        )
        self.assertEqual(errors, [])
        self.assertEqual(summary["approvedImages"], 2)
        self.assertEqual(summary["thumbnailRelationships"], 2)
        db_rows = [
            {"eventId": item["targetEvent"], "url": item["browserUrl"], "isThumbnail": item["isThumbnail"]}
            for item in relationships
        ]
        api_rows = [
            {"id": item["targetEvent"], "media": {"thumbnail": item["browserUrl"]}}
            for item in relationships
        ]
        self.assertEqual(verify_db_snapshot(relationships, db_rows), [])
        self.assertEqual(verify_api_snapshot(relationships, api_rows), [])


def slash(path: str | Path) -> str:
    return str(path).replace("\\", "/")


def sha256(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
