from __future__ import annotations

import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_final_events import build_map_data, province_from_text  # noqa: E402
from geo_contract import (  # noqa: E402
    GeographyContractError,
    geojson_position_to_marker,
    infer_operational_geography,
    map_data_errors,
    marker_to_geojson_position,
    normalize_geo_text,
)
from prepare_indexes import (  # noqa: E402
    ProvinceAliasError,
    build_gadm_index,
    build_province_lookups,
    iter_coords,
)
from stage4_common import CONFIG, read_json  # noqa: E402


def expect_error(label, error_type, action, message_part: str | None = None):
    try:
        action()
    except error_type as exc:
        if message_part and message_part not in str(exc):
            raise AssertionError(f"{label}: expected {message_part!r} in {exc!r}")
        print(f"[OK] {label}: rejected ({exc})")
        return
    raise AssertionError(f"{label}: expected {error_type.__name__}")


def fixture_indexes():
    provinces = {
        "HaTinh": {
            "provinceName": "Hà Tĩnh",
            "gadmName": "HaTinh",
            "gadmRef": "VNM.29_1",
            "center": {"lat": 18.3, "lng": 105.8},
        },
        "KienGiang": {
            "provinceName": "Kiên Giang",
            "gadmName": "KienGiang",
            "gadmRef": "VNM.33_1",
            "center": {"lat": 10.0, "lng": 105.1},
        },
        "QuangNinh": {
            "provinceName": "Quảng Ninh",
            "gadmName": "QuangNinh",
            "gadmRef": "VNM.44_1",
            "center": {"lat": 21.1, "lng": 107.3},
        },
    }
    entries = [
        ("Hà Tĩnh", "HaTinh", "fixture"),
        ("Kiên Giang", "KienGiang", "fixture"),
        ("Quảng", "HaTinh", "fixture shorter phrase"),
        ("Quảng Ninh", "QuangNinh", "fixture longest phrase"),
    ]
    exact, phrase = build_province_lookups(entries)
    locations = {
        "Hà Tiên, Kiên Giang": {
            "modern_name": "Thành phố Hà Tiên, tỉnh Kiên Giang",
            "lat": 10.3833,
            "lng": 104.4833,
            "confidence": "high",
            "country": "vietnam",
        },
        "Bãi Cháy, Hạ Long, Quảng Ninh": {
            "modern_name": "Bãi Cháy, thành phố Hạ Long, tỉnh Quảng Ninh",
            "lat": 20.95,
            "lng": 107.05,
            "confidence": "high",
            "country": "vietnam",
        },
        "Điểm A": {
            "modern_name": "Điểm A, tỉnh Quảng Ninh",
            "lat": 21.0,
            "lng": 107.0,
            "confidence": "high",
            "country": "vietnam",
        },
        "Điểm B": {
            "modern_name": "Điểm B, tỉnh Quảng Ninh",
            "lat": 21.0,
            "lng": 107.0,
            "confidence": "high",
            "country": "vietnam",
        },
        "Điểm C": {
            "modern_name": "Điểm C, tỉnh Quảng Ninh",
            "lat": 21.2,
            "lng": 107.2,
            "confidence": "high",
            "country": "vietnam",
        },
        "Cửu Long": {
            "modern_name": "Đồng bằng sông Cửu Long, Việt Nam",
            "lat": 10.0,
            "lng": 105.7,
            "confidence": "low",
            "country": "vietnam",
        },
    }
    location_lookup = {
        normalize_geo_text(name, strip_admin_prefix=False): name for name in locations
    }
    return {
        "gadm": {
            "provinces": provinces,
            "exactLookup": exact,
            "phraseLookup": phrase,
            "lookup": exact,
        },
        "locations": {"locations": locations, "lookup": location_lookup},
    }


def row(event_id: str, places: list[str]):
    return {
        "suggestedId": event_id,
        "classification": {"region": "vietnam"},
        "rawPlaceMentions": places,
    }


def build(event_id: str, places: list[str], overrides=None):
    return build_map_data(
        row(event_id, places),
        fixture_indexes(),
        overrides or {},
        {},
        set(),
    )[0]


def run_tests():
    # 1. Geography normalization keeps the proper-name token Tĩnh.
    assert normalize_geo_text("Hà Tĩnh") == "ha tinh"
    assert normalize_geo_text("Tỉnh Hà Tĩnh") == "ha tinh"
    assert normalize_geo_text("Hà Tĩnh") != "ha"
    actual_gadm = build_gadm_index()
    assert actual_gadm["exactLookup"]["ha tinh"] == "HàTĩnh"
    assert "ha" not in actual_gadm["phraseLookup"]
    assert actual_gadm["exactLookup"]["hue"] == "ThừaThiênHuế"
    print("[OK] Hà Tĩnh normalization")

    indexes = fixture_indexes()

    # 2-3. Known false positives resolve to their actual province context.
    assert province_from_text("Hà Tiên, Kiên Giang", indexes) == "KienGiang"
    assert province_from_text("Hà Tiên, Kiên Giang", indexes) != "HaTinh"
    print("[OK] Hà Tiên does not match Hà Tĩnh")
    assert province_from_text("Bãi Cháy, Hạ Long, Quảng Ninh", indexes) == "QuangNinh"
    print("[OK] Bãi Cháy/Hạ Long matches Quảng Ninh")

    # 4-5. Exact phrases win, and phrase matching is longest-first.
    assert province_from_text("Quảng Ninh", indexes) == "QuangNinh"
    assert province_from_text("Khu vực Quảng Ninh ven biển", indexes) == "QuangNinh"
    print("[OK] exact and longest whole-phrase matching")

    # 6. Very short/ambiguous aliases fail at index construction.
    expect_error(
        "ambiguous alias ha",
        ProvinceAliasError,
        lambda: build_province_lookups([("ha", "HaTinh", "fixture")]),
        "too short or ambiguous",
    )

    # Equal-priority matches for different provinces fail closed.
    ambiguous = copy.deepcopy(indexes)
    ambiguous["gadm"]["phraseLookup"] = {
        "north bay": "HaTinh",
        "south sea": "KienGiang",
    }
    expect_error(
        "equal-rank province ambiguity",
        GeographyContractError,
        lambda: province_from_text("north bay and south sea", ambiguous),
        "ambiguous province phrase",
    )

    # 7. Contextual Cửu Long override excludes the false Vietnam marker.
    real_overrides = read_json(CONFIG / "manual_geotype_override.json", {})
    cuu_long = build_map_data(
        row(
            "hoi-nghi-thanh-lap-dang-cong-san-viet-nam",
            ["Đông Dương", "Việt Nam", "Trung Quốc", "Hương Cảng (Trung Quốc)", "Cửu Long", "Hồng Công"],
        ),
        indexes,
        real_overrides,
        {},
        set(),
    )[0]
    assert cuu_long["geoType"] == "no_location"
    assert cuu_long["marker"] is None and cuu_long["markers"] == []
    assert "Cửu Long" in cuu_long["historicalLocations"]
    assert "Hương Cảng (Trung Quốc)" in cuu_long["historicalLocations"]
    print("[OK] contextual Cửu Long override")

    # 8 and 12. Parent province is context, never an automatic polygon.
    one_marker = build("ha-tien-fixture", ["Hà Tiên, Kiên Giang"])
    assert one_marker["geoType"] == "point"
    assert one_marker["provinceNames"] == [] and one_marker["gadmRefs"] == []
    print("[OK] marker parent province does not create mixed")

    # 9. Duplicate coordinates collapse to one marker; the alternate name remains context.
    duplicate = build("duplicate-marker-fixture", ["Điểm A", "Điểm B"])
    assert duplicate["geoType"] == "point"
    assert duplicate["marker"]["name"] == "Điểm A"
    assert "Điểm B" in duplicate["historicalLocations"]
    print("[OK] duplicate coordinates do not create multi_point")

    # 10. Distinct coordinates produce multi_point and preserve the primary marker contract.
    multi_point = build("multi-point-fixture", ["Điểm A", "Điểm C"])
    assert multi_point["geoType"] == "multi_point"
    assert len(multi_point["markers"]) == 2
    assert multi_point["marker"] == multi_point["markers"][0]
    print("[OK] distinct coordinates create multi_point")

    # 11. A single explicit region is still canonical multi_polygon.
    polygon = build("region-fixture", ["Quảng Ninh"])
    assert polygon["geoType"] == "multi_polygon"
    assert polygon["marker"] is None and len(polygon["gadmRefs"]) == 1
    print("[OK] one explicit region creates multi_polygon")

    # 13. Marker plus an independently mentioned region creates mixed.
    mixed = build("mixed-fixture", ["Điểm A", "Kiên Giang"])
    assert mixed["geoType"] == "mixed"
    assert mixed["marker"] == mixed["markers"][0]
    assert mixed["provinceNames"] == ["Kiên Giang"]
    print("[OK] independent point and region create mixed")

    # 14. Nationwide clears every operational target but retains context.
    nationwide = build("nationwide-fixture", ["Việt Nam", "Điểm A", "Quảng Ninh"])
    assert nationwide["geoType"] == "nationwide"
    assert nationwide["marker"] is None and nationwide["markers"] == []
    assert nationwide["provinceNames"] == [] and nationwide["gadmRefs"] == []
    assert set(["Việt Nam", "Điểm A", "Quảng Ninh"]).issubset(nationwide["historicalLocations"])
    print("[OK] nationwide clears operational geometry")

    # 15. no_location has no operational geometry.
    no_location = build("no-location-fixture", ["Không xác định"])
    assert no_location["geoType"] == "no_location"
    assert no_location["marker"] is None and no_location["provinceNames"] == []
    print("[OK] no_location has no operational geometry")

    # 16. focusGeometry is not an input to the classifier.
    first = infer_operational_geography(
        nationwide_signal=False,
        markers=[{"name": "A", "lat": 10.0, "lng": 106.0}],
        region_targets=[],
    )
    second = infer_operational_geography(
        nationwide_signal=False,
        markers=[{"name": "A", "lat": 10.0, "lng": 106.0}],
        region_targets=[],
    )
    assert first["geoType"] == second["geoType"] == "point"
    print("[OK] classifier is independent of focusGeometry")

    # 17. GeoJSON [lng, lat] and application {lat, lng} stay ordered.
    marker = geojson_position_to_marker([105.7, 10.0])
    assert marker == {"lat": 10.0, "lng": 105.7}
    assert marker_to_geojson_position(marker) == [105.7, 10.0]
    assert iter_coords({"coordinates": [[[105.7, 10.0], [106.0, 11.0]]]})[0] == marker
    print("[OK] GeoJSON/application coordinate boundary")

    # 18. Invalid/legacy geoType never falls back to no_location.
    expect_error(
        "invalid forced geoType",
        GeographyContractError,
        lambda: infer_operational_geography(
            nationwide_signal=False,
            markers=[],
            region_targets=[],
            forced_geo_type="polygon",
        ),
        "invalid forced geoType",
    )

    # 20. Validator reports event ID, field, reason and cardinality mismatch.
    invalid = copy.deepcopy(polygon)
    invalid["gadmRefs"] = []
    invalid_before_validation = copy.deepcopy(invalid)
    errors = map_data_errors("cardinality-fixture", invalid)
    assert invalid == invalid_before_validation
    assert any("cardinality-fixture: mapData.gadmRefs: cardinality" in error for error in errors)
    print("[OK] provinceNames/gadmRefs cardinality validation")

    invalid_nationwide = copy.deepcopy(nationwide)
    invalid_nationwide["marker"] = {"name": "bad", "lat": 91.0, "lng": 106.0}
    nationwide_errors = map_data_errors("invalid-nationwide", invalid_nationwide)
    assert any("lat: outside [-90, 90]" in error for error in nationwide_errors)
    assert any("must not carry operational geometry" in error for error in nationwide_errors)

    invalid_mixed = copy.deepcopy(mixed)
    invalid_mixed["gadmRefs"].append(invalid_mixed["gadmRefs"][0])
    invalid_mixed["provinceNames"].append(invalid_mixed["provinceNames"][0])
    invalid_mixed["marker"] = {"name": "not-primary", "lat": 10.0, "lng": 106.0}
    mixed_errors = map_data_errors("invalid-mixed", invalid_mixed)
    assert any("duplicate operational target" in error for error in mixed_errors)
    assert any("must equal markers[0]" in error for error in mixed_errors)
    print("[OK] validator rejects coordinate, geometry, duplicate GADM, and primary-marker violations")

    print("=== ALL GEO CONTRACT REGRESSION TESTS PASS ===")


if __name__ == "__main__":
    run_tests()
