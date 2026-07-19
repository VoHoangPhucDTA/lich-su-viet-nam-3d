from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
from typing import Any

SHARED_CRAWDATA = Path(__file__).resolve().parents[1]
if str(SHARED_CRAWDATA) not in sys.path:
    sys.path.insert(0, str(SHARED_CRAWDATA))

from chronology_policy import (  # noqa: E402
    POLICY_BACKED_CATEGORY,
    POLICY_METADATA_KEYS,
    ChronologyPolicyError,
    validate_policy_chronology_consistency,
)
from common import read_json


SUPPORTED_VERSION = 1
ALLOWED_MODES = {"auto_safe", "manual_curated"}
ALLOWED_DATE_PRECISIONS = {"day", "month", "year", "period", "approximate"}
CONFIG_KEYS = {"version", "overrides"}
OVERRIDE_KEYS = {"eventId", "mode", "category", "chronology", "reason"} | POLICY_METADATA_KEYS
CHRONOLOGY_KEYS = {"start", "end", "datePrecision", "displayDate", "isApproximate"}
DATE_PART_KEYS = {"year", "month", "day"}
MOJIBAKE_MARKERS = ("HÃƒÂ¬nh", "ChÃ¡Â»Â§", "Ã„â€˜", "Ã¢â‚¬â€œ", "ï¿½")


class SyntheticChronologyOverrideError(ValueError):
    pass


def load_synthetic_chronology_overrides(
    path: Path,
    valid_synthetic_event_ids: set[str],
) -> dict[str, dict[str, Any]]:
    config = read_json(path, None)
    return index_synthetic_chronology_overrides(config, valid_synthetic_event_ids)


def index_synthetic_chronology_overrides(
    config: Any,
    valid_synthetic_event_ids: set[str],
) -> dict[str, dict[str, Any]]:
    validate_config_shape(config)
    indexed: dict[str, dict[str, Any]] = {}
    for index, override in enumerate(config["overrides"], start=1):
        validate_override(override, valid_synthetic_event_ids, context=f"override #{index}")
        event_id = override["eventId"]
        if event_id in indexed:
            raise SyntheticChronologyOverrideError(f"Duplicate synthetic chronology override eventId: {event_id}")
        indexed[event_id] = deepcopy(override)
    return indexed


def validate_config_shape(config: Any) -> None:
    if not isinstance(config, dict):
        raise SyntheticChronologyOverrideError("synthetic_chronology_overrides config must be an object")
    _reject_unknown_keys(config, CONFIG_KEYS, "synthetic_chronology_overrides config")
    if "version" not in config:
        raise SyntheticChronologyOverrideError("synthetic_chronology_overrides config missing required field: version")
    if isinstance(config["version"], bool) or config["version"] != SUPPORTED_VERSION:
        raise SyntheticChronologyOverrideError(f"Unsupported synthetic_chronology_overrides version: {config['version']!r}")
    if "overrides" not in config:
        raise SyntheticChronologyOverrideError("synthetic_chronology_overrides config missing required field: overrides")
    if not isinstance(config["overrides"], list):
        raise SyntheticChronologyOverrideError("synthetic_chronology_overrides.overrides must be a list")


def validate_override(override: Any, valid_synthetic_event_ids: set[str], context: str = "override") -> None:
    if not isinstance(override, dict):
        raise SyntheticChronologyOverrideError(f"{context}: override must be an object")
    _reject_unknown_keys(override, OVERRIDE_KEYS, context)
    event_id = _required_text(override, "eventId", context)
    _reject_mojibake(event_id, f"{context}.eventId")
    if event_id not in valid_synthetic_event_ids:
        raise SyntheticChronologyOverrideError(
            f"{context}: target eventId is not a generated Stage4B synthetic collection: {event_id}"
        )

    mode = _required_text(override, "mode", context)
    if mode not in ALLOWED_MODES:
        raise SyntheticChronologyOverrideError(f"{context}: unsupported mode: {mode}")

    category = _required_text(override, "category", context)
    reason = _required_text(override, "reason", context)
    _reject_mojibake(category, f"{context}.category")
    _reject_mojibake(reason, f"{context}.reason")

    if "chronology" not in override or not isinstance(override["chronology"], dict):
        raise SyntheticChronologyOverrideError(f"{context}: chronology must be an object")
    validate_chronology(override["chronology"], context=f"{context}.chronology")
    _validate_policy_metadata(override, mode, category, context)


def validate_chronology(chronology: dict[str, Any], context: str = "chronology") -> None:
    _reject_unknown_keys(chronology, CHRONOLOGY_KEYS, context)
    missing = sorted(CHRONOLOGY_KEYS - set(chronology))
    if missing:
        raise SyntheticChronologyOverrideError(f"{context}: missing required fields: {', '.join(missing)}")
    if not isinstance(chronology["start"], dict):
        raise SyntheticChronologyOverrideError(f"{context}.start must be an object")
    if chronology["end"] is not None and not isinstance(chronology["end"], dict):
        raise SyntheticChronologyOverrideError(f"{context}.end must be an object or null")

    start = _validate_date_part(chronology["start"], f"{context}.start")
    end = _validate_date_part(chronology["end"], f"{context}.end") if chronology["end"] is not None else None

    precision = chronology["datePrecision"]
    if not isinstance(precision, str) or precision not in ALLOWED_DATE_PRECISIONS:
        raise SyntheticChronologyOverrideError(f"{context}.datePrecision unsupported value: {precision!r}")

    display_date = chronology["displayDate"]
    if not isinstance(display_date, str) or not display_date.strip():
        raise SyntheticChronologyOverrideError(f"{context}.displayDate must be a non-empty string")
    _reject_mojibake(display_date, f"{context}.displayDate")

    if not isinstance(chronology["isApproximate"], bool):
        raise SyntheticChronologyOverrideError(f"{context}.isApproximate must be boolean")

    start_year = start.get("year")
    end_year = end.get("year") if end else None
    if isinstance(start_year, int) and isinstance(end_year, int) and end_year < start_year:
        raise SyntheticChronologyOverrideError(f"{context}: end.year must be greater than or equal to start.year")


def apply_synthetic_chronology_override(
    node: dict[str, Any],
    event_id: str,
    overrides_by_event_id: dict[str, dict[str, Any]] | None,
    applied_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    overrides_by_event_id = overrides_by_event_id or {}
    if event_id not in overrides_by_event_id:
        return deepcopy(node)
    out = deepcopy(node)
    out["chronology"] = deepcopy(overrides_by_event_id[event_id]["chronology"])
    if applied_counts is not None:
        applied_counts[event_id] = applied_counts.get(event_id, 0) + 1
    return out


def validate_all_synthetic_overrides_applied(applied_counts: dict[str, int]) -> None:
    unused = sorted(event_id for event_id, count in applied_counts.items() if count == 0)
    repeated = sorted(event_id for event_id, count in applied_counts.items() if count > 1)
    if unused:
        raise SyntheticChronologyOverrideError(f"Synthetic chronology overrides were not applied: {', '.join(unused)}")
    if repeated:
        raise SyntheticChronologyOverrideError(
            f"Synthetic chronology overrides applied more than once: {', '.join(repeated)}"
        )


def _validate_date_part(value: dict[str, Any], context: str) -> dict[str, int | None]:
    _reject_unknown_keys(value, DATE_PART_KEYS, context)
    out: dict[str, int | None] = {}
    for key in ("year", "month", "day"):
        if key not in value:
            raise SyntheticChronologyOverrideError(f"{context}.{key} is required")
        item = value[key]
        if item is not None and (isinstance(item, bool) or not isinstance(item, int)):
            raise SyntheticChronologyOverrideError(f"{context}.{key} must be an integer or null")
        if key == "year" and item == 0:
            raise SyntheticChronologyOverrideError(f"{context}.year must not be 0")
        if key == "month" and item is not None and not 1 <= item <= 12:
            raise SyntheticChronologyOverrideError(f"{context}.month must be between 1 and 12")
        if key == "day" and item is not None and not 1 <= item <= 31:
            raise SyntheticChronologyOverrideError(f"{context}.day must be between 1 and 31")
        out[key] = item
    return out


def _reject_unknown_keys(value: dict[str, Any], allowed_keys: set[str], context: str) -> None:
    unknown = sorted(set(value) - allowed_keys)
    if unknown:
        raise SyntheticChronologyOverrideError(f"{context}: unknown keys: {', '.join(unknown)}")


def _validate_policy_metadata(override: dict[str, Any], mode: str, category: str, context: str) -> None:
    has_policy_ref = "policyRef" in override
    has_policy_spec = "policySpec" in override
    if category == POLICY_BACKED_CATEGORY:
        if mode != "manual_curated":
            raise SyntheticChronologyOverrideError(
                f"{context}: {POLICY_BACKED_CATEGORY} requires mode=manual_curated"
            )
        if not has_policy_ref or not has_policy_spec:
            raise SyntheticChronologyOverrideError(
                f"{context}: {POLICY_BACKED_CATEGORY} requires policyRef and policySpec"
            )
    elif has_policy_ref != has_policy_spec:
        raise SyntheticChronologyOverrideError(f"{context}: policyRef and policySpec must be provided together")

    if not has_policy_ref and not has_policy_spec:
        return
    policy_ref = override["policyRef"]
    if not isinstance(policy_ref, str) or not policy_ref.strip():
        raise SyntheticChronologyOverrideError(f"{context}: policyRef must be a non-empty string")
    try:
        validate_policy_chronology_consistency(
            policy_ref=policy_ref,
            policy_spec=override["policySpec"],
            chronology=override["chronology"],
            context=context,
        )
    except ChronologyPolicyError as exc:
        raise SyntheticChronologyOverrideError(f"{context}: {exc}") from exc


def _required_text(override: dict[str, Any], key: str, context: str) -> str:
    value = override.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SyntheticChronologyOverrideError(f"{context}: {key} must be a non-empty string")
    return value.strip()


def _reject_mojibake(value: str, context: str) -> None:
    if any(marker in value for marker in MOJIBAKE_MARKERS):
        raise SyntheticChronologyOverrideError(f"{context} contains suspicious mojibake")
