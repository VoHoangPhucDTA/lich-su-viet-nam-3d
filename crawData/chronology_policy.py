from __future__ import annotations

from dataclasses import dataclass
from typing import Any


CLOSED_HISTORICAL_PERIOD_V1 = "closed_historical_period_v1"
POLICY_BACKED_CATEGORY = "policy_closed_historical_period"

POLICY_METADATA_KEYS = {"policyRef", "policySpec"}
POLICY_SPEC_KEYS = {"start", "end"}
BOUNDARY_BASE_KEYS = {"unit"}
CENTURY_MILLENNIUM_KEYS = {"unit", "era", "index", "part"}
DECADE_KEYS = {"unit", "anchorYear"}
SUPPORTED_UNITS = {"century", "millennium", "decade"}
SUPPORTED_ERAS = {"CE", "BCE"}
SUPPORTED_PARTS = {"whole", "early", "middle", "late"}


class ChronologyPolicyError(ValueError):
    pass


@dataclass(frozen=True)
class ClosedInterval:
    start_year: int
    end_year: int


def compute_policy_interval(policy_ref: str, policy_spec: Any) -> ClosedInterval:
    if policy_ref != CLOSED_HISTORICAL_PERIOD_V1:
        raise ChronologyPolicyError(f"unknown chronology policy: {policy_ref!r}")
    if not isinstance(policy_spec, dict):
        raise ChronologyPolicyError("policySpec must be an object")
    _reject_unknown_keys(policy_spec, POLICY_SPEC_KEYS, "policySpec")
    if "start" not in policy_spec or "end" not in policy_spec:
        raise ChronologyPolicyError("policySpec must include start and end boundaries")

    start_boundary = _boundary_interval(policy_spec["start"], "policySpec.start")
    end_boundary = _boundary_interval(policy_spec["end"], "policySpec.end")
    interval = ClosedInterval(start_boundary.start_year, end_boundary.end_year)
    _validate_closed_interval(interval)
    return interval


def validate_policy_chronology_consistency(
    *,
    policy_ref: str,
    policy_spec: Any,
    chronology: dict[str, Any],
    context: str,
) -> None:
    interval = compute_policy_interval(policy_ref, policy_spec)
    start = chronology.get("start")
    end = chronology.get("end")
    if not isinstance(start, dict) or not isinstance(end, dict):
        raise ChronologyPolicyError(f"{context}: policy-backed chronology requires object start and end")
    expected_start = {"year": interval.start_year, "month": None, "day": None}
    expected_end = {"year": interval.end_year, "month": None, "day": None}
    if start != expected_start:
        raise ChronologyPolicyError(
            f"{context}: chronology.start does not match {policy_ref}: expected {expected_start!r}"
        )
    if end != expected_end:
        raise ChronologyPolicyError(
            f"{context}: chronology.end does not match {policy_ref}: expected {expected_end!r}"
        )
    if chronology.get("datePrecision") != "period":
        raise ChronologyPolicyError(f"{context}: policy-backed chronology requires datePrecision='period'")
    if chronology.get("isApproximate") is not True:
        raise ChronologyPolicyError(f"{context}: policy-backed chronology requires isApproximate=true")
    display_date = chronology.get("displayDate")
    if not isinstance(display_date, str) or not display_date.strip():
        raise ChronologyPolicyError(f"{context}: policy-backed chronology requires a curated displayDate")


def _boundary_interval(boundary: Any, context: str) -> ClosedInterval:
    if not isinstance(boundary, dict):
        raise ChronologyPolicyError(f"{context} must be an object")
    _reject_unknown_keys(boundary, BOUNDARY_BASE_KEYS | {"era", "index", "part", "anchorYear"}, context)
    unit = boundary.get("unit")
    if unit not in SUPPORTED_UNITS:
        raise ChronologyPolicyError(f"{context}.unit unsupported value: {unit!r}")
    if unit == "decade":
        _reject_unknown_keys(boundary, DECADE_KEYS, context)
        return _decade_interval(boundary, context)

    _reject_unknown_keys(boundary, CENTURY_MILLENNIUM_KEYS, context)
    era = boundary.get("era")
    if era not in SUPPORTED_ERAS:
        raise ChronologyPolicyError(f"{context}.era unsupported value: {era!r}")
    index = boundary.get("index")
    if isinstance(index, bool) or not isinstance(index, int):
        raise ChronologyPolicyError(f"{context}.index must be an integer")
    if index <= 0:
        raise ChronologyPolicyError(f"{context}.index must be greater than 0")
    part = boundary.get("part", "whole")
    if part not in SUPPORTED_PARTS:
        raise ChronologyPolicyError(f"{context}.part unsupported value: {part!r}")
    size = 100 if unit == "century" else 1000
    return _partitioned_interval(index=index, era=era, part=part, size=size)


def _partitioned_interval(index: int, era: str, part: str, size: int) -> ClosedInterval:
    if era == "CE":
        whole_start = size * (index - 1) + 1
    else:
        whole_start = -(size * index)

    start_pos, end_pos = _part_positions(size, part)
    return ClosedInterval(whole_start + start_pos - 1, whole_start + end_pos - 1)


def _part_positions(size: int, part: str) -> tuple[int, int]:
    if part == "whole":
        return 1, size
    if size == 100:
        if part == "early":
            return 1, 33
        if part == "middle":
            return 34, 66
        return 67, 100
    if part == "early":
        return 1, 333
    if part == "middle":
        return 334, 666
    return 667, 1000


def _decade_interval(boundary: dict[str, Any], context: str) -> ClosedInterval:
    anchor_year = boundary.get("anchorYear")
    if isinstance(anchor_year, bool) or not isinstance(anchor_year, int):
        raise ChronologyPolicyError(f"{context}.anchorYear must be an integer")
    if anchor_year == 0:
        raise ChronologyPolicyError(f"{context}.anchorYear must not be 0")
    if anchor_year % 10 != 0:
        raise ChronologyPolicyError(f"{context}.anchorYear must be divisible by 10")
    return ClosedInterval(anchor_year, anchor_year + 9)


def _validate_closed_interval(interval: ClosedInterval) -> None:
    if interval.start_year == 0 or interval.end_year == 0:
        raise ChronologyPolicyError("closed_historical_period_v1 must not generate year 0")
    if interval.start_year < 0 < interval.end_year:
        raise ChronologyPolicyError("closed_historical_period_v1 does not support BCE-to-CE ranges")
    if interval.end_year < interval.start_year:
        raise ChronologyPolicyError("policySpec end boundary must not be earlier than start boundary")


def _reject_unknown_keys(value: dict[str, Any], allowed_keys: set[str], context: str) -> None:
    unknown = sorted(set(value) - allowed_keys)
    if unknown:
        raise ChronologyPolicyError(f"{context}: unknown keys: {', '.join(unknown)}")
