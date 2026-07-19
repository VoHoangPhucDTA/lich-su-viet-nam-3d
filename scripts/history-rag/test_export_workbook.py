from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("export_workbook.py")
SPEC = importlib.util.spec_from_file_location("history_rag_export_workbook", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ExportWorkbookTest(unittest.TestCase):
    def test_uri_normalization_preserves_meaningful_components(self) -> None:
        self.assertEqual(
            "https://example.com/Path?q=One#Part",
            MODULE.normalize_uri("HTTPS://EXAMPLE.COM/Path/?q=One#Part"),
        )
        self.assertEqual("local:historical_events.sql", MODULE.normalize_uri("local:historical_events.sql"))

    def test_source_dedupe_is_deterministic(self) -> None:
        first = MODULE.source_dedupe_key("wikipedia", None, "HTTPS://VI.WIKIPEDIA.ORG/wiki/Test/", None)
        second = MODULE.source_dedupe_key("wikipedia", None, "https://vi.wikipedia.org/wiki/Test", None)
        self.assertEqual(first, second)

    def test_ndjson_writer_is_canonical_utf8(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.ndjson"
            digest = MODULE.write_ndjson(path, [{"z": "Tiếng Việt", "a": 1}])
            content = path.read_bytes()
            self.assertEqual(b'{"a":1,"z":"Ti\xe1\xba\xbfng Vi\xe1\xbb\x87t"}\n', content)
            self.assertEqual(MODULE.sha256_bytes(content), digest)

    def test_manifest_package_hash_depends_on_ordered_file_hashes(self) -> None:
        hashes = {name: MODULE.sha256_text(name) for name in MODULE.OUTPUT_FILES}
        first = MODULE.package_hash(hashes)
        second = MODULE.package_hash(dict(reversed(list(hashes.items()))))
        self.assertEqual(first, second)
        self.assertEqual(64, len(first))

    def test_required_textbook_reference_fields_are_present(self) -> None:
        expected = {
            "id",
            "event_id",
            "excerpt",
            "page_start",
            "page_end",
            "page_scope",
            "page_number_basis",
            "page_mapping_status",
        }
        sample = json.loads(
            MODULE.canonical_json(
                {
                    "id": 1,
                    "event_id": "event-1",
                    "excerpt": "Nội dung",
                    "page_start": 1,
                    "page_end": 1,
                    "page_scope": "EXACT_EXCERPT_PAGE",
                    "page_number_basis": "PRINTED_BOOK_PAGE",
                    "page_mapping_status": "EXACT_PAGE_MAPPED",
                }
            )
        )
        self.assertTrue(expected.issubset(sample))


if __name__ == "__main__":
    unittest.main()
