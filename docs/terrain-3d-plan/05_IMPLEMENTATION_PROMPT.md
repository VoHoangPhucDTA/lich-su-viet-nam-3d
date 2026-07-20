# Prompt cho phiên Codex triển khai tiếp theo

Bạn đang làm việc trong repository website hỗ trợ học sinh THPT học Lịch sử Việt Nam. Hãy triển khai **MVP “Xem địa hình 3D” trên `/map`** theo đúng sáu tài liệu trong `docs/terrain-3d-plan/`.

## Đọc và kiểm tra trước khi sửa

Đọc theo thứ tự: `00_README.md`, `01_FRONTEND_ANALYSIS.md`, `02_BACKEND_ANALYSIS.md`, `03_REFERENCE_PATCH_REVIEW.md`, `04_IMPLEMENTATION_PLAN.md`. Source hiện tại luôn thắng tài liệu nếu line đã đổi. Chạy lại `git status --short`, branch, tracked diff; giữ mọi thay đổi của người dùng.

## Ràng buộc tuyệt đối

- Đây là công việc implementation theo phase; **không apply/merge/overwrite** `terrain-3d-implementation.patch`, ZIP hoặc report.
- Không sửa backend/migration/importer trong MVP frontend-only. Nếu detail `sourceJson` không đủ sau audit, dừng tại decision gate và báo evidence, không tự mở rộng scope.
- Không đụng image/media mapping, canonical data, GeoJSON, auth, quiz hoặc module ngoài runtime `/map`.
- Không hard-code/log Cesium token; chỉ dùng tên `VITE_CESIUM_ION_TOKEN`. Không commit `.env`.
- Không thêm package nếu Cesium 1.139.1 và dependency hiện tại đủ; không chuyển sang Resium.
- Không reset/checkout/clean/xóa thay đổi người dùng; dùng patch semantic nhỏ.
- Không để `any` né type nếu Cesium declarations có type; không làm whole-file line-ending churn.
- `nationwide` và `no_location` luôn không eligible; `multi_region` không tự động là polygon.

## Phase bắt buộc

1. **Contract/API:** mở rộng canonical type additive, giữ legacy; giữ `sourceJson.mapData`; đọc flat/nested; canonical thắng normalized; fallback fail-safe. Viết test parser trước.
2. **Target utility:** tạo pure `terrainTargets.ts`; validate finite/range; stable IDs; point/region; exact GADM `GID_1` rồi normalized name; mismatch diagnostics; focus chỉ là hint. Test đủ sáu type, legacy, malformed, duplicate, unresolved.
3. **Provider:** env token, lazy World Terrain, `loading/ready/error/retry`; map ellipsoid fallback; verify Cesium API 1.139.1; mounted/session guard cho provider/GeoJSON/datasource.
4. **Orchestration:** state owner tại MapPage với reducer/transition guard; `requestId + eventId + terrainSessionId`; latest-wins; bảo toàn sidebar/timeline/search/deep-link/hierarchy.
5. **Camera:** snapshot một lần, operation ID; cancel khác complete; overview/point/region frame; reduced motion; restore exact trước close/switch/year/grade/route; chặn auto-fly legacy ghi đè.
6. **Region:** await datasource; gom toàn bộ MultiPolygon bounds; click/highlight; namespace metadata trong handler duy nhất; cleanup material/entity/datasource.
7. **Popup UX:** CTA eligibility, loading/error/retry, target picker/highlight, `Quay lại góc nhìn`; không nhầm với back-to-parent; keyboard/focus/Escape/mobile.
8. **Integration/release:** chạy regression `/map`, six types, A→B, close/switch/unmount, marker/sidebar/timeline/deep-link; kiểm tra resource count và WebGL thủ công.

## Checkpoint sau mỗi phase

Báo: file sửa/tạo, logic, command, PASS/FAIL, diff stat, acceptance đã đạt, blocker và rollback. Nếu test fail, sửa trong phase hiện tại hoặc dừng; không chồng workaround UI. Chạy `npx tsc --noEmit -p tsconfig.app.json`, test scoped và lint scoped phù hợp. `npm run build` chỉ chạy khi kiểm soát được `prebuild`/generated data và ghi status trước/sau.

## Decision gates bắt buộc

Dừng và báo nếu:

- `sourceJson` không có `mapData`/schema khác kế hoạch;
- live/staging raw data thiếu ở mức khiến frontend-only không khả thi;
- provider API/token/quota/CSP/base path không xác minh được;
- cần DTO/backend/migration/package mới;
- contract canonical khác sáu type hoặc có yêu cầu historical boundary thay GADM hiện đại.

Không tự migration/import/production API. Khi provider/data lỗi, giữ map 2D/ellipsoid và feature disabled.

## Output cuối

Trả lời tiếng Việt, nêu kết quả người dùng nhận được; file theo phase; contract/eligibility; camera/lifecycle/race; commands PASS/FAIL phân biệt baseline/environment/regression; manual acceptance đã/chưa chạy; blocker live DB/token/GADM/deploy path; `git status --short`; rollback/feature-disable. Không tuyên bố end-to-end hoàn tất nếu chưa thử provider/camera trên staging WebGL.
