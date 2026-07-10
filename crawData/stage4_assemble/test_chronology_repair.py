from __future__ import annotations

import copy
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chronology_policy import CLOSED_HISTORICAL_PERIOD_V1, POLICY_BACKED_CATEGORY  # noqa: E402
from chronology_repair import (  # noqa: E402
    ChronologyOverrideError,
    apply_chronology_override,
    index_chronology_overrides,
    load_chronology_overrides,
    validate_all_overrides_applied,
)
from build_final_events import event_id_for_sid, make_event, merge_rows  # noqa: E402
from stage4_common import DEDUPED_EVENTS, read_jsonl  # noqa: E402


VALID_EVENT_IDS = {
    "event-one",
    "event-two",
    "bce-event",
    "manual-event",
    "fixture-stage4-event",
    "unrelated-stage4-event",
}


def chronology(start_year=1954, end_year=None, precision="year", display_date="Năm 1954", is_approximate=False):
    return {
        "start": {"year": start_year, "month": None, "day": None},
        "end": {"year": end_year, "month": None, "day": None} if end_year is not None else None,
        "datePrecision": precision,
        "displayDate": display_date,
        "isApproximate": is_approximate,
    }


def override(event_id="event-one", mode="auto_safe", chrono=None):
    return {
        "eventId": event_id,
        "mode": mode,
        "category": "closed_year_range",
        "chronology": chrono or chronology(1954, 1960, "period", "1954 - 1960"),
        "reason": "Explicit chronology used for isolated D3 mechanism test.",
    }


def config(*items):
    return {"version": 1, "overrides": list(items)}


def expect_error(label, payload, message_part=None):
    try:
        index_chronology_overrides(payload, VALID_EVENT_IDS)
    except ChronologyOverrideError as exc:
        if message_part and message_part not in str(exc):
            raise AssertionError(f"{label}: expected error containing {message_part!r}, got {exc!r}")
        print(f"[OK] {label}: rejected ({exc})")
        return
    raise AssertionError(f"{label}: expected ChronologyOverrideError")


def stage4_row(event_id, start_year):
    return {
        "suggestedId": event_id,
        "titles": {"primary": event_id, "short": event_id, "alternatives": []},
        "classification": {"eventType": "political", "tags": []},
        "chronology": chronology(start_year, None, "year", f"Năm {start_year}"),
        "summary": {"cardSummary": "Stable"},
        "textbookContent": {"canonicalSummary": "Stable", "keyFacts": []},
        "rawPlaceMentions": [],
        "relatedMentions": [],
    }


def canonical_event(row):
    return make_event(
        row,
        {},
        {"geoType": "no_location"},
        {"coverage": {"grades": [], "books": [], "lessons": []}, "textbookRefs": []},
    )


def real_stage4a_event_ids():
    return {event_id_for_sid(row.get("suggestedId")) for row in read_jsonl(DEDUPED_EVENTS)}


def run_tests():
    # 1. Empty config loads successfully.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "chronology_overrides.json"
        path.write_text(json.dumps(config(), ensure_ascii=False), encoding="utf-8")
        loaded = load_chronology_overrides(path, VALID_EVENT_IDS)
        assert loaded == {}, "empty config should load as empty override index"
    print("[OK] empty config loads")

    # 2. Valid exact-year override.
    exact = index_chronology_overrides(
        config(override(chrono=chronology(1976, None, "year", "Năm 1976"))),
        VALID_EVENT_IDS,
    )
    assert exact["event-one"]["chronology"]["start"]["year"] == 1976
    print("[OK] valid exact-year override")

    # 3. Valid closed-range override.
    closed = index_chronology_overrides(config(override()), VALID_EVENT_IDS)
    assert closed["event-one"]["chronology"]["end"]["year"] == 1960
    print("[OK] valid closed-range override")

    # 4. Valid BCE negative-year override.
    bce = index_chronology_overrides(
        config(override("bce-event", chrono=chronology(-208, None, "approximate", "Năm 208 TCN"))),
        VALID_EVENT_IDS,
    )
    assert bce["bce-event"]["chronology"]["start"]["year"] == -208
    print("[OK] valid BCE negative-year override")

    # 5. Valid null-end override.
    null_end = index_chronology_overrides(
        config(override(chrono=chronology(1986, None, "year", "Từ năm 1986"))),
        VALID_EVENT_IDS,
    )
    assert null_end["event-one"]["chronology"]["end"] is None
    print("[OK] valid null-end override")

    # 6. Valid manual_curated mode.
    manual = index_chronology_overrides(config(override("manual-event", mode="manual_curated")), VALID_EVENT_IDS)
    assert manual["manual-event"]["mode"] == "manual_curated"
    print("[OK] valid manual_curated mode")

    policy_override = override(
        "manual-event",
        mode="manual_curated",
        chrono=chronology(1601, 1833, "period", "Curated source text unrelated to parsing", True),
    )
    policy_override["category"] = POLICY_BACKED_CATEGORY
    policy_override["policyRef"] = CLOSED_HISTORICAL_PERIOD_V1
    policy_override["policySpec"] = {
        "start": {"unit": "century", "era": "CE", "index": 17},
        "end": {"unit": "century", "era": "CE", "index": 19, "part": "early"},
    }
    policy = index_chronology_overrides(config(policy_override), VALID_EVENT_IDS)
    assert policy["manual-event"]["chronology"]["start"]["year"] == 1601
    print("[OK] valid policy-backed manual override")

    # 7. Correct Vietnamese displayDate and reason.
    vietnamese = override(
        chrono=chronology(1945, None, "day", "Ngày 2 tháng 9 năm 1945"),
    )
    vietnamese["reason"] = "Giữ nguyên mốc thời gian rõ trong tư liệu nguồn."
    index_chronology_overrides(config(vietnamese), VALID_EVENT_IDS)
    print("[OK] valid Vietnamese text")

    # Strict unknown-key rejection.
    bad_config = config()
    bad_config["metadata"] = {}
    expect_error("unknown extra top-level key", bad_config, "metadata")
    expect_error("typo top-level key", {"version": 1, "overrides": [], "versoin": 1}, "versoin")
    bad = override()
    bad["approved"] = True
    expect_error("unknown extra override key", config(bad), "approved")
    bad = override()
    bad["reasno"] = "typo"
    expect_error("typo override key", config(bad), "reasno")
    bad = override()
    bad["chronology"]["source"] = "review note"
    expect_error("unknown chronology key", config(bad), "source")
    bad = override()
    bad["chronology"]["precision"] = "year"
    expect_error("typo chronology key", config(bad), "precision")
    bad = override()
    bad["chronology"]["start"]["calendar"] = "gregorian"
    expect_error("unknown start key", config(bad), "calendar")
    bad = override()
    bad["chronology"]["start"]["yeer"] = 1955
    expect_error("typo start key", config(bad), "yeer")
    bad = override(chrono=chronology(1954, 1960, "period", "1954 - 1960"))
    bad["chronology"]["end"]["monthName"] = "January"
    expect_error("unknown end key", config(bad), "monthName")

    real_config = Path(__file__).resolve().parent / "config" / "chronology_overrides.json"
    real_config_data = json.loads(real_config.read_text(encoding="utf-8"))
    loaded = load_chronology_overrides(real_config, real_stage4a_event_ids())
    assert len(loaded) == len(real_config_data["overrides"]), "real config should load every configured override"
    print("[OK] real chronology config loads")

    # Invalid cases.
    expect_error("unknown top-level version", {"version": 2, "overrides": []}, "Unsupported")
    expect_error("boolean top-level version", {"version": True, "overrides": []}, "Unsupported")
    expect_error("missing overrides", {"version": 1}, "overrides")
    expect_error("duplicate event IDs", config(override(), override()), "Duplicate")
    expect_error("unknown target event ID", config(override("missing-event")), "does not exist")
    bad = override("")
    expect_error("empty eventId", config(bad), "eventId")
    bad = override(mode="review")
    expect_error("unsupported mode", config(bad), "unsupported mode")
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
    bad["chronology"]["end"]["year"] = 1834
    expect_error("policy chronology mismatch", config(bad), "does not match")
    bad = copy.deepcopy(policy_override)
    bad["chronology"]["start"]["month"] = 1
    expect_error("policy rejects non-null month", config(bad), "does not match")
    bad = override()
    bad["category"] = ""
    expect_error("empty category", config(bad), "category")
    bad = override()
    bad["reason"] = ""
    expect_error("empty reason", config(bad), "reason")
    bad = override()
    del bad["chronology"]["start"]
    expect_error("malformed chronology", config(bad), "missing required")
    bad = override(chrono=chronology(True, None, "year", "Năm 1954"))
    expect_error("boolean year", config(bad), "year")
    bad_chrono = chronology(1954, None, "month", "Tháng 13 năm 1954")
    bad_chrono["start"]["month"] = 13
    expect_error("month outside range", config(override(chrono=bad_chrono)), "month")
    bad_chrono = chronology(1954, None, "day", "Ngày 32-1-1954")
    bad_chrono["start"]["day"] = 32
    expect_error("day outside range", config(override(chrono=bad_chrono)), "day")
    expect_error("canonical year zero", config(override(chrono=chronology(0, None, "year", "Năm 0"))), "must not be 0")
    expect_error(
        "end year before start year",
        config(override(chrono=chronology(1960, 1954, "period", "1960 - 1954"))),
        "end.year",
    )
    expect_error(
        "unsupported datePrecision",
        config(override(chrono=chronology(1954, None, "century", "Thế kỉ XX"))),
        "datePrecision",
    )
    bad = override()
    bad["reason"] = "Chá»§ text is corrupted"
    expect_error("obvious mojibake", config(bad), "mojibake")
    bad = override()
    bad["chronology"]["sourceOnlyField"] = "must not leak"
    expect_error("unknown chronology key cannot leak", config(bad), "sourceOnlyField")

    # 24. Applying an override changes only chronology.
    row = {
        "suggestedId": "event-one",
        "titles": {"primary": "Original title"},
        "classification": {"eventType": "political"},
        "chronology": chronology(1900, None, "year", "Năm 1900"),
        "summary": {"cardSummary": "Stable"},
    }
    overrides = index_chronology_overrides(config(override()), VALID_EVENT_IDS)
    applied_counts = {"event-one": 0}
    changed = apply_chronology_override(row, "event-one", overrides, applied_counts)
    for key in row:
        if key != "chronology":
            assert changed[key] == row[key], f"unexpected non-chronology change: {key}"
    assert changed["chronology"] == overrides["event-one"]["chronology"]
    assert applied_counts["event-one"] == 1
    print("[OK] override changes only chronology")

    # 25. Input source row is not mutated.
    assert row["chronology"]["start"]["year"] == 1900
    print("[OK] input row is not mutated")

    # 26. Same input + config produces identical output twice.
    first = apply_chronology_override(row, "event-one", overrides)
    second = apply_chronology_override(row, "event-one", overrides)
    assert first == second
    assert first is not second
    print("[OK] deterministic override application")

    # Exact replacement means no hidden inheritance from damaged source chronology.
    row_with_extra = copy.deepcopy(row)
    row_with_extra["chronology"]["sourceOnlyField"] = "should disappear"
    replaced = apply_chronology_override(row_with_extra, "event-one", overrides)
    assert "sourceOnlyField" not in replaced["chronology"]
    print("[OK] exact replacement chronology semantics")

    # Temporary positive integration proof through the Stage4A merge/apply/make_event path.
    fixture_rows = [
        stage4_row("fixture-stage4-event", 1900),
        stage4_row("unrelated-stage4-event", 1800),
    ]
    fixture_overrides = index_chronology_overrides(
        config(
            override(
                "fixture-stage4-event",
                chrono=chronology(1954, 1960, "period", "1954 - 1960"),
            )
        ),
        VALID_EVENT_IDS,
    )
    fixture_counts = {event_id: 0 for event_id in fixture_overrides}
    before_events = {}
    after_events = {}
    for fixture_row in fixture_rows:
        merged_row, collisions = merge_rows([fixture_row])
        assert collisions == []
        event_id = event_id_for_sid(merged_row["suggestedId"])
        before_events[event_id] = canonical_event(merged_row)
        changed_row = apply_chronology_override(merged_row, event_id, fixture_overrides, fixture_counts)
        after_events[event_id] = canonical_event(changed_row)
    validate_all_overrides_applied(fixture_counts)
    changed_ids = sorted(event_id for event_id in before_events if before_events[event_id] != after_events[event_id])
    assert changed_ids == ["fixture-stage4-event"]
    for key in before_events["fixture-stage4-event"]:
        if key != "chronology":
            assert before_events["fixture-stage4-event"][key] == after_events["fixture-stage4-event"][key]
    assert fixture_counts["fixture-stage4-event"] == 1
    print("[OK] Stage4A integration fixture changes only target chronology")

    print("=== TAT CA CHRONOLOGY REPAIR TEST PASS ===")


if __name__ == "__main__":
    run_tests()
