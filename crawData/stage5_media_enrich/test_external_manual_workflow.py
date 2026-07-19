#!/usr/bin/env python3
"""Focused synthetic tests for manual external media discovery/ingest.

These tests do not use the live review state, network, DB, or approved config.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
DISCOVER = SCRIPT_DIR / "discover_external_media_links.py"
INGEST = SCRIPT_DIR / "ingest_manual_external_images.py"


class ExternalManualWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.plan = self.root / "plan.json"
        self.media_root = self.root / "external_event_images"
        self.overrides = self.root / "overrides.json"
        self.output = self.root / "output"
        self.event_id = "sample-event"
        self.write_json(self.plan, {
            "version": 1,
            "events": [
                {
                    "eventId": self.event_id,
                    "title": "Sample event",
                    "shortTitle": "Sample",
                    "displayDate": "1945",
                    "canonicalSummary": "Synthetic sample event.",
                    "historicalLocations": ["Việt Nam"],
                    "preferredVerificationDomains": ["baotanglichsu.vn"],
                    "queries": ["Sample event"],
                    "requiredImages": 2,
                    "slots": [
                        {"slot": 1, "role": "thumbnail", "isThumbnail": True},
                        {"slot": 2, "role": "gallery", "isThumbnail": False, "sortOrder": 2},
                    ],
                },
                {
                    "eventId": "unattempted-event",
                    "title": "Unattempted event",
                    "displayDate": "Không rõ",
                    "preferredVerificationDomains": ["baotanglichsu.vn"],
                    "queries": ["Unattempted event"],
                    "requiredImages": 2,
                    "slots": [
                        {"slot": 1, "role": "thumbnail", "isThumbnail": True},
                        {"slot": 2, "role": "gallery", "isThumbnail": False, "sortOrder": 2},
                    ],
                },
            ],
        })
        self.write_json(self.overrides, {
            "version": 1,
            "events": {
                self.event_id: {
                    "historicalVerificationSources": [
                        {
                            "url": "https://baotanglichsu.vn/sample-event",
                            "title": "Sample event verification",
                            "reason": "Synthetic trusted source.",
                        }
                    ],
                    "imageCandidates": [
                        {
                            "imageTitle": "Sample image one",
                            "assetPageUrl": "https://commons.wikimedia.org/wiki/File:Sample_1.png",
                            "assetFileUrl": "https://upload.wikimedia.org/sample_1.png",
                            "license": "CC BY-SA 4.0",
                            "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                            "relationType": "direct",
                            "confidence": "manual",
                            "extension": "png",
                        },
                        {
                            "imageTitle": "Sample image two",
                            "assetPageUrl": "https://commons.wikimedia.org/wiki/File:Sample_2.png",
                            "assetFileUrl": "https://upload.wikimedia.org/sample_2.png",
                            "license": "Public Domain",
                            "relationType": "strong_contextual",
                            "confidence": "manual",
                            "extension": "jpg",
                        },
                    ],
                }
            },
        })

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def run_discovery(self) -> None:
        subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(DISCOVER),
            "--plan",
            str(self.plan),
            "--media-root",
            str(self.media_root),
            "--overrides",
            str(self.overrides),
            "--output-worklist-json",
            str(self.output / "worklist.json"),
            "--output-worklist-csv",
            str(self.output / "worklist.csv"),
            "--queue-json",
            str(self.output / "queue.json"),
            "--queue-csv",
            str(self.output / "queue.csv"),
            "--guide",
            str(self.output / "guide.md"),
            "--authoritative-sources-json",
            str(self.output / "authoritative_sources.json"),
            "--report",
            str(self.output / "report.json"),
            "--skip-network",
            "--limit",
            "1",
        ], check=True)

    def test_discovery_generates_manual_queue_without_binary_download(self) -> None:
        self.run_discovery()
        queue = json.loads((self.output / "queue.json").read_text(encoding="utf-8"))
        self.assertEqual(len(queue["rows"]), 2)
        self.assertEqual(queue["rows"][0]["downloadStatus"], "pending_manual_download")
        self.assertEqual(queue["rows"][0]["suggestedFilename"], "image_01.png")
        self.assertEqual(queue["rows"][1]["suggestedFilename"], "image_02.jpg")
        self.assertFalse((self.media_root / "assets").exists())
        self.assertTrue((self.media_root / "by_event" / self.event_id / "DOWNLOAD_INSTRUCTIONS.md").exists())
        worklist = json.loads((self.output / "worklist.json").read_text(encoding="utf-8"))
        self.assertEqual(worklist["events"][1]["discoveryStatus"], "not_attempted")

    def test_ingest_hashes_manual_files_and_detects_duplicates(self) -> None:
        self.run_discovery()
        event_dir = self.media_root / "by_event" / self.event_id
        (event_dir / "image_01.png").write_bytes(b"synthetic-one")
        (event_dir / "image_02.jpg").write_bytes(b"synthetic-two")
        subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(INGEST),
            "--plan",
            str(self.plan),
            "--media-root",
            str(self.media_root),
            "--queue",
            str(self.output / "queue.json"),
            "--manifest",
            str(self.media_root / "external_event_image_manifest.json"),
            "--report",
            str(self.output / "ingest_report.json"),
            "--limit",
            "1",
        ], check=True)
        report = json.loads((self.output / "ingest_report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["eventCount"], 1)
        self.assertEqual(report["eventsWithTwoImages"], 1)
        self.assertEqual(report["automaticApprovals"], 0)
        manifest = json.loads((self.media_root / "external_event_image_manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["events"][0]["images"]), 2)
        for image in manifest["events"][0]["images"]:
            self.assertTrue(Path(image["canonicalAsset"]).exists())
            self.assertEqual(len(image["sha256"]), 64)
            self.assertEqual(image["reviewStatus"], "pending")

    def test_ingest_preserves_original_filename_as_normalized_caption(self) -> None:
        self.run_discovery()
        event_dir = self.media_root / "by_event" / self.event_id
        (event_dir / "800px-Sample_historical_photo-Wikimedia_Commons.png").write_bytes(b"synthetic-one")
        (event_dir / "second-original-file_name.jpg").write_bytes(b"synthetic-two")
        subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(INGEST),
            "--plan",
            str(self.plan),
            "--media-root",
            str(self.media_root),
            "--queue",
            str(self.output / "queue.json"),
            "--manifest",
            str(self.media_root / "external_event_image_manifest.json"),
            "--report",
            str(self.output / "ingest_report.json"),
            "--limit",
            "1",
        ], check=True)
        manifest = json.loads((self.media_root / "external_event_image_manifest.json").read_text(encoding="utf-8"))
        images = manifest["events"][0]["images"]
        self.assertEqual(images[0]["originalFileName"], "800px-Sample_historical_photo-Wikimedia_Commons.png")
        self.assertEqual(images[0]["fileTitle"], "Sample historical photo Wikimedia Commons")
        self.assertEqual(images[1]["originalFileName"], "second-original-file_name.jpg")
        self.assertEqual(images[1]["fileTitle"], "Second original file name")

    def test_ingest_reports_duplicate_physical_hashes(self) -> None:
        self.run_discovery()
        event_dir = self.media_root / "by_event" / self.event_id
        (event_dir / "image_01.png").write_bytes(b"same")
        (event_dir / "image_02.jpg").write_bytes(b"same")
        subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(INGEST),
            "--plan",
            str(self.plan),
            "--media-root",
            str(self.media_root),
            "--queue",
            str(self.output / "queue.json"),
            "--manifest",
            str(self.media_root / "external_event_image_manifest.json"),
            "--report",
            str(self.output / "ingest_report.json"),
            "--limit",
            "1",
        ], check=True)
        report = json.loads((self.output / "ingest_report.json").read_text(encoding="utf-8"))
        self.assertEqual(len(report["duplicatePhysicalHashes"]), 1)


if __name__ == "__main__":
    unittest.main()
