# TÀI LIỆU NGỮ CẢNH DỰ ÁN (PIPELINE STAGE 1 & 2)
**Dự án:** Lịch sử Việt Nam 3D
**Mục đích tài liệu:** Cung cấp toàn bộ ngữ cảnh, luồng xử lý và cấu trúc thư mục của 2 giai đoạn đầu tiên (Crawl và Extract) cho AI hoặc Lập trình viên mới tiếp cận mà không cần đọc trực tiếp mã nguồn.

---

## 1. TỔNG QUAN HỆ THỐNG
Dự án được chia thành nhiều giai đoạn (pipeline) để biến đổi dữ liệu từ dạng trang web tĩnh (Sách giáo khoa điện tử) thành cấu trúc JSON chuẩn bị cho việc biểu diễn trên Bản đồ 3D và Timeline.

- **Giai đoạn 1 (`stage1_crawl`):** Thu thập dữ liệu (Crawling & Parsing) từ `sgkvn.com`. Lấy toàn bộ text, ảnh, chuyển HTML thành các block JSON có cấu trúc.
- **Giai đoạn 2 (`stage2_extract`):** Trích xuất thông tin (LLM Extraction). Sử dụng AI (Gemini 2.5 Flash) đọc các block text và nhặt ra các "Sự kiện" (Events) và "Khái niệm" (Concepts) theo một Schema chuẩn (có toạ độ thời gian, phân loại vùng miền).

---

## 2. GIAI ĐOẠN 1: CRAWL & PARSE (`stage1_crawl`)

### Quy trình hoạt động
1. **Đọc URL:** Script lấy danh sách URL gốc của các bài học Lịch sử (Lớp 10, 11, 12 sách Kết Nối Tri Thức) từ file cấu hình `lessons_urls.py`.
2. **Tải HTML (Bypass Cloudflare):** Sử dụng thư viện `curl_cffi` (giả lập trình duyệt Chrome) để tải trang web không bị chặn. HTML thô của mỗi bài được lưu lại ngay lập tức vào thư mục `raw_html/` để làm cache (tính năng `--resume`).
3. **Parse HTML sang Block:** Phân tích thẻ `<div id="content">`. Chuyển đổi các thẻ HTML phức tạp thành các block đơn giản như: `heading`, `paragraph`, `list`, `table`, `image`. Tự động nhận diện số trang (ví dụ: *(Trang 15)*).
4. **Xuất JSON:** Gom tất cả lại và ghi ra các file đầu ra dạng `lich_su_{grade}_kntt.json`.

### Cấu trúc thư mục Stage 1
```text
stage1_crawl/
├── crawler.py                  # Script chính thực hiện toàn bộ việc tải và parse HTML.
├── download_images.py          # Script duyệt qua JSON để tải toàn bộ hình ảnh về lưu ở local.
├── lessons_urls.py             # File cấu hình (Chứa danh sách tất cả các URL cần cào).
├── fetch_sitemap2.py           # (Phụ trợ) Tải sitemap từ server để tìm URL mới.
├── filter_urls.py              # (Phụ trợ) Lọc URL bài học từ sitemap.
├── lich_su_10_kntt.json        # Output: Dữ liệu JSON đã parse của Lớp 10.
├── lich_su_11_kntt.json        # Output: Dữ liệu JSON đã parse của Lớp 11.
├── lich_su_12_kntt.json        # Output: Dữ liệu JSON đã parse của Lớp 12.
├── raw_html/                   # Thư mục cache chứa file HTML thô tải về từ web (grade_10, 11, 12).
└── images/                     # Thư mục chứa hình ảnh minh hoạ tải về từ web.
```

---

## 3. GIAI ĐOẠN 2: TRÍCH XUẤT BẰNG LLM (`stage2_extract`)

### Quy trình hoạt động
1. **Chuẩn bị Prompt (`prepare_prompts.py`):** Đọc các file JSON đầu ra của Giai đoạn 1, chuyển các block text thành một chuỗi Markdown dài (có đánh dấu `[Trang X]`) và lưu vào thư mục `output/prompts/`.
2. **Gọi LLM (`extract.py`):** 
   - Duyệt qua từng file `.md` prompt.
   - Kết hợp với **System Prompt** (chứa Schema chuẩn JSON và hàng tá luật khắt khe về thời gian).
   - Gọi API Gemini 2.5 Flash đa key (xoay vòng API Key để tránh rate limit 429).
3. **Hậu xử lý (Post-processing):**
   - Hàm `fix_bce_years`: Nhận diện các năm Trước Công Nguyên (TCN) và tự động gắn dấu âm (`-`) cho trường `year`.
   - Hàm `fix_period_years`: Nếu `datePrecision` là `period` (thời kì), ép các trường ngày/tháng/năm về `null`.
4. **Lưu trữ:** Kết quả gốc JSON của từng bài lưu tại `output/raw_responses/`. Cuối cùng nối tất cả vào file tổng `event_candidates.jsonl`. Tính năng `--resume` được thiết kế mặc định: nếu bài nào đã có file trong `raw_responses`, script sẽ tự bỏ qua không tốn tiền API lại.

### Cấu trúc thư mục Stage 2
```text
stage2_extract/
├── extract.py                  # Script chính gọi LLM, xử lý retry, post-processing và lưu JSON.
├── prepare_prompts.py          # Convert dữ liệu JSON (stage 1) sang Markdown prompt.
├── rebuild_jsonl.py            # Quét thư mục raw_responses và gộp lại thành 1 file jsonl.
├── validate_raw.py             # Script chạy validation kiểm tra JSON Schema nghiêm ngặt.
├── count.py                    # (Thống kê) Đếm số lượng event trong từng file.
├── test_postprocess.py         # (Test) File test logic các thuật toán sửa năm (BCE).
├── debug_api.py                # (Test) Ping thử API Gemini để kiểm tra kết nối.
├── prompts/
│   └── event_extraction.md     # System prompt chứa định dạng JSON Schema ép LLM phải tuân thủ.
└── output/
    ├── prompts/                # Chứa các file .md đầu vào (Ví dụ: 12_12957.md).
    ├── raw_responses/          # Chứa các file .json đầu ra do Gemini sinh ra.
    ├── failed/                 # Chứa log lỗi nếu Gemini không tuân thủ Schema hoặc API lỗi.
    └── event_candidates.jsonl  # OUTPUT CUỐI CÙNG: Chứa toàn bộ sự kiện của 3 lớp gộp lại.
```

---

## 4. TÍNH KẾT NỐI (INCREMENTAL RESUME)
Cả 2 giai đoạn đều được thiết kế để có thể "chạy tiếp sức". Ví dụ: Khi phát hiện thiếu bài 9 lớp 12:
1. Nạp URL Bài 9 vào `lessons_urls.py` và lưu file HTML OCR vào `raw_html/`.
2. Chạy `python crawler.py --resume` (tự động bỏ qua 46 bài cũ, chỉ parse Bài 9).
3. Chạy `python prepare_prompts.py` (tạo prompt cho Bài 9).
4. Chạy `python extract.py --all` (tự động bỏ qua 46 bài cũ, chỉ gọi AI cho Bài 9 và tự append JSON mới vào file tổng `event_candidates.jsonl`).

---

## 5. GIAI ĐOẠN 3: GỘP TRÙNG LẶP & TOẠ ĐỘ HOÁ (`stage3_dedup`)

### Quy trình hoạt động
1. **Gộp trùng lặp (Deduplication):** Script cốt lõi `dedup.py` sẽ chia các sự kiện vào các bucket theo Thế kỷ, sau đó gọi Gemini 2.5 Flash để đánh giá và gộp các sự kiện giống nhau (từ nhiều bài học khác nhau) thành một thực thể duy nhất.
2. **Gỡ gộp thủ công (Manual Unmerge):** Hệ thống đọc cấu hình từ `manual_unmerge_list.json` để tách lại những sự kiện mà AI gộp sai hoặc con người muốn tách riêng.
3. **Mã hoá địa lý (Geocoding):** Script `geocode.py` đọc toàn bộ danh sách địa danh (`rawPlaceMentions`), gọi API để chuyển đổi thành toạ độ (`lat/lng`) và cache lại vào `locations_dict.json`. Cấu hình `manual_coords_override.json` dùng để ép toạ độ cứng cho những địa danh AI không tìm được.
4. **Tối ưu chi phí:** Script `re_dedup.py` giúp chạy lại toàn bộ quy trình gộp dựa trên cấu hình các cụm đã gộp từ trước mà không cần tốn tiền gọi API Gemini thêm lần nào nữa.

### Cấu trúc thư mục Stage 3
```text
stage3_dedup/
├── dedup.py                    # Script trung tâm gọi AI gom nhóm sự kiện trùng lặp.
├── re_dedup.py                 # Script tái áp dụng logic gộp mà không cần gọi API AI.
├── geocode.py                  # Script gọi API Google/Mapbox để lấy toạ độ địa lý.
├── detect_duplicate_coords.py  # Script kiểm tra rà soát các toạ độ bị đè lên nhau.
├── validate_stage3.py          # Script kiểm tra JSON Schema nghiêm ngặt.
├── manual_unmerge_list.json    # File cấu hình do con người can thiệp để tách sự kiện.
├── manual_coords_override.json # File cấu hình sửa toạ độ bằng tay.
├── locations_dict.json         # Output cache: Từ điển địa danh -> Toạ độ.
└── deduped_events.jsonl        # OUTPUT CUỐI CÙNG: Chứa các sự kiện ĐÃ GỘP của GD3.
```

---

## 6. GIAI ĐOẠN 4: LẮP RÁP & KIỂM DUYỆT ĐẦU RA (`stage4_assemble`)

### Quy trình hoạt động (Human-in-the-loop)
1. **Kiểm duyệt tự động (Curation):** Một số sự kiện mang mác "Lịch sử Thế giới" (`region=world`) nhưng lại liên quan sát sườn đến Việt Nam (Ví dụ: VN gia nhập ASEAN). Các script `build_vietnam_candidates.py` và `build_vietnam_include_suggestion.py` sẽ tự động quét, chấm điểm từ khoá ("viet nam", "asean", "ho chi minh"...) và đề xuất giữ lại.
2. **Chốt danh sách (Whitelist):** `apply_stage4A_include_fix.py` đọc các đề xuất đó, kết hợp với các luật cứng, tự động sinh ra danh sách `config/manual_vietnam_include.json` để ép đưa lên Bản đồ Việt Nam.
3. **Lắp ráp cuối cùng:** `build_final_events.py` (Trái tim của GD4) sẽ đọc dữ liệu đã gộp từ GD3, nhúng toạ độ từ thư viện, xoá bỏ các trường thừa, format lại Thumbnail và xuất ra JSON cuối cùng.
4. **Tạo Index:** `prepare_indexes.py` xây dựng các bộ index (như Full-text search index) phục vụ chức năng tìm kiếm siêu tốc trên Web 3D Frontend.

### Cấu trúc thư mục Stage 4
```text
stage4_assemble/
├── build_final_events.py                  # Script trung tâm lắp ráp JSON xuất bản.
├── prepare_indexes.py                     # Sinh ra Search Index JSON phục vụ Frontend.
├── build_vietnam_include_suggestion.py    # Script AI-less chấm điểm và đề xuất sự kiện Thế giới.
├── build_vietnam_candidates.py            # Phụ trợ tìm kiếm keyword "Việt Nam" trong data Thế giới.
├── apply_stage4A_include_fix.py           # Tự động chốt danh sách Whitelist từ đề xuất.
├── build_event_display_review.py          # Script sinh Markdown giả lập UI hiển thị để test.
├── validate_stage4.py                     # Kiểm tra chất lượng file JSON thành phẩm.
├── stage4_common.py                       # File tiện ích dùng chung (đường dẫn, hàm chuẩn hoá).
├── config/manual_vietnam_include.json     # Whitelist các sự kiện ngoại lệ đưa lên bản đồ.
└── output/                                # Chứa các file JSON, Index tối ưu 100% cho Web 3D.
```

---

## 7. GIAI DOAN 4B: CURATE TREE (`stage4b_curate_tree`)

Stage 4B la buoc hoan thien con thieu cua Giai doan 4, nam sau `stage4_assemble` va truoc Stage 5 enrichment. Stage nay khong sua Stage 1-4A; input chinh la:

```text
stage4_assemble/output/final_events.jsonl
```

### Quy trinh hoat dong

1. **Phase 1 suggestion-only:** Sinh review de nguoi dung duyet, gom curation review, merge proposal, parent suggestions va fallback-to-root review.
2. **Human checkpoint:** Nguoi dung cap nhat `force_keep.json`, `force_supporting.json`, `force_remove.json`, `force_parent.json`, `merge_aliases.json`.
3. **Phase 2 build curated output:** Apply approved merges, split core/supporting/removed, tao 9 root periods synthetic, tao collection synthetic tu force parent, assign parent, build tree, validate va export.
4. **Phase 2.3 cleanup:** Chuan hoa display schema, tang validator link/root/display, them force parent/supporting cleanup va xuat lai dataset.

### Ket qua hien tai

- Input Stage 4A: 407 events.
- Output core tree: 361 nodes.
- Supporting items: 50.
- Removed events: 0.
- Synthetic roots: 9.
- Synthetic collections: 6.
- Validation errors: 0.
- Validation warnings: 5 semantic root/chronology warnings duoc chap nhan.

### Output cuoi

```text
stage4b_curate_tree/output/phase2/core_events.jsonl
stage4b_curate_tree/output/phase2/supporting_items.jsonl
stage4b_curate_tree/output/phase2/removed_events.jsonl
stage4b_curate_tree/output/phase2/event_tree.json
stage4b_curate_tree/output/phase2/hierarchy_seed.generated.json
stage4b_curate_tree/output/phase2/merge_log.md
stage4b_curate_tree/output/phase2/semantic_validation.md
```
