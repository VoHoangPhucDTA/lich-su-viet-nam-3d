from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chronology_policy import CLOSED_HISTORICAL_PERIOD_V1, POLICY_BACKED_CATEGORY  # noqa: E402
from build_tree import build_forced_collection_nodes  # noqa: E402
from common import CONFIG, read_json  # noqa: E402
from curate_events import _forced_collection_ids, _forced_parent_ids  # noqa: E402
from synthetic_chronology_repair import (  # noqa: E402
    SyntheticChronologyOverrideError,
    apply_synthetic_chronology_override,
    index_synthetic_chronology_overrides,
    load_synthetic_chronology_overrides,
    validate_all_synthetic_overrides_applied,
)


VALID_SYNTHETIC_IDS = {"synthetic-one", "synthetic-two", "viet-nam-synthetic"}


def chronology(start_year=1954, end_year=1960, precision="period", display_date="1954 - 1960", is_approximate=False):
    return {
        "start": {"year": start_year, "month": None, "day": None},
        "end": {"year": end_year, "month": None, "day": None} if end_year is not None else None,
        "datePrecision": precision,
        "displayDate": display_date,
        "isApproximate": is_approximate,
    }


def override(event_id="synthetic-one", mode="auto_safe", chrono=None):
    return {
        "eventId": event_id,
        "mode": mode,
        "category": "closed_year_range",
        "chronology": chrono or chronology(),
        "reason": "Explicit synthetic chronology used for isolated test.",
    }


def config(*items):
    return {"version": 1, "overrides": list(items)}


def expect_error(label, payload, message_part=None):
    try:
        index_synthetic_chronology_overrides(payload, VALID_SYNTHETIC_IDS)
    except SyntheticChronologyOverrideError as exc:
        if message_part and message_part not in str(exc):
            raise AssertionError(f"{label}: expected error containing {message_part!r}, got {exc!r}")
        print(f"[OK] {label}: rejected ({exc})")
        return
    raise AssertionError(f"{label}: expected SyntheticChronologyOverrideError")


def root_periods():
    return [
        {
            "id": "viet-nam-1975-den-nay",
            "title": "Viet Nam tu nam 1975 den nay",
            "short": "Viet Nam 1975-den nay",
            "startYear": 1975,
            "endYear": None,
        }
    ]


def without_chronology(value):
    out = copy.deepcopy(value)
    out.pop("chronology", None)
    return out


def run_tests():
    # 1. Empty config.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "synthetic_chronology_overrides.json"
        path.write_text(json.dumps(config(), ensure_ascii=False), encoding="utf-8")
        loaded = load_synthetic_chronology_overrides(path, VALID_SYNTHETIC_IDS)
        assert loaded == {}
    print("[OK] empty config loads")

    # 2. Valid closed-range synthetic override.
    indexed = index_synthetic_chronology_overrides(config(override()), VALID_SYNTHETIC_IDS)
    assert indexed["synthetic-one"]["chronology"]["start"]["year"] == 1954
    assert indexed["synthetic-one"]["chronology"]["end"]["year"] == 1960
    print("[OK] valid closed-range synthetic override")

    policy_override = override(
        "synthetic-two",
        mode="manual_curated",
        chrono=chronology(1601, 1833, "period", "Curated synthetic text unrelated to parsing", True),
    )
    policy_override["category"] = POLICY_BACKED_CATEGORY
    policy_override["policyRef"] = CLOSED_HISTORICAL_PERIOD_V1
    policy_override["policySpec"] = {
        "start": {"unit": "century", "era": "CE", "index": 17},
        "end": {"unit": "century", "era": "CE", "index": 19, "part": "early"},
    }
    policy_indexed = index_synthetic_chronology_overrides(config(policy_override), VALID_SYNTHETIC_IDS)
    assert policy_indexed["synthetic-two"]["chronology"]["end"]["year"] == 1833
    print("[OK] valid policy-backed synthetic override")

    # 3. Correct Vietnamese displayDate.
    vi = override(
        chrono=chronology(1858, 1918, "period", "Chủ quyền biển đảo Việt Nam 1858-1918")
    )
    vi["reason"] = "Explicit closed year range in the generated synthetic collection displayDate."
    index_synthetic_chronology_overrides(config(vi), VALID_SYNTHETIC_IDS)
    print("[OK] valid Vietnamese displayDate")

    # 4. Exact replacement chronology.
    node = {"id": "synthetic-one", "chronology": chronology(None, None, "period", "synthetic-one"), "title": "Stable"}
    applied = apply_synthetic_chronology_override(node, "synthetic-one", indexed, {"synthetic-one": 0})
    assert applied["chronology"] == indexed["synthetic-one"]["chronology"]
    print("[OK] exact chronology replacement")

    # 5. Only chronology changes.
    assert without_chronology(node) == without_chronology(applied)
    print("[OK] only chronology changes")

    # 6. Source node not mutated.
    assert node["chronology"]["start"]["year"] is None
    print("[OK] source node not mutated")

    # 7. Deterministic repeated application.
    first = apply_synthetic_chronology_override(node, "synthetic-one", indexed, {"synthetic-one": 0})
    second = apply_synthetic_chronology_override(node, "synthetic-one", indexed, {"synthetic-one": 0})
    assert first == second
    print("[OK] deterministic repeated application")

    # Invalid cases.
    expect_error("unsupported version", {"version": 2, "overrides": []}, "Unsupported")
    expect_error("boolean version", {"version": True, "overrides": []}, "Unsupported")
    expect_error("missing overrides", {"version": 1}, "overrides")
    bad = config()
    bad["metadata"] = {}
    expect_error("unknown top-level key", bad, "metadata")
    expect_error("duplicate event ID", config(override(), override()), "Duplicate")
    expect_error("unknown synthetic target", config(override("ordinary-stage4a-event")), "not a generated")
    expect_error("empty eventId", config(override("")), "eventId")
    expect_error("unsupported mode", config(override(mode="review")), "unsupported mode")
    bad = copy.deepcopy(policy_override)
    bad["mode"] = "auto_safe"
    expect_error("policy-backed category requires manual mode", config(bad), "manual_curated")
    bad = copy.deepcopy(policy_override)
    del bad["policySpec"]
    expect_error("policy-backed category requires policySpec", config(bad), "policyRef and policySpec")
    bad = copy.deepcopy(policy_override)
    bad["policyRef"] = "closed_historical_period_v2"
    expect_error("unknown policy ID", config(bad), "unknown chronology policy")
    bad = copy.deepcopy(policy_override)
    bad["policySpec"]["start"]["open"] = True
    expect_error("unknown policySpec key", config(bad), "unknown keys")
    bad = copy.deepcopy(policy_override)
    bad["chronology"]["start"]["year"] = 1602
    expect_error("policy chronology mismatch", config(bad), "does not match")
    bad = override()
    bad["category"] = ""
    expect_error("empty category", config(bad), "category")
    bad = override()
    bad["reason"] = ""
    expect_error("empty reason", config(bad), "reason")
    bad = override()
    del bad["chronology"]["start"]
    expect_error("malformed chronology", config(bad), "missing required")
    bad = override()
    bad["chronology"]["source"] = "note"
    expect_error("unknown chronology key", config(bad), "source")
    expect_error("boolean year", config(override(chrono=chronology(True, None, "year", "true"))), "year")
    expect_error("year zero", config(override(chrono=chronology(0, None, "year", "0"))), "must not be 0")
    bad_chrono = chronology(1954, None, "month", "month 13")
    bad_chrono["start"]["month"] = 13
    expect_error("invalid month", config(override(chrono=bad_chrono)), "month")
    bad_chrono = chronology(1954, None, "day", "day 32")
    bad_chrono["start"]["day"] = 32
    expect_error("invalid day", config(override(chrono=bad_chrono)), "day")
    expect_error("reversed year range", config(override(chrono=chronology(1960, 1954))), "end.year")
    bad = override()
    bad["reason"] = "ChÃ¡Â»Â§ corrupted text"
    expect_error("mojibake", config(bad), "mojibake")

    # 25. Unused configured override.
    try:
        validate_all_synthetic_overrides_applied({"synthetic-one": 0})
    except SyntheticChronologyOverrideError as exc:
        assert "not applied" in str(exc)
        print(f"[OK] unused configured override: rejected ({exc})")
    else:
        raise AssertionError("unused configured override should fail")

    # 26. Repeated application.
    try:
        validate_all_synthetic_overrides_applied({"synthetic-one": 2})
    except SyntheticChronologyOverrideError as exc:
        assert "more than once" in str(exc)
        print(f"[OK] repeated application: rejected ({exc})")
    else:
        raise AssertionError("repeated application should fail")

    # Integration helper path: forced id -> synthetic node -> override.
    base_nodes = build_forced_collection_nodes([], {"synthetic-one"}, root_periods())
    counts = {"synthetic-one": 0}
    repaired_nodes = build_forced_collection_nodes([], {"synthetic-one"}, root_periods(), indexed, counts)
    assert len(base_nodes) == 1 and len(repaired_nodes) == 1
    assert counts == {"synthetic-one": 1}
    assert base_nodes[0]["id"] == repaired_nodes[0]["id"]
    assert without_chronology(base_nodes[0]) == without_chronology(repaired_nodes[0])
    assert repaired_nodes[0]["chronology"]["start"]["year"] == 1954
    validate_all_synthetic_overrides_applied(counts)
    print("[OK] integration helper applies one synthetic chronology only")

    # Real config validates against the current forced synthetic generation domain.
    force_parent = read_json(CONFIG / "force_parent.json", {})
    root_ids = {"viet-nam-1975-den-nay", "viet-nam-1858-1918", "viet-nam-1919-1945", "viet-nam-1954-1975", "viet-nam-tu-the-ki-xvi-den-xix"}
    forced_ids = _forced_parent_ids(force_parent)
    forced_ids.update(_forced_collection_ids(force_parent, root_ids))
    real = load_synthetic_chronology_overrides(CONFIG / "synthetic_chronology_overrides.json", forced_ids)
    real_config = read_json(CONFIG / "synthetic_chronology_overrides.json", {})
    assert len(real) == len(real_config["overrides"])
    print("[OK] real synthetic chronology config validates")

    print("=== TAT CA SYNTHETIC CHRONOLOGY REPAIR TEST PASS ===")


if __name__ == "__main__":
    run_tests()
