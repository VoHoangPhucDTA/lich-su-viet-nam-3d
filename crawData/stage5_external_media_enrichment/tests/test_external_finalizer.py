from __future__ import annotations

import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "finalize_external_event_media.py"
spec = importlib.util.spec_from_file_location("external_finalizer", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
assert spec.loader is not None
spec.loader.exec_module(mod)


class ExternalFinalizerTests(unittest.TestCase):
    def fixture(self, root: Path, verification_url: str):
        package_root = root / "external_event_images"
        assets = package_root / "assets"
        assets.mkdir(parents=True)
        images = []
        for slot, payload in [(1, b"image-a"), (2, b"image-b")]:
            digest = hashlib.sha256(payload).hexdigest()
            asset = assets / f"{digest}.jpg"
            asset.write_bytes(payload)
            images.append(
                {
                    "slot": slot,
                    "isThumbnail": slot == 1,
                    "sortOrder": slot,
                    "sha256": digest,
                    "extension": ".jpg",
                    "canonicalAsset": f"external_event_images/assets/{asset.name}",
                    "fileTitle": f"Image {slot}",
                    "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
                    "downloadUrl": "https://upload.wikimedia.org/example.jpg",
                    "license": "CC BY-SA 4.0",
                    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                    "preferredVerificationDomains": ["baotanglichsu.vn"],
                    "relationType": "direct",
                }
            )
        manifest = {"events": [{"eventId": "event-1", "title": "Event One", "images": images}]}
        decisions = {
            "event-1": {
                "status": "approved",
                "images": [
                    {"approved": True, "historicalVerificationUrl": verification_url, "relationType": "direct"},
                    {"approved": True, "historicalVerificationUrl": verification_url, "relationType": "strong_contextual"},
                ],
            }
        }
        return package_root, manifest, decisions

    def test_two_verified_images_finalize(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package_root, manifest, decisions = self.fixture(root, "https://baotanglichsu.vn/vi/Articles/example")
            external, combined, external_candidates, combined_candidates, report = mod.build_outputs(
                manifest, decisions, {"version": 1, "mappings": [], "rejected": []}, [], package_root
            )
            self.assertEqual([], report["errors"])
            self.assertEqual(1, report["approvedExternalEvents"])
            self.assertEqual(2, report["externalRelationships"])
            self.assertEqual(2, report["historicallyVerifiedRelationships"])
            self.assertEqual(2, len(external["mappings"]))
            self.assertEqual(2, len(external_candidates))
            self.assertEqual(2, len(combined["mappings"]))
            self.assertEqual(2, len(combined_candidates))

    def test_untrusted_verification_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package_root, manifest, decisions = self.fixture(root, "https://example.com/not-authoritative")
            _, _, _, _, report = mod.build_outputs(
                manifest, decisions, {"version": 1, "mappings": [], "rejected": []}, [], package_root
            )
            self.assertTrue(any("outside trusted domains" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
