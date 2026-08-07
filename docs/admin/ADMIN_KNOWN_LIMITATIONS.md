# Admin known limitations

## Chủ ý giữ ngoài phạm vi

- Không có full `raw_json`/GeoJSON/mapData editor; geography chỉ nhận sáu payload
  canonical typed và backend tự derive mapData/focus/region labels.
- Media chỉ quản lý metadata và URL HTTP(S); không upload/xóa resource Cloudinary.
- Không hard-delete event; archive/restore là lifecycle được hỗ trợ.
- Không xóa/anonymize user, reset password, revoke session UI hoặc hiển thị token.
- Legacy full PUT/status/single-role/delete vẫn quarantine để giữ contract 409.
- Không có giao diện Admin duyệt AI candidate. AI-generated practice thuộc Quiz của
  học sinh; backend candidate/review chỉ được giữ lại như capability thử nghiệm,
  không phải workflow Admin của khóa luận.

## Chất lượng và accessibility

- Axe tự động chỉ chứng minh không có finding serious/critical trên các trang và
  viewport đã test; không phải chứng nhận WCAG AA.
- Đã tự động kiểm tra focus trap/restore/Escape/inert cho dialog/sidebar, live
  regions, table semantics, 360/768/1440 viewport, reflow tương đương 200%,
  reduced-motion và forced-colors.
- Còn pending manual: NVDA/VoiceOver end-to-end, keyboard-only trên trình duyệt
  production, high-contrast OS thực, browser zoom UI 200% và đánh giá ngôn ngữ
  thông báo bởi người dùng Việt Nam.

## Hiệu năng/build backlog Phase 12 (tùy chọn)

- Bundle chính vẫn lớn do Cesium/public application; không tối ưu Cesium toàn cục
  trong Phase 11. Admin routes đã lazy-load thành chunk riêng.
- Chỉ cân nhắc index mới sau EXPLAIN/timing trên dữ liệu có quy mô đại diện; Phase
  11 không thêm migration.
- Có thể bổ sung browser engine khác ngoài Chromium và visual regression sau này.
- Có thể bổ sung upload/compensation storage, session-management UI và audit
  export chỉ khi có yêu cầu nghiệp vụ và threat model riêng.

## Ảnh cần chụp cho khóa luận

Không dùng Playwright failure trace. Chụp mới từ demo sạch, không có email/token:

- Dashboard với metrics và attention.
- Event list với filter/completeness; event detail/editor theo section.
- Conflict dialog và publication/archive confirmation.
- User list/detail với role/status an toàn.
- Mobile Admin sidebar và một màn hình accessibility focus state.
