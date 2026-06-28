# Homepage Release

> Tổng hợp kiến thức về homepage release "Cội Nguồn" và hệ thống điều hướng trong dự án Lịch Sử Việt Nam 3D.
> Cập nhật lần cuối: 2026-06-26

---

## Architecture

### Route Restructure (Root → /home redirect)
- **Ngày**: 2026-06-26
- **Chi tiết**: Route `/` (root) redirects to `/home` thay vì hiển thị MapPage trực tiếp. Các route mới: `/home` (CoiNguonPage), `/map` (MapPage giữ nguyên), `/browse` (AllEventsPage), `/periods` (HistoricalPeriodsPage). AppHeader cần `useLocation()` để highlight nav tab active theo route hiện tại.
- **Files liên quan**: `frontend/src/App.tsx`, `frontend/src/components/layout/AppHeader.tsx`

### Trang chủ Cội Nguồn (CoiNguonPage)
- **Ngày**: 2026-06-26
- **Chi tiết**: Thiết kế hero section với split layout (7/5 ratio) — nội dung bên trái, hình ảnh di sản bên phải. Badge Quốc hiệu, heading "Biên Niên Sử Việt Nam 3D" với tô đậm đỏ. Hai CTA chính: "Bản Đồ Tương Tác" (/map) và "Ôn Luyện Kiến Thức" (/quiz). Micro stats (2000+ năm, 100+ sự kiện, 63 tỉnh thành). 3-column bento grid giới thiệu công cụ học tập.
- **Files liên quan**: `frontend/src/pages/CoiNguonPage.tsx`

### Thư viện Sử liệu (AllEventsPage)
- **Ngày**: 2026-06-26
- **Chi tiết**: Grid 3 cột hiển thị tất cả sự kiện. Search với debounce, filter theo eventType (4 loại), sort theo năm/ tên. "Load more" phân trang (24 events/page). Loading skeleton, empty state, error state đầy đủ.
- **Files liên quan**: `frontend/src/pages/AllEventsPage.tsx`, `frontend/src/components/shared/EventCard.tsx`

### Thời Kỳ Lịch Sử (HistoricalPeriodsPage)
- **Ngày**: 2026-06-26
- **Chi tiết**: 5 period cards với gradient fallback theo eventType. Drill-down: click period → fetch events → client-side year-range filter. Context-aware back navigation (history.length heuristic). Hỗ trợ URL query param (?period=feudal) cho deep linking.
- **Files liên quan**: `frontend/src/pages/HistoricalPeriodsPage.tsx`

### Data Layer mở rộng
- **Ngày**: 2026-06-26
- **Chi tiết**: `eventTitleImages.ts` mapping slug → hero image path. `getHomepageEvents()` fetch 6 events cho homepage. `getBrowseEvents()` với params: q, eventType, limit, offset, sortBy, sortDir.
- **Files liên quan**: `frontend/src/data/eventTitleImages.ts`, `frontend/src/services/eventApi.ts`

---

## How-To

### Cách thêm route mới
- **Ngày**: 2026-06-26
- **Bước thực hiện**:
  1. Tạo page component trong `frontend/src/pages/`
  2. Import và thêm `<Route>` trong `App.tsx`
  3. Cập nhật `AppHeader.tsx` nav tabs nếu cần
  4. Thêm entry trong `eventTitleImages.ts` nếu page cần hero images
- **Files liên quan**: `frontend/src/App.tsx`, `frontend/src/components/layout/AppHeader.tsx`

### Cách commit theo chuẩn release
- **Ngày**: 2026-06-26
- **Bước thực hiện**:
  1. Stage tất cả file: `git add frontend/` (thêm folder cụ thể)
  2. Viết commit message dạng `[Category] Mô tả ngắn gọn bằng tiếng Việt`
  3. Kiểm tra PR template/docs nếu có để lấy title chính xác
- **Lưu ý**: Trên Windows/Git Bash, dùng path `/f/...` thay vì `F:\...`

### Cách sử dụng EventCard component
- **Ngày**: 2026-06-26
- **Bước thực hiện**:
  1. Import `EventCard` từ `../components/shared/EventCard`
  2. Props: `event: HistoricalEvent`, `variant?: 'normal' | 'compact'` (mặc định normal)
  3. EventCard tự động xử lý title image (từ `eventTitleImages.ts`) hoặc gradient fallback dựa trên eventType
- **Files liên quan**: `frontend/src/components/shared/EventCard.tsx`

---

## Patterns

### File organization cho pages
- **Ngày**: 2026-06-26
- **Chi tiết**: Pages được tổ chức flat trong `frontend/src/pages/`, với các page auth trong `pages/auth/`, profile trong `pages/profile/`, admin trong `pages/admin/`, quiz trong `pages/quiz/`, exams trong `pages/exams/`.
- **Files liên quan**: `frontend/src/pages/`

### Light theme design tokens
- **Ngày**: 2026-06-26
- **Chi tiết**: Toàn bộ UI dùng light theme với color palette: stone-50 background, amber gold accent (#C49A45), red-900 (#8b1e1e) cho CTAs và điểm nhấn. Tất cả hard-coded colors đã thay thế CSS variables — dùng trực tiếp hex values.
- **Files liên quan**: `frontend/src/index.css`

---

## Bugs & Solutions

### animate-pulse trong Tailwind v4
- **Ngày**: 2026-06-26
- **Vấn đề**: Tailwind v4 ships `animate-pulse` mặc định, nhưng có thể không hoạt động ở một số phiên bản
- **Fix**: Thêm defensive fallback CSS animation trong `index.css` để đảm bảo loading skeleton luôn chạy
- **Files liên quan**: `frontend/src/index.css`

### Chunk warning Cesium.js
- **Ngày**: 2026-06-26
- **Vấn đề**: Một JS chunk > 500 kB do Cesium bundle
- **Fix**: Đề xuất dynamic import cho Cesium trong tương lai, hiện tại chấp nhận warning
