# Accessibility Spec

Đây là yêu cầu thiết kế/QA, không phải tuyên bố đã đạt WCAG tuyệt đối.

- Dùng landmarks `header`, `main`, `nav`, `aside` hợp lý; một `h1`, heading hierarchy không nhảy cấp vì style.
- Filter có accessible name, group label, current selection và dùng được bằng keyboard.
- Mọi control có focus-visible rõ trong light/dark; thứ tự focus khớp reading order.
- Chart có accessible name, mô tả mục đích và textual summary/list tương đương; tooltip không là nguồn duy nhất.
- Strength/weakness/confidence dùng text/icon/pattern bên cạnh màu; không chỉ xanh/đỏ.
- Contrast text, border cần thiết, focus ring và data marks phải được kiểm tra ở cả hai theme.
- Tôn trọng `prefers-reduced-motion`; không auto-play hoặc parallax.
- KPI có label screen-reader rõ (ví dụ “Điểm trung bình 7 phẩy 4 trên 10”).
- History dùng list/article hoặc table semantics đúng; mobile card vẫn có heading và link name duy nhất.
- Loading có `aria-live`/status thông báo và skeleton không đọc như KPI thật; fallback/error notice dùng role phù hợp nhưng không lạm dụng alert. Nút “Thử lại” có accessible name rõ và CTA browse là liên kết riêng.
- Touch target tối thiểu 44px; icon-only button có accessible name.
- Text dài, line-height và wrap vẫn dùng được ở zoom 200%; không khóa chiều cao làm cắt chữ.
- Tránh placeholder như label; date/score/duration có context; abbreviation T/F được giải thích là Đúng/Sai.
- Skeleton ẩn khỏi accessibility tree hoặc có status duy nhất; không tạo hàng chục announcement.
- QA cần keyboard-only, screen reader smoke test, contrast tool và reflow ở 320px/200% trước implementation acceptance.
