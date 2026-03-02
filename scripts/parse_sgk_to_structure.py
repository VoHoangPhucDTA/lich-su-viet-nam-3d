# parse_sgk_to_structure.py
import re
import json
import os
import sys

def parse_content(text: str) -> dict:
    # ==================== CLEAN TEXT ====================
    text = re.sub(r'#### Page \d+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Hình \d+\.\d+\..*?\(.*?\)', '', text, flags=re.DOTALL)
    text = re.sub(r'\(Image:.*?\)', '', text, flags=re.DOTALL)
    text = re.sub(r'Sơ đồ \d+\.\d+\..*?', '', text, flags=re.DOTALL)
    text = re.sub(r'Bảng \d+\.\d+\..*?(?=\n\n|\Z)', '', text, flags=re.DOTALL | re.MULTILINE)
    text = text.strip()

    # ==================== STRUCTURE ====================
    result = {
        "class": "Lop10", # thay đổi tên class theo file sgk
        "topics": [
            {
                "topic_number": 1,
                "topic_title": "LỊCH SỬ VÀ SỬ HỌC",
                "lessons": [
                    {
                        "lesson_number": 1,
                        "lesson_title": "HIỆN THỰC LỊCH SỬ VÀ NHẬN THỨC LỊCH SỬ",
                        "header": "",
                        "sections": []
                    }
                ]
            }
        ]
    }

    lesson = result["topics"][0]["lessons"][0]

    # Header: phần trước LEVEL1 đầu tiên
    header_match = re.search(r'^(.*?)(?=LEVEL1)', text, re.DOTALL)
    lesson["header"] = header_match.group(1).strip() if header_match else ""

    # ==================== PARSE LEVELS (ĐÃ SỬA) ====================
    level_pattern = r'(LEVEL\d)\s*(.*?)(?=(?:LEVEL\d|\Z))'   # ← ĐÃ SỬA: thêm ?: để non-capturing
    matches = re.findall(level_pattern, text, re.DOTALL)

    sections = []
    current_level1 = None
    current_level2 = None

    for level, content in matches:          # ← Bây giờ chỉ còn 2 giá trị
        content = content.strip()
        if not content:
            continue

        # Tách title và body
        title_match = re.match(r'(\d+(?:\.\d+)?\.?\s*.*?)\n(.*)', content, re.DOTALL)
        title = title_match.group(1).strip() if title_match else ""
        body = title_match.group(2).strip() if title_match else content

        if level == 'LEVEL1':
            current_level1 = {
                "level": "1",
                "title": title or "1. Lịch sử, hiện thực lịch sử và nhận thức lịch sử",
                "content": body,
                "subsections": []
            }
            sections.append(current_level1)
            current_level2 = None

        elif level == 'LEVEL2':
            if current_level1:
                current_level2 = {
                    "level": "2",
                    "title": title or "2. Đối tượng, chức năng, nhiệm vụ và nguyên tắc cơ bản của Sử học",
                    "content": body,
                    "sub_subsections": []
                }
                current_level1["subsections"].append(current_level2)

        elif level == 'LEVEL3':
            sub = {
                "level": title.split()[0] if title and title[0].isdigit() else "2.1",
                "title": title,
                "content": body
            }
            if current_level2:
                current_level2["sub_subsections"].append(sub)
            elif current_level1:
                if "sub_subsections" not in current_level1:
                    current_level1["sub_subsections"] = []
                current_level1["sub_subsections"].append(sub)

    lesson["sections"] = sections

    # Thêm phần câu hỏi cuối (1., 2., 3.)
    trailing_match = re.search(r'(1\..*?3\..*?)$', text, re.DOTALL)
    if trailing_match and sections:
        sections[-1]["content"] = (sections[-1].get("content", "") + "\n\n" + trailing_match.group(1).strip()).strip()

    return result


# ===================== MAIN =====================
if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    else:
        input_file = "../data/txt/sgk11.txt"   # ← Đổi tên file TXT của bạn nếu khác

    if not os.path.exists(input_file):
        print(f"❌ Không tìm thấy file: {input_file}")
        print("   Cách dùng: python parse_sgk_to_structure.py ten_file.txt")
        sys.exit(1)

    with open(input_file, "r", encoding="utf-8") as f:
        content = f.read()

    parsed_json = parse_content(content)

    output_dir = "../data/processed"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "structure_sgk.json")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(parsed_json, f, indent=2, ensure_ascii=False)

    print(f"✅ Parse thành công!")
    print(f"   File JSON đã lưu tại: {output_file}")
    print(f"   Đường dẫn đầy đủ: {os.path.abspath(output_file)}")