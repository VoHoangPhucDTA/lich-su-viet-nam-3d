import os
import json
import time
from urllib.parse import urlparse
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as curl_req
    USE_CURL = True
except ImportError:
    import requests as curl_req
    USE_CURL = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, "images")
RAW_HTML_DIR = os.path.join(BASE_DIR, "raw_html")

HEADERS = {
    "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    "referer": "https://sgkvn.com/",
}

def download_image(url: str, local_path: str):
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True # Da tai
    
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    try:
        if USE_CURL:
            resp = curl_req.get(url, headers=HEADERS, impersonate="chrome124", timeout=30)
        else:
            resp = curl_req.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(resp.content)
        time.sleep(0.1)
        return True
    except Exception as e:
        print(f"    [LOI] Khong tai duoc {url}: {e}")
        return False

def update_html_file(html_path: str, url_map: dict):
    """Thay the cac URL anh tren web bang duong dan local trong file HTML tho."""
    if not os.path.exists(html_path):
        return
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
        
    soup = BeautifulSoup(f"<div id='content'>{html}</div>", "html.parser")
    content_div = soup.select_one("div#content")
    if not content_div: return
    
    changed = False
    for img in content_div.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if src.startswith("/"):
            src = "https://sgkvn.com" + src
            
        if src in url_map:
            img["src"] = url_map[src]
            if img.has_attr("data-src"):
                img["data-src"] = url_map[src]
            changed = True
            
    if changed:
        with open(html_path, "w", encoding="utf-8") as f:
            # Tra lai html ben trong the content_div
            f.write("".join(str(c) for c in content_div.children))

def process_grade(grade: str):
    json_file = os.path.join(BASE_DIR, f"lich_su_{grade}_kntt.json")
    if not os.path.exists(json_file):
        print(f"Khong tim thay {json_file}")
        return

    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"\n======================================")
    print(f"DOWNLOAD ANH LOP {grade}")
    print(f"======================================")

    for lesson in data.get("lessons", []):
        if lesson.get("status") not in ("success", "resumed"):
            continue
            
        lid = lesson["lesson_id"]
        title = lesson.get("title", "")
        images = lesson.get("images", [])
        if not images:
            continue
            
        print(f"[{lid}] {title[:40]}... ({len(images)} anh)")
        
        url_map = {}
        for idx, img in enumerate(images):
            src = img.get("src", "")
            if not src or not src.startswith("http"):
                continue # Da la local hoac khong hop le
                
            # Lay duoi file
            ext = os.path.splitext(urlparse(src).path)[1]
            if not ext: ext = ".jpg"
            
            local_filename = f"img_{idx+1:02d}{ext}"
            local_rel_path = f"images/grade_{grade}/{lid}/{local_filename}"
            local_abs_path = os.path.join(BASE_DIR, local_rel_path)
            
            if download_image(src, local_abs_path):
                # Update map de luu vao JSON va HTML
                url_map[src] = local_rel_path
                
        if not url_map:
            continue
            
        # Update JSON blocks & images
        for img in lesson["images"]:
            if img.get("src") in url_map:
                img["src"] = url_map[img["src"]]
                
        for block in lesson.get("blocks", []):
            if block.get("type") == "image" and block.get("src") in url_map:
                block["src"] = url_map[block["src"]]
                
        # Update HTML file
        # Tim file HTML theo ID
        grade_html_dir = os.path.join(RAW_HTML_DIR, f"grade_{grade}")
        if os.path.exists(grade_html_dir):
            for fname in os.listdir(grade_html_dir):
                if fname.startswith(f"{lid}_") and fname.endswith(".html"):
                    update_html_file(os.path.join(grade_html_dir, fname), url_map)
                    break

    # Ghi lai JSON
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"-> Da cap nhat {json_file}")

if __name__ == "__main__":
    for g in ["10", "11", "12"]:
        process_grade(g)
    print("\nHOAN THANH DOWNLOAD ANH!")
