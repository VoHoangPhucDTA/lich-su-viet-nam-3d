# Gói Nghiệm Thu Giai Đoạn 3 — Deduplication & Geocoding

Thư mục này chứa toàn bộ dữ liệu đầu vào, đầu ra, log kiểm định và báo cáo phân tích để AI đánh giá xác nhận nghiệm thu (hoặc từ chối) Giai đoạn 3 của pipeline xây dựng dataset lịch sử Việt Nam 3D.

## Nội dung thư mục

| File | Mô tả |
|---|---|
| `README.md` | File này — hướng dẫn đọc gói |
| `deduped_events.jsonl` | **Output chính của Deduplication** — 680 sự kiện sau khi gộp |
| `locations_dict.json` | **Output chính của Geocoding** — từ điển tọa độ địa danh (474 địa danh sau lọc blacklist) |
| `dedup_review.md` | Toàn bộ 28 nhóm gộp để review tay (yêu cầu bắt buộc) |
| `geocode_sample.md` | 20 địa danh mẫu để đối chiếu thủ công |
| `validate_report.txt` | Output đầy đủ của `validate_stage3.py` (thống kê + cảnh báo) |
| `dedup_log.txt` | Log đầy đủ của lần chạy `dedup.py` cuối |

## 4 tiêu chí nghiệm thu (theo yêu cầu)

### 1. Geocode đủ 474/474?
→ Xem `validate_report.txt` phần "--- KIỂM ĐỊNH GEOCODE ---"
→ Xem `locations_dict.json` (đếm key)

### 2. Thống kê Dedup
→ Xem `validate_report.txt` phần "--- KIỂM ĐỊNH DEDUP ---"
→ Xem `dedup_log.txt` — kiểm tra KHÔNG có dòng nào chứa `[ERROR] Failed`

### 3. Check eventType/eventSubtype conflict — đặc biệt Nhóm 3 (Gạc Ma)
→ Xem `validate_report.txt` — tìm dòng `[LỖI NGHIÊM TRỌNG]` hoặc `[CẢNH BÁO TYPE]`
→ Nhóm Gạc Ma: sau khi prompt được cập nhật cấm gộp "bản chất khác nhau", LLM có gộp lại không?

### 4. Region cuối của các nhóm conflict
→ Xem `validate_report.txt` — tìm dòng `[CẢNH BÁO]` chứa "region conflict"
→ Logic sửa: khi conflict, ưu tiên `"vietnam"` nếu có bất kỳ event nào gán vietnam
→ Sự kiện "Việt Nam gia nhập ASEAN": region cuối sẽ là `"vietnam"`
→ Các sự kiện song trùng VN-thế giới được đánh dấu `_is_dual_region: true` để phân tích khóa luận

## Ghi chú kỹ thuật quan trọng

**Về logic resume của Geocode:**
- Mỗi địa danh đã có trong `locations_dict.json` (bất kể confidence là gì, kể cả `"none"`) đều bị bỏ qua khi resume.
- Logic kiểm tra: `if p and p not in locations_dict` (dòng 108 trong `geocode.py`).
- Điều này đảm bảo địa danh được gán `confidence: "none"` (không phải địa danh) KHÔNG bị gọi lại LLM mỗi lần.

**Về `_is_dual_region`:**
- Field mới được thêm vào các sự kiện có region conflict sau khi gộp.
- Có thể dùng làm tín hiệu để frontend hiển thị sự kiện ở cả 2 chế độ xem (Lịch sử VN và Lịch sử Thế giới).

**Về Nhóm Gạc Ma:**
- Prompt `dedup_prompt.md` đã được bổ sung quy tắc 5: "KHÔNG BAO GIỜ gộp các sự kiện có BẢN CHẤT KHÁC NHAU dù cùng thời điểm/địa điểm."
- Cơ chế tự động bắt lỗi đã được thêm vào `validate_stage3.py`: cảnh báo `[LỖI NGHIÊM TRỌNG]` nếu nhóm gộp chứa các `eventType` khác nhau.
