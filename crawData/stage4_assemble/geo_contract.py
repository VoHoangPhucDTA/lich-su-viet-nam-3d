from __future__ import annotations

import math
import re
import unicodedata
from typing import Any


GEO_TYPES = frozenset(
    {
        "point",
        "multi_point",
        "multi_polygon",
        "mixed",
        "nationwide",
        "no_location",
    }
)

MARKER_COORD_PRECISION = 6
AMBIGUOUS_PHRASE_ALIASES = frozenset({"ha"})
ADMIN_PREFIXES = (
    "thanh pho",
    "thi tran",
    "thi xa",
    "tinh",
    "huyen",
    "quan",
    "xa",
    "tp",
)


class GeographyContractError(ValueError):
    """Raised when geography cannot be classified without guessing."""


def normalize_geo_text(value: Any, *, strip_admin_prefix: bool = True) -> str:
    """Normalize geography without deleting administrative words inside proper names."""
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("\u0111", "d")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not strip_admin_prefix:
        return text
    changed = True
    while changed and text:
        changed = False
        for prefix in ADMIN_PREFIXES:
            if text == prefix:
                return ""
            if text.startswith(prefix + " "):
                text = text[len(prefix) + 1 :].strip()
                changed = True
                break
    return text


def phrase_alias_is_allowed(alias: str) -> bool:
    normalized = normalize_geo_text(alias)
    if not normalized or normalized in AMBIGUOUS_PHRASE_ALIASES:
        return False
    tokens = normalized.split()
    return len(tokens) > 1 or len(normalized) >= 3


def marker_coordinate_key(marker: dict[str, Any]) -> tuple[float, float] | None:
    lat = marker.get("lat")
    lng = marker.get("lng")
    if (
        isinstance(lat, bool)
        or isinstance(lng, bool)
        or not isinstance(lat, (int, float))
        or not isinstance(lng, (int, float))
        or not math.isfinite(float(lat))
        or not math.isfinite(float(lng))
    ):
        return None
    return (round(float(lat), MARKER_COORD_PRECISION), round(float(lng), MARKER_COORD_PRECISION))


def deduplicate_markers(
    markers: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    unique: list[dict[str, Any]] = []
    duplicate_names: list[str] = []
    seen: set[tuple[float, float]] = set()
    for marker in markers:
        key = marker_coordinate_key(marker)
        if key is None or key not in seen:
            unique.append(marker)
            if key is not None:
                seen.add(key)
            continue
        name = str(marker.get("name") or "").strip()
        if name:
            duplicate_names.append(name)
    return unique, duplicate_names


def infer_operational_geography(
    *,
    nationwide_signal: bool,
    markers: list[dict[str, Any]],
    region_targets: list[str],
    forced_geo_type: str | None = None,
) -> dict[str, Any]:
    if forced_geo_type is not None and forced_geo_type not in GEO_TYPES:
        raise GeographyContractError(f"invalid forced geoType: {forced_geo_type}")

    unique_markers, duplicate_marker_names = deduplicate_markers(markers)
    operational_regions = list(region_targets)

    if forced_geo_type == "nationwide":
        nationwide_signal = True
    if forced_geo_type == "no_location":
        return {
            "geoType": "no_location",
            "markers": [],
            "regionTargets": [],
            "duplicateMarkerNames": duplicate_marker_names,
        }
    if nationwide_signal:
        if forced_geo_type not in {None, "nationwide"}:
            raise GeographyContractError(
                f"forced geoType {forced_geo_type} conflicts with nationwide signal"
            )
        return {
            "geoType": "nationwide",
            "markers": [],
            "regionTargets": [],
            "duplicateMarkerNames": duplicate_marker_names,
        }

    if not unique_markers and not operational_regions:
        inferred = "no_location"
    elif len(unique_markers) == 1 and not operational_regions:
        inferred = "point"
    elif len(unique_markers) >= 2 and not operational_regions:
        inferred = "multi_point"
    elif not unique_markers and operational_regions:
        inferred = "multi_polygon"
    else:
        inferred = "mixed"

    if forced_geo_type is not None and forced_geo_type != inferred:
        raise GeographyContractError(
            f"forced geoType {forced_geo_type} conflicts with inferred {inferred}"
        )
    return {
        "geoType": inferred,
        "markers": unique_markers,
        "regionTargets": operational_regions,
        "duplicateMarkerNames": duplicate_marker_names,
    }


def geojson_position_to_marker(position: list[Any] | tuple[Any, ...]) -> dict[str, float]:
    if len(position) < 2:
        raise GeographyContractError("GeoJSON position requires [lng, lat]")
    lng, lat = position[0], position[1]
    if isinstance(lat, bool) or isinstance(lng, bool) or not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        raise GeographyContractError("GeoJSON position must contain numeric [lng, lat]")
    return {"lat": float(lat), "lng": float(lng)}


def marker_to_geojson_position(marker: dict[str, Any]) -> list[float]:
    key = marker_coordinate_key(marker)
    if key is None:
        raise GeographyContractError("application marker requires numeric {lat, lng}")
    return [float(marker["lng"]), float(marker["lat"])]


def map_data_errors(event_id: str, map_data: Any) -> list[str]:
    prefix = f"{event_id}: mapData"
    if not isinstance(map_data, dict):
        return [f"{prefix}: must be an object"]

    errors: list[str] = []
    geo_type = map_data.get("geoType")
    marker = map_data.get("marker")
    markers = map_data.get("markers")
    province_names = map_data.get("provinceNames")
    gadm_refs = map_data.get("gadmRefs")

    if geo_type not in GEO_TYPES:
        errors.append(f"{prefix}.geoType: unsupported canonical value {geo_type!r}")
    if not isinstance(markers, list):
        errors.append(f"{prefix}.markers: must be an array")
        markers = []
    if not isinstance(province_names, list) or not all(isinstance(x, str) for x in province_names):
        errors.append(f"{prefix}.provinceNames: must be string[]")
        province_names = []
    if not isinstance(gadm_refs, list) or not all(isinstance(x, str) for x in gadm_refs):
        errors.append(f"{prefix}.gadmRefs: must be string[]")
        gadm_refs = []

    if len(province_names) != len(gadm_refs):
        errors.append(
            f"{prefix}.gadmRefs: cardinality {len(gadm_refs)} does not match provinceNames {len(province_names)}"
        )
    if len(gadm_refs) != len(set(gadm_refs)):
        errors.append(f"{prefix}.gadmRefs: duplicate operational target")

    operational_markers = ([marker] if marker else []) + list(markers)
    for index, candidate in enumerate(operational_markers):
        field = "marker" if index == 0 and marker else f"markers[{index - (1 if marker else 0)}]"
        if not isinstance(candidate, dict):
            errors.append(f"{prefix}.{field}: must be an object")
            continue
        lat = candidate.get("lat")
        lng = candidate.get("lng")
        if (
            isinstance(lat, bool)
            or isinstance(lng, bool)
            or not isinstance(lat, (int, float))
            or not isinstance(lng, (int, float))
            or not math.isfinite(float(lat))
            or not math.isfinite(float(lng))
        ):
            errors.append(f"{prefix}.{field}: lat/lng must be finite numbers")
            continue
        if not -90 <= float(lat) <= 90:
            errors.append(f"{prefix}.{field}.lat: outside [-90, 90]")
        if not -180 <= float(lng) <= 180:
            errors.append(f"{prefix}.{field}.lng: outside [-180, 180]")

    marker_keys = [marker_coordinate_key(value) for value in markers if isinstance(value, dict)]
    valid_marker_keys = [key for key in marker_keys if key is not None]
    if len(valid_marker_keys) != len(set(valid_marker_keys)):
        errors.append(f"{prefix}.markers: duplicate operational coordinates")
    if markers and marker != markers[0]:
        errors.append(f"{prefix}.marker: must equal markers[0]")

    has_regions = bool(province_names or gadm_refs)
    if geo_type == "point":
        if marker is None or markers:
            errors.append(f"{prefix}: point requires exactly one marker and empty markers[]")
        if has_regions:
            errors.append(f"{prefix}: point must not carry operational regions")
    elif geo_type == "multi_point":
        if marker is None or len(markers) < 2:
            errors.append(f"{prefix}: multi_point requires at least two markers")
        if has_regions:
            errors.append(f"{prefix}: multi_point must not carry operational regions")
    elif geo_type == "multi_polygon":
        if marker is not None or markers:
            errors.append(f"{prefix}: multi_polygon must not carry operational markers")
        if not province_names or not gadm_refs:
            errors.append(f"{prefix}: multi_polygon requires at least one region target")
    elif geo_type == "mixed":
        if marker is None or not markers:
            errors.append(f"{prefix}: mixed requires at least one marker")
        if not province_names or not gadm_refs:
            errors.append(f"{prefix}: mixed requires an independent region target")
    elif geo_type in {"nationwide", "no_location"}:
        if marker is not None or markers or has_regions:
            errors.append(f"{prefix}: {geo_type} must not carry operational geometry")

    focus = map_data.get("focusGeometry")
    if not isinstance(focus, dict) or not {"mode", "center", "zoom"}.issubset(focus):
        errors.append(f"{prefix}.focusGeometry: invalid metadata skeleton")
    return errors


def validate_map_data(event_id: str, map_data: Any) -> None:
    errors = map_data_errors(event_id, map_data)
    if errors:
        raise GeographyContractError("\n".join(errors))
