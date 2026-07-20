# Phân tích backend Event API

## 1. Event read flow

```text
GET /api/events/{idOrSlug}
  → EventController.findDetail
  → EventReadService.findDetail
  → EventReadRepository.findDetailByIdOrSlug
  → EventDetailDto
  → ApiResponse.data
```

- Endpoint detail là `GET /api/events/{idOrSlug}` và nhận **cả ID lẫn slug** (`backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:69-72`).
- Service chuyển nguyên key cho repository và trả 404 nếu không tìm thấy (`backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:81-84`).
- SQL dùng `(e.id = :idOrSlug OR e.slug = :idOrSlug)`, chỉ lấy event published (`backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-170`).
- Envelope được client unwrap tại `payload.data`; không cần đổi response shape (`frontend/src/services/apiClient.ts:109-138`).

Auth ngoài scope không chặn Event GET trong luồng đã phân tích; không cần thay auth cho terrain. Call ghi view của MapPage là luồng riêng và không cung cấp location data (`frontend/src/pages/MapPage.tsx:340-354`).

## 2. DTO, JDBC và raw JSON

- `EventDetailDto` có `Object sourceJson` (`backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:6-44`).
- Detail SQL select `e.raw_json`, mapper parse thành object; parse thiếu/sai trả empty map thay vì làm endpoint fail (`backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:150-168`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:532-570`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:633-640`).
- Repository giữ `sourceJson` khi enrich grades/textbook/media/relations (`backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:175-214`). Vì vậy backend không làm mất `sourceJson.mapData` trong detail response.

List/children dùng `EventSummaryDto`: chỉ `geoType`, một `lat`, một `lng`, `provinceNames` và metadata; không có `sourceJson`, `markers[]`, `gadmRefs[]`, `focusGeometry` (`backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`). Đây là cố ý phù hợp list nhẹ; terrain targets phải được tạo sau detail fetch.

`EventListResponse` chỉ gồm `items` và `count`; không có envelope con khác (`backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventListResponse.java:5-8`).

## 3. Nơi dữ liệu vị trí bị mất

Importer lưu toàn raw event JSON vào `raw_json`, nhưng normalized columns chỉ lấy:

- `geoType` sau khi collapse canonical về legacy;
- một `marker` hoặc `focusGeometry.center` thành lat/lng;
- `provinceNames` và `historicalLocations` (`backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:691-700`, `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:726-727`).

`normalizeGeoType` đổi `point → single_point` và gộp `multi_point`, `multi_polygon`, `mixed` vào `multi_region` (`backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503`). `markers[]`, `gadmRefs[]`, `focusGeometry` không vào normalized DTO/list, nhưng vẫn còn trong `raw_json` nếu DB được import từ payload canonical.

Service filter list cũng chỉ allow bốn tên legacy (`backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:39-69`). MVP không cần sửa filter vì terrain không lọc list theo canonical geo type; canonical được lấy từ detail raw JSON.

Điểm mất dữ liệu gây lỗi MVP nằm ở frontend `/map`: detail response có sourceJson nhưng `getHistoricalEventFromBackend` gọi summary mapper và bỏ nó (`frontend/src/services/eventApi.ts:176-204`, `frontend/src/services/eventApi.ts:479-486`).

## 4. Quyết định frontend-only

MVP frontend-only **khả thi có điều kiện**:

1. Giữ detail endpoint hiện tại.
2. Frontend parse/validate `sourceJson.mapData` thành `TerrainTarget[]` giới hạn.
3. Nếu raw thiếu/malformed, fallback chỉ dùng normalized single coordinate/province names có thể resolve; không đoán từ narrative/historical location.
4. CTA chỉ active khi target hợp lệ; `nationwide`/`no_location` luôn unsupported.
5. Không gửi raw JSON trực tiếp vào Cesium.

Không bắt buộc sửa `EventDetailDto`, repository, controller, database schema hay migration cho MVP. Không chạy importer. Backend/migration chỉ cần nếu audit staging chứng minh `raw_json.mapData` không tồn tại/không đồng bộ ở tỷ lệ làm MVP vô dụng, hoặc nếu sản phẩm yêu cầu typed/versioned API contract cho consumer khác.

## 5. Fallback và blocker

Fallback an toàn khi không sửa backend:

- detail raw hợp lệ: dùng canonical;
- raw thiếu/sai: dùng normalized location tối thiểu nếu validate/resolve được;
- không còn target: map 2D hoạt động, CTA ẩn/disabled với lý do;
- không tự đổi `multi_region` thành `multi_polygon` nếu shape target không chứng minh điều đó;
- không báo terrain thành công khi provider rơi về ellipsoid.

Blocker production thật sự, hiện **UNVERIFIED**: DB live có bao nhiêu row `raw_json` hợp lệ và đồng bộ. Repository chỉ chứng minh code lưu/đọc raw JSON, không chứng minh trạng thái DB đang deploy. Cần audit read-only trên staging/live response đã sanitise trước release; không migration/import trong MVP.

Nếu frontend-only thất bại sau audit, phương án backend kế tiếp là DTO typed cho map data/terrain targets hoặc endpoint location riêng, kèm contract tests. Khi đó dự kiến sửa `EventDetailDto.java`, repository mapper/service/controller tùy thiết kế và test tương ứng; migration chỉ khi dữ liệu phải backfill/normalize, không sửa migration cũ.
