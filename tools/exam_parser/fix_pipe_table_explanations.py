"""
fix_pipe_table_explanations.py

Vá các file JSON trong data/exams có explanation bị leak định dạng bảng thô:
    "Câu | Đáp án | Giải thích\n1 | C | <text>"   (MCQ)
    "a) | Đ | <text>\nb) | S | <text>"            (T/F)

Đáp án (C) đã nằm ở correctOptionId; isTrue (Đ/S) đã nằm ở statements[].isTrue,
nên phần "N | X |" / "a) | Đ |" là dữ liệu thừa. Script bóc prefix, giữ nguyên
nội dung lời giải, chỉ đổi cách trình bày.

- MCQ: "1 | C | text"  → "text"      (bỏ luôn dòng header "Câu | Đáp án | ...")
- T/F: "a) | Đ | text" → "a) text"   (giữ nhãn a/b/c/d để người đọc biết ý nào)

An toàn: KHÔNG sửa 1 ký tự nội dung, chỉ đụng file có leak, tạo .bak trước khi ghi.

Usage:
  python fix_pipe_table_explanations.py            # quét + sửa tại chỗ
  python fix_pipe_table_explanations.py --dry-run  # chỉ xem, không ghi
"""

import argparse
import json
import re
import shutil
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "exams"

HEADER_RE = re.compile(r"^\s*Câu\s*\|\s*Đáp\s*án\s*\|.*$", re.IGNORECASE)
# "1 | C | text"  hoặc  "12 | D | text"
MCQ_LINE_RE = re.compile(r"^\s*\d{1,3}\s*\|\s*[A-D?]?\s*\|\s*(.*)$", re.IGNORECASE)
# "a) | Đ | text"  hoặc  "a | S | text"
TF_LINE_RE = re.compile(r"^\s*([a-d])\)?\s*\|\s*[^|]*\|\s*(.*)$", re.IGNORECASE)


def reformat_explanation(text: str, qtype: str) -> str:
    """Bóc prefix bảng khỏi từng dòng explanation. Trả về text đã format."""
    out_lines: list[str] = []
    for line in text.split("\n"):
        if HEADER_RE.match(line):
            continue  # bỏ dòng header bảng

        if qtype == "true_false":
            m = TF_LINE_RE.match(line)
            if m:
                out_lines.append(f"{m.group(1).lower()}) {m.group(2).strip()}")
                continue
        else:
            m = MCQ_LINE_RE.match(line)
            if m:
                out_lines.append(m.group(1).strip())
                continue

        # Dòng không khớp pattern → giữ nguyên (thường là dòng nối tiếp của lời giải)
        if line.strip():
            out_lines.append(line.strip())

    return "\n".join(out_lines).strip()


def line_has_leak(text: str) -> bool:
    for line in text.split("\n"):
        if HEADER_RE.match(line) or MCQ_LINE_RE.match(line) or TF_LINE_RE.match(line):
            return True
    return False


def process_file(path: Path, dry_run: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    changed = 0
    for section in data.get("sections", []):
        for q in section.get("questions", []):
            expl = q.get("explanation", "")
            if not expl or not line_has_leak(expl):
                continue
            new_expl = reformat_explanation(expl, q.get("questionType", "mcq"))
            if new_expl != expl:
                q["explanation"] = new_expl
                changed += 1

    if changed and not dry_run:
        shutil.copy2(path, path.with_suffix(".json.bak"))
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Chỉ báo cáo, không ghi file")
    args = ap.parse_args()

    files = sorted(DATA_DIR.glob("*.json"))
    total = 0
    for f in files:
        try:
            n = process_file(f, args.dry_run)
        except Exception as e:
            print(f"  ⚠ Lỗi {f.name}: {e}")
            continue
        if n:
            tag = "[dry-run] " if args.dry_run else ""
            print(f"  ✓ {tag}{n:2d} explanation sửa | {f.name}")
            total += n

    verb = "sẽ sửa" if args.dry_run else "đã sửa"
    print(f"\n✅ Tổng {verb} {total} explanation."
          + ("" if args.dry_run else " Backup .json.bak đã tạo cho file bị đụng."))


if __name__ == "__main__":
    main()
