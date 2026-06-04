#!/usr/bin/env python3
"""
parse_sgk_to_structure.py
Parses Vietnamese history textbook raw text files (sgk10/11/12.txt) into structured JSON.

Supports two text formats:
  Format A (sgk10): CHỦ ĐỀ N TITLE  /  Bài N TITLE   (no ## prefix, no colon)
  Format B (sgk11/12): Chủ đề N: TITLE  /  ## Bài N TITLE

Boundary markers in text: CHUDE{N}, BAI{N}, LEVEL1/2/3
"""

import re
import json
import sys
from pathlib import Path


# ─── Regex patterns (handle both Format A and B) ──────────────────────────────

# CHUDE marker line
RE_CHUDE_MARKER = re.compile(r'^CHUDE(\d+)\s*$')

# Topic title
RE_TOPIC_TITLE = re.compile(
    r'^(?:CH[ÚU]\s*Đ[ÊE]\s*(\d+)[:\s]+(.+)'   # Format A: uppercase variant
    r'|Ch[ủu]\s*đ[ềe]\s*(\d+)\s*:\s*(.+))',    # Format B: mixed-case with colon
    re.IGNORECASE | re.UNICODE
)

# BAI marker line
RE_BAI_MARKER = re.compile(r'^BAI(\d+)\s*$')

# Lesson title
RE_LESSON_TITLE = re.compile(
    r'^(?:##\s*)?B[àa]i\s+(\d+)\s+(.+)',
    re.IGNORECASE | re.UNICODE
)

# Section level markers (Capture only the number: 1, 2, or 3)
RE_LEVEL = re.compile(r'^LEVEL([123])\s*$')

# Section header after LEVEL marker
RE_SECTION_HEADER = re.compile(
    r'^(?:#{1,3}\s*)?([IVXivx]+\.|[A-Z]\.|[a-z]\)|[\d]+\.)\s+(.+)',
    re.UNICODE
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def clean(text: str) -> str:
    """Strip markdown hash prefixes and extra whitespace."""
    return re.sub(r'^#+\s*', '', text).strip()


def detect_class(filename: str) -> str:
    name = Path(filename).stem.lower()
    if '10' in name:
        return 'Lop10'
    if '11' in name:
        return 'Lop11'
    if '12' in name:
        return 'Lop12'
    return 'Unknown'


# ─── Parser ───────────────────────────────────────────────────────────────────

def parse_file(filepath: str) -> dict:
    class_name = detect_class(filepath)
    result = {'class': class_name, 'topics': []}

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # State machine
    current_topic = None
    current_lesson = None
    current_section = None
    content_buffer = []

    def flush_content():
        """Phân bổ nội dung trong buffer vào header của bài học hoặc content của section."""
        nonlocal content_buffer
        if not content_buffer:
            return
            
        text = '\n'.join(line for line in content_buffer if line.strip()).strip()
        if not text:
            content_buffer = []
            return

        # Nếu đang ở trong một section (đã gặp LEVEL), ghi vào content của section
        if current_section is not None:
            current_section['content'] = (
                current_section.get('content', '') + '\n\n' + text
            ).strip()
        # Nếu chưa có section nào nhưng đang ở trong bài (trước LEVEL đầu tiên), ghi vào header
        elif current_lesson is not None:
            current_lesson['header'] = (
                current_lesson.get('header', '') + '\n\n' + text
            ).strip()
            
        content_buffer = []

    def save_section():
        """Lưu section hiện tại vào bài học."""
        flush_content()
        if current_section is not None and current_lesson is not None:
            current_lesson['sections'].append(current_section)

    def save_lesson():
        """Lưu bài học hiện tại vào chủ đề."""
        save_section()
        if current_lesson is not None and current_topic is not None:
            current_topic['lessons'].append(current_lesson)

    def save_topic():
        """Lưu chủ đề hiện tại vào danh sách kết quả."""
        save_lesson()
        if current_topic is not None:
            result['topics'].append(current_topic)

    i = 0
    n = len(lines)

    while i < n:
        raw = lines[i].rstrip('\n')
        line = raw.strip()
        i += 1

        # ── CHUDE marker ──────────────────────────────────────────────────────
        m_chude = RE_CHUDE_MARKER.match(line)
        if m_chude:
            topic_num = int(m_chude.group(1))
            title_line = ''
            
            # Peek ahead for the topic title line
            j = i
            while j < n and not lines[j].strip():
                j += 1
            if j < n:
                candidate = lines[j].strip()
                m = RE_TOPIC_TITLE.match(candidate)
                if m:
                    if m.group(2):        # Format A
                        title_line = clean(m.group(2))
                    elif m.group(4):      # Format B
                        title_line = clean(m.group(4))
                    i = j + 1

            save_topic()

            current_topic = {
                'topic_number': topic_num,
                'topic_title': title_line,
                'lessons': []
            }
            current_lesson = None
            current_section = None
            content_buffer = []
            continue

        # ── BAI marker ────────────────────────────────────────────────────────
        m_bai = RE_BAI_MARKER.match(line)
        if m_bai:
            lesson_num = int(m_bai.group(1))
            title_line = ''
            
            # Peek ahead for lesson title
            j = i
            while j < n and not lines[j].strip():
                j += 1
            if j < n:
                candidate = lines[j].strip()
                m = RE_LESSON_TITLE.match(candidate)
                if m:
                    title_line = clean(candidate)
                    i = j + 1

            save_lesson()

            current_lesson = {
                'lesson_number': lesson_num,
                'lesson_title': title_line,
                'header': '',
                'sections': []
            }
            current_section = None
            content_buffer = []
            continue

        # ── LEVEL marker ──────────────────────────────────────────────────────
        m_level = RE_LEVEL.match(line)
        if m_level:
            level_num = m_level.group(1)  # Sẽ là '1', '2' hoặc '3'

            save_section()

            # Peek for section title
            j = i
            while j < n and not lines[j].strip():
                j += 1
            
            title_line = ''
            if j < n:
                candidate = lines[j].strip()
                mh = RE_SECTION_HEADER.match(candidate)
                if mh:
                    title_line = clean(candidate)
                    i = j + 1
                else:
                    # Nếu dòng tiếp theo không khớp format header, vẫn lấy nó làm tiêu đề tạm
                    title_line = clean(candidate)
                    i = j + 1

            current_section = {
                'level': level_num,
                'title': title_line,
                'content': ''
            }
            content_buffer = []
            continue

        # ── Regular content line ───────────────────────────────────────────────
        if current_lesson is not None:
            # Lưu lại cả những dòng trống để giữ form đoạn văn khi \n\n
            if raw == '':
                content_buffer.append('')
            else:
                content_buffer.append(line)

    # ── End of file: flush everything ─────────────────────────────────────────
    save_topic()

    return result


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/parse_sgk_to_structure.py data/sgk/txt/sgk10.txt ...")
        sys.exit(1)

    # Tự động tính toán đường dẫn để trỏ tới data/processed/
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    processed_dir = project_root / 'data' / 'processed'
    
    # Tạo thư mục processed nếu chưa tồn tại
    processed_dir.mkdir(parents=True, exist_ok=True)

    for filepath in sys.argv[1:]:
        p = Path(filepath)
        if not p.exists():
            print(f"[WARN] File not found: {filepath}")
            continue

        print(f"Parsing {filepath} ...")
        data = parse_file(filepath)

        # Trỏ output vào đúng thư mục processed
        out_path = processed_dir / f"structure_{p.stem}.json"
        
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # Summary
        num_topics = len(data['topics'])
        num_lessons = sum(len(t['lessons']) for t in data['topics'])
        print(f"  → LƯU TẠI: {out_path}  |  {num_topics} chủ đề  |  {num_lessons} bài")
        for t in data['topics']:
            lessons_str = ', '.join(f"Bài {l['lesson_number']}" for l in t['lessons'])
            print(f"     [{t['topic_title'][:50]}] → {lessons_str}")

    print("\nDone.")


if __name__ == '__main__':
    main()