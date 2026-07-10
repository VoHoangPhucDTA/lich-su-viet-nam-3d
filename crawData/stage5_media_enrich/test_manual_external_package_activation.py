#!/usr/bin/env python3
"""Synthetic tests for activating stabilized manual external-image packages."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ACTIVATE = SCRIPT_DIR / "activate_manual_external_package.py"


class ManualExternalPackageActivationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.package = self.root / "package.zip"
        self.plan = self.root / "plan.json"
        self.media_root = self.root / "external_event_images"
        self.output = self.root / "output"
        self.write_json(self.plan, {
            "version": 1,
            "events": [
                {"eventId": "event-one", "title": "Event One"},
                {"eventId": "event-two", "title": "Event Two"},
            ],
        })
        self.create_package()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def queue_row(self, index: int, event_id: str, slot: int, status: str = "awaiting_manual_download") -> dict[str, object]:
        return {
            "eventIndex": index,
            "eventId": event_id,
            "title": f"Title {event_id}",
            "displayDate": "1945",
            "eventLevel": "event",
            "sourceFamily": "modern",
            "preferredVerificationDomains": "baotanglichsu.vn|nhandan.vn",
            "folder": f"by_event/{event_id}",
            "slot": slot,
            "imageTitle": f"Image {slot}",
            "assetPageUrl": f"https://commons.wikimedia.org/wiki/File:{event_id}_{slot}.jpg",
            "assetFileUrl": "",
            "previewUrl": "",
            "sourceDomain": "commons.wikimedia.org",
            "license": "check on linked image file page before reuse",
            "historicalVerificationUrl": "https://baotanglichsu.vn/example",
            "relationType": "strong_contextual",
            "confidence": "medium",
            "historicalReason": "Synthetic reason.",
            "suggestedFilename": f"image_{slot:02d}.<đúng-đuôi-file>",
            "downloadStatus": status,
            "reviewerNotes": "",
        }

    def create_package(self, include_bad_event: bool = False) -> None:
        queue = [
            self.queue_row(0, "event-one", 1),
            self.queue_row(0, "event-one", 2),
            self.queue_row(1, "event-two", 1, "blocked_data_issue"),
            self.queue_row(1, "event-two", 2, "blocked_data_issue"),
        ]
        if include_bad_event:
            queue.append(self.queue_row(2, "event-missing", 1))
            queue.append(self.queue_row(2, "event-missing", 2))
        gates = [
            {
                "eventIndex": 1,
                "eventId": "event-two",
                "title": "Event Two",
                "status": "blocked_data_issue",
                "severity": "P0",
                "category": "data_issue",
                "problem": "Synthetic blocker.",
                "requiredAction": "Fix event before approving.",
                "resolvedInV2": False,
            }
        ]
        summary = {
            "schemaVersion": 2,
            "validationPassed": True,
            "events": 3 if include_bad_event else 2,
            "candidates": len(queue),
            "batches": 1,
            "concreteAssetFiles": 0,
            "importReady": False,
        }
        with zipfile.ZipFile(self.package, "w") as archive:
            base = "stage5_manual_external_images_stabilized_v2/"
            archive.writestr(base + "MASTER_QUEUE_NORMALIZED.json", json.dumps(queue, ensure_ascii=False))
            archive.writestr(base + "REVIEW_GATES_ALL.json", json.dumps(gates, ensure_ascii=False))
            archive.writestr(base + "STABILIZATION_SUMMARY.json", json.dumps(summary, ensure_ascii=False))
            archive.writestr(base + "VALIDATION_REPORT.txt", "RESULT: PASS")

    def run_activate(self, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(ACTIVATE),
            "--package",
            str(self.package),
            "--plan",
            str(self.plan),
            "--media-root",
            str(self.media_root),
            "--queue-json",
            str(self.output / "queue.json"),
            "--queue-csv",
            str(self.output / "queue.csv"),
            "--gates-json",
            str(self.output / "gates.json"),
            "--summary-json",
            str(self.output / "summary.json"),
            "--guide",
            str(self.output / "guide.md"),
        ], check=check, text=True, capture_output=True)

    def test_activation_writes_queue_and_event_folders_without_assets(self) -> None:
        self.run_activate()
        queue = json.loads((self.output / "queue.json").read_text(encoding="utf-8"))
        self.assertEqual(len(queue["rows"]), 4)
        self.assertEqual(queue["rows"][0]["role"], "thumbnail")
        self.assertEqual(queue["rows"][1]["role"], "gallery")
        self.assertFalse((self.media_root / "assets").exists())
        self.assertTrue((self.media_root / "by_event" / "event-one" / "DOWNLOAD_INSTRUCTIONS.md").exists())
        self.assertTrue((self.media_root / "by_event" / "event-two" / "sources.json").exists())
        summary = json.loads((self.output / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["eventCount"], 2)
        self.assertEqual(summary["candidateSlotCount"], 4)
        self.assertEqual(summary["binaryDownloads"], 0)
        self.assertEqual(summary["blockedEventCount"], 1)
        self.assertFalse(summary["importReady"])

    def test_activation_rejects_package_not_matching_plan(self) -> None:
        self.create_package(include_bad_event=True)
        result = self.run_activate(check=False)
        self.assertNotEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["validationErrors"])
        self.assertFalse((self.output / "queue.json").exists())


if __name__ == "__main__":
    unittest.main()
