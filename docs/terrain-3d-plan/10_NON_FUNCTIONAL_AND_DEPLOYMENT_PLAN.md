# Yêu cầu phi chức năng và triển khai

## Performance budget theo ba mức

Không đặt số tuyệt đối trước benchmark. Mỗi chỉ số ghi ba cột: target ban đầu, cần benchmark, ngưỡng nghiệm thu sau đo.

| Chỉ số | Target ban đầu | Cần benchmark | Ngưỡng nghiệm thu |
|---|---|---|---|
| Click CTA → bắt đầu flight | Có feedback loading ngay | Browser Performance marks | Chốt sau đo P50/P95 trên laptop mục tiêu |
| Provider ready | Lazy, không block map | Network/DevTools | Chốt theo mạng trường học và quota |
| GeoJSON ready | Một datasource dùng lại | Resource timing | Chốt sau staging |
| Chọn target → camera | Không tạo datasource mới ngoài session | Performance mark | P95 do product duyệt |
| Entity/datasource/session | Có giới hạn và cleanup | Cesium collections | Không tăng sau 10 enter/exit |
| FPS/mượt | Không auto-tour | Chrome Performance/WebGL | Chốt cho event nhiều vùng |

Gắn marks `terrain_enter_start/provider_ready/geojson_ready/target_select/camera_complete/terrain_exit_complete`; không log token/raw payload.

## Reliability matrix

Phải test: A→B liên tục; close khi provider loading; route change giữa flight; provider/GeoJSON/GADM lỗi; detail thiếu `sourceJson`; flight cancel; StrictMode mount/unmount; enter/exit ≥10 lần. Expected luôn là latest intent thắng, không setState stale, map 2D vẫn dùng được và datasource/handler/viewer không tích lũy.

## Accessibility/compatibility

Matrix tối thiểu: Chrome desktop, Edge desktop, Android Chrome nếu website hỗ trợ mobile, laptop viewport phổ biến, WebGL unavailable/weak. Ghi rõ browser version, OS, GPU và token environment. Không mở rộng sang Safari/iOS nếu không có khả năng kiểm thử trong luận văn; nêu đó là limitation.

## Security và deployment checklist

- `VITE_CESIUM_ION_TOKEN` là public browser token, domain restriction, quota alert và rotation owner.
- Không commit `.env`; không log token; rotate token từng hard-code trong source trước staging.
- CSP cho `worker-src`, `connect-src`, `img-src`, `blob:` và Cesium Ion domain; HTTPS bắt buộc.
- `CESIUM_BASE_URL`, Workers/Assets/Widgets và GeoJSON phải đúng production base path; `/cesium`/`/geojson` absolute hiện là giả định local (`frontend/vite.config.ts:14-20`, `frontend/vite.config.ts:42-44`).
- Xác minh CORS/API base URL, cache headers cho static Cesium/GeoJSON, timeout/retry hữu hạn.
- Không tuyên bố terrain thành công khi provider fallback ellipsoid.

## Resource cleanup gate

Chụp counts trước/sau mỗi session: Viewer, ScreenSpaceEventHandler, dataSources, entities và pending camera operations. Sau 10 chu kỳ counts phải ổn định; unmount phải destroy/cancel. Đây là technical evidence, không chỉ screenshot.

## Demo fallback plan

Chuẩn bị trước một event đại diện cho mỗi `point`, `multi_point`, `multi_polygon`, `mixed`; xác minh GADM refs và sanitize captions. Nếu provider lỗi, demo UI error + map 2D; không gọi ellipsoid là terrain. Có ảnh/video dự phòng cho bảo vệ, nhưng sản phẩm thật chỉ được demo terrain khi token/quota/network đã kiểm tra. Checklist ngày bảo vệ gồm token staging, HTTPS/CSP, base path, API reachable, GeoJSON 200, WebGL, fallback và logout/cleanup.
