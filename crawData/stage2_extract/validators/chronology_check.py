import os
import json
import argparse
from datetime import datetime

def is_valid_year(year):
    if year is None:
        return True
    return isinstance(year, int)

def validate_date_obj(date_obj, is_start=True):
    if not date_obj:
        return []
    
    errors = []
    year = date_obj.get("year")
    month = date_obj.get("month")
    day = date_obj.get("day")
    
    if year is not None and not isinstance(year, int):
        errors.append(f"Year '{year}' must be an integer or null.")
    if month is not None:
        if not isinstance(month, int) or month < 1 or month > 12:
            errors.append(f"Month '{month}' must be an integer between 1 and 12.")
    if day is not None:
        if not isinstance(day, int) or day < 1 or day > 31:
            errors.append(f"Day '{day}' must be an integer between 1 and 31.")
            
    # Check logical combinations
    if day is not None and month is None:
        errors.append("Cannot have a day without a month.")
    if month is not None and year is None:
        errors.append("Cannot have a month without a year.")
        
    return errors

def compare_dates(start, end):
    # returns True if start <= end, else False
    if not start or not end:
        return True
    
    sy, sm, sd = start.get("year"), start.get("month"), start.get("day")
    ey, em, ed = end.get("year"), end.get("month"), end.get("day")
    
    if sy is None or ey is None:
        return True # Can't compare accurately
        
    if sy < ey: return True
    if sy > ey: return False
    
    # Same year
    if sm is None or em is None: return True
    if sm < em: return True
    if sm > em: return False
    
    # Same month
    if sd is None or ed is None: return True
    if sd <= ed: return True
    return False

def validate_file(filepath):
    errors = []
    warnings = []
    stats = {
        "10": {"vietnam": 0, "world": 0},
        "11": {"vietnam": 0, "world": 0},
        "12": {"vietnam": 0, "world": 0},
        "total": {"vietnam": 0, "world": 0},
        "flags": {
            "invalid_precision": 0,
            "bce_positive_year": 0,
            "century_with_year": 0
        }
    }
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        for line_num, line in enumerate(lines, 1):
            if not line.strip(): continue
            try:
                data = json.loads(line)
            except Exception as e:
                errors.append(f"Line {line_num}: Invalid JSON - {e}")
                continue
                
            lesson_id = data.get("lesson_id", "UNKNOWN")
            grade = str(data.get("grade", ""))
            
            # Check chronology of all events
            events_to_check = data.get("events", [data]) if "events" in data else [data]
            for i, event in enumerate(events_to_check):
                sid = event.get("suggestedId", f"event_{i}")
                
                # Check region
                region = event.get("classification", {}).get("region")
                if region not in ["vietnam", "world"]:
                    errors.append(f"[FLAG] Lesson {lesson_id} Event '{sid}': Missing or invalid region '{region}'. Must be 'vietnam' or 'world'.")
                else:
                    stats["total"][region] += 1
                    if grade in stats:
                        stats[grade][region] += 1
                        
                chrono = event.get("chronology")
                
                if not chrono:
                    continue
                    
                start = chrono.get("start")
                end = chrono.get("end")
                precision = chrono.get("datePrecision")
                display_date = chrono.get("displayDate", "")
                
                # Check 2.1: datePrecision
                if precision not in ["day", "month", "year", "period", "approximate"]:
                    errors.append(f"[FLAG] Lesson {lesson_id} Event '{sid}': datePrecision ngoài enum: '{precision}'.")
                    stats["flags"]["invalid_precision"] += 1
                    
                # Check 2.2: TCN with positive year
                # Chi flag start.year neu TCN thuan (khong co nam duong hop le o cuoi khoang hoa hop)
                import re as _re
                display_lower = display_date.lower() if display_date else ""
                if "tcn" in display_lower or "tr\u01b0\u1edbc c\u00f4ng nguy\u00ean" in display_lower:
                    # Detect CE year: 4 chữ số không theo sau bởi "tcn" (bắt cả "năm 1857" và "– 1857")
                    has_ce_year_in_display = bool(_re.search(r"\d{4}(?!\s*tcn)", display_lower))
                    sy = start.get("year") if start else None
                    ey = end.get("year") if end else None
                    flag_start = (sy is not None and sy > 0)
                    # Khong flag end.year khi start.year=None (khoang hon hop hop le: start=thien nien ki, end=nam CN)
                    flag_end = (ey is not None and ey > 0 and not has_ce_year_in_display and sy is not None)
                    if flag_start or flag_end:
                        errors.append(f"[FLAG] Lesson {lesson_id} Event '{sid}': N\u0103m TCN nh\u01b0ng year d\u01b0\u01a1ng, nghi thi\u1ebfu d\u1ea5u \u00e2m (start={sy}, end={ey}).")
                        stats["flags"]["bce_positive_year"] += 1
                        
                # Check 2.3: Century/Millennium with BOTH years not null AND no specific CE year in display
                # Tranh false positive voi khoang hon hop (start=the ki TCN, end=nam CN cu the)
                if "th\u1ebf k\u1ec9" in display_lower or "thi\u00ean ni\u00ean k\u1ec9" in display_lower:
                    has_specific_year = bool(_re.search(r"\d{3,4}", display_lower))
                    sy = start.get("year") if start else None
                    ey = end.get("year") if end else None
                    # Chi flag neu CA 2 year deu khong null VA displayDate thuan the ki (khong co nam cu the)
                    if sy is not None and ey is not None and not has_specific_year:
                        errors.append(f"[FLAG] Lesson {lesson_id} Event '{sid}': displayDate thu\u1ea7n th\u1ebf k\u1ec9/thi\u00ean ni\u00ean k\u1ec9 nh\u01b0ng c\u1ea3 start.year={sy} v\u00e0 end.year={ey} \u0111\u1ec1u kh\u00f4ng null, nghi LLM t\u1ef1 quy \u0111\u1ed5i.")
                        stats["flags"]["century_with_year"] += 1
                
                start_errs = validate_date_obj(start, is_start=True)
                end_errs = validate_date_obj(end, is_start=False)
                
                for err in start_errs:
                    errors.append(f"Lesson {lesson_id} Event '{sid}' Start Date: {err}")
                for err in end_errs:
                    errors.append(f"Lesson {lesson_id} Event '{sid}' End Date: {err}")
                    
                if not start_errs and not end_errs:
                    if not compare_dates(start, end):
                        errors.append(f"Lesson {lesson_id} Event '{sid}': Start date is after End date.")
                        
    except Exception as e:
        errors.append(f"Failed to process file {filepath}: {e}")
        
    return errors, warnings, stats

def main():
    # Default path is relative to the script file, not CWD
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _default_input = os.path.join(_script_dir, "..", "output", "event_candidates.jsonl")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=_default_input, help="Path to event_candidates.jsonl")
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file {args.input} not found.")
        return
        
    print(f"Validating chronology and regions for {args.input}...")
    errors, warnings, stats = validate_file(args.input)
    
    print("\n--- Validation Results ---")
    if errors:
        print(f"Found {len(errors)} errors:")
        for e in errors:
            print(f"  [ERROR] {e}")
    else:
        print("No errors found!")
        
    if warnings:
        print(f"Found {len(warnings)} warnings:")
        for w in warnings:
            print(f"  [WARN] {w}")
            
    # Ghi bao cao vao validation_report.md
    report_lines = []
    report_lines.append("# Báo cáo Validation (Hậu kiểm)")
    report_lines.append(f"- Thời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"- File dữ liệu: {args.input}")
    
    report_lines.append("\n## 1. Thống kê theo Region (Việt Nam vs Thế giới)")
    report_lines.append("| Lớp | Việt Nam | Thế giới | Tổng |")
    report_lines.append("|---|---|---|---|")
    for g in ["10", "11", "12"]:
        vn = stats[g]['vietnam']
        w = stats[g]['world']
        report_lines.append(f"| Lớp {g} | {vn} | {w} | {vn + w} |")
    
    tvn = stats['total']['vietnam']
    tw = stats['total']['world']
    report_lines.append(f"| **Tổng cộng** | **{tvn}** | **{tw}** | **{tvn + tw}** |")

    report_lines.append("\n## 2. Kết quả kiểm tra lỗi (Errors / Flags)")
    report_lines.append("### Thống kê vi phạm Chronology Mới")
    report_lines.append(f"- datePrecision ngoài enum: {stats['flags']['invalid_precision']}")
    report_lines.append(f"- Năm TCN nhưng year dương: {stats['flags']['bce_positive_year']}")
    report_lines.append(f"- displayDate cấp thế kỉ nhưng year không null: {stats['flags']['century_with_year']}\n")
    
    if not errors:
        report_lines.append("✅ Không phát hiện lỗi nghiêm trọng (Zero errors).")
    else:
        report_lines.append(f"❌ Phát hiện {len(errors)} lỗi:")
        for e in errors:
            report_lines.append(f"- {e}")
            
    report_lines.append("\n## 3. Cảnh báo (Warnings)")
    if not warnings:
        report_lines.append("✅ Không có cảnh báo.")
    else:
        for w in warnings:
            report_lines.append(f"- {w}")
            
    out_dir = os.path.dirname(args.input)
    if not out_dir: out_dir = "."
    report_path = os.path.join(out_dir, "validation_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
        
    print(f"Đã ghi báo cáo chi tiết vào: {report_path}")
            
if __name__ == "__main__":
    main()
