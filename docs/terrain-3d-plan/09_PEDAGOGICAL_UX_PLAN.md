# Kế hoạch trải nghiệm học tập và UX

## Learning objectives

Sau khi dùng module, học sinh có thể:

1. Nhận biết sự kiện diễn ra ở đâu và phân biệt point với region.
2. Quan sát mối liên hệ giữa địa điểm và đặc điểm địa hình hiện đại.
3. So sánh nhiều địa điểm của cùng một sự kiện qua overview/target picker.
4. Liên hệ không gian địa lý với tóm tắt/narrative mà không nhầm biểu diễn hiện đại với biên giới lịch sử.

## User journey

```text
Chọn sự kiện
→ đọc tóm tắt
→ Xem địa hình
→ quan sát overview
→ chọn điểm/vùng
→ đọc tên + chú thích
→ Quay lại góc nhìn tổng thể
→ tiếp tục đọc nội dung sự kiện
```

CTA chỉ xuất hiện khi eligible. `nationwide`/`no_location` giữ nội dung 2D và không hiển thị CTA gây kỳ vọng sai.

## Wording tiếng Việt

| Tình huống | Wording |
|---|---|
| CTA | `Xem địa hình` |
| Overview | `Tổng quan khu vực` |
| Target list | `Địa điểm liên quan` |
| Point | `Điểm: {label}` |
| Region | `Vùng: {label}` |
| Loading | `Đang tải địa hình…` |
| Provider error | `Chưa tải được địa hình 3D. Bạn vẫn có thể xem bản đồ.` |
| GeoJSON error | `Chưa xác định được ranh giới vùng; các điểm hợp lệ vẫn có thể xem.` |
| Empty | `Sự kiện này chưa có vị trí đủ tin cậy để xem địa hình.` |
| Back camera | `Quay lại góc nhìn` |
| Modern boundary note | `Vùng tô màu là ranh giới hành chính hiện đại dùng để định vị.` |
| Terrain note | `Địa hình hiển thị theo dữ liệu hiện đại.` |

## Cognitive load

- Chỉ ưu tiên CTA, target list, Back camera và Retry; không lộ provider/GADM/geometry.
- Không hiển thị quá nhiều target cùng lúc; dùng danh sách có nhãn, stable order và selected state.
- Không chỉ dùng màu: selected có text/icon/outline/aria state.
- Camera flight ngắn, có overview và reduced-motion; popup không che toàn bộ vùng quan sát.
- Back-to-parent và Back-camera là hai nút/nhãn khác nhau.
- Hướng dẫn lần đầu chỉ là một tooltip ngắn nếu user testing cho thấy cần; không thêm overlay mặc định.

## Accessibility và mobile

- Button thật, focus ring rõ, label đầy đủ; target list keyboard navigable.
- `aria-live="polite"` cho loading/error; không đọc raw error kỹ thuật.
- Escape đóng picker/thoát terrain theo policy; focus trả về CTA hoặc popup hợp lý.
- Không phụ thuộc màu; contrast cho primary/secondary/highlight.
- 320/375px: popup có scroll nội dung, CTA không bị che, list không tràn ngang; Cesium canvas vẫn giữ khu vực tối thiểu.
- `prefers-reduced-motion`: duration 0/ngắn, không auto-tour.

## User tasks cho pilot

1. Mở một event point và xác định vị trí.
2. Mở event multi-point, chọn target thứ hai và quay lại overview.
3. Mở multi-polygon/mixed, phân biệt point với vùng.
4. Đóng popup/đổi event trong lúc loading hoặc camera đang bay.
5. Giải thích bằng lời chú thích “ranh giới hiện đại” có nghĩa gì.

Các task đo usability/perceived usefulness, không tự suy ra learning gain.
