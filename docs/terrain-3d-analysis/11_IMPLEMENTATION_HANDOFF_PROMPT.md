# Prompt bàn giao cho AI triển khai

Sao chép nguyên khối dưới đây cho phiên triển khai sau. Cung cấp kèm các tệp trong `10_FILES_REQUIRED_FOR_IMPLEMENTATION.md`.

---

## Prompt

Bạn đang làm việc trong repository website học Lịch sử Việt Nam bằng bản đồ 3D. Hãy triển khai chức năng **“Xem địa hình 3D chi tiết của sự kiện lịch sử”** theo source hiện tại và bộ tài liệu `docs/terrain-3d-analysis/`.

### 1. Quy tắc an toàn bắt buộc

Trước khi làm:

```text
git status --short
git branch --show-current
```

Ghi lại baseline và giữ nguyên mọi thay đổi có sẵn của người dùng. Tại thời điểm phân tích trước, baseline có:

```text
?? .editorconfig
?? PULL_REQUEST_UI_REFACTOR.md
?? docs/ui-refactor/
```

Baseline có thể đã thay đổi; source hiện tại mới là nguồn quyết định. Không xóa, revert, overwrite hoặc stage thay đổi không thuộc nhiệm vụ.

Không:

- sửa/refactor `MVP_KLTN/` hoặc `AppInputData/`;
- đụng vào image review/mapping/enrichment, đặc biệt `frontend/src/data/eventTitleImages.ts`, `crawData/stage5_media_enrich/`, `crawData/stage5_external_media_enrichment/`, `thumbnails_event/`;
- cài package hoặc đổi dependency nếu chưa chứng minh bắt buộc;
- refactor ngoài phạm vi, format hàng loạt, đổi router/layout không liên quan;
- ghi token/secret vào source, tài liệu, log hoặc báo cáo;
- chạy profile importer, migration hoặc API production;
- sửa migration đã áp dụng; nếu thực sự cần DB change, dừng và trình bày migration mới/rollback trước.

### 2. Kiến trúc đã xác minh

- Frontend thực tế cho route `/map` là `frontend/`.
- Entry: `frontend/src/main.tsx`; router: `frontend/src/App.tsx`; `/map` render `frontend/src/pages/MapPage.tsx`.
- `MapPage` giữ local `selectedEvent`, list/search/navigation state và truyền cùng event cho `Sidebar`, `CesiumMap`, `EventPopup`.
- Cesium component chính: `frontend/src/components/CesiumMap.tsx`; dùng raw imperative Cesium API, không dùng Resium.
- Popup chính: `frontend/src/components/EventPopup.tsx`; action footer đã có placeholder terrain disabled.
- Frontend gọi Spring Boot qua `frontend/src/services/eventApi.ts` + `apiClient.ts`.
- Backend event flow: `EventController` → `EventReadService` → `EventReadRepository` (JDBC) → MySQL.
- Deep link: `/map?event=<id-or-slug>`; detail backend match cả ID lẫn slug.
- Viewer hiện dùng `EllipsoidTerrainProvider`, lighting/shadows/depth-test đều false; chưa có elevation thật.
- `frontend/src/lib/cesium.ts` đang chứa client token trực tiếp. Không lặp lại token. Chuyển sang tên env `VITE_CESIUM_ION_TOKEN` và yêu cầu owner rotate/restrict token.
- Province geometry runtime: `frontend/public/geojson/vietnam-provinces.json`, GADM 4.1 level 1, property `GID_1`/`NAME_1`, MultiPolygon, CRS84 `[longitude, latitude]`.
- Detail API trả `sourceJson`, nhưng map mapper hiện bỏ `sourceJson.mapData`.

Đọc trước:

```text
docs/terrain-3d-analysis/03_MAP_AND_CESIUM_CURRENT_FLOW.md
docs/terrain-3d-analysis/04_GEO_DATA_CONTRACT.md
docs/terrain-3d-analysis/05_BACKEND_API_CONTRACT.md
docs/terrain-3d-analysis/06_FEATURE_GAP_ANALYSIS.md
docs/terrain-3d-analysis/07_IMPLEMENTATION_PLAN.md
docs/terrain-3d-analysis/08_TEST_AND_ACCEPTANCE_PLAN.md
docs/terrain-3d-analysis/09_OPEN_QUESTIONS_AND_BLOCKERS.md
```

### 3. Hợp đồng geo bắt buộc

Dùng đúng sáu giá trị canonical:

```text
point
multi_point
multi_polygon
mixed
nationwide
no_location
```

Không dùng `single_point`/`multi_region` làm contract tính năng mới và không collapse các type:

- `point`: một marker.
- `multi_point`: từng phần tử `markers[]` là target; các marker khác tên có thể trùng tọa độ.
- `multi_polygon`: từng cặp `gadmRefs[]`/`provinceNames[]` là region target; geometry lấy từ GADM.
- `mixed`: union có type rõ ràng của point targets và region targets; không suy diễn thành một geometry.
- `nationwide`: không hiển thị action terrain.
- `no_location`: không hiển thị action terrain.

Eligibility chỉ true khi type được hỗ trợ **và** có ít nhất một target hợp lệ. Validate finite/range coordinates, arrays rỗng/lệch, duplicate IDs và unresolved GADM refs. Lookup region ưu tiên `GID_1/gadmRef`, không match tên đơn giản trước.

MVP có thể đọc `sourceJson.mapData` từ detail response, không cần migration. Tuy nhiên phải giữ data này trong frontend mapper. Nếu chọn sửa backend contract, chỉ sửa các file đã liệt kê ở mục 5 và thêm tests; giải thích vì sao frontend-only không đủ.

### 4. Hành vi sản phẩm phải triển khai

1. Popup eligible có nút “Xem địa hình”.
2. Bấm nút chụp camera view hiện tại đúng một lần rồi enter terrain mode.
3. Chỉ báo mode active sau khi Viewer, terrain provider và target geometry cần thiết đã ready.
4. Dùng terrain elevation thật. Ellipsoid fallback có thể giữ map cơ bản nhưng không được báo terrain thành công.
5. Point fly-to ở góc nghiêng nhìn được relief.
6. Region/multipolygon fly-to bằng bounds đầy đủ, không altitude hard-code theo geo type cũ.
7. Multi-target hiển thị list; click list hoặc entity/polygon chọn cùng target, highlight và tên selected target.
8. `mixed` hỗ trợ chuyển point ↔ region trong cùng terrain session.
9. Có “Toàn bộ phạm vi sự kiện” để về event overview mà không exit.
10. Có “Quay lại góc nhìn” để restore snapshot và exit; phân biệt rõ với “Quay lại cha”.
11. Đóng popup, chọn event khác, đổi year/grade, đổi route hoặc unmount đều phải cancel stale work, restore theo policy và cleanup.
12. Người dùng được tự xoay/zoom trong terrain mode; không cập nhật snapshot gốc.
13. Có loading/error/retry accessible cho API/provider/GeoJSON/camera.
14. Desktop/mobile/keyboard dùng được; không để canvas/popup/sidebar che controls.

### 5. File được phép sửa trong phạm vi dự kiến

Bắt buộc/khả năng cao:

```text
frontend/src/types/event.ts
frontend/src/services/eventApi.ts
frontend/src/pages/MapPage.tsx
frontend/src/components/CesiumMap.tsx
frontend/src/components/EventPopup.tsx
frontend/src/lib/cesium.ts
frontend/.env.example
frontend/src/utils/terrainTargets.ts                 # mới
frontend/src/utils/terrainTargets.test.ts            # mới
```

Chỉ khi cần và phải giải thích:

```text
frontend/src/data/eventRegistry.ts
frontend/src/data/eventAdapter.ts
frontend/src/data/vietnamProvinceCentroids.ts
frontend/src/components/Sidebar.tsx
frontend/src/components/Timeline.tsx
frontend/src/index.css
frontend/vite.config.ts
```

Backend chỉ khi chọn harden contract:

```text
backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java
backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java
backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java
backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java
backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java
backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventMapDataDto.java       # có thể mới
backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventTerrainTargetDto.java # có thể mới
backend/src/test/...                                                               # tests tương ứng
```

Không mở rộng danh sách một cách âm thầm. Nếu cần file khác, nêu evidence và lý do trước.

### 6. State/camera design

State machine tối thiểu:

```text
idle
event-selected
terrain-entering
terrain-active
target-selected
terrain-exiting
error
```

Giữ UI/session state tại `MapPage`; giữ Cesium resources và camera snapshot bằng refs trong `CesiumMap`. Không tạo global store/context mới.

Camera snapshot phải có:

```text
positionWC
directionWC
upWC
heading
pitch
roll
transform (nếu non-identity)
```

Quy tắc:

- capture sau Viewer ready, trước fly đầu tiên;
- `snapshotRef.current ??= captureCamera()`;
- target thứ hai/ba không overwrite;
- restore exact world position + orientation trong tolerance;
- exit animation phải có complete/cancel resolution;
- unmount/route cleanup có synchronous fallback;
- provider/geometry error sau khi camera đã di chuyển phải rollback;
- session/request ID hoặc AbortController phải chặn response/event cũ ghi state mới.

Tái sử dụng **một** Cesium LEFT_CLICK handler hiện có. Gắn metadata namespace rõ ràng để phân biệt event marker, terrain target, GADM background và cluster. Không tạo handler trong render/effect phụ thuộc target.

### 7. Triển khai theo phase

Làm lần lượt, báo cáo sau mỗi nhóm hợp lý:

1. Chuẩn hóa eligibility theo actual `geo_type`.
2. Chuẩn hóa targets từ `sourceJson.mapData`.
3. Camera snapshot/restore.
4. Terrain mode state machine và stale-session guard.
5. CTA popup.
6. Point fly-to.
7. Polygon/multipolygon bounds fly-to.
8. Multi-target list + map picking.
9. Highlight selected/all targets.
10. “Toàn bộ phạm vi” và “Quay lại góc nhìn”.
11. Cleanup/lifecycle/StrictMode/route.
12. Loading/error/accessibility/mobile.
13. Tests/regression.
14. Env/documentation/final verification.

Không bắt đầu phase sau nếu phase trước còn typecheck/test lỗi do thay đổi vừa làm.

### 8. Kiểm thử và commands

Trước/sau mỗi nhóm phase:

```text
git status --short
git diff --stat
```

Từ `frontend/`, ưu tiên commands không generate source:

```text
npm exec tsc -- --noEmit -p tsconfig.app.json
npm run test
npm run lint
npm exec vite build
```

`npm run build` có `prebuild → build:data` và có thể ghi manifest/index. Chỉ chạy sau khi audit side effect; kiểm tra diff trước/sau và không giữ generated changes ngoài phạm vi. Không cài dependency khi command lỗi.

Nếu backend được sửa:

```text
./mvnw test
```

Không bật profile `import-events`, không chạy migration/live DB. Dùng tests chọn lọc trước full suite.

Manual matrix phải bao phủ sáu type, API/provider/GeoJSON failure, invalid/empty geometry, rapid event selection, target switching, user camera movement, Back/close/event-change/year/route/reload deep-link, mobile widths, keyboard, StrictMode và ít nhất 20 enter/exit cycles.

### 9. Acceptance criteria

- `point`, `multi_point`, `multi_polygon`, `mixed` chỉ có CTA khi có target hợp lệ.
- `nationwide`, `no_location` không render CTA.
- Terrain active dùng provider elevation thật; provider failure có error/rollback.
- Point và region fly đúng; region dùng full MultiPolygon bounds.
- Mọi target selectable từ list và map; selected target rõ và được announce.
- `mixed` chuyển qua lại giữa kind mà không exit.
- Camera snapshot chỉ capture một lần; Back/close/change/route restore đúng.
- “Toàn bộ phạm vi” không clear snapshot hoặc exit.
- Không duplicate Viewer/entity/datasource/handler; không stale async update/memory leak.
- Deep link `/map?event=<id-or-slug>` reload đúng.
- Mobile/keyboard/screen reader flow dùng được.
- Route khác và event detail hiện tại không regression.
- Không còn secret hard-code; `.env.example` chỉ có tên env.
- Không sửa image review/mapping, workspace legacy hoặc file ngoài báo cáo.

### 10. Báo cáo cuối bắt buộc

Cuối cùng cung cấp:

1. Tóm tắt hành vi đã triển khai theo phase.
2. Danh sách chính xác mọi file tạo/sửa.
3. Danh sách mọi command đã chạy và exit result.
4. Test/build/typecheck/lint nào pass/fail.
5. Phần không thể test và lý do.
6. Open blocker còn lại, đặc biệt provider credential, live DB và boundary policy.
7. `git status --short` và `git diff --stat`.
8. Xác nhận không đụng image review/mapping, không cài package, không refactor ngoài phạm vi.

Nếu thiếu provider credential hoặc product boundary decision, vẫn có thể hoàn tất code path/test mocks; không bịa credential, không coi ellipsoid là terrain thật, và phải ghi rõ phần blocked.

---
