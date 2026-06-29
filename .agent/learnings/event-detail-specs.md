# Event Detail Specs

> Tổng hợp kiến thức về tài liệu hóa Usecase 02: Xem chi tiết sự kiện lịch sử trên hệ thống.
> Cập nhật lần cuối: 2026-05-15

---

## Architecture

### Luồng xử lý Text-to-Speech (TTS)
- **Ngày**: 2026-05-15
- **Chi tiết**: Thiết kế luồng TTS như một luồng Optional (`<<extend>>`). Client yêu cầu audio -> Backend kiểm tra cache trong Database -> Nếu chưa có, Backend gọi External API (FPT.AI / ElevenLabs) để sinh Audio -> Upload lên Cloudinary -> Trả về URL. Cơ chế này bảo mật API Key và tiết kiệm chi phí gọi lại (cache hit).
- **Files liên quan**: `usecase_event_detail_uml.puml`, `EventController.java`, `EventReadService.java`

### Giao diện hiển thị Media (Hình ảnh & Video)
- **Ngày**: 2026-05-15
- **Chi tiết**: Thay vì cuộn dọc dài, section Media được chia thành 2 Tab (Hình ảnh / Video). Ảnh được load trực tiếp từ URL Cloudinary (với tham số tối ưu). Video nhúng iFrame. Giúp giảm tải DOM và cải thiện UX cho các bài viết có nhiều tư liệu.
- **Files liên quan**: `EventDetailPage.tsx`

---

## Bugs & Solutions

### UML Actor Rendering
- **Ngày**: 2026-05-15
- **Vấn đề**: Vẽ luồng Actor (User) gọi trực tiếp lệnh "Render các Section" cho trang `EventDetailPage`.
- **Root cause**: Hiểu nhầm hành vi render của React. Người dùng không trực tiếp trigger hàm render của component, mà Component tự động render dựa trên State (sau khi fetch data).
- **Fix**: Chuyển luồng thành self-message của Component: `EDP -> EDP: Tự động Render...`.
- **Files liên quan**: `usecase_event_detail_uml.puml`

---

## Patterns

### Trích xuất Section List từ Component thực tế
- **Ngày**: 2026-05-15
- **Chi tiết**: Khi viết Document HTML hoặc UML, không chỉ liệt kê các Section cơ bản mà phải đối chiếu với code thực tế. Ví dụ `EventDetailPage.tsx` chứa Tổng quan, Nội dung SGK, Dữ kiện chính, Địa điểm, Sự kiện liên quan, Tư liệu Media, Nguồn tham khảo. Phải liệt kê đầy đủ để Document khớp 100% với Code.
- **Files liên quan**: `usecase_event_detail.html`, `EventDetailPage.tsx`

### Chuẩn hóa định dạng tài liệu HTML (KLTN Template)
- **Ngày**: 2026-05-15
- **Chi tiết**: Để tài liệu HTML có thể dễ dàng copy/paste hoặc in ấn trực tiếp cho Khóa luận, cần tuân thủ cấu trúc CSS (Times New Roman, 13pt) và format bảng HTML (border 1px solid black, the `<th>` xám). Đảm bảo mọi file đặc tả (Auth, Event Interaction, Event Detail) đều dùng chung một bộ style duy nhất này.
- **Files liên quan**: `usecase_event_detail.html`, `usecase_auth_copy.html`
