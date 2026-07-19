from __future__ import annotations

from chronology_policy import (
    CLOSED_HISTORICAL_PERIOD_V1,
    ChronologyPolicyError,
    compute_policy_interval,
    validate_policy_chronology_consistency,
)


def boundary(unit, *, era="CE", index=None, part="whole", anchor_year=None):
    if unit == "decade":
        return {"unit": "decade", "anchorYear": anchor_year}
    return {"unit": unit, "era": era, "index": index, "part": part}


def spec(start, end=None):
    return {"start": start, "end": end or start}


def chronology(start_year, end_year, display_date="curated source text"):
    return {
        "start": {"year": start_year, "month": None, "day": None},
        "end": {"year": end_year, "month": None, "day": None},
        "datePrecision": "period",
        "displayDate": display_date,
        "isApproximate": True,
    }


def assert_interval(label, policy_spec, expected):
    interval = compute_policy_interval(CLOSED_HISTORICAL_PERIOD_V1, policy_spec)
    actual = (interval.start_year, interval.end_year)
    assert actual == expected, f"{label}: expected {expected}, got {actual}"
    print(f"[OK] {label}: {actual[0]} -> {actual[1]}")


def expect_error(label, policy_spec=None, message_part=None, *, chronology_value=None):
    try:
        if chronology_value is None:
            compute_policy_interval(CLOSED_HISTORICAL_PERIOD_V1, policy_spec)
        else:
            validate_policy_chronology_consistency(
                policy_ref=CLOSED_HISTORICAL_PERIOD_V1,
                policy_spec=policy_spec,
                chronology=chronology_value,
                context=label,
            )
    except ChronologyPolicyError as exc:
        if message_part and message_part not in str(exc):
            raise AssertionError(f"{label}: expected {message_part!r}, got {exc!r}")
        print(f"[OK] {label}: rejected ({exc})")
        return
    raise AssertionError(f"{label}: expected ChronologyPolicyError")


def run_tests():
    assert_interval("1st century CE", spec(boundary("century", index=1)), (1, 100))
    assert_interval("10th century CE", spec(boundary("century", index=10)), (901, 1000))
    assert_interval("20th century CE", spec(boundary("century", index=20)), (1901, 2000))
    assert_interval("1st century BCE", spec(boundary("century", era="BCE", index=1)), (-100, -1))
    assert_interval("5th century BCE", spec(boundary("century", era="BCE", index=5)), (-500, -401))

    assert_interval("early 19th century CE", spec(boundary("century", index=19, part="early")), (1801, 1833))
    assert_interval("middle 19th century CE", spec(boundary("century", index=19, part="middle")), (1834, 1866))
    assert_interval("late 19th century CE", spec(boundary("century", index=19, part="late")), (1867, 1900))
    assert_interval(
        "early 5th century BCE",
        spec(boundary("century", era="BCE", index=5, part="early")),
        (-500, -468),
    )
    assert_interval(
        "middle 5th century BCE",
        spec(boundary("century", era="BCE", index=5, part="middle")),
        (-467, -435),
    )
    assert_interval(
        "late 5th century BCE",
        spec(boundary("century", era="BCE", index=5, part="late")),
        (-434, -401),
    )

    assert_interval("1st millennium CE", spec(boundary("millennium", index=1)), (1, 1000))
    assert_interval("1st millennium BCE", spec(boundary("millennium", era="BCE", index=1)), (-1000, -1))
    assert_interval(
        "early 1st millennium BCE",
        spec(boundary("millennium", era="BCE", index=1, part="early")),
        (-1000, -668),
    )
    assert_interval(
        "middle 1st millennium BCE",
        spec(boundary("millennium", era="BCE", index=1, part="middle")),
        (-667, -335),
    )
    assert_interval(
        "late 1st millennium BCE",
        spec(boundary("millennium", era="BCE", index=1, part="late")),
        (-334, -1),
    )

    assert_interval("1930s decade", spec(boundary("decade", anchor_year=1930)), (1930, 1939))
    assert_interval(
        "17th century to early 19th century",
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
        (1601, 1833),
    )
    assert_interval(
        "3rd century to 5th century",
        spec(boundary("century", index=3), boundary("century", index=5)),
        (201, 500),
    )

    expect_error("invalid unit", spec({"unit": "dynasty", "era": "CE", "index": 1}), "unit")
    expect_error("invalid era", spec({"unit": "century", "era": "COMMON", "index": 1}), "era")
    expect_error("invalid part", spec(boundary("century", index=1, part="earliest")), "part")
    expect_error("invalid unit index", spec(boundary("century", index=0)), "greater than 0")
    expect_error("year zero", spec(boundary("decade", anchor_year=0)), "must not be 0")
    expect_error("open start", {"openStart": True, "end": boundary("century", index=1)}, "unknown keys")
    expect_error("open end", {"start": boundary("century", index=1), "openEnd": True}, "unknown keys")
    expect_error("before X", {"before": {"year": 1460}, "end": boundary("century", index=15)}, "unknown keys")
    expect_error("after X", {"start": boundary("century", index=20), "after": {"year": 1950}}, "unknown keys")
    expect_error("to present", {"start": boundary("century", index=20), "end": {"unit": "present"}}, "unit")
    expect_error("current year", {"start": boundary("century", index=20), "end": boundary("century", index=21), "currentYear": 2026}, "unknown keys")
    expect_error("multiple intervals", {"intervals": [spec(boundary("century", index=1))]}, "unknown keys")
    expect_error("relative years ago", {"start": {"unit": "relative_years_ago", "years": 2700}, "end": boundary("century", era="BCE", index=3)}, "unknown keys")
    expect_error(
        "cross BCE to CE",
        spec(boundary("century", era="BCE", index=1), boundary("century", index=1)),
        "BCE-to-CE",
    )
    expect_error(
        "start after end",
        spec(boundary("century", index=20), boundary("century", index=19)),
        "end boundary",
    )
    expect_error(
        "policy chronology mismatch",
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
        "does not match",
        chronology_value=chronology(1601, 1834),
    )
    bad_month = chronology(1601, 1833)
    bad_month["start"]["month"] = 1
    expect_error(
        "policy non-null month",
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
        "does not match",
        chronology_value=bad_month,
    )
    bad_precision = chronology(1601, 1833)
    bad_precision["datePrecision"] = "year"
    expect_error(
        "policy datePrecision mismatch",
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
        "datePrecision",
        chronology_value=bad_precision,
    )
    bad_approx = chronology(1601, 1833)
    bad_approx["isApproximate"] = False
    expect_error(
        "policy isApproximate mismatch",
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
        "isApproximate",
        chronology_value=bad_approx,
    )

    first = compute_policy_interval(
        CLOSED_HISTORICAL_PERIOD_V1,
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
    )
    second = compute_policy_interval(
        CLOSED_HISTORICAL_PERIOD_V1,
        spec(boundary("century", index=17), boundary("century", index=19, part="early")),
    )
    assert first == second
    print("[OK] deterministic repeated policy computation")
    print("=== TAT CA CHRONOLOGY POLICY TEST PASS ===")


if __name__ == "__main__":
    run_tests()
