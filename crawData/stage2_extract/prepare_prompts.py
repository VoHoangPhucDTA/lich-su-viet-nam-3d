import json
import os

def clean_text(text: str) -> str:
    """Loai bo dau * de xoa markup in dam/in nghieng, giup LLM tranh bi nhieu."""
    if not text:
        return ""
    return text.replace("*", "").strip()

def block_to_markdown(block: dict, last_page: int) -> tuple[str, int]:
    """Chuyen 1 block thanh markdown, va quan ly viec danh dau trang [Trang N]."""
    lines = []
    
    # In marker trang neu sang trang moi
    current_page = block.get("page")
    if current_page is not None and current_page != last_page:
        lines.append(f"\n[Trang {current_page}]")
        last_page = current_page
        
    btype = block.get("type", "unknown")
    text = clean_text(block.get("text", ""))
    
    if btype == "heading":
        level = block.get("level", 2)
        prefix = "#" * level
        lines.append(f"\n{prefix} {text}")
    elif btype == "paragraph":
        lines.append(f"\n{text}")
    elif btype == "list":
        lines.append("")
        for item in block.get("items", []):
            lines.append(f"- {clean_text(item)}")
    elif btype == "table":
        lines.append("")
        rows = block.get("rows", [])
        if rows:
            for i, row in enumerate(rows):
                cleaned_cells = [clean_text(c).replace("\n", " ") for c in row]
                lines.append("| " + " | ".join(cleaned_cells) + " |")
                # Them dong phan cach tieu de bang
                if i == 0:
                    lines.append("|" + "|".join(["---"] * len(row)) + "|")
    elif btype == "image":
        caption = clean_text(block.get("caption", ""))
        if caption:
            lines.append(f"\n[Hình: {caption}]")
    elif btype == "source_text":
        lines.append(f"\n> **TƯ LIỆU:** {text}")
    elif btype == "question":
        lines.append(f"\n❓ {text}")
    elif btype == "citation":
        lines.append(f"\n— {text}")
        
    return "\n".join(lines), last_page

def process_grade(grade: str, data_dir: str, output_dir: str):
    fname = os.path.join(data_dir, f"lich_su_{grade}_kntt.json")
    if not os.path.exists(fname):
        return
        
    with open(fname, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    for lesson in data.get("lessons", []):
        if lesson.get("status") not in ("success", "resumed"):
            continue
            
        lid = lesson["lesson_id"]
        title = lesson.get("title", "")
        book = lesson.get("book", "")
        chapter = lesson.get("chapter", "")
        
        md_lines = []
        md_lines.append(f"# {title}")
        md_lines.append(f"- Lớp: {grade} | Sách: {book} | Chủ đề: {chapter}")
        md_lines.append(f"- Lesson ID: {lid}")
        md_lines.append("---")
        
        last_page = None
        for block in lesson.get("blocks", []):
            md_text, last_page = block_to_markdown(block, last_page)
            if md_text.strip():
                md_lines.append(md_text)
                
        out_path = os.path.join(output_dir, f"{grade}_{lid}.md")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(md_lines))

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "..", "stage1_crawl")
    output_dir = os.path.join(base_dir, "output", "prompts")
    os.makedirs(output_dir, exist_ok=True)
    
    for grade in ["10", "11", "12"]:
        process_grade(grade, data_dir, output_dir)
        
    print(f"Da tao cac file prompt Markdown thanh cong tai: {output_dir}")

if __name__ == "__main__":
    main()
