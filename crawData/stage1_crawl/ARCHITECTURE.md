# ARCHITECTURE.md — Kiến trúc Chi tiết

> Tài liệu này dành cho AI/dev đọc code để hiểu sâu hơn, trước khi sửa bất kỳ file nào.

---

## 1. Tổng quan hệ thống

```
[lessons_urls.py]
      ↓  BOOKS dict (URL list theo lớp)
[crawler.py: build_lesson_list()]
      ↓  list[lesson_dict]
[crawler.py: scrape_lesson()]
      ├─→ fetch_html()          HTTP GET với curl_cffi Chrome impersonation
      ├─→ _extract_breadcrumb() Lấy tiêu đề từ JSON-LD
      ├─→ content_html = str(content_div)   ← LƯU HTML THÔ TRƯỚC
      ├─→ DOM mutation: bọc <strong>→** <em>→*
      ├─→ parse_content_blocks()
      │     └─→ _tag_to_block() cho từng element
      └─→ trả về raw_lesson dict
[crawler.py: crawl_grade()]
      ├─→ lưu raw_html/grade_XX/{lesson_id}_{title}.html
      └─→ lưu lich_su_XX_kntt.json
```

---

## 2. Các module và hàm quan trọng

### `crawler.py`

| Hàm | Vai trò | Có thể sửa không? |
|-----|---------|------------------|
| `fetch_html(url)` | HTTP GET, retry 3 lần, bypass Cloudflare | ✅ An toàn |
| `build_lesson_list(grade)` | Đọc `BOOKS[grade]` → tạo list lesson dict | ✅ An toàn |
| `_extract_breadcrumb(soup)` | Lấy tiêu đề từ `<script type="ld+json">` | ⚠️ Cẩn thận |
| `_tag_to_block(el)` | **Nhân lõi parse** — chuyển 1 HTML tag → 1 block | ⛔ Đừng sửa cấu trúc |
| `parse_content_blocks(div)` | Duyệt đệ quy `div#content`, gọi `_tag_to_block` | ⚠️ Cẩn thận |
| `_blocks_to_text(blocks)` | Render blocks thành Markdown text thuần | ✅ An toàn |
| `scrape_lesson(lesson, grade)` | Điều phối: fetch → parse → lưu file | ⚠️ Cẩn thận |
| `crawl_grade(grade)` | Crawl toàn bộ 1 lớp, lưu JSON | ✅ An toàn |
| `main()` | argparse entry point | ✅ An toàn |

### `lessons_urls.py`

Chỉ chứa dict `BOOKS` — **không có logic**. Thường xuyên sửa khi thêm bài mới.

---

## 3. Schema Output — raw_lesson dict

Mỗi bài học trong `lessons[]` có cấu trúc:

```json
{
  "lesson_id":    "12335",          // ID số cuối URL
  "grade":        "11",             // "10" | "11" | "12"
  "book":         "KNTT",           // Kết Nối Tri Thức
  "chapter":      "Chu de 1",       // parse từ URL slug
  "lesson":       "Bai 1",          // parse từ URL slug
  "topic":        "",               // chưa dùng
  "title":        "BÀI 1: MỘT SỐ VẤN ĐỀ...",  // từ breadcrumb JSON-LD
  "url":          "https://sgkvn.com/...",
  "page_title":   "BÀI 1: MỘT SỐ VẤN ĐỀ...",
  "breadcrumb":   [{"position":1, "name":"...", "url":"..."}],
  "toc":          [{"text":"...", "anchor":"#..."}],
  "blocks":       [ ...xem mục 4... ],
  "content_text": "Markdown text thuần, nối tất cả blocks",
  "content_html": "<div id='content'>...</div>  (HTML gốc, chưa bị Markdown)",
  "images":       [{"src":"...", "alt":"", "caption":"Hình 1. ..."}],
  "scraped_at":   "2025-06-15T10:00:00",
  "status":       "success" | "resumed" | "error" | "no_content"
}
```

> **Quy tắc quan trọng:** `content_html` là HTML **gốc 100%** — được lưu **trước** khi DOM bị bọc `**`/`*`. Nếu sau này muốn parse lại offline, dùng `content_html` làm nguồn.

---

## 4. Schema Block — 9 loại

```
heading      → {type, level:int, text:str, id:str, page:int}
paragraph    → {type, text:str, page:int}
list         → {type, ordered:bool, items:[str], page:int}
table        → {type, rows:[[str]], page:int}
image        → {type, src:str, alt:str, caption:str, page:int}
question     → {type, text:str, page:int}           -- bắt đầu bằng "?"
source_text  → {type, text:str, page:int}           -- "TƯ LIỆU N."
citation     → {type, text:str, page:int}           -- text-align:right
page_marker  → {type, page:int}                     -- "(Trang N)" — không đưa vào blocks
```

> `page` là số trang SGK (trích từ `(Trang N)` trong nội dung) — giúp AI biết ngữ cảnh vật lý của từng đoạn.

---

## 5. Luồng xử lý Markdown (quan trọng — đừng đảo thứ tự)

```python
# 1. Lấy HTML thô TRƯỚC
content_html = str(content_div)          # ← lưu nguyên bản

# 2. Mutate DOM: bọc bold/italic bằng Markdown
for tag in content_div.find_all(['strong','b']):
    tag.insert_before("**"); tag.insert_after("**")
for tag in content_div.find_all(['em','i']):
    tag.insert_before("*"); tag.insert_after("*")

# 3. Parse text sau khi đã mutate
blocks = parse_content_blocks(content_div, url)
# → text trong blocks có dạng: **TƯ LIỆU 1.** "Vì sao..."
```

**Tại sao cần thứ tự này?**
- `content_html` phải là HTML gốc → dùng để lưu file và parse lại offline
- Sau mutation, `get_text()` sẽ tự nhiên trả về Markdown trong text
- Marker detection (`?`, `TƯ LIỆU`, `Trang N`) dùng `clean_txt = txt.replace('*','').strip()` để "miễn nhiễm" với dấu sao

---

## 6. Cơ chế Resume

```
scrape_lesson(lesson, grade, resume=True)
    → raw_html_path = raw_html/grade_11/12335_BÀI_1...html
    → if file exists and size > 0:
          đọc file, parse lại blocks (KHÔNG request mạng)
          return status="resumed"
    → else:
          fetch_html() → parse → lưu file → return status="success"
```

Khi chạy `--resume`:
- Bài đã có HTML → đọc offline, cực nhanh
- Bài chưa có HTML (mới hoặc lỗi 404) → request mạng bình thường

---

## 7. Cách thêm bài/lớp mới

### Thêm URL còn thiếu (chỉ sửa `lessons_urls.py`)
```python
BOOKS["10"]["urls"].append(
    "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-X-.../bai-N-...html"
)
```
→ Chạy lại: `python -X utf8 crawler.py --grade 10 --resume`

### Thêm lớp mới (ví dụ lớp 9)
1. Thêm entry vào `BOOKS` trong `lessons_urls.py`
2. Cập nhật `argparse choices` trong `main()` của `crawler.py`
3. Crawl: `python -X utf8 crawler.py --grade 9`

### Thêm loại block mới vào `_tag_to_block`
```python
# Ví dụ: nhận diện box "Ghi nhớ"
if name == "div" and el.get("class") and "ghi-nho" in " ".join(el.get("class",[])):
    return {"type": "summary_box", "text": el.get_text(separator=" ", strip=True)}
```
→ Sau đó cập nhật `_blocks_to_text()` để render loại block mới.

---

## 8. Coding Style

- **Comment tiếng Việt không dấu** trong code (tránh lỗi encoding):
  ```python
  # Lay danh sach bai tu trang chu de
  ```
- **Separator `' '` khi `get_text()`** để tránh dính chữ:
  ```python
  el.get_text(separator=" ", strip=True)   # ✅
  el.get_text(strip=True)                  # ❌ — dính chữ
  ```
- **`clean_txt = txt.replace('*', '').strip()`** trước mọi regex marker detection
- **Thứ tự**: lưu `content_html` → mutate DOM → parse blocks (không đảo)
- **Hàm `_` prefix**: hàm nội bộ, không gọi từ ngoài module

---

## 9. Dependencies

| Thư viện | Phiên bản | Vai trò |
|----------|-----------|---------|
| `curl_cffi` | ≥ 0.5 | HTTP client giả Chrome 124 → bypass Cloudflare |
| `beautifulsoup4` | ≥ 4.12 | Parse HTML, duyệt DOM |
| `argparse` | stdlib | CLI `--grade`, `--resume` |
| `json` | stdlib | Đọc/ghi JSON output |
| `re` | stdlib | Regex URL parsing, marker detection |

Fallback: nếu không có `curl_cffi`, dùng `requests` thường (có thể bị Cloudflare block).
