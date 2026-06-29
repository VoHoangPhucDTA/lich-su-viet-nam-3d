# -*- coding: utf-8 -*-
"""
crawler.py — Cào SGK Lich su (Ket Noi Tri Thuc) cho 3 lop 10, 11, 12.
Nguon : https://sgkvn.com
Cach dung:
  python crawler.py --grade 11          # Chay 1 lop
  python crawler.py --grade all         # Chay ca 3 lop
  python crawler.py --grade 12 --resume # Tiep tuc tu cho bi ngat

Luu y: Can cai curl_cffi truoc:  pip install curl_cffi beautifulsoup4
"""

import json, time, os, re, sys, io, argparse
from datetime import datetime
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, NavigableString, Tag

# ── Fix UTF-8 tren Windows ───────────────────────────────────────────────────
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Import curl_cffi ─────────────────────────────────────────────────────────
try:
    from curl_cffi import requests as curl_req
    USE_CURL = True
    print("[OK] curl_cffi san sang - Chrome impersonation ACTIVE")
except ImportError:
    import requests as curl_req          # fallback
    USE_CURL = False
    print("[WARN] curl_cffi chua cai, dung requests (co the bi Cloudflare block)")

# ── Import danh sach URL theo lop ────────────────────────────────────────────
from lessons_urls import BOOKS

# ── Cau hinh chung ───────────────────────────────────────────────────────────
BASE_URL        = "https://sgkvn.com"
OUTPUT_DIR      = os.path.dirname(os.path.abspath(__file__))
RAW_HTML_BASE   = os.path.join(OUTPUT_DIR, "raw_html")

REQUEST_DELAY   = 2.0
REQUEST_TIMEOUT = 45
MAX_RETRIES     = 3
MAX_LESSONS     = 100  # gioi han bao ve chong lap vo han

HEADERS = {
    "accept":                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language":         "vi-VN,vi;q=0.9,en-US;q=0.8",
    "accept-encoding":         "gzip, deflate, br",
    "cache-control":           "max-age=0",
    "sec-fetch-dest":          "document",
    "sec-fetch-mode":          "navigate",
    "sec-fetch-site":          "none",
    "upgrade-insecure-requests": "1",
}


# ── Tien ich ─────────────────────────────────────────────────────────────────

def lesson_id_from_url(url: str) -> str:
    """Lay lesson_id tu URL (vi du: '12335' tu '...tu-san-12335.html')."""
    m = re.search(r"-(\d+)\.html$", url)
    return m.group(1) if m else re.sub(r"[^\w]", "_", url[-30:])


def raw_html_path(lesson_id: str, title: str, grade: str) -> str:
    """Duong dan file HTML tho theo lop va lesson_id."""
    raw_dir = os.path.join(RAW_HTML_BASE, f"grade_{grade}")
    os.makedirs(raw_dir, exist_ok=True)
    safe = re.sub(r"[^\w\-]", "_", title[:40]) if title else ""
    return os.path.join(raw_dir, f"{lesson_id}_{safe}.html")

def find_raw_html_file(lesson_id: str, grade: str) -> str | None:
    """Tim file HTML tho da luu dua tren lesson_id."""
    raw_dir = os.path.join(RAW_HTML_BASE, f"grade_{grade}")
    if not os.path.exists(raw_dir):
        return None
    for fname in os.listdir(raw_dir):
        if fname.startswith(f"{lesson_id}_") and fname.endswith(".html"):
            return os.path.join(raw_dir, fname)
    return None


def fetch_html(url: str, attempt: int = 0) -> str:
    """Tai HTML voi retry. Nem ngoai le neu that bai sau MAX_RETRIES."""
    kwargs = dict(headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    try:
        if USE_CURL:
            resp = curl_req.get(url, impersonate="chrome124", **kwargs)
        else:
            resp = curl_req.get(url, **kwargs)
        resp.raise_for_status()
        html = resp.text
        if "Just a moment" in html or "cf-browser-verification" in html:
            raise RuntimeError("Cloudflare challenge page")
        return html
    except Exception as e:
        if attempt < MAX_RETRIES - 1:
            wait = 5 * (attempt + 1)
            print(f"    [Retry {attempt+1}/{MAX_RETRIES}] {type(e).__name__}: {e}. Cho {wait}s...")
            time.sleep(wait)
            return fetch_html(url, attempt + 1)
        raise


def parse(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


# ── BUOC 1: Xay dung danh sach bai hoc tu BOOKS ──────────────────────────────

def build_lesson_list(grade: str) -> list:
    """
    Doc danh sach URL tu lessons_urls.BOOKS[grade] va sinh danh sach lesson dict.
    Moi lesson dict co: lesson_id, grade, book, chapter, lesson, topic, title, url.
    """
    book_cfg = BOOKS.get(grade)
    if not book_cfg:
        raise ValueError(f"Khong tim thay cau hinh cho grade={grade} trong lessons_urls.BOOKS")

    urls = book_cfg.get("urls", [])
    if not urls:
        print(f"  [!] Grade {grade}: danh sach urls[] trong. Hay dien URL vao lessons_urls.py truoc!")
        return []

    lessons = []
    print(f"\n[STEP 1] Grade {grade}: Nap {len(urls)} URL truc tiep tu lessons_urls.py...")
    for u in urls:
        lid = lesson_id_from_url(u)

        m_chap = re.search(r"/(chu-de-\d+|chuyen-de-\d+|chuyen-de-hoc-tap-[^/]+)[-/]", u)
        if m_chap:
            chapter_slug = m_chap.group(1)
            # chuyen slug thanh nhan: "chu-de-1" => "Chu de 1", "chuyen-de-2" => "Chuyen de 2"
            chapter = chapter_slug.replace("chu-de", "Chu de").replace("chuyen-de", "Chuyen de").replace("-", " ")
        else:
            chapter = ""

        m_less = re.search(r"/(bai-\d+)[-/]", u)
        lesson_num = m_less.group(1).replace("bai", "Bai").replace("-", " ") if m_less else ""

        lessons.append({
            "lesson_id": lid,
            "grade":     book_cfg["grade"],
            "book":      book_cfg["book"],
            "chapter":   chapter,
            "lesson":    lesson_num,
            "topic":     "",
            "title":     "",
            "url":       u,
        })

    return lessons


# ── BUOC 2: Parse noi dung bai ───────────────────────────────────────────────

def _extract_breadcrumb(soup: BeautifulSoup) -> list:
    """Trich xuat breadcrumb tu JSON-LD (xu ly ca JSON-LD dang list)."""
    result = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw  = script.string or ""
            data = json.loads(raw)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and item.get("@type") == "BreadcrumbList":
                        data = item
                        break
                else:
                    continue
            if isinstance(data, dict) and data.get("@type") == "BreadcrumbList":
                for item in sorted(
                    data.get("itemListElement", []),
                    key=lambda x: x.get("position", 0)
                ):
                    bc_item = item.get("item", {})
                    result.append({
                        "position": item.get("position"),
                        "name":     (bc_item.get("name") or item.get("name") or "").strip(),
                        "url":      bc_item.get("@id", ""),
                    })
                if result:
                    return result
        except Exception:
            pass
    return result


def _tag_to_block(el: Tag) -> dict | None:
    """
    Chuyen mot the HTML thanh block co cau truc.
    Kieu block: heading | paragraph | list | table | image | question | page_marker
                source_text | citation
    """
    name = el.name if el.name else ""

    # ── Danh dau so trang: <em>(Trang N)</em> ──
    if name in ("p", "em"):
        txt = el.get_text(separator=" ", strip=True)
        clean_txt = txt.replace("*", "").strip()
        m = re.match(r"^\(?Trang\s+(\d+)\)?$", clean_txt)
        if m:
            return {"type": "page_marker", "page": int(m.group(1))}

    # ── Heading ──
    if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
        return {
            "type":  "heading",
            "level": int(name[1]),
            "text":  el.get_text(separator=" ", strip=True),
            "id":    el.get("id", ""),
        }

    # ── Bang ──
    if name == "table":
        rows = []
        for tr in el.find_all("tr"):
            cells = [td.get_text(separator=" ", strip=True) for td in tr.find_all(["th", "td"])]
            if cells:
                rows.append(cells)
        return {"type": "table", "rows": rows}

    # ── Anh ──
    if name == "img":
        src = el.get("src") or el.get("data-src") or ""
        if src.startswith("/"):
            src = BASE_URL + src
        return {"type": "image", "src": src, "alt": el.get("alt", ""), "caption": ""}

    # ── Cau hoi va cac loai doan van ──
    if name == "p":
        txt = el.get_text(separator=" ", strip=True)
        clean_txt = txt.replace("*", "").strip()

        if clean_txt.startswith("?"):
            return {"type": "question", "text": txt}

        # Tu lieu (TU LIEU N.)
        if re.match(r"^TU LIEU\s+\d+", clean_txt, re.IGNORECASE) or \
           re.match(r"^T\u01af LI\u1ec6U\s+\d+", clean_txt, re.IGNORECASE):
            return {"type": "source_text", "text": txt}

        # Trich dan (text-align: right)
        style = el.get("style", "")
        if "right" in style:
            return {"type": "citation", "text": txt}

        if txt:
            # Tim anh ben trong <p>
            img = el.find("img")
            if img:
                src = img.get("src") or img.get("data-src") or ""
                if src.startswith("/"):
                    src = BASE_URL + src
                caption_parts = []
                for child in el.children:
                    if isinstance(child, NavigableString):
                        t = child.strip()
                        if t:
                            caption_parts.append(t)
                    elif child.name not in ("img",):
                        t = child.get_text(separator=" ", strip=True)
                        if t:
                            caption_parts.append(t)
                caption = " ".join(caption_parts).strip()
                return {"type": "image", "src": src, "alt": img.get("alt", ""), "caption": caption}

            return {"type": "paragraph", "text": txt}

    # ── Danh sach (ul/ol) ──
    if name in ("ul", "ol"):
        items = []
        for li in el.find_all("li", recursive=False):
            items.append(li.get_text(separator=" ", strip=True))
        if items:
            return {"type": "list", "ordered": name == "ol", "items": items}

    return None


def parse_content_blocks(content_div: Tag, lesson_url: str) -> list:
    """
    Duyet de quy div#content va chuyen tung the con thanh block.
    Post-process: Gop caption vao anh lien truoc.
    """
    blocks = []
    current_page = None

    def process(el):
        nonlocal current_page
        if isinstance(el, NavigableString):
            return

        block = _tag_to_block(el)
        if block:
            if block["type"] == "page_marker":
                current_page = block["page"]
            else:
                block["page"] = current_page
                blocks.append(block)
            return

        # Neu khong nhan dien duoc (div, section...), duyet cac con
        for child in el.children:
            process(child)

    for child in content_div.children:
        process(child)

    # Post-process: Gop caption vao anh lien truoc no
    merged_blocks = []
    for b in blocks:
        if b.get("type") == "paragraph":
            text = b.get("text", "")
            clean_text = text.replace("*", "").strip()
            if re.match(r"^(H\u00ecnh|S\u01a1 \u0111\u1ed3|L\u01b0\u1ee3c \u0111\u1ed3|B\u1ea3n \u0111\u1ed3)\b",
                        clean_text, re.IGNORECASE):
                if merged_blocks and merged_blocks[-1]["type"] == "image":
                    merged_blocks[-1]["caption"] = text
                    continue
        merged_blocks.append(b)

    return merged_blocks


def _blocks_to_text(blocks: list) -> str:
    """Noi cac blocks thanh text thuan (de search/RAG)."""
    parts = []
    for b in blocks:
        t = b.get("type", "")
        if t in ("paragraph", "question", "source_text", "citation"):
            parts.append(b.get("text", ""))
        elif t == "heading":
            parts.append(b.get("text", ""))
        elif t == "list":
            parts.extend(b.get("items", []))
        elif t == "table":
            rows = b.get("rows", [])
            if rows:
                parts.append("| " + " | ".join(rows[0]) + " |")
                parts.append("|" + "|".join(["---"] * len(rows[0])) + "|")
                for row in rows[1:]:
                    parts.append("| " + " | ".join(row) + " |")
        elif t == "image" and b.get("caption"):
            parts.append(f"[Hinh: {b['caption']}]")
        elif t == "page_marker":
            parts.append(f"(Trang {b.get('page')})")
    return "\n".join(p for p in parts if p)


def scrape_lesson(lesson: dict, grade: str, resume: bool = False) -> dict:
    """
    Cao noi dung 1 bai hoc.
    Neu resume=True va file HTML tho da ton tai (va khong rong), doc lai offline.
    """
    url = lesson["url"]
    lid = lesson.get("lesson_id", "")
    title_hint = lesson.get("title", "")

    # ── RESUME: kiem tra file da ton tai ──────────────────────────────────────
    html_path_guess = find_raw_html_file(lid, grade)
    if resume and html_path_guess and os.path.getsize(html_path_guess) > 0:
        print(f"       [SKIP] Da co file HTML tho, doc lai offline: {os.path.basename(html_path_guess)}")
        with open(html_path_guess, "r", encoding="utf-8") as f:
            content_html_offline = f.read()
        # Parse lai tu HTML da luu (content_html la noi dung div#content)
        soup_offline = BeautifulSoup(f"<div id='content'>{content_html_offline}</div>", "html.parser")
        content_div_offline = soup_offline.select_one("div#content")
        blocks = parse_content_blocks(content_div_offline, url) if content_div_offline else []
        images = []
        scraped_srcs = set()
        for block in blocks:
            if block.get("type") == "image" and block.get("src"):
                images.append({"src": block["src"], "alt": block.get("alt", ""), "caption": block.get("caption", "")})
                scraped_srcs.add(block["src"])
        if content_div_offline:
            for img in content_div_offline.find_all("img"):
                src = img.get("src") or img.get("data-src") or ""
                if src and src not in scraped_srcs:
                    images.append({"src": src, "alt": img.get("alt", ""), "caption": ""})
                    scraped_srcs.add(src)
        
        # Lay lai title tu ten file: "12335_BAI_1_MOT_SO_VAN_DE.html" -> "BAI 1 MOT SO VAN DE"
        if not title_hint:
            fname = os.path.basename(html_path_guess)
            title_hint = fname[len(lid)+1:-5].replace("_", " ").strip()
            
        return {
            **lesson,
            "page_title":   title_hint,
            "title":        title_hint,
            "breadcrumb":   [],
            "toc":          [],
            "blocks":       blocks,
            "content_text": _blocks_to_text(blocks),
            "content_html": content_html_offline,
            "images":       images,
            "scraped_at":   datetime.now().isoformat(),
            "status":       "resumed",
        }

    try:
        html = fetch_html(url)
        soup = parse(html)

        # Tieu de bai: lay tu breadcrumb JSON-LD (phan tu cuoi)
        page_title = lesson.get("title", "")
        if not page_title:
            bc = _extract_breadcrumb(soup)
            page_title = bc[-1]["name"] if bc else ""
            if not page_title:
                h1 = soup.find("h1")
                page_title = h1.get_text(strip=True) if h1 else f"Bai {lid}"

        # Cat bo tien to "Lich su -" va hau to "|"
        page_title = re.sub(r"^L\u1ecbch s\u1eed\s*[-\u2013|]\s*", "", page_title, flags=re.IGNORECASE)
        page_title = page_title.split("|")[0].strip()
        lesson["title"] = page_title

        # Selector chinh: div#content
        content_div = soup.select_one("div#content")
        if not content_div:
            col8 = soup.select_one('div[class*="w-8/12"]') or soup.select_one('div[class*="lg:w-8"]')
            if col8:
                content_div = col8
            else:
                content_div = soup.find("main")
                if content_div:
                    for s in content_div.select('div[class*="w-4/12"], div[class*="lg:w-4"], script, style'):
                        s.decompose()

        if not content_div:
            return {**lesson, "status": "no_content",
                    "blocks": [], "content_text": "", "content_html": "",
                    "images": [], "breadcrumb": [], "scraped_at": datetime.now().isoformat()}

        # Luu HTML tho TRUOC khi chen Markdown (de dam bao noi dung sach goc)
        content_html = str(content_div)

        # Wrap cac the bold/italic bang Markdown truoc khi parse text
        for tag in content_div.find_all(["strong", "b"]):
            tag.insert_before(NavigableString("**"))
            tag.insert_after(NavigableString("**"))
        for tag in content_div.find_all(["em", "i"]):
            tag.insert_before(NavigableString("*"))
            tag.insert_after(NavigableString("*"))

        # Parse thanh blocks co cau truc
        blocks = parse_content_blocks(content_div, url)

        # Lop 1: Lay anh da duoc nhan dien (co kem caption)
        images = []
        scraped_srcs = set()
        for block in blocks:
            if block.get("type") == "image" and block.get("src"):
                images.append({"src": block["src"], "alt": block.get("alt", ""), "caption": block.get("caption", "")})
                scraped_srcs.add(block["src"])

        # Lop 2: Quet "vet day" de tim anh trong table hoac the la
        for img in content_div.find_all("img"):
            src = img.get("src") or img.get("data-src") or ""
            if src.startswith("/"):
                src = BASE_URL + src
            if src and src not in scraped_srcs:
                images.append({"src": src, "alt": img.get("alt", ""), "caption": ""})
                scraped_srcs.add(src)

        content_text = _blocks_to_text(blocks)

        # Muc luc noi bo (ul.list-decimal)
        toc_items = []
        toc_ul = soup.select_one("ul.list-decimal")
        if toc_ul:
            for li in toc_ul.find_all("li"):
                a = li.find("a")
                toc_items.append({
                    "text":   li.get_text(strip=True),
                    "anchor": a["href"] if a else "",
                })

        breadcrumb = _extract_breadcrumb(soup)

        # Luu file HTML tho
        html_out = raw_html_path(lid, page_title, grade)
        if content_html:
            with open(html_out, "w", encoding="utf-8") as f:
                f.write(content_html)

        return {
            **lesson,
            "page_title":   page_title,
            "breadcrumb":   breadcrumb,
            "toc":          toc_items,
            "blocks":       blocks,
            "content_text": content_text,
            "content_html": content_html,
            "images":       images,
            "scraped_at":   datetime.now().isoformat(),
            "status":       "success",
        }

    except Exception as e:
        print(f"    [LOI] {url}: {e}")
        return {
            **lesson,
            "page_title": "", "breadcrumb": [], "toc": [],
            "blocks": [], "content_text": "", "content_html": "",
            "images": [], "status": "error", "error": str(e),
            "scraped_at": datetime.now().isoformat(),
        }


# ── Crawl mot cuon sach ───────────────────────────────────────────────────────

def crawl_grade(grade: str, resume: bool = False) -> dict:
    """
    Crawl toan bo 1 lop. Tra ve dict tong ket: {grade, total, success, error}.
    """
    book_cfg = BOOKS[grade]
    output_file = os.path.join(OUTPUT_DIR, book_cfg["output_file"])
    label = book_cfg.get("subject_label", f"Lich Su {grade} KNTT")

    print()
    print("=" * 70)
    print(f"CRAWLER: {label}")
    print(f"curl_cffi Chrome impersonation: {'ON' if USE_CURL else 'OFF'}")
    print(f"Output: {output_file}")
    if resume:
        print("[RESUME MODE] Cac bai da co HTML se duoc doc lai tu dia, bo qua request.")
    print("=" * 70)

    # Buoc 1: Lay danh sach bai
    try:
        lessons = build_lesson_list(grade)
    except Exception as e:
        print(f"\n[FATAL] Khong lay duoc danh sach bai: {e}")
        return {"grade": grade, "total": 0, "success": 0, "error": 0}

    if not lessons:
        print(f"\n[FATAL] Danh sach bai cho lop {grade} trong.")
        return {"grade": grade, "total": 0, "success": 0, "error": 0}

    # Gioi han bao ve
    if len(lessons) > MAX_LESSONS:
        print(f"  [WARN] So bai ({len(lessons)}) vuot MAX_LESSONS ({MAX_LESSONS}). Cat xuong.")
        lessons = lessons[:MAX_LESSONS]

    # Buoc 2: Cao noi dung tung bai
    print(f"\n[STEP 2] Cao noi dung {len(lessons)} bai...")
    print("-" * 70)

    results = []
    for idx, lesson in enumerate(lessons, 1):
        title_preview = lesson.get("title") or lesson["url"].split("/")[-1][:50]
        print(f"\n[{idx:2d}/{len(lessons)}] {title_preview}")

        data = scrape_lesson(lesson, grade, resume=resume)

        icon  = "OK"  if data["status"] in ("success", "resumed") else "LOI"
        n_blk = len(data.get("blocks", []))
        n_img = len(data.get("images", []))
        n_chr = len(data.get("content_text", ""))
        print(f"       [{icon}] {data['status']} | {n_blk} blocks | {n_img} anh | {n_chr} ky tu")
        if data.get("title"):
            print(f"       Tieu de: {data['title'][:70]}")

        results.append(data)

        if idx < len(lessons) and data["status"] != "resumed":
            time.sleep(REQUEST_DELAY)

    # Luu JSON
    success_n = sum(1 for r in results if r["status"] in ("success", "resumed"))
    error_n   = len(results) - success_n

    output = {
        "metadata": {
            "subject":       label,
            "grade":         grade,
            "book":          book_cfg["book"],
            "total_lessons": len(results),
            "success_count": success_n,
            "error_count":   error_n,
            "crawled_at":    datetime.now().isoformat(),
            "fetcher":       "curl_cffi Chrome124" if USE_CURL else "requests",
            "block_types":   ["heading", "paragraph", "list", "table", "image",
                               "question", "source_text", "citation", "page_marker"],
        },
        "lessons": results,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 70}")
    print(f"HOAN THANH LOP {grade}!")
    print(f"  Tong bai   : {len(results)}")
    print(f"  Thanh cong : {success_n}")
    print(f"  Loi        : {error_n}")
    print(f"  File JSON  : {output_file}")
    print(f"  HTML tho   : {os.path.join(RAW_HTML_BASE, f'grade_{grade}/')}")
    print(f"{'=' * 70}")

    return {"grade": grade, "total": len(results), "success": success_n, "error": error_n}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Cào SGK Lịch sử KNTT cho lớp 10, 11, 12"
    )
    parser.add_argument(
        "--grade",
        required=True,
        choices=["10", "11", "12", "all"],
        help="Lop can crawl: 10, 11, 12 hoac all (ca 3 lop)"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        default=False,
        help="Neu co flag nay, cac bai da co file HTML tho se duoc doc lai tu dia, bo qua request mang."
    )
    args = parser.parse_args()

    grades = ["10", "11", "12"] if args.grade == "all" else [args.grade]

    # Tao thu muc goc raw_html
    os.makedirs(RAW_HTML_BASE, exist_ok=True)

    summaries = []
    for g in grades:
        summary = crawl_grade(g, resume=args.resume)
        summaries.append(summary)

        # Nghi giua cac lop neu chay all
        if args.grade == "all" and g != grades[-1]:
            print("\n[*] Nghi 5 giay truoc khi crawl lop tiep theo...")
            time.sleep(5)

    # ── Tong ket khi chay --grade all ────────────────────────────────────────
    if args.grade == "all":
        print()
        print("=" * 70)
        print("TONG KET CA 3 LOP")
        print("=" * 70)
        print(f"{'Lop':<8} {'Tong bai':<12} {'Thanh cong':<14} {'Loi':<8}")
        print("-" * 70)
        total_all = success_all = error_all = 0
        for s in summaries:
            print(f"  {s['grade']:<6} {s['total']:<12} {s['success']:<14} {s['error']:<8}")
            total_all   += s["total"]
            success_all += s["success"]
            error_all   += s["error"]
        print("-" * 70)
        print(f"  {'TONG':<6} {total_all:<12} {success_all:<14} {error_all:<8}")
        print("=" * 70)


if __name__ == "__main__":
    main()
