"""
Test fix_bce_years va validate_schema voi cac ca bien quan trong.
"""
import sys, os
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

    # --- Ca 6: fix_period_years null out year khi datePrecision=period ---
    data6 = {"events": [make_event("test6", "The ki IV - VI", 301, 600, "period")], "concepts": []}
    fix_period_years(data6)
    c = data6["events"][0]["chronology"]
    assert c["start"]["year"] is None, f"Ca 6 FAIL: start.year={c['start']['year']}"
    assert c["end"]["year"] is None,   f"Ca 6 FAIL: end.year={c['end']['year']}"
    print(f"[OK] Ca 6 (period -> null): start={c['start']['year']}, end={c['end']['year']}")

    # --- Ca 7: validate_schema bat events=[] va concepts=[] dong thoi ---
    data7 = {"lesson_id": "99999", "lesson_title": "Test", "events": [], "concepts": []}
    try:
        validate_schema(data7, "99999")
        errors.append("Ca 7 FAIL: validate_schema khong raise khi events=concepts=[]")
    except ValueError as ex:
        print(f"[OK] Ca 7 (events=concepts=[]): raise '{ex}'")

    # --- Ca 8: Bai thuan ly thuyet hop le (events=[], concepts=[...]) -> PASS ---
    data8 = {
        "lesson_id": "99998", "lesson_title": "Test",
        "events": [],
        "concepts": [{"suggestedId": "kn1"}]
    }
    try:
        validate_schema(data8, "99998")
        print(f"[OK] Ca 8 (events=[], concepts=[1]): PASS (hop le)")
    except ValueError as ex:
        errors.append(f"Ca 8 FAIL: {ex}")

    print()
    if errors:
        for err in errors:
            print(f"[FAIL] {err}")
        sys.exit(1)
    else:
        print("=== TAT CA TEST PASS ===")

if __name__ == "__main__":
    run_tests()
