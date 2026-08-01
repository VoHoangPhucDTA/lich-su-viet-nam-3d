# PR: Tối ưu tốc độ tải các trang public

## Mục tiêu

Giảm lượng JavaScript, hình ảnh và dữ liệu không cần thiết trong lần đầu người dùng mở website, đặc biệt tại:

- `/home`
- `/browse`
- `/periods?period=...`

Đồng thời giữ nguyên toàn bộ chức năng `/map`, terrain 3D, trang chi tiết sự kiện và Admin.

## Vấn đề trước thay đổi

- `/home` tải `MapPage` và Cesium dù người dùng chưa mở bản đồ.
- Hero, logo và ảnh thời kỳ có dung lượng lớn.
- EventCard tải ảnh Cloudinary gốc, lớn hơn nhiều so với kích thước card.
- `/home` gọi sáu full-detail API.
- Sáu API tạo khoảng 48 SQL statement và trả phần lớn dữ liệu không được card sử dụng.

## Những thay đổi chính

### 1. Lazy-load route `/map`

- `MapPage` chỉ được tải khi người dùng vào `/map`.
- Cesium và historical-event registry không còn nằm trong initial `/home`.
- Direct navigation và SPA navigation vẫn hoạt động.

### 2. Tối ưu static images trên `/home`

- Thêm AVIF/WebP/JPEG fallback.
- Hero sử dụng responsive candidates.
- Period cards và logo sử dụng ảnh phù hợp kích thước hiển thị.
- Giữ nguyên bố cục và CLS.

### 3. Tối ưu thumbnail EventCard

- Áp dụng chung cho `/home`, `/browse` và `/periods`.
- Dùng Cloudinary transformations `c_limit`, `f_auto`, `q_auto`.
- Browser chọn giữa các candidate 360/480/768.
- Giữ nguyên fallback, lazy loading và nội dung hình ảnh.
- Không upload hoặc thay Cloudinary asset.

### 4. Thêm homepage summary endpoint

- Thêm `GET /api/events/homepage`.
- Backend giữ sáu sự kiện curated và đúng thứ tự.
- Một compact SQL query.
- Frontend normal path chỉ gửi một request.
- Khi endpoint lỗi, thiếu, duplicate hoặc invalid, frontend fallback đúng một lần sang list API.
- Detail API vẫn giữ nguyên.

## Kết quả đo

| Hạng mục | Trước | Sau |
|---|---:|---:|
| Initial entry JS raw | 5.450.267 B | 531.497 B |
| Initial entry JS gzip | 1.400,73 KB | 154,75 KB |
| Static cold transfer `/home` | 5.226.808 B | 471.361 B |
| Sáu EventCard images `/home` | 1.998.162 B | 169.884 B |
| `/browse` initial image transfer | 5.580.183 B | 316.941 B |
| `/browse` load-more image transfer | 9.814.175 B | 384.105 B |
| Homepage HTTP requests | 6 | 1 |
| Homepage SQL statements | 48 | 1 |
| Homepage API payload | 46.470 B | 2.241 B |
| Homepage endpoint p50 | — | 12,698 ms |
| Homepage endpoint p95 | — | 15,516 ms |

Lưu ý: benchmark thực hiện trong local production preview. Timing có thể biến thiên theo máy và mạng; mức giảm byte, request và query là bằng chứng chính, không phải production RUM.

## Hành vi được giữ nguyên

- Sáu homepage events và thứ tự.
- Link đến trang chi tiết và Event-detail API.
- Search, filter, sort và infinite loading.
- Responsive EventCard layout.
- `/map`, Cesium Viewer, terrain CTA và các geo type `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, `no_location`.
- Admin, database schema và Flyway migrations.

## Fallback của homepage

Normal path:

```text
GET /api/events/homepage
```

Khi response lỗi hoặc không hợp lệ:

```text
GET /api/events?eventLevel=atomic&limit=30
```

Frontend không quay lại sáu detail requests.

## Kiểm thử đã chạy

### Frontend

- Focused Vitest cho App/header, Cloudinary helper, EventCard, route image profiles, homepage API và homepage fallback.
- TypeScript app/node.
- Scoped ESLint.
- Direct Vite production build.
- `git diff --check`.

### Backend

- Controller/routing tests.
- Service tests.
- Repository tests.
- Homepage response contract, security/public access và existing detail regression.

### Browser

- `/home` cold/warm; `/browse` initial/load-more; các `/periods?period=...`.
- Responsive desktop/tablet/mobile.
- Direct `/map`, SPA `/home → /map`, terrain smoke, back navigation và Viewer cleanup.

## Cách review PR

Nên review theo thứ tự commit:

1. Initial lazy loading và static assets.
2. Shared responsive EventCard images.
3. Homepage summary endpoint.
4. PR documentation.

Điểm cần tập trung: route `/map` không eager-load lại; Cloudinary guard không sửa URL signed/private/non-Cloudinary; EventCard fallback không tạo loop; homepage response giữ đúng sáu slug và thứ tự; homepage fallback không gọi detail API; detail API contract không đổi.

## Cách test manual

### `/home`

- Hard reload với Disable cache, xác nhận hero và sáu card hiển thị.
- Network chỉ có một `/api/events/homepage`, không có sáu detail requests.
- Thumbnail Cloudinary có `c_limit`, `f_auto`, `q_auto`; nhấn event rồi Back về `/home`.

### `/browse`

- Hard reload, kiểm tra initial batch, cuộn load batch tiếp theo.
- Ảnh cũ không request lại; search/filter/sort vẫn hoạt động.

### `/periods`

Test `ancient`, `feudal`, `colonial`, `modern`, `contemporary`; kiểm tra card, ảnh, filter/sort và load-more.

### `/map`

- Direct `/map` và SPA navigation.
- Viewer/canvas, sidebar/timeline.
- Một event có terrain CTA, một event `no_location`, sau đó Back về route trước.

## Rủi ro

### Cloudinary URL parsing

Các URL không thể transform an toàn sẽ giữ nguyên source URL và fallback hiện tại.

### Homepage endpoint

Endpoint trả compact DTO riêng; trang detail vẫn dùng full DTO cũ.

### Browser timing

FCP/LCP có thể thay đổi nhẹ giữa các lượt đo; thay đổi chính của PR là giảm byte, request và query.

## Rollback

Các commit được chia theo concern nên có thể revert độc lập:

```text
revert homepage summary commit
revert responsive EventCard commit
revert initial asset-load commit
```

Không cần rollback database vì PR không có migration. Không cần rollback Cloudinary vì PR không upload hoặc thay asset.

## Ngoài phạm vi

- Không kiểm tra nội dung lịch sử của ảnh.
- Không thay Cloudinary asset.
- Không thay Cesium `Viewer` hoặc giảm thêm Map JS bundle.
- Không thêm virtualization, không sửa production CDN/cache headers, không self-host font.
- Không sửa database schema/index hoặc Admin.

Phase 5B đã thử các phương án import và dynamic boundary cho Cesium nhưng không có thay đổi nào được giữ vì không giảm production bundle.

## Checklist

- [x] Không có migration
- [x] Không thay detail API
- [x] Không upload Cloudinary asset
- [x] Không thay terrain behavior
- [x] Frontend tests pass
- [x] Backend tests pass
- [x] TypeScript pass
- [x] ESLint pass
- [x] Production build pass
- [x] Browser smoke pass
- [ ] Reviewer manual test
