# Kế hoạch kiểm thử và nghiệm thu

## Chiến lược

Ba lớp kiểm thử:

1. **Unit, không WebGL:** normalize `geo_type`/targets, eligibility, bounds/height helpers, state transitions, camera snapshot serialization.
2. **Component/integration có mock Cesium/API:** CTA/list/loading/error, session sequencing, một handler duy nhất, cleanup datasource.
3. **Manual browser với WebGL và terrain provider thật:** relief, camera orientation, click/pick, mobile, keyboard, route/remount và network failure.

Vitest đã có (`frontend/package.json:6-17`). Không thấy test hiện tại cho `MapPage`, `CesiumMap`, `EventPopup` hay `Sidebar`; không thêm package chỉ để hoàn thành tính năng.

## Fixtures bắt buộc

Dùng bản lược bỏ nội dung lịch sử/media từ sáu record canonical:

| Fixture | Nguồn |
|---|---|
| `point` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:51` |
| `multi_point` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:229` |
| `multi_polygon` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:11` |
| `mixed` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:10` |
| `nationwide` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1` |
| `no_location` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:17` |

Thêm fixtures lỗi: marker null, `NaN`/lat ngoài `[-90,90]`, lng ngoài `[-180,180]`, arrays rỗng/lệch độ dài, `gadmRef` không tồn tại, GeoJSON feature thiếu hierarchy, polygon có nhiều outer rings/hole.

## Matrix theo `geo_type`

| `geo_type` | CTA | Targets kỳ vọng | Camera/terrain | Click/chuyển target | Quay lại |
|---|---|---|---|---|---|
| `point` | Hiện khi marker hợp lệ | 1 point | Fly oblique tới point, terrain thật nhìn thấy | Click marker/list giữ cùng target | Khôi phục snapshot |
| `multi_point` | Hiện khi còn ≥1 marker hợp lệ | Mỗi `markers[]` là target; duplicate coordinates vẫn là target theo ID | Overview toàn event, rồi fly từng point | Đổi liên tục không ghi đè snapshot | Khôi phục góc trước enter |
| `multi_polygon` | Hiện khi resolve ≥1 GADM ref | Mỗi region/GID là target | Overview bounds tất cả; từng region dùng full MultiPolygon bounds | Click polygon/list đồng bộ highlight/tên | Khôi phục snapshot |
| `mixed` | Hiện khi còn point hoặc region hợp lệ | Union point + region, có type badge | Overview union; chọn đúng thuật toán theo target kind | Chuyển point ↔ region trong cùng mode | Khôi phục snapshot |
| `nationwide` | Không render | 0 | Không tự fly terrain | Không có target interaction | Không áp dụng |
| `no_location` | Không render | 0 | Không tự fly terrain | Không có target interaction | Không áp dụng |

## Matrix chức năng và lỗi

| Nhóm | Case | Kết quả mong đợi |
|---|---|---|
| Eligibility | API column dùng tên cũ nhưng `sourceJson.mapData.geoType` dùng tên mới | Actual source được dùng; không collapse |
| Eligibility | Eligible type nhưng mọi target invalid | Không mở terrain; message “chưa có dữ liệu vị trí hợp lệ” |
| Provider | World Terrain ready | CTA hoạt động; elevation thật |
| Provider | Token thiếu/sai/quota/network lỗi | Ellipsoid có thể giữ map cơ bản nhưng không báo terrain thành công; status/error + retry an toàn |
| API | List lỗi | Phân biệt lỗi với danh sách rỗng |
| API | Detail lỗi khi click | Không mở popup terrain bằng stale summary; error có thể retry |
| API | Hai selection resolve đảo thứ tự | Event cuối người dùng chọn thắng; response cũ bị bỏ |
| GeoJSON | Load chậm hơn selected event | `terrain-entering` chờ; chỉ fly bounds khi datasource ready |
| GeoJSON | Load lỗi | Không click/fly region; point targets của `mixed` vẫn có thể dùng nếu policy cho phép; error rõ |
| Geometry | Empty/invalid marker | Target bị bỏ, không tạo entity |
| Geometry | Unknown GADM ref/name | Diagnostic + target bị vô hiệu; không fly overview Việt Nam như thể thành công |
| Geometry | MultiPolygon nhiều part/hole | Bounds chứa mọi outer part; hole không thành target |
| Camera | Enter lần đầu | Snapshot lưu trước fly |
| Camera | Chọn target thứ hai | Snapshot không đổi |
| Camera | User tự xoay/zoom trong mode | Cho phép; Back vẫn về snapshot ban đầu |
| Camera | `camera.flyTo` bị cancel | State không kẹt `entering/exiting`; retry/back hoạt động |
| Exit | Nút “Quay lại góc nhìn” | Restore position + orientation trong tolerance |
| Exit | “Toàn bộ phạm vi” | Về event overview nhưng vẫn terrain active, snapshot giữ nguyên |
| Exit | Đóng popup | Restore trước khi clear event |
| Exit | Chọn event khác | Restore session cũ rồi chọn event mới; không flash target cũ |
| Exit | Đổi year/grade | Restore và cleanup |
| Exit | Route `/map` → `/events/...` | Cancel async, restore/cleanup; quay lại không duplicate |
| Deep link | Reload `/map?event=<slug>` | Detail/targets load, popup đúng; terrain không auto-open nếu product không yêu cầu |
| Entity | Rerender/hover/search | Không duplicate marker/target/province datasource |
| Handler | Enter/exit 20 lần | Vẫn đúng một LEFT_CLICK handler |
| Lifecycle | React StrictMode remount | Handler hoạt động sau remount; viewer/resource không leak |
| Mobile | Width 320/375/768 px | Canvas, popup, target list và CTA dùng được; không đẩy content ra ngoài |
| Keyboard | Tab/Shift+Tab/Enter/Space/Escape | CTA/list/back/close reachable; focus visible; Escape policy nhất quán |
| Screen reader | Loading/error/selected target | `role=status`/`aria-live`/`role=alert`; selected target được thông báo |
| Route regression | `/home`, `/browse`, `/events/:slug`, auth/profile/exam | Không thay layout/API behavior ngoài `/map` |

## Kiểm thử camera chính xác

Trước enter, ghi snapshot:

- `positionWC`
- `directionWC`
- `upWC`
- heading, pitch, roll
- transform nếu non-identity

Sau restore:

- Mỗi Cartesian component nằm trong tolerance phù hợp với animation/floating point.
- Dot product giữa direction cũ/mới và up cũ/mới gần `1`.
- Heading/pitch/roll gần snapshot sau normalize góc.
- Transform giống snapshot nếu đã lưu.

Test riêng đảm bảo snapshot object/reference không đổi qua `SELECT_TARGET` nhiều lần. Camera hiện chỉ `setView`/fly mà không lưu snapshot hay restore (`frontend/src/components/CesiumMap.tsx:421-502`), nên đây là regression test mới bắt buộc.

## Kiểm thử bounds và height

- `point`: finite/range validation.
- `multi_point`: bounds chứa tất cả point, kể cả hai target trùng coordinate.
- `multi_polygon`: lookup bằng `GID_1`, gom tất cả polygon parts; không chỉ ring đầu.
- `mixed`: bounds union point + region.
- Height derivation monotonic theo radius và luôn nằm trong min/max.
- Không dùng `focusGeometry.zoom` làm geometry; chỉ fallback.
- Unknown/empty bounds trả result typed `unsupported/error`, không tự bay `VIETNAM_CENTER`.

Current code chỉ gom `hierarchy.positions` và tạo `Rectangle` (`frontend/src/components/CesiumMap.tsx:387-417`), rồi dùng altitude hard-code cho nhánh khác (`frontend/src/components/CesiumMap.tsx:456-480`); tests cần khóa hành vi mới.

## Kiểm thử cleanup/no-duplicate

Instrumentation trong môi trường dev/test:

- count `viewer.dataSources` theo name trước/enter/đổi target/exit;
- count target entities theo session;
- spy số lần `setInputAction`/`removeInputAction`/`destroy`;
- spy provider/GeoJSON Promise hoàn tất sau unmount;
- vòng lặp enter → select targets → exit → route away/back ít nhất 20 lần;
- kiểm tra không có stale `eventId` metadata sau chọn event khác;
- quan sát console không có “object destroyed”, duplicate Viewer hoặc state update after unmount.

Marker datasource hiện được remove/rebuild (`frontend/src/components/CesiumMap.tsx:219-315`), handler được destroy nhưng Viewer được giữ module-level (`frontend/src/components/CesiumMap.tsx:198-214`); StrictMode/remount là case bắt buộc.

## Acceptance criteria Given/When/Then

### AC-01 — eligibility

**Given** một event có actual `geo_type` là `point`, `multi_point`, `multi_polygon` hoặc `mixed` và có ít nhất một target hợp lệ
**When** popup mở
**Then** action “Xem địa hình” xuất hiện; với `nationwide`, `no_location` hoặc target rỗng, action không xuất hiện.

### AC-02 — terrain thật

**Given** terrain provider đã ready với credential hợp lệ
**When** người dùng mở terrain mode
**Then** Viewer dùng elevation terrain thật, không phải `EllipsoidTerrainProvider`, và UI không báo thành công trước readiness.

### AC-03 — snapshot một lần

**Given** camera đang ở một position/orientation bất kỳ
**When** người dùng mở terrain rồi chọn nhiều target và tự xoay camera
**Then** snapshot ban đầu chỉ được ghi một lần và không bị thay bởi các camera view trong mode.

### AC-04 — point

**Given** point target hợp lệ
**When** terrain mode mở hoặc target được chọn
**Then** camera fly tới point ở góc nghiêng nhìn được relief, marker được highlight và selected label được cập nhật.

### AC-05 — nhiều point

**Given** event `multi_point` có N marker hợp lệ
**When** popup hiển thị targets
**Then** có N lựa chọn stable ID; click từng lựa chọn hoặc marker chọn đúng target mà không tạo duplicate entity/handler.

### AC-06 — nhiều polygon

**Given** event `multi_polygon` có GADM refs hợp lệ
**When** người dùng enter terrain và chọn một vùng
**Then** tất cả vùng được tô, vùng chọn nổi bật, camera dùng bounds đầy đủ của vùng và tên vùng hiện trong UI.

### AC-07 — mixed

**Given** event `mixed` có cả markers và GADM regions
**When** người dùng chuyển giữa target point và region
**Then** mỗi target dùng đúng render/fly algorithm, terrain mode vẫn active và snapshot không đổi.

### AC-08 — whole event

**Given** một multi-target event đang ở target cụ thể
**When** người dùng chọn “Toàn bộ phạm vi sự kiện”
**Then** camera về bounds chung, highlight toàn event và terrain mode không thoát.

### AC-09 — back/close/change

**Given** terrain mode active
**When** người dùng nhấn “Quay lại góc nhìn”, đóng popup, đổi event, đổi year/grade hoặc rời route
**Then** camera được restore đúng policy, terrain resources/listeners được cleanup và không có stale update.

### AC-10 — error rollback

**Given** provider/geometry/camera/API thất bại trong lúc enter
**When** lỗi xảy ra
**Then** UI có error accessible, camera rollback nếu đã di chuyển, state không kẹt và người dùng có thể retry/close.

### AC-11 — deep link

**Given** URL `/map?event=<valid-id-or-slug>`
**When** trang reload
**Then** event/popup/targets đúng được tải; `nationwide/no_location` không có CTA và lỗi lookup không để loading vô hạn.

### AC-12 — accessibility/mobile

**Given** viewport mobile hoặc người dùng chỉ dùng keyboard/screen reader
**When** mở popup, chọn target và exit
**Then** controls reachable/focus-visible, trạng thái được announce, không có horizontal overflow cản thao tác và canvas không che controls.

### AC-13 — resource safety

**Given** React StrictMode và 20 chu kỳ enter/exit/route
**When** chu kỳ hoàn tất
**Then** số Viewer/handler/datasource/entity không tăng theo chu kỳ và không có lỗi dùng resource đã destroy.

## Commands đề xuất trong giai đoạn triển khai

```text
# Từ frontend/
npm exec tsc -- --noEmit -p tsconfig.app.json
npm run test
npm run lint
```

Chỉ chạy `npm run build` sau khi kiểm tra `prebuild`: script này chạy `build:data` và có thể ghi manifest/index (`frontend/package.json:12-16`). Ghi `git status --short` trước/sau mọi command có khả năng generate.

Nếu backend được sửa:

```text
# Từ backend/
./mvnw test
```

Ưu tiên test chọn lọc trước full suite. Không chạy profile `import-events`, migration hoặc kết nối production trong kiểm thử tính năng nếu chưa có phê duyệt.
