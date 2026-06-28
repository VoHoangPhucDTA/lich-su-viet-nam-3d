# SGK Lịch sử Crawler — Tài liệu Tổng quan

> **Mục đích của folder này:** Thu thập (crawl) và chuẩn hoá toàn bộ nội dung SGK Lịch sử lớp 10, 11, 12 (bộ Kết Nối Tri Thức) từ `sgkvn.com` thành dữ liệu có cấu trúc (JSON + Markdown) phục vụ pipeline RAG/AI ở Giai đoạn 2.

---

## Đọc file nào trước?

| Thứ tự | File | Tại sao |
|--------|------|---------|
| 1 | **README.md** (file này) | Hiểu toàn cảnh |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | Hiểu luồng dữ liệu & từng module |
| 3 | [DECISIONS.md](DECISIONS.md) | Lý do đằng sau mỗi quyết định kỹ thuật |
| 4 | [lessons_urls.py](lessons_urls.py) | Cấu hình URL — file hay cần sửa nhất |
| 5 | [crawler.py](crawler.py) | Logic crawl chính |
| 6 | [STATUS.md](STATUS.md) | Tình trạng hiện tại, TODO, bugs đã biết |

---

## Cài đặt

```bash
pip install curl_cffi beautifulsoup4
```

## Cách chạy nhanh

```powershell
# Crawl 1 lớp
python -X utf8 crawler.py --grade 11

# Crawl cả 3 lớp, in bảng tổng kết cuối
python -X utf8 crawler.py --grade all

# Tiếp tục khi bị ngắt (không request lại bài đã có file HTML)
python -X utf8 crawler.py --grade all --resume
```

> **Lưu ý Windows:** Dùng `python -X utf8` để tránh lỗi UnicodeEncodeError trên console CP1258.

---

## Kết quả hiện tại (lần chạy cuối: 15/06/2025)

| Lớp | Bài thành công | Tổng bài | File JSON |
|-----|---------------|----------|-----------|
| 10 | **14** | 14 | `lich_su_10_kntt.json` (1.1 MB) |
| 11 | **16** | 16 | `lich_su_11_kntt.json` (1.0 MB) |
| 12 | **16** | 16 | `lich_su_12_kntt.json` (0.97 MB) |
| **Tổng** | **46** | **46** | **0 lỗi** |

---

## Cấu trúc thư mục

```
crawData/
├── README.md              ← Tổng quan (file này)
├── ARCHITECTURE.md        ← Kiến trúc chi tiết, luồng dữ liệu, coding style
├── STATUS.md              ← Trạng thái, TODO, bugs đã biết
│
├── crawler.py             ← Script chính (KHÔNG sửa logic parse)
├── lessons_urls.py        ← Cấu hình URL từng lớp (file thường xuyên sửa)
│
├── lich_su_10_kntt.json   ← Output lớp 10 (14 bài)
├── lich_su_11_kntt.json   ← Output lớp 11 (16 bài)
├── lich_su_12_kntt.json   ← Output lớp 12 (16 bài)
│
├── raw_html/
│   ├── grade_10/          ← HTML thô từng bài lớp 10
│   ├── grade_11/          ← HTML thô từng bài lớp 11
│   └── grade_12/          ← HTML thô từng bài lớp 12
│
└── [scripts phụ - không cần chạy thường xuyên]
    ├── crawl_sgk_lich_su_11.py  ← Script gốc lớp 11 (đã thay bằng crawler.py)
    ├── fetch_sitemap2.py        ← Tải sitemap để tìm URL bài mới
    └── filter_urls.py           ← Lọc URL từ sitemap
```
