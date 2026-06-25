"""
merge_bank.py – Gộp câu hỏi từ nhiều đề thi JSON → question_bank.json

Tách từng câu hỏi riêng lẻ ra khỏi đề, gán thêm metadata nguồn,
tạo ngân hàng câu hỏi cho chế độ "Luyện custom" (theo chủ đề/độ khó).

Usage:
  python merge_bank.py output/exams/ --output output/question_bank.json
"""

import argparse
import json
import sys
from pathlib import Path


def extract_questions(exam: dict) -> list[dict]:
    """Trích xuất tất cả câu hỏi từ 1 đề, gán thêm metadata nguồn."""
    questions: list[dict] = []
    exam_id = exam.get("examId", "")
    exam_title = exam.get("title", "")
    exam_year = exam.get("year", 0)
    exam_source = exam.get("source", "")

    for section in exam.get("sections", []):
        for q in section.get("questions", []):
            # Thêm metadata nguồn vào câu hỏi
            q_copy = {**q}
            q_copy["examId"] = exam_id
            q_copy["examTitle"] = exam_title
            q_copy["examYear"] = exam_year
            q_copy["examSource"] = exam_source
            q_copy["grade"] = 12  # Đề THPT mặc định lớp 12
            questions.append(q_copy)

    return questions


def merge_banks(exam_dir: Path) -> dict:
    """Đọc tất cả JSON đề thi trong thư mục, gộp thành ngân hàng câu hỏi."""
    json_files = sorted(exam_dir.glob("*.json"))
    if not json_files:
        print(f"❌ Không tìm thấy file JSON nào trong {exam_dir}")
        sys.exit(1)

    all_questions: list[dict] = []
    exam_count = 0

    for f in json_files:
        # Bỏ qua question_bank.json nếu có
        if f.name == "question_bank.json":
            continue

        with open(f, "r", encoding="utf-8") as fp:
            exam = json.load(fp)

        questions = extract_questions(exam)
        all_questions.extend(questions)
        exam_count += 1
        print(f"  ✓ {f.name}: {len(questions)} câu")

    # Deduplicate theo id
    seen_ids: set[str] = set()
    unique: list[dict] = []
    for q in all_questions:
        qid = q.get("id", "")
        if qid and qid not in seen_ids:
            seen_ids.add(qid)
            unique.append(q)

    # Thống kê
    mcq_count = sum(1 for q in unique if q.get("questionType") == "mcq")
    tf_count = sum(1 for q in unique if q.get("questionType") == "true_false")

    topics: dict[str, int] = {}
    for q in unique:
        t = q.get("topic", "Không xác định")
        topics[t] = topics.get(t, 0) + 1

    bank = {
        "generatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "totalQuestions": len(unique),
        "mcqCount": mcq_count,
        "trueFalseCount": tf_count,
        "examCount": exam_count,
        "topicDistribution": dict(sorted(topics.items(), key=lambda x: -x[1])),
        "questions": unique,
    }

    return bank


def main():
    parser = argparse.ArgumentParser(description="Gộp câu hỏi từ nhiều đề → question_bank.json")
    parser.add_argument("exam_dir", help="Thư mục chứa JSON đề thi đã parse")
    parser.add_argument(
        "--output",
        default=None,
        help="Đường dẫn file output (mặc định: <exam_dir>/../question_bank.json)",
    )
    args = parser.parse_args()

    exam_dir = Path(args.exam_dir)
    if not exam_dir.is_dir():
        print(f"❌ Thư mục không tồn tại: {exam_dir}")
        sys.exit(1)

    print(f"📁 Đọc đề thi từ: {exam_dir}")
    bank = merge_banks(exam_dir)

    output_path = Path(args.output) if args.output else exam_dir.parent / "question_bank.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Ngân hàng câu hỏi: {bank['totalQuestions']} câu ({bank['mcqCount']} MCQ + {bank['trueFalseCount']} Đ/S)")
    print(f"   Từ {bank['examCount']} đề thi")
    print(f"   Chủ đề: {len(bank['topicDistribution'])} chủ đề khác nhau")
    print(f"   → {output_path}")


if __name__ == "__main__":
    main()
