# Event Interaction Specs

> Tổng hợp kiến thức về tài liệu hóa Usecase 01: Tương tác với sự kiện lịch sử trên bản đồ 3D trong dự án KLTN.
> Cập nhật lần cuối: 2026-05-15

---

## Architecture

### Cơ chế truy vấn CSDL (Database Query)
- **Ngày**: 2026-05-15
- **Chi tiết**: Sử dụng Native SQL với `NamedParameterJdbcTemplate` thay vì JPA Entity để tối ưu tốc độ đọc (Read-heavy). Chỉ SELECT các trường DTO nhỏ. Lọc theo lớp bằng `EXISTS` sub-query. Đếm sự kiện con bằng sub-query trong `SELECT` giúp Sidebar hiển thị biểu tượng mở rộng mà không load full cây.
- **Files liên quan**: `EventReadRepository.java`

---

## Bugs & Solutions

### Lỗi hiển thị hướng mũi tên PlantUML
- **Ngày**: 2026-05-15
- **Vấn đề**: Các mũi tên hiển thị UI đang chĩa vào Actor (User), làm sai lệch quy chuẩn thể hiện tài liệu. User chỉ tác động, giao diện hiển thị trên thiết bị/trình duyệt.
- **Root cause**: Hiểu sai về luồng render dữ liệu UI trong sơ đồ Sequence.
- **Fix**: Xóa toàn bộ mũi tên trả về User (ví dụ `SB --> U`). Điều hướng mũi tên về chính file Component render dữ liệu đó (vd: `MapPage -> Sidebar.tsx: Nhận dữ liệu và hiển thị...`).
- **Files liên quan**: `usecase_event_interaction_uml.puml`

---

## How-To

### Đồng bộ hóa Trace Comments giữa Code và UML
- **Ngày**: 2026-05-15
- **Bước thực hiện**:
  1. Loại bỏ tiền tố Use Case trong mã nguồn (xóa `UC-01.` chỉ giữ lại `1.1.x`) để chuẩn hóa định dạng.
  2. Gắn comment mô tả đúng thứ tự luồng Sequence ở các hàm thực thi logic.
  3. Với các tính năng optional, thêm nhãn `(Tùy chọn)` hoặc `Optional` ở text UML, trong khối `opt ... end` và sửa comment mã nguồn tương ứng.
- **Files liên quan**: `Timeline.tsx`, `Sidebar.tsx`, `usecase_event_interaction_uml.puml`

---

## Patterns

### Biểu diễn hành động Optional trong PlantUML
- **Ngày**: 2026-05-15
- **Chi tiết**: Sử dụng block `opt [Tiêu đề khối] (Optional) ... end` để bọc các luồng thao tác không bắt buộc. Kết hợp đánh dấu "[Tùy chọn]" trong tài liệu HTML để người đọc đối chiếu dễ dàng với sơ đồ.
- **Ví dụ code**:
  ```plantuml
  opt Lọc hiển thị trên Client (Optional)
      U -> SB : 1.1.11: Sidebar.tsx:\nNgười dùng nhấp chọn các nút filter
  end
  ```
- **Files liên quan**: `usecase_event_interaction_uml.puml`, `usecase_event_interaction.html`
