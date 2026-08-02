from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE4_DIR = HERE.parent / "stage4_assemble"
sys.path.insert(0, str(STAGE4_DIR))
sys.path.insert(0, str(HERE))

from build_tree import build_forced_collection_nodes, build_synthetic_roots  # noqa: E402
from geo_contract import map_data_errors  # noqa: E402


def root_periods():
    return [
        {
            "id": "viet-nam-1975-den-nay",
            "title": "Việt Nam từ năm 1975 đến nay",
            "short": "Việt Nam 1975 đến nay",
            "startYear": 1975,
            "endYear": None,
        }
    ]


def assert_nationwide_without_operational_geometry(node):
    map_data = node["mapData"]
    assert map_data["geoType"] == "nationwide"
    assert map_data["marker"] is None
    assert map_data["markers"] == []
    assert map_data["provinceNames"] == []
    assert map_data["gadmRefs"] == []
    assert map_data_errors(node["id"], map_data) == []


def run_tests():
    roots = build_synthetic_roots(root_periods())
    assert len(roots) == 1
    assert_nationwide_without_operational_geometry(roots[0])
    print("[OK] synthetic root nationwide geometry contract")

    collections = build_forced_collection_nodes([], {"synthetic-collection"}, root_periods())
    assert len(collections) == 1
    assert_nationwide_without_operational_geometry(collections[0])
    print("[OK] synthetic collection nationwide geometry contract")

    print("=== ALL STAGE4B GEO CONTRACT TESTS PASS ===")


if __name__ == "__main__":
    run_tests()
