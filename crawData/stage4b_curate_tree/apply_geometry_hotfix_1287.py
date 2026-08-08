#!/usr/bin/env python3
"""Apply GEOMETRY-HOTFIX-1 to the approved geography and canonical JSONL.

The signed B4-D decision remains immutable.  The small decision artifact named
below explicitly supersedes that one event.  Guards make the operation fail if
the expected release state, upstream marker provenance, identity, order, or
non-geography content has drifted.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVENT_ID = "khang-chien-chong-quan-nguyen-1287-1288"
RELEASE_DIR = ROOT / "docs/data/releases/geo-owner-approved-2026-08-04"
DECISION_PATH = RELEASE_DIR / "geometry-hotfix-1287-decision.json"
APPROVED_PATH = RELEASE_DIR / "approved_event_geography.jsonl"
CANONICAL_PATH = ROOT / "crawData/stage4b_curate_tree/output/phase2/core_events.jsonl"
UPSTREAM_PATH = ROOT / "crawData/stage4_assemble/output/final_events.jsonl"


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def write_jsonl(path: Path, rows: list[dict[str, object]], *, compact: bool) -> None:
    separators = (",", ":") if compact else (", ", ": ")
    content = "\n".join(
        json.dumps(row, ensure_ascii=False, separators=separators) for row in rows
    ) + "\n"
    path.write_text(content, encoding="utf-8", newline="\n")


def by_id(rows: list[dict[str, object]], key: str) -> dict[str, object]:
    matches = [row for row in rows if row.get(key) == EVENT_ID]
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one {EVENT_ID} row, found {len(matches)}")
    return matches[0]


def non_geo(record: dict[str, object]) -> dict[str, object]:
    result = copy.deepcopy(record)
    result.pop("mapData", None)
    display = result.get("display")
    if isinstance(display, dict):
        display.pop("showOnMap", None)
    return result


def main() -> None:
    decision = json.loads(DECISION_PATH.read_text(encoding="utf-8"))
    if decision.get("eventId") != EVENT_ID or decision.get("approvedGeoType") != "multi_point":
        raise RuntimeError("Hotfix decision identity or geoType is invalid")

    approved_rows = read_jsonl(APPROVED_PATH)
    canonical_rows = read_jsonl(CANONICAL_PATH)
    upstream_rows = read_jsonl(UPSTREAM_PATH)
    approved = by_id(approved_rows, "eventId")
    canonical = by_id(canonical_rows, "id")
    upstream = by_id(upstream_rows, "id")

    supersedes = decision["supersedes"]
    if approved.get("approvedGeoType") not in {"no_location", "multi_point"}:
        raise RuntimeError("Approved source is not at the expected pre/post-hotfix state")
    if approved.get("approvedGeoType") == "no_location" and approved.get("approvedGeoHash") != supersedes["approvedGeoHash"]:
        raise RuntimeError("Superseded approved geography hash drifted")

    requested_markers = decision["approvedMarkers"]
    upstream_markers = upstream["mapData"]["markers"]
    if any(marker not in upstream_markers for marker in requested_markers):
        raise RuntimeError("A requested marker is absent from the upstream source record")
    if {marker["name"] for marker in requested_markers} != {"Bạch Đằng", "Cửa Lục", "Thăng Long", "Vân Đồn"}:
        raise RuntimeError("Hotfix marker set is not the reviewed four-point projection")

    before_non_geo = non_geo(canonical)
    focus_geometry = copy.deepcopy(canonical["mapData"]["focusGeometry"])
    map_data = {
        "geoType": "multi_point",
        "marker": copy.deepcopy(requested_markers[0]),
        "markers": copy.deepcopy(requested_markers),
        "provinceNames": [],
        "gadmRefs": [],
        "historicalLocations": [],
        "focusGeometry": focus_geometry,
    }
    approved_geo_hash = sha256_json(map_data)

    canonical["mapData"] = map_data
    canonical["display"]["showOnMap"] = True
    if non_geo(canonical) != before_non_geo:
        raise RuntimeError("Non-geography content changed")

    approved.update(
        approvedGeoType="multi_point",
        approvedMarkers=copy.deepcopy(requested_markers),
        approvedProvinceNames=[],
        approvedGadmRefs=[],
        showOnMap=True,
        decision="SET_MULTI_POINT",
        status="owner_approved_correction",
        reviewer="Project owner — GEOMETRY-HOTFIX-1",
        reviewDate=decision["reviewDate"],
        decisionOrigin="geometry_hotfix_project_evidence",
        historicalVerification=False,
        reviewerNote="GEOMETRY-HOTFIX-1 supersedes the signed fail-closed decision for this event; see geometry-hotfix-1287-decision.json.",
        approvedGeoHash=approved_geo_hash,
    )

    write_jsonl(APPROVED_PATH, approved_rows, compact=False)
    write_jsonl(CANONICAL_PATH, canonical_rows, compact=True)
    print(f"1287_GEOMETRY_DECISION=MULTI_POINT approvedGeoHash={approved_geo_hash}")


if __name__ == "__main__":
    main()
