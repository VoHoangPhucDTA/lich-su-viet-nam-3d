"""
Test fix_bce_years, fix_period_years va validate_schema voi cac ca bien quan trong.
"""
import sys, os
from types import SimpleNamespace

sys.modules.setdefault("requests", SimpleNamespace(post=None))
sys.path.insert(0, os.path.dirname(__file__))
from extract import fix_bce_years, fix_period_years, validate_schema

def make_event(sid, dd, start_year, end_year, precision="approximate"):
    return {
        "suggestedId": sid,
        "classification": {"region": "world"},
        "chronology": {
            "displayDate": dd,
            "datePrecision": precision,
            "start": {"year": start_year, "month": None, "day": None},
            "end":   {"year": end_year,   "month": None, "day": None},
            "isApproximate": True
        }
    }

def clone(data):
    import copy
    return copy.deepcopy(data)

def run_tests():
    errors = []

    # --- Ca 1: Thuan TCN, ca start va end deu phai am ---
    data1 = {"events": [make_event("test1", "Khoảng năm 3200 TCN – năm 30 TCN", 3200, 30)], "concepts": []}
    fix_bce_years(data1)
    s = data1["events"][0]["chronology"]["start"]["year"]
    e = data1["events"][0]["chronology"]["end"]["year"]
    assert s == -3200, f"Ca 1 FAIL: start={s}, expected -3200"
    assert e == -30,   f"Ca 1 FAIL: end={e}, expected -30"
    print(f"[OK] Ca 1 (thuan TCN): start={s}, end={e}")

    # --- Ca 2: Hon hop TCN + CE, end phai KHONG bi negate ---
    data2 = {"events": [make_event("test2", "Giữa thiên niên kỉ III TCN – năm 1857", None, 1857, "period")], "concepts": []}
    fix_bce_years(data2)
    e = data2["events"][0]["chronology"]["end"]["year"]
    assert e == 1857, f"Ca 2 FAIL: end={e}, expected 1857 (khong bi negate)"
    print(f"[OK] Ca 2 (hon hop TCN+CE): end={e} (giu nguyen)")

    # --- Ca 3: Tuong tu voi nam 1911 ---
    data3 = {"events": [make_event("test3", "Khoảng thế kỉ XXI TCN – năm 1911", None, 1911, "period")], "concepts": []}
    fix_bce_years(data3)
    e = data3["events"][0]["chronology"]["end"]["year"]
    assert e == 1911, f"Ca 3 FAIL: end={e}, expected 1911"
    print(f"[OK] Ca 3 (TCN+1911): end={e} (giu nguyen)")

    # --- Ca 4: Nam 558 TCN thuan ---
    data4 = {"events": [make_event("test4", "Năm 558 TCN", 558, None)], "concepts": []}
    fix_bce_years(data4)
    s = data4["events"][0]["chronology"]["start"]["year"]
    assert s == -558, f"Ca 4 FAIL: start={s}, expected -558"
    print(f"[OK] Ca 4 (558 TCN): start={s}")

    # --- Ca 5: Gemini dung dung (-558) -> khong doi ---
    data5 = {"events": [make_event("test5", "Năm 558 TCN", -558, None)], "concepts": []}
    fix_bce_years(data5)
    s = data5["events"][0]["chronology"]["start"]["year"]
    assert s == -558, f"Ca 5 FAIL: start={s}, expected -558 (giu nguyen)"
    print(f"[OK] Ca 5 (da am -> giu nguyen): start={s}")

    # --- Ca 6: period co range nam hop le thi giu year ---
    data6 = {"events": [make_event("test6", "1954 - 1960", 1954, 1960, "period")], "concepts": []}
    fix_period_years(data6)
    c = data6["events"][0]["chronology"]
    assert c["start"]["year"] == 1954, f"Ca 6 FAIL: start.year={c['start']['year']}"
    assert c["end"]["year"] == 1960,   f"Ca 6 FAIL: end.year={c['end']['year']}"
    print(f"[OK] Ca 6 (period range giu year): start={c['start']['year']}, end={c['end']['year']}")

    # --- Ca 7: period co 1 start year hop le thi giu start, end null ---
    data7 = {"events": [make_event("test7", "1954", 1954, None, "period")], "concepts": []}
    fix_period_years(data7)
    c = data7["events"][0]["chronology"]
    assert c["start"]["year"] == 1954, f"Ca 7 FAIL: start.year={c['start']['year']}"
    assert c["end"]["year"] is None, f"Ca 7 FAIL: end.year={c['end']['year']}"
    print(f"[OK] Ca 7 (period start year only): start={c['start']['year']}, end={c['end']['year']}")

    # --- Ca 8: period khong co year thi khong tu suy dien ---
    data8 = {"events": [make_event("test8", "Thoi ky khong ro", None, None, "period")], "concepts": []}
    fix_period_years(data8)
    c = data8["events"][0]["chronology"]
    assert c["start"]["year"] is None, f"Ca 8 FAIL: start.year={c['start']['year']}"
    assert c["end"]["year"] is None, f"Ca 8 FAIL: end.year={c['end']['year']}"
    print(f"[OK] Ca 8 (period no years): start={c['start']['year']}, end={c['end']['year']}")

    # --- Ca 9: non-period chronology khong doi ---
    data9 = {"events": [make_event("test9", "Nam 1954", 1954, None, "year")], "concepts": []}
    before9 = clone(data9)
    fix_period_years(data9)
    assert data9 == before9, "Ca 9 FAIL: non-period chronology bi thay doi"
    print("[OK] Ca 9 (non-period unchanged)")

    # --- Ca 10: nam am hop le trong period khong bi xoa/chuyen doi ---
    data10 = {"events": [make_event("test10", "Nam 208 TCN", -208, None, "period")], "concepts": []}
    fix_period_years(data10)
    c = data10["events"][0]["chronology"]
    assert c["start"]["year"] == -208, f"Ca 10 FAIL: start.year={c['start']['year']}"
    print(f"[OK] Ca 10 (period BCE year): start={c['start']['year']}")

    # --- Ca 11: idempotency va representative range 1964 - 1965 ---
    data11 = {"events": [make_event("test11", "1964 - 1965", 1964, 1965, "period")], "concepts": []}
    fix_period_years(data11)
    once = clone(data11)
    fix_period_years(data11)
    assert data11 == once, "Ca 11 FAIL: fix_period_years khong idempotent"
    c = data11["events"][0]["chronology"]
    assert c["start"]["year"] == 1964 and c["end"]["year"] == 1965, "Ca 11 FAIL: range 1964-1965 khong duoc giu"
    print(f"[OK] Ca 11 (idempotent 1964-1965): start={c['start']['year']}, end={c['end']['year']}")

    # --- Ca 12: period xoa month/day qua chi tiet nhung giu year ---
    data12 = {"events": [make_event("test12", "1954 - 1960", 1954, 1960, "period")], "concepts": []}
    data12["events"][0]["chronology"]["start"]["month"] = 5
    data12["events"][0]["chronology"]["end"]["day"] = 7
    fix_period_years(data12)
    c = data12["events"][0]["chronology"]
    assert c["start"]["year"] == 1954 and c["end"]["year"] == 1960, "Ca 12 FAIL: year bi xoa"
    assert c["start"]["month"] is None and c["end"]["day"] is None, "Ca 12 FAIL: month/day khong duoc normalize"
    print("[OK] Ca 12 (period clears month/day only)")

    # --- Ca 13: validate_schema bat events=[] va concepts=[] dong thoi ---
    data7 = {"lesson_id": "99999", "lesson_title": "Test", "events": [], "concepts": []}
    try:
        validate_schema(data7, "99999")
        errors.append("Ca 13 FAIL: validate_schema khong raise khi events=concepts=[]")
    except ValueError as ex:
        print(f"[OK] Ca 13 (events=concepts=[]): raise '{ex}'")

    # --- Ca 14: Bai thuan ly thuyet hop le (events=[], concepts=[...]) -> PASS ---
    data8 = {
        "lesson_id": "99998", "lesson_title": "Test",
        "events": [],
        "concepts": [{"suggestedId": "kn1"}]
    }
    try:
        validate_schema(data8, "99998")
        print(f"[OK] Ca 14 (events=[], concepts=[1]): PASS (hop le)")
    except ValueError as ex:
        errors.append(f"Ca 14 FAIL: {ex}")

    print()
    if errors:
        for err in errors:
            print(f"[FAIL] {err}")
        sys.exit(1)
    else:
        print("=== TAT CA TEST PASS ===")

if __name__ == "__main__":
    run_tests()
