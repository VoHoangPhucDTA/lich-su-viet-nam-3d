from __future__ import annotations

from stage4_common import centroid


def assert_equal(actual, expected, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def test_legacy_left_to_right_rounding() -> None:
    points = [
        {"lat": 0.0, "lng": 105.0},
        {"lat": 0.0, "lng": 105.3333},
        {"lat": 0.0, "lng": 104.0},
        {"lat": 0.0, "lng": 106.0},
        {"lat": 0.0, "lng": 105.369175},
        {"lat": 0.0, "lng": 105.975674},
    ]
    assert_equal(centroid(points), {"lat": 0.0, "lng": 105.279692}, "legacy rounding tie")


def test_affected_mixed_point_set() -> None:
    points = [
        {"lat": 21.2833, "lng": 106.2},
        {"lat": 18.35, "lng": 105.8},
        {"lat": 15.5, "lng": 108.0},
        {"lat": 20.95, "lng": 106.35},
        {"lat": 21.379381, "lng": 106.428532},
        {"lat": 18.288633, "lng": 105.737608},
        {"lat": 15.590959, "lng": 107.970142},
        {"lat": 20.947713, "lng": 106.376858},
    ]
    expected = {"lat": 19.036248, "lng": 106.607893}
    assert_equal(centroid(points), expected, "affected mixed point set")
    assert_equal(centroid(list(reversed(points))), expected, "reversed stable point set")


def test_repeated_execution_is_deterministic() -> None:
    points = [
        {"lat": 10.7758, "lng": 106.6996},
        {"lat": 16.4637, "lng": 107.5909},
        {"lat": 16.0544, "lng": 108.2022},
        {"lat": 21.0, "lng": 105.0},
        {"lat": 10.7, "lng": 106.0},
        {"lat": 10.780438, "lng": 106.700954},
        {"lat": 16.289679, "lng": 107.501696},
        {"lat": 16.083155, "lng": 108.123722},
    ]
    expected = {"lat": 14.768397, "lng": 106.977384}
    for _ in range(20):
        assert_equal(centroid(points), expected, "repeated centroid")


def test_positive_and_negative_coordinates() -> None:
    points = [
        {"lat": -10.25, "lng": 100.125},
        {"lat": 10.75, "lng": -99.875},
    ]
    assert_equal(centroid(points), {"lat": 0.25, "lng": 0.125}, "positive and negative coordinates")


def main() -> None:
    test_legacy_left_to_right_rounding()
    test_affected_mixed_point_set()
    test_repeated_execution_is_deterministic()
    test_positive_and_negative_coordinates()
    print("=== TAT CA CENTROID REPRODUCIBILITY TEST PASS ===")


if __name__ == "__main__":
    main()
