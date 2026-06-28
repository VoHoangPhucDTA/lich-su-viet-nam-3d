"""
validate_exam.py – Validate JSON đề thi đã parse

Kiểm tra:
- Đủ câu MCQ (24) và Đ/S (4)
- Mỗi MCQ có đúng 4 options và correctOptionId hợp lệ
- Mỗi Đ/S có đúng 4 statements với isTrue
- Metadata đầy đủ

Usage:
  python validate_exam.py output/exams/de-thi-2025.json
  python validate_exam.py output/exams/  # validate tất cả JSON trong thư mục
"""

import argparse
import json
import sys
from pathlib import Path


def validate_exam(data: dict, filename: str = "") -> list[str]:
    """Validate 1 đề thi JSON, trả về danh sách lỗi/cảnh báo."""
    issues: list[str] = []
    prefix = f"[{filename}] " if filename else ""

    # Metadata
    for field in ["examId", "title", "year", "format", "timeLimitMinutes", "totalScore"]:
        if not data.get(field):
            issues.append(f"{prefix}Thiếu metadata: {field}")

    sections = data.get("sections", [])
    if not sections:
        issues.append(f"{prefix}Không có sections nào!")
        return issues

    total_mcq = 0
    total_tf = 0

    for section in sections:
        s_type = section.get("sectionType")
        questions = section.get("questions", [])

        for q in questions:
            q_num = q.get("orderInExam", "?")
            q_type = q.get("questionType")

            if q_type == "mcq":
                total_mcq += 1
                options = q.get("options", [])
                if len(options) != 4:
                    issues.append(f"{prefix}Câu {q_num} (MCQ): {len(options)} options (cần 4)")
                
                option_ids = [o.get("id") for o in options]
                for expected in ["A", "B", "C", "D"]:
                    if expected not in option_ids:
                        issues.append(f"{prefix}Câu {q_num} (MCQ): thiếu option {expected}")

                correct = q.get("correctOptionId")
                if correct not in ["A", "B", "C", "D"]:
                    issues.append(f"{prefix}Câu {q_num} (MCQ): correctOptionId = {correct} (không hợp lệ)")

                if not q.get("questionText", "").strip():
                    issues.append(f"{prefix}Câu {q_num} (MCQ): questionText rỗng")

            elif q_type == "true_false":
                total_tf += 1
                stmts = q.get("statements", [])
                if len(stmts) != 4:
                    issues.append(f"{prefix}Câu {q_num} (Đ/S): {len(stmts)} statements (cần 4)")

                for stmt in stmts:
                    if stmt.get("isTrue") is None:
                        issues.append(f"{prefix}Câu {q_num}{stmt.get('id', '?')} (Đ/S): isTrue = null")
                    if not stmt.get("text", "").strip():
                        issues.append(f"{prefix}Câu {q_num}{stmt.get('id', '?')} (Đ/S): text rỗng")

                if not q.get("questionText", "").strip():
                    issues.append(f"{prefix}Câu {q_num} (Đ/S): questionText rỗng")

            # Kiểm tra topic và cognitiveLevel
            if not q.get("topic"):
                issues.append(f"{prefix}Câu {q_num}: thiếu topic")
            if q.get("cognitiveLevel") not in ["knowledge", "comprehension", "application"]:
                issues.append(f"{prefix}Câu {q_num}: cognitiveLevel không hợp lệ: {q.get('cognitiveLevel')}")

    # Kiểm tra số lượng
    exam_format = data.get("format", "")
    if exam_format == "thpt_2025":
        if total_mcq != 24:
            issues.append(f"{prefix}Tổng MCQ = {total_mcq} (kỳ vọng 24)")
        if total_tf != 4:
            issues.append(f"{prefix}Tổng Đ/S = {total_tf} (kỳ vọng 4)")
    elif exam_format == "thpt_legacy":
        if total_mcq != 40:
            issues.append(f"{prefix}Tổng MCQ = {total_mcq} (kỳ vọng 40 cho đề cũ)")

    return issues


def main():
    parser = argparse.ArgumentParser(description="Validate JSON đề thi đã parse")
    parser.add_argument("input_path", help="File JSON hoặc thư mục chứa JSON")
    args = parser.parse_args()

    input_path = Path(args.input_path)
    files: list[Path] = []

    if input_path.is_file() and input_path.suffix == ".json":
        files = [input_path]
    elif input_path.is_dir():
        files = sorted(input_path.glob("*.json"))
    else:
        print(f"❌ Đường dẫn không hợp lệ: {input_path}")
        sys.exit(1)

    if not files:
        print(f"❌ Không tìm thấy file JSON nào.")
        sys.exit(1)

    total_issues = 0
    for f in files:
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)

        issues = validate_exam(data, f.name)
        if issues:
            print(f"\n⚠ {f.name}: {len(issues)} vấn đề")
            for issue in issues:
                print(f"  - {issue}")
            total_issues += len(issues)
        else:
            print(f"✅ {f.name}: OK")

    print(f"\n{'='*40}")
    print(f"Tổng: {len(files)} file, {total_issues} vấn đề")


if __name__ == "__main__":
    main()
