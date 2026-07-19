#!/usr/bin/env python3
"""Synthetic tests for downloaded external media finalization policy."""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from finalize_external_event_media import build_outputs


class ExternalFinalizerPolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        self.package_root = self.repo / "crawData" / "stage5_external_media_enrichment"
        self.assets = self.package_root / "assets"
        self.assets.mkdir(parents=True)

        self.shared = self.write_asset("shared.jpg", b"shared-image")
        self.second = self.write_asset("second.png", b"second-image")
        self.hard = self.write_asset("hard.jpg", b"hard-image")

        self.base_mappings = {
            "version": 1,
            "mappings": [
                {
                    "sourceImage": "crawData/stage1_crawl/images/base.png",
                    "lessonId": "base",
                    "altText": "Base thumbnail",
                    "status": "approved",
                    "targets": [{"eventId": "one-image", "isThumbnail": True, "sortOrder": 1, "reviewNote": "base"}],
                },
                {
                    "sourceImage": "crawData/stage1_crawl/images/base-gallery.png",
                    "lessonId": "base",
                    "altText": "Base gallery",
                    "status": "approved",
                    "targets": [{"eventId": "one-image", "isThumbnail": False, "sortOrder": 2, "reviewNote": "base"}],
                },
            ],
            "rejected": [],
        }

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_asset(self, name: str, data: bytes) -> dict[str, str]:
        path = self.assets / name
        path.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        return {
            "path": path,
            "repo": str(path.relative_to(self.repo)).replace("\\", "/"),
            "sha256": digest,
            "extension": path.suffix.lower().lstrip("."),
        }

    def image(self, asset: dict[str, str], slot: int, original: str, display: str) -> dict[str, object]:
        return {
            "slot": slot,
            "canonicalAsset": asset["repo"],
            "sha256": asset["sha256"],
            "extension": asset["extension"],
            "originalFileName": original,
            "fileTitle": display,
            "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Example",
            "downloadUrl": "https://upload.wikimedia.org/example",
            "license": "Public Domain",
            "historicalVerificationUrl": "",
            "relationType": "strong_contextual",
            "isThumbnail": True,
            "sortOrder": slot,
        }

    def test_downloaded_non_blockers_become_gallery_preview_without_requiring_completeness(self) -> None:
        manifest = {
            "version": 1,
            "events": [
                {
                    "eventId": "one-image",
                    "title": "One image event",
                    "displayDate": "1945",
                    "images": [self.image(self.shared, 1, "800px-One_image.jpg", "One image")],
                },
                {
                    "eventId": "two-images",
                    "title": "Two image event",
                    "displayDate": "1954",
                    "images": [
                        self.image(self.shared, 1, "Shared_original.jpg", "Shared original"),
                        self.image(self.second, 2, "Second_original.png", "Second original"),
                    ],
                },
                {
                    "eventId": "hard-blocked",
                    "title": "Hard blocked",
                    "images": [self.image(self.hard, 1, "Hard.jpg", "Hard")],
                },
                {"eventId": "missing-only", "title": "Missing only", "images": []},
            ],
        }
        gates = {
            "version": 1,
            "gates": [{"eventId": "hard-blocked", "status": "blocked_data_issue", "category": "data_issue"}],
        }
        decisions = {
            "version": 1,
            "decisions": {
                "one-image": {
                    "status": "needs_replacement",
                    "images": [{"captionOverride": "Curated one image caption", "note": "kept despite duplicate policy"}],
                }
            },
        }

        external, combined, external_candidates, combined_candidates, report = build_outputs(
            manifest,
            decisions["decisions"],
            self.base_mappings,
            [],
            self.package_root,
            gates,
            self.repo,
        )

        self.assertEqual(report["errors"], [])
        self.assertEqual(report["approvedExternalEvents"], 2)
        self.assertEqual(report["hardBlockedExternalEvents"], 1)
        self.assertEqual(report["skippedMissingExternalEvents"], 1)
        self.assertEqual(report["duplicatePhysicalHashGroupsAllowed"], 1)
        self.assertEqual(report["externalThumbnailRelationships"], 0)
        self.assertEqual(report["externalGalleryRelationships"], 3)
        self.assertEqual(len(external["mappings"]), 2)
        self.assertEqual(len(external_candidates), 2)
        self.assertEqual(len(combined["mappings"]), 4)
        self.assertEqual(len(combined_candidates), 2)

        external_targets = [target for mapping in external["mappings"] for target in mapping["targets"]]
        self.assertTrue(all(target["isThumbnail"] is False for target in external_targets))
        one_target = next(target for target in external_targets if target["eventId"] == "one-image")
        self.assertEqual(one_target["sortOrder"], 3)

        one_mapping = next(mapping for mapping in external["mappings"] if any(t["eventId"] == "one-image" for t in mapping["targets"]))
        self.assertEqual(one_mapping["captionOverride"], "Curated one image caption")
        self.assertNotIn("sourceName", json.dumps(one_mapping, ensure_ascii=False))

        candidate = next(row for row in external_candidates if row["sourceImage"] == one_mapping["sourceImage"])
        self.assertEqual(candidate["caption"], "One image")
        self.assertEqual(candidate["sourceMetadata"]["displayName"], "One image")
        self.assertEqual(candidate["sourceMetadata"]["originalFileName"], "800px-One_image.jpg")
        self.assertNotIn("hard-blocked", {target["eventId"] for target in external_targets})
        self.assertNotIn("missing-only", {target["eventId"] for target in external_targets})


if __name__ == "__main__":
    unittest.main()
