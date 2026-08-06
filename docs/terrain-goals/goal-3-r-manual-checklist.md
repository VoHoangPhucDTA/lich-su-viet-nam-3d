# Goal 1–3-R merged manual WebGL checklist

**Trạng thái hiện tại: PENDING_BACKEND_AND_DATABASE**

Lookup policy hiện tại: `SLUG_ONLY_FAIL_CLOSED`. Khi backend hoạt động, checklist phải kiểm tra thêm payload/event có slug thật hiển thị custom insight; event thiếu slug vẫn dùng generic terrain flow và không được match bằng `event.id`.

Browser mở được `/map`, nhưng backend `127.0.0.1:8080` và MySQL cổng 3306 không hoạt động nên UI không có event để chọn. Không mục nào dưới đây được đánh dấu PASS cho đến khi chạy lại với đủ môi trường.

## Chuẩn bị

1. Khởi động MySQL và Spring Boot bằng cấu hình hợp lệ của project.
2. Khởi động frontend bằng command an toàn đã nêu trong kế hoạch; không dùng lifecycle có thể tái sinh dataset.
3. Mở `/map`, Browser DevTools và debug handle Cesium hiện hữu theo hướng dẫn Goal 1/2.
4. Ghi scene baseline: terrain provider, `verticalExaggeration`, lighting, `globe.depthTestAgainstTerrain`, `globe.maximumScreenSpaceError` và camera pose.

## Goal 1 — Render foundation

- Xác nhận Cesium World Terrain hoạt động và `hasVertexNormals === true` sau khi provider sẵn sàng.
- Xác nhận `requestWaterMask === false` theo Goal 1.
- So sánh scene settings trước, trong và sau terrain; mọi giá trị phải restore đúng snapshot ban đầu.
- Chạy 10 chu kỳ enter/exit; không rò rỉ scene state hoặc listener.
- Kiểm tra cancel, đổi event giữa lifecycle đang chạy và unmount; không có stale operation thắng session mới.

## Goal 2 — Camera

- Chạy manual A/B theo checklist Goal 2 cho cùng event/target.
- Xác nhận camera ground-relative và target vẫn nhìn thấy; không kết luận tuning mới trong Goal 3-R.
- Kiểm tra cancel, đổi event và exit trong lúc camera/terrain đang xử lý.
- Trạng thái checkpoint vẫn `NOT_READY_MANUAL_PENDING` cho đến khi A/B hoàn tất.

## Goal 3-R — Insight/UI

- Điện Biên Phủ: CTA duy nhất là `Xem không gian diễn biến chiến dịch`; sau enter, insight card nằm ngay trên target list.
- 1287–1288: CTA là `Xem bối cảnh địa hình 3D`; card có đúng sourceRef trang 46 và 49, đồng thời có câu tự giới hạn phạm vi.
- Event không có insight: CTA generic `Khám phá địa hình khu vực`; không có card hoặc container rỗng; target list vẫn hoạt động.
- Xác nhận card có hai nhãn `Theo SGK` và `Quan sát trên mô hình 3D — địa hình hiện nay`.
- Xác nhận target list có đúng nhãn `Các địa điểm liên quan đến sự kiện (theo dữ liệu bản đồ của đề tài)` đúng một lần.
- Xác nhận không production entry nào có relevance decisive hoặc preferred initial target.
- Exit terrain và đóng popup: card biến mất, scene/camera restore theo hành vi Goal 1–2.
- Lặp lại enter/exit, đổi qua lại ba loại event và cancel; không insight cũ xuất hiện ở event mới.
- Kiểm tra sourced block chỉ chứa headline, explanation và source; observation prompts nằm ở block riêng; scope note nằm sau danh sách quan sát.
- Kiểm tra card không có `aria-live`; source có nhãn `Nguồn:`; target list được đọc đúng visible label qua `aria-labelledby`.
- Với fixture/dev payload thiếu slug nhưng `id` trùng canonical slug, xác nhận CTA generic và không có sourced insight.

## Ảnh bắt buộc

| Ảnh | Trạng thái | Tên đề xuất |
|---|---|---|
| Điện Biên Phủ, terrain active, insight + target list | PENDING | `goal-3-r-dien-bien-phu.png` |
| 1287–1288, terrain active, insight + target list | PENDING | `goal-3-r-1287-1288.png` |
| Event không insight, terrain active | PENDING | `goal-3-r-no-insight.png` |
| Sau exit terrain, scene restored | PENDING | `goal-3-r-after-exit.png` |

Không dùng ảnh trang có 0 event làm bằng chứng PASS cho các mục trên.
