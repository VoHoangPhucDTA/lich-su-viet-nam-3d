import json
import os
import sys

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "..")
    output_dir = os.path.join(base_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    
    report_lines = [
        "# Health Report: Dữ liệu Raw Giai đoạn 1",
        "",
        "| Metric | Lớp 10 | Lớp 11 | Lớp 12 |",
        "|---|---|---|---|"
    ]
    
    metrics = {"10": {}, "11": {}, "12": {}}
    
    page_null_details = []
    
    for grade in ["10", "11", "12"]:
        fname = os.path.join(data_dir, f"lich_su_{grade}_kntt.json")
        if not os.path.exists(fname):
            metrics[grade] = {"error": "File not found"}
            continue
            
        with open(fname, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        lessons = data.get("lessons", [])
        total_lessons = len(lessons)
        not_success = [l["lesson_id"] for l in lessons if l.get("status") not in ("success", "resumed")]
        
        total_blocks = 0
        page_null = 0
        block_types = {}
        lengths = []
        
        for lesson in lessons:
            blocks = lesson.get("blocks", [])
            total_blocks += len(blocks)
            ct = len(lesson.get("content_text", ""))
            if ct > 0: lengths.append(ct)
            
            null_in_lesson = 0
            for b in blocks:
                t = b.get("type", "unknown")
                block_types[t] = block_types.get(t, 0) + 1
                if b.get("page") is None:
                    page_null += 1
                    null_in_lesson += 1
                    
            if null_in_lesson > 0:
                page_null_details.append(f"- Lớp {grade} - Bài {lesson['lesson_id']} ({lesson.get('title','')}): {null_in_lesson}/{len(blocks)} blocks page=null")
                
        metrics[grade] = {
            "total_lessons": total_lessons,
            "not_success": len(not_success),
            "total_blocks": total_blocks,
            "page_null": page_null,
            "block_types": block_types,
            "min_len": min(lengths) if lengths else 0,
            "max_len": max(lengths) if lengths else 0,
            "avg_len": sum(lengths) // len(lengths) if lengths else 0
        }
        
    # Build markdown table
    m10, m11, m12 = metrics["10"], metrics["11"], metrics["12"]
    
    def get_val(m, key):
        if "error" in m: return "-"
        return str(m.get(key, 0))
        
    def get_type(m, t):
        if "error" in m: return "-"
        return str(m.get("block_types", {}).get(t, 0))
        
    report_lines.append(f"| Tổng bài học | {get_val(m10, 'total_lessons')} | {get_val(m11, 'total_lessons')} | {get_val(m12, 'total_lessons')} |")
    report_lines.append(f"| Tổng blocks | {get_val(m10, 'total_blocks')} | {get_val(m11, 'total_blocks')} | {get_val(m12, 'total_blocks')} |")
    report_lines.append(f"| Lỗi fetch (status!=success) | {get_val(m10, 'not_success')} | {get_val(m11, 'not_success')} | {get_val(m12, 'not_success')} |")
    report_lines.append(f"| `page=null` | {get_val(m10, 'page_null')} | {get_val(m11, 'page_null')} | {get_val(m12, 'page_null')} |")
    report_lines.append(f"| Block `source_text` | {get_type(m10, 'source_text')} | {get_type(m11, 'source_text')} | {get_type(m12, 'source_text')} |")
    report_lines.append(f"| Block `question` | {get_type(m10, 'question')} | {get_type(m11, 'question')} | {get_type(m12, 'question')} |")
    report_lines.append(f"| Block `table` | {get_type(m10, 'table')} | {get_type(m11, 'table')} | {get_type(m12, 'table')} |")
    report_lines.append(f"| Block `list` | {get_type(m10, 'list')} | {get_type(m11, 'list')} | {get_type(m12, 'list')} |")
    report_lines.append(f"| Ký tự (Min) | {get_val(m10, 'min_len')} | {get_val(m11, 'min_len')} | {get_val(m12, 'min_len')} |")
    report_lines.append(f"| Ký tự (Max) | {get_val(m10, 'max_len')} | {get_val(m11, 'max_len')} | {get_val(m12, 'max_len')} |")
    report_lines.append(f"| Ký tự (Avg) | {get_val(m10, 'avg_len')} | {get_val(m11, 'avg_len')} | {get_val(m12, 'avg_len')} |")
    
    report_lines.append("")
    report_lines.append("## Chi tiết `page=null`")
    if page_null_details:
        report_lines.extend(page_null_details)
    else:
        report_lines.append("Tất cả blocks đều có page.")
        
    report_path = os.path.join(output_dir, "health_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
        
    print(f"Da kiem tra xong! Ket qua luu tai: {report_path}")

if __name__ == "__main__":
    main()
