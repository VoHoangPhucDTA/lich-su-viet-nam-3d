# Đóng góp khóa luận và phạm vi

## Problem statement

Học sinh THPT thường phải liên hệ tên địa danh, bản đồ tĩnh và văn bản để hình dung sự kiện diễn ra ở đâu, trên địa hình nào và liên kết các địa điểm ra sao. Map 2D hiện tại giúp định vị marker nhưng chỉ giữ một tọa độ trong `HistoricalEvent`; mapper `/map` còn bỏ `markers[]`, `gadmRefs[]` và `focusGeometry` (`01_FRONTEND_ANALYSIS.md`, `frontend/src/types/event.ts:13-36`, `frontend/src/services/eventApi.ts:176-204`). Vì vậy các sự kiện nhiều điểm/vùng khó được khám phá theo đúng cấu trúc không gian.

Terrain 3D bổ sung một lớp quan sát địa hình hiện đại, camera overview/target và tương tác region. Nó không tự biến dữ liệu thành bằng chứng lịch sử và không thay thế narrative, timeline hay bản đồ 2D.

## Mục tiêu

**Tổng quát:** thiết kế và đánh giá một module terrain 3D theo sự kiện, có dữ liệu target được kiểm chứng, lifecycle an toàn và trải nghiệm học tập phù hợp học sinh THPT.

**Cụ thể:**

1. Chuẩn hóa sáu `geo_type` và tạo target point/region có eligibility rõ ràng.
2. Cho phép overview, chọn từng target và restore camera mà không phá map/timeline hiện có.
3. Hiển thị provider/error/fallback minh bạch, cleanup tài nguyên và chống race.
4. Gắn disclaimer về địa hình hiện đại, ranh giới GADM và độ tin cậy vị trí.
5. Đo được functional correctness, technical reliability và usability/perceived usefulness.

## Câu hỏi đánh giá

- Người học có hoàn thành các nhiệm vụ định vị/chọn target/khôi phục góc nhìn mà không cần hướng dẫn dài không?
- Multi-target có giúp người học nhận ra quan hệ không gian giữa nhiều điểm/vùng của một sự kiện không?
- Thời gian tải, lỗi provider và camera transition có chấp nhận được trên thiết bị mục tiêu không?
- Người học có phân biệt được “địa hình hiện đại” với “ranh giới/lãnh thổ lịch sử” sau khi đọc chú thích không?
- Module có giữ được hành vi `/map` và cleanup ổn định khi đổi event/route không?

Đây là câu hỏi đánh giá, không phải tuyên bố rằng terrain cải thiện điểm số. Chỉ được kết luận hiệu quả học tập nếu có pre-test/post-test hoặc thiết kế đối chứng đủ chặt.

## Đóng góp

### Kỹ thuật

- Adapter canonical/legacy và `TerrainTarget` thuần, fail-closed.
- Provider World Terrain lazy với status/error/fallback và token public-client qua env.
- State/session/operation IDs cho provider, target, camera và cleanup Cesium.
- Resolver GADM exact-first, bounds MultiPolygon và interaction namespaced.
- Bộ test/telemetry/quality gates có thể tái lập.

### Ứng dụng

- Một luồng học tập “đọc tóm tắt → overview → chọn target → chú thích → restore → tiếp tục đọc”.
- Hỗ trợ event point, multi-point, multi-polygon và mixed; không ép terrain cho nationwide/no-location.
- UI tiếng Việt tránh thuật ngữ provider/GADM/geometry và tôn trọng reduced motion.

### Phương pháp

- Kết hợp audit dữ liệu, acceptance functional, đo kỹ thuật và user evaluation nhỏ.
- Báo cáo rõ coverage, unresolved target, limitation và evidence thay vì chỉ trình diễn screenshot.

## Phạm vi và ngoài phạm vi

**Trong phạm vi:** route `/map`, Event detail read flow, bốn type terrain được hỗ trợ, GADM level-1 hiện có, camera/target/popup/lifecycle, usability học sinh THPT.

**Ngoài phạm vi:** sửa schema/backend/migration trong MVP, biên giới lịch sử theo từng thời kỳ, tái dựng chiến trường 3D, simulation, AI sinh nội dung, image/media mapping, đo thành tích học tập nếu không có thiết kế thực nghiệm, toàn bộ repository và production data repair.

## Tuyên bố cần tránh

- “Terrain chứng minh vị trí lịch sử chính xác tuyệt đối.”
- “Polygon GADM là biên giới/lãnh thổ lịch sử.”
- “Địa hình 3D chắc chắn cải thiện kết quả học tập.”
- “Coverage 100% toàn dataset” nếu chưa có audit.
- “Production-ready” khi chưa có token/quota/CSP/live-data audit và WebGL test.
- “Không có lỗi” chỉ dựa trên unit test utility.

## Giới hạn

Terrain hiện đại có thể khác địa mạo lịch sử; location thường là vị trí đại diện; event rộng hoặc ngoài Việt Nam không vừa một polygon tỉnh; GADM name/ref có thể drift; token/network/WebGL phụ thuộc môi trường. Các giới hạn này phải xuất hiện trong chương hạn chế và trong UI copy phù hợp.
