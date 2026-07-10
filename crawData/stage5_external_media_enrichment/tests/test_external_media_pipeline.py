from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "publish_approved_media_v2.py"
spec = importlib.util.spec_from_file_location("publisher_v2", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
assert spec.loader is not None
spec.loader.exec_module(mod)


class PublisherV2Tests(unittest.TestCase):
    def test_thumbnail_and_gallery_item(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "src").mkdir()
            img1 = root / "src" / "a.png"
            img2 = root / "src" / "b.png"
            img1.write_bytes(b"image-a")
            img2.write_bytes(b"image-b")
            h1 = mod.sha256_file(img1)
            h2 = mod.sha256_file(img2)
            candidates = {
                "src/a.png": {"sourceImage": "src/a.png", "lessonId": "external-web", "contentHash": h1, "extension": ".png", "caption": "A"},
                "src/b.png": {"sourceImage": "src/b.png", "lessonId": "external-web", "contentHash": h2, "extension": ".png", "caption": "B"},
            }
            approved = {"version": 1, "mappings": [
                {"sourceImage": "src/a.png", "lessonId": "external-web", "status": "approved", "targets": [{"eventId": "event-1", "isThumbnail": True, "sortOrder": 1}]},
                {"sourceImage": "src/b.png", "lessonId": "external-web", "status": "approved", "targets": [{"eventId": "event-1", "isThumbnail": False, "sortOrder": 2}]},
            ]}
            events = {"event-1": {"id": "event-1", "media": {"thumbnail": "", "items": []}}}
            rels = mod.validate_and_plan(approved, candidates, events, root, root / "public")
            self.assertEqual(2, len(rels))
            enriched, changed = mod.enrich_events(list(events.values()), rels)
            media = enriched[0]["media"]
            self.assertEqual(rels[0].browser_url if rels[0].media_ownership == "thumbnail" else rels[1].browser_url, media["thumbnail"])
            self.assertEqual(1, len(media["items"]))
            self.assertEqual(2, media["items"][0]["sortOrder"])
            self.assertEqual(["event-1"], changed)

    def test_duplicate_sort_order_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "src").mkdir()
            for name in ["a.png", "b.png"]:
                (root / "src" / name).write_bytes(name.encode())
            candidates = {}
            mappings = []
            for name in ["a.png", "b.png"]:
                source = f"src/{name}"
                candidates[source] = {"sourceImage": source, "lessonId": "external-web", "contentHash": mod.sha256_file(root/source), "extension": ".png", "caption": name}
                mappings.append({"sourceImage": source, "lessonId": "external-web", "status": "approved", "targets": [{"eventId": "event-1", "isThumbnail": name=="a.png", "sortOrder": 1}]})
            with self.assertRaises(ValueError):
                mod.validate_and_plan({"version":1,"mappings":mappings}, candidates, {"event-1":{"id":"event-1"}}, root, root/"public")


if __name__ == "__main__":
    unittest.main()
