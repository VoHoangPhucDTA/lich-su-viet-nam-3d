#!/usr/bin/env python3
"""Focused tests for the Stage5 manual review tool.

The fixtures are synthetic and isolated; these tests do not review or approve
real Stage5 images.
"""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import urlopen

from manual_review_tool import (
    STATUS_APPROVED,
    STATUS_DEFERRED,
    STATUS_NO_SUITABLE,
    ManualReviewState,
    ReviewHandler,
)


class ManualReviewToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.output = self.root / "crawData/stage5_media_enrich/output"
        self.config = self.root / "crawData/stage5_media_enrich/config"
        self.images = self.root / "crawData/stage1_crawl/images/grade_12/900"
        self.core_path = self.root / "crawData/stage4b_curate_tree/output/phase2/core_events.jsonl"
        self.candidates_path = self.output / "image_event_candidates.jsonl"
        self.approved_path = self.config / "approved_event_image_mappings.json"
        self.decisions_path = self.output / "manual_review_decisions.json"
        self.export_path = self.output / "proposed_approved_mappings.json"
        self.output.mkdir(parents=True)
        self.config.mkdir(parents=True)
        self.images.mkdir(parents=True)
        self.core_path.parent.mkdir(parents=True)

        for name in ("img_01.png", "img_02.png", "img_03.png", "img_04.png", "img_dup.png", "img_approved.png"):
            (self.images / name).write_bytes(f"bytes-{name}".encode("utf-8"))

        self.events = [
            self.event("event-a", "Hồ Chí Minh đọc Tuyên ngôn Độc lập", "Ngày 2-9-1945", "900", "atomic"),
            self.event("event-b", "Đại hội Quốc dân Tân Trào", "1945", "900", "atomic"),
            self.event("event-c", "Cầu Long Biên", "1898-1902", "901", "atomic"),
            self.event("event-d", "Bối cảnh chung", "Thế kỉ XX", "902", "collection"),
            self.event("event-e", "Tân Trào chuẩn bị Tổng khởi nghĩa", "1945", "900", "atomic"),
            self.event("event-f", "Quảng trường Ba Đình năm 1945", "1945", "900", "atomic"),
            self.event("event-g", "Chính phủ lâm thời ra mắt", "1945", "900", "atomic"),
            self.event("event-h", "Long Biên Hà Nội trong lịch sử", "1902", "903", "atomic"),
            self.event("event-z", "Sự kiện sai niên đại 1200", "1200", "900", "atomic"),
        ]
        self.write_jsonl(self.core_path, self.events)
        self.candidates = [
            self.candidate("single", "img_01.png", "Hồ Chí Minh đọc Tuyên ngôn Độc lập 1945", ["event-a"], "single_candidate", "hash-single"),
            self.candidate("ambiguous", "img_02.png", "Đại hội Quốc dân ở Tân Trào năm 1945", ["event-a", "event-b"], "ambiguous", "hash-amb"),
            self.candidate("unresolved", "img_03.png", "Cầu Long Biên", [], "unresolved", "hash-unresolved"),
            self.candidate("dup-a", "img_04.png", "Duplicate first", ["event-a"], "single_candidate", "hash-dup"),
            self.candidate("dup-b", "img_dup.png", "Duplicate second", ["event-b"], "single_candidate", "hash-dup"),
            self.candidate("approved-existing", "img_approved.png", "Already approved", ["event-c"], "single_candidate", "hash-approved"),
            self.candidate("invalid", "missing.png", "Invalid", [], "invalid", "hash-invalid"),
        ]
        self.write_jsonl(self.candidates_path, self.candidates)
        self.write_json(
            self.approved_path,
            {
                "version": 1,
                "mappings": [
                    {
                        "sourceImage": "crawData/stage1_crawl/images/grade_12/900/img_approved.png",
                        "lessonId": "900",
                        "altText": "",
                        "status": "approved",
                        "targets": [{"eventId": "event-c", "isThumbnail": True, "sortOrder": 1}],
                    }
                ],
            },
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def state(self) -> ManualReviewState:
        return ManualReviewState(
            repo_root=self.root,
            candidates_path=self.candidates_path,
            approved_path=self.approved_path,
            core_events_path=self.core_path,
            decisions_path=self.decisions_path,
            export_path=self.export_path,
        )

    @staticmethod
    def event(event_id: str, title: str, display_date: str, lesson_id: str, level: str) -> dict[str, object]:
        return {
            "id": event_id,
            "slug": event_id,
            "eventLevel": level,
            "titles": {"primary": title, "short": title, "alternatives": []},
            "chronology": {"start": {"year": None}, "end": {"year": None}, "displayDate": display_date},
            "summary": {"homepageSummary": title, "cardSummary": title},
            "textbookContent": {"textbookRefs": [{"lessonId": lesson_id}], "keyFacts": []},
            "mapData": {"historicalLocations": []},
        }

    @staticmethod
    def candidate(
        image_id: str,
        image_name: str,
        caption: str,
        event_ids: list[str],
        status: str,
        content_hash: str,
    ) -> dict[str, object]:
        return {
            "imageId": image_id,
            "grade": 12,
            "lessonId": "900",
            "lessonTitle": "Synthetic lesson",
            "imageOrder": len(image_id),
            "sourceImage": f"crawData/stage1_crawl/images/grade_12/900/{image_name}",
            "caption": caption,
            "alt": "",
            "extension": ".png",
            "contentHash": content_hash,
            "candidateEvents": [
                {"eventId": event_id, "title": event_id, "reason": "lesson_id_match"} for event_id in event_ids
            ],
            "candidateEventCount": len(event_ids),
            "mappingStatus": status,
            "validationIssues": [],
        }

    @staticmethod
    def write_json(path: Path, payload: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
            encoding="utf-8",
        )

    def test_single_candidate_approve_and_export(self) -> None:
        state = self.state()
        suggestions = state.rank_suggestions(self.candidates[0])
        top = suggestions[0]
        self.assertEqual(top.event_id, "event-a")
        self.assertEqual(top.origin, "ORIGINAL CANDIDATE")
        self.assertGreater(len(suggestions), 1)
        state.decide("single", STATUS_APPROVED, "event-a", "single candidate accepted")
        export = state.export_proposed()
        self.assertEqual(export["mappingCount"], 1)
        payload = json.loads(self.export_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["mappings"][0]["targets"][0]["eventId"], "event-a")

    def test_ambiguous_selection_defer_no_suitable_undo_and_resume(self) -> None:
        state = self.state()
        suggestions = state.rank_suggestions(self.candidates[1])
        self.assertEqual(suggestions[0].event_id, "event-b")
        self.assertEqual([item.origin for item in suggestions[:2]], ["ORIGINAL CANDIDATE", "ORIGINAL CANDIDATE"])
        self.assertIn("SAME LESSON", {item.origin for item in suggestions})
        state.decide("ambiguous", STATUS_APPROVED, "event-b", "ranked ambiguous selection")
        state.decide("unresolved", STATUS_DEFERRED)
        state.decide("dup-a", STATUS_NO_SUITABLE)

        resumed = self.state()
        self.assertEqual(resumed.progress()["approved"], 1)
        self.assertEqual(resumed.progress()["deferred"], 1)
        self.assertEqual(resumed.progress()["noSuitableEvent"], 1)
        resumed.undo()
        self.assertNotIn("dup-a", resumed.decisions["decisions"])

    def test_unresolved_search_across_all_events(self) -> None:
        state = self.state()
        results = state.search("unresolved", "Cầu Long Biên")
        self.assertEqual(results[0]["event_id"], "event-c")

    def test_unresolved_receives_automatic_global_suggestions(self) -> None:
        state = self.state()
        suggestions = state.rank_suggestions(self.candidates[2])
        self.assertIn("event-c", [item.event_id for item in suggestions])
        self.assertIn("EXPANDED SEARCH", {item.origin for item in suggestions})

    def test_backfill_deduplication_contradiction_filtering_maximum_and_no_auto_approval(self) -> None:
        state = self.state()
        suggestions = state.rank_suggestions(self.candidates[1])
        event_ids = [item.event_id for item in suggestions]
        self.assertLessEqual(len(suggestions), 5)
        self.assertEqual(len(event_ids), len(set(event_ids)))
        self.assertNotIn("event-z", event_ids)
        self.assertEqual(state.progress()["approved"], 0)
        self.assertEqual(state.decisions["decisions"], {})

    def test_duplicate_and_already_approved_exclusion(self) -> None:
        state = self.state()
        queue_ids = [candidate["imageId"] for candidate in state.review_queue()]
        self.assertIn("dup-a", queue_ids)
        self.assertNotIn("dup-b", queue_ids)
        self.assertNotIn("approved-existing", queue_ids)
        self.assertNotIn("invalid", queue_ids)

        state.decide("dup-a", STATUS_DEFERRED)
        resumed_ids = [candidate["imageId"] for candidate in self.state().review_queue()]
        self.assertNotIn("dup-a", resumed_ids)
        self.assertNotIn("dup-b", resumed_ids)

    def test_image_route_serves_encoded_image_id_with_safe_content_type_and_bytes(self) -> None:
        state = self.state()
        ReviewHandler.state = state
        server = ThreadingHTTPServer(("127.0.0.1", 0), ReviewHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            encoded_id = quote(quote("single", safe=""), safe="")
            url = f"http://127.0.0.1:{server.server_port}/image/{encoded_id}"
            with urlopen(url, timeout=5) as response:
                body = response.read()
                content_type = response.headers.get("content-type", "")
            self.assertEqual(body, (self.images / "img_01.png").read_bytes())
            self.assertIn("image/png", content_type)
        finally:
            server.shutdown()
            server.server_close()

    def test_image_route_rejects_missing_and_path_traversal_sources(self) -> None:
        state = self.state()
        ReviewHandler.state = state
        server = ThreadingHTTPServer(("127.0.0.1", 0), ReviewHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with self.assertRaises(HTTPError) as missing:
                urlopen(f"http://127.0.0.1:{server.server_port}/image/does-not-exist", timeout=5)
            self.assertEqual(missing.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()

        outside = self.root / "crawData/stage1_crawl/not-images.png"
        outside.parent.mkdir(parents=True, exist_ok=True)
        outside.write_bytes(b"secret")
        self.candidates.append(
            {
                **self.candidate("traversal", "../not-images.png", "Traversal", ["event-a"], "single_candidate", "hash-traversal"),
                "sourceImage": "crawData/stage1_crawl/not-images.png",
            }
        )
        self.write_jsonl(self.candidates_path, self.candidates)
        traversal_state = self.state()
        with self.assertRaises(ValueError):
            traversal_state.image_path_for("traversal")


if __name__ == "__main__":
    unittest.main()
