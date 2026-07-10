#!/usr/bin/env python3
"""Tests for external media blocker/duplicate decision generation."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
RESOLVE = SCRIPT_DIR / "resolve_external_media_review_gates.py"


class ExternalGateResolutionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.manifest = self.root / "manifest.json"
        self.report = self.root / "ingest_report.json"
        self.gates = self.root / "gates.json"
        self.decisions = self.root / "decisions.json"
        self.out = self.root / "out.json"
        self.out_csv = self.root / "out.csv"
        self.write_json(self.manifest, {
            "version": 1,
            "events": [
                self.event("hard-blocked", ["hard-a.jpg", "hard-b.jpg"], ["ha", "hb"]),
                self.event("duplicate-one", ["dup-a.jpg", "unique-a.jpg"], ["same", "u1"]),
                self.event("duplicate-two", ["dup-b.jpg", "unique-b.jpg"], ["same", "u2"]),
                self.event("missing-only", [], []),
            ],
        })
        self.write_json(self.report, {
            "version": 1,
            "missing": [{"eventId": "missing-only", "slot": 1}],
            "duplicatePhysicalHashes": {
                "same": [
                    str(self.root / "duplicate-one" / "dup-a.jpg"),
                    str(self.root / "duplicate-two" / "dup-b.jpg"),
                ]
            },
        })
        self.write_json(self.gates, {
            "version": 1,
            "gates": [
                {
                    "eventId": "hard-blocked",
                    "status": "blocked_data_issue",
                    "category": "data_issue",
                    "requiredAction": "Fix data first.",
                }
            ],
        })

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_json(self, path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def event(self, event_id: str, filenames: list[str], hashes: list[str]) -> dict[str, object]:
        images = []
        for idx, (name, digest) in enumerate(zip(filenames, hashes), start=1):
            images.append({
                "slot": idx,
                "sha256": digest,
                "localPath": str(self.root / event_id / name),
                "historicalVerificationUrl": "https://baotanglichsu.vn/example",
                "relationType": "strong_contextual",
            })
        return {"eventId": event_id, "title": event_id, "images": images}

    def run_resolve(self, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run([
            sys.executable,
            "-X",
            "utf8",
            str(RESOLVE),
            "--manifest",
            str(self.manifest),
            "--ingest-report",
            str(self.report),
            "--gates",
            str(self.gates),
            "--decisions",
            str(self.decisions),
            "--report-json",
            str(self.out),
            "--report-csv",
            str(self.out_csv),
        ], check=check, text=True, capture_output=True)

    def test_marks_only_blockers_and_reports_duplicates_without_touching_missing(self) -> None:
        self.write_json(self.decisions, {
            "version": 1,
            "decisions": {
                "duplicate-one": {
                    "status": "needs_replacement",
                    "reason": "duplicate physical image hash requires replacement or explicit manual justification",
                }
            },
        })
        self.run_resolve()
        value = json.loads(self.decisions.read_text(encoding="utf-8"))
        decisions = value["decisions"]
        self.assertEqual(decisions["hard-blocked"]["status"], "needs_replacement")
        self.assertNotIn("duplicate-one", decisions)
        self.assertNotIn("duplicate-two", decisions)
        self.assertNotIn("missing-only", decisions)
        self.assertFalse(any(img["approved"] for row in decisions.values() for img in row["images"]))
        report = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(report["automaticApprovals"], 0)
        self.assertEqual(report["hardBlockerEvents"], 1)
        self.assertEqual(report["duplicateAffectedEvents"], 2)
        self.assertEqual(report["duplicateEventsMarkedNeedsReplacement"], 0)
        self.assertEqual(report["staleDuplicateDecisionsCleared"], 1)
        self.assertEqual(report["eventsMarkedNeedsReplacement"], 1)
        self.assertEqual(report["missingEventsLeftUntouched"], 1)

    def test_refuses_to_override_approved_decision(self) -> None:
        self.write_json(self.decisions, {"version": 1, "decisions": {"hard-blocked": {"status": "approved"}}})
        result = self.run_resolve(check=False)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
