import re
import json
import os
import sys

def parse_content(full_text: str) -> dict:
    # ==================== CLEAN TEXT ====================
    full_text = re.sub(r'#### Page \d+', '', full_text, flags=re.IGNORECASE)
    full_text = re.sub(r'Hình \d+\.\d+\..*?\(.*?\)', '', full_text, flags=re.DOTALL)
    full_text = re.sub(r'\(Image:.*?\)', '', full_text, flags=re.DOTALL)
    full_text = re.sub(r'Sơ đồ \d+\.\d+\..*?', '', full_text, flags=re.DOTALL)
    full_text = re.sub(r'Bảng \d+\.\d+\..*?(?=\n\n|\Z)', '', full_text, flags=re.DOTALL | re.MULTILINE)
    full_text = full_text.strip()

    result = {"class": "Lop10", "topics": []}

    # ==================== TẤT CẢ CHỦ ĐỀ ====================
    # Dùng split để chia nhỏ theo CHUDE nhằm tránh lặp dữ liệu
    topic_blocks = re.split(r'\n(?=CHUDE\d+)', full_text, flags=re.IGNORECASE)

    for block in topic_blocks:
        if not block.strip(): continue
        
        # Lấy header của Chủ đề
        topic_header_match = re.match(r'CHUDE(\d+)\s*\nChủ đề \d+:\s*(.*)', block, re.IGNORECASE)
        if not topic_header_match: continue
        
        topic_num = int(topic_header_match.group(1))
        topic_title = topic_header_match.group(2).split('\n')[0].strip()
        
        topic = {"topic_number": topic_num, "topic_title": topic_title, "lessons": []}

        # ==================== TẤT CẢ BÀI ====================
        # Chia nhỏ tiếp theo BAI
        lesson_blocks = re.split(r'\n(?=BAI\d+)', block, flags=re.IGNORECASE)
        
        for l_block in lesson_blocks:
            if not l_block.strip() or 'BAI' not in l_block.upper(): continue
            
            lesson_match = re.match(r'BAI(\d+)\s*\n#+ \s*Bài \d+\s*(.*)', l_block, re.IGNORECASE)
            if not lesson_match: continue
            
            lesson_num = int(lesson_match.group(1))
            lesson_title = lesson_match.group(2).split('\n')[0].strip()
            
            # Tách Header và Levels
            # Header là phần từ sau tên Bài đến trước LEVEL1 đầu tiên
            parts = re.split(r'\n(?=LEVEL\d)', l_block, flags=re.IGNORECASE)
            header_raw = parts[0]
            header_content = re.sub(r'BAI\d+\s*\n#+ \s*Bài \d+.*?\n', '', header_raw, count=1, flags=re.DOTALL).strip()

            sections = []
            current_level1 = None
            current_level2 = None

            # Duyệt qua các phần LEVEL đã split
            for i in range(1, len(parts)):
                item = parts[i].strip()
                if not item: continue
                
                # Tách Tag (LEVEL1) và Nội dung còn lại
                item_split = item.split('\n', 1)
                tag = item_split[0].strip().upper() # LEVEL1, LEVEL2...
                content_block = item_split[1].strip() if len(item_split) > 1 else ""
                
                # Tách Tiêu đề (dòng đầu của content_block) và Nội dung thực sự
                content_lines = content_block.split('\n', 1)
                title = content_lines[0].replace('##', '').strip()
                body = content_lines[1].strip() if len(content_lines) > 1 else ""

                if tag == 'LEVEL1':
                    current_level1 = {
                        "level": "1",
                        "title": title,
                        "content": body,
                        "subsections": []
                    }
                    sections.append(current_level1)
                    current_level2 = None
                
                elif tag == 'LEVEL2':
                    if current_level1 is not None:
                        current_level2 = {
                            "level": "2",
                            "title": title,
                            "content": body,
                            "sub_subsections": []
                        }
                        current_level1["subsections"].append(current_level2)
                
                elif tag == 'LEVEL3':
                    sub = {
                        "level": title.split()[0] if title and title[0].isdigit() else "3",
                        "title": title,
                        "content": body
                    }
                    if current_level2:
                        current_level2["sub_subsections"].append(sub)
                    elif current_level1:
                        if "sub_subsections" not in current_level1:
                            current_level1["sub_subsections"] = []
                        current_level1["sub_subsections"].append(sub)

            topic["lessons"].append({
                "lesson_number": lesson_num,
                "lesson_title": lesson_title,
                "header": header_content,
                "sections": sections
            })

        result["topics"].append(topic)

    return result

if __name__ == "__main__":
    # Giữ nguyên phần main của bạn
    input_file = sys.argv[1] if len(sys.argv) > 1 else "../data/txt/sgk12.txt"
    if not os.path.exists(input_file):
        print(f"❌ Không tìm thấy file: {input_file}")
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