# Backend API Contract cho chức năng xem địa hình 3D

## 1. Phạm vi và mức độ xác minh

Tài liệu này mô tả backend event mà frontend hiện tại thực sự gọi, cách dữ liệu vị trí được lưu và trả về, các rủi ro truy vấn, cùng những thay đổi backend có thể cần khi triển khai chức năng xem địa hình 3D.

Phân tích được thực hiện tĩnh trên source code và snapshot dữ liệu trong repository. Không khởi động backend, không kết nối database production và không gọi API production. Vì vậy:

- Cấu trúc controller, service, repository, DTO, SQL và frontend call site là **VERIFIED** từ source.
- JSON minh họa bên dưới là shape suy ra từ Java record và Jackson config, không phải response bắt trực tiếp từ production.
- Trạng thái database live sau snapshot ngày 10-07-2026 là **UNVERIFIED**.
- Lệnh start/deploy production, container image và nền tảng chạy thực tế là **UNVERIFIED** vì repository không có Dockerfile/Compose hoặc deployment manifest có thể xác nhận.

## 2. Backend runtime đã xác minh

Backend chính nằm trong `backend/`:

- Spring Boot `4.0.3`, Java `21`, Maven, MySQL connector, Flyway và Spring Data JPA/JDBC dependencies: `backend/pom.xml:5-15`, `backend/pom.xml:29-41`, `backend/pom.xml:70-74`, `backend/pom.xml:95-103`.
- Entry point là `BackendApplication.main()`. Trước khi gọi `SpringApplication.run`, ứng dụng nạp `.env` và tự bật profile `remote-production` khi datasource URL trỏ tới TiDB Cloud: `backend/src/main/java/com/lichsuvn/backend/BackendApplication.java:10-23`, `backend/src/main/java/com/lichsuvn/backend/BackendApplication.java:26-47`, `backend/src/main/java/com/lichsuvn/backend/BackendApplication.java:62-93`.
- Cấu hình mặc định dùng MySQL, bật Flyway tại `classpath:db/migration` và tắt Open Session in View: `backend/src/main/resources/application.properties:3-21`.
- Profile `remote-production` tắt Flyway khi app khởi động; migration remote được thực hiện như một thao tác riêng có kiểm soát: `backend/src/main/resources/application-remote-production.properties:1-3`.
- Frontend dev proxy `/api/*` tới `http://localhost:8080`; production ghép request với biến `VITE_API_BASE_URL`: `frontend/vite.config.ts:24-35`, `frontend/src/services/apiClient.ts:9-16`, `frontend/src/services/apiClient.ts:109-137`.

Root README mô tả một kiến trúc dự kiến có Event JPA entity, nhưng Event read API hiện tại không đi theo cấu trúc đó: `README.md:31-43`. Source thực tế ghi rõ Event API dùng JDBC projection để tránh tải `raw_json` và narrative ở list endpoint: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:29-38`.

## 3. Các lớp backend liên quan

### 3.1. Controller

`EventController` khai báo base path `/api` và chỉ điều phối request sang `EventReadService`: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:17-30`.

### 3.2. Service

`EventReadService`:

- validate grade, event type, geo type, limit và offset;
- gọi `EventReadRepository`;
- đóng gói list thành `EventListResponse`;
- ném `NotFoundException` khi không tìm thấy event detail.

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:17-36`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:39-93`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:95-129`.

### 3.3. Repository

`EventReadRepository` dùng `NamedParameterJdbcTemplate`; không có Event JPA entity hoặc Location JPA entity cho luồng này: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:29-56`.

Repository tự chứa các mapper private:

- `summaryMapper()` và `mapSummary()` tạo `EventSummaryDto`;
- `detailMapper()` tạo `EventDetailDto`;
- `timelineMapper()` tạo `TimelineEventDto`.

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:512-599`.

Không có mapper class riêng, Event domain entity riêng, Location controller, Location service hoặc EventLocation repository trong backend hiện tại. Khi triển khai không nên giả định các abstraction này đã tồn tại.

### 3.4. DTO

- `EventSummaryDto` chứa một tọa độ `lat`/`lng`, `geoType` và `provinceNames`, nhưng không chứa `historicalLocations`, nhiều marker, GADM ref hoặc geometry: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`.
- `EventDetailDto` thêm `historicalLocations` và trường generic `sourceJson`, cùng các nội dung chi tiết khác: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:6-44`.
- `EventListResponse` chỉ có `items` và `count`; `count` là kích thước page hiện tại, không phải tổng số row match: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventListResponse.java:5-8`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:54-69`.

## 4. Endpoint liên quan và frontend call site

| Endpoint | Tham số/ý nghĩa | Frontend hiện tại dùng |
| --- | --- | --- |
| `GET /api/events` | `year`, `grade`, `eventType`, `geoType`, `q`, `parentId`, `level`, `limit`, `offset`: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:32-57` | Map tải event theo năm/lớp và search: `frontend/src/services/eventApi.ts:431-455`; `MapPage` kích hoạt các call này tại `frontend/src/pages/MapPage.tsx:238-294`. |
| `GET /api/timeline` | `from`, `to`, `grade`, `eventType`: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:59-67` | Map lấy các năm timeline theo grade: `frontend/src/services/eventApi.ts:499-507`, `frontend/src/pages/MapPage.tsx:256-270`. |
| `GET /api/events/{idOrSlug}` | Lấy event detail bằng id hoặc slug: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:69-72` | Dùng khi chọn event và khi mở `/map?event=...`: `frontend/src/services/eventApi.ts:479-495`, `frontend/src/pages/MapPage.tsx:330-346`, `frontend/src/pages/MapPage.tsx:379-421`. |
| `GET /api/events/{eventId}/children` | Lấy con trực tiếp theo id: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:74-77` | Gọi đồng thời với detail khi chọn event: `frontend/src/services/eventApi.ts:458-466`, `frontend/src/pages/MapPage.tsx:340-343`. |
| `GET /api/events/{eventId}/related` | Lấy predecessor/successor/related theo id: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:79-82` | Adapter frontend có call riêng: `frontend/src/services/eventApi.ts:469-476`. |
| `POST /api/events/{eventId}/view` | Ghi nhận lượt xem/progress; thuộc progress module, không thuộc `EventController` | Map gọi sau khi chọn event: `frontend/src/services/eventApi.ts:590-598`, `frontend/src/pages/MapPage.tsx:353-354`. |

Các GET event/timeline và POST view được public trong security config: `backend/src/main/java/com/lichsuvn/backend/common/config/SecurityConfig.java:96-104`.

Hiện không có endpoint chuyên biệt kiểu:

```text
GET /api/events/{idOrSlug}/locations
GET /api/events/{idOrSlug}/terrain-targets
```

## 5. Response envelope và JSON shape

Mọi response thành công dùng `ApiResponse<T>`:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Success",
  "data": {},
  "timestamp": "2026-01-01T00:00:00Z"
}
```

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/common/api/ApiResponse.java:13-29`. Jackson dùng `ObjectMapper` mặc định, không cấu hình snake_case, nên Java record fields được serialize theo camelCase: `backend/src/main/java/com/lichsuvn/backend/common/config/JacksonConfig.java:7-13`.

### 5.1. List response đã rút gọn

Ví dụ đã lược bỏ nội dung không liên quan và không dùng dữ liệu thật:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Success",
  "data": {
    "items": [
      {
        "id": "event-id",
        "slug": "event-slug",
        "title": "Tên sự kiện",
        "geoType": "point",
        "lat": 0.0,
        "lng": 0.0,
        "provinceNames": ["Tên tỉnh"],
        "parentId": null,
        "childCount": 0
      }
    ],
    "count": 1
  },
  "timestamp": "..."
}
```

Shape đầy đủ được xác định bởi `EventSummaryDto`: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`.

### 5.2. Detail response

Detail có các location field normalized và toàn bộ raw document:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Success",
  "data": {
    "id": "event-id",
    "slug": "event-slug",
    "geoType": "mixed",
    "lat": 0.0,
    "lng": 0.0,
    "provinceNames": ["Tên tỉnh"],
    "historicalLocations": ["Tên lịch sử"],
    "sourceJson": {
      "mapData": {
        "geoType": "mixed",
        "marker": {},
        "markers": [],
        "provinceNames": [],
        "gadmRefs": [],
        "focusGeometry": {}
      }
    }
  },
  "timestamp": "..."
}
```

`sourceJson` là `Object`, không phải DTO typed: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:19-43`.

## 6. Event identifier: id và slug

- Detail endpoint nhận một path variable tên `idOrSlug`: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:69-71`.
- Repository query `e.id = :idOrSlug OR e.slug = :idOrSlug`: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-168`.
- `id` là primary key, `slug` có unique constraint riêng: `backend/src/main/resources/db/migration/V2__events_core.sql:36-39`.
- Map ưu tiên `slug`, fallback `id` khi lấy detail, nhưng children/view luôn dùng `id`: `frontend/src/pages/MapPage.tsx:340-353`.
- Query parameter `/map?event=...` thực tế có thể chứa id hoặc slug vì được truyền thẳng vào detail endpoint: `frontend/src/pages/MapPage.tsx:232-236`, `frontend/src/pages/MapPage.tsx:388-414`.

Rủi ro biên: schema không cấm `id` của event A trùng `slug` của event B. Khi đó truy vấn `OR ... LIMIT 1` không có ordering sẽ mơ hồ. Không có bằng chứng collision trong repository; dữ liệu live là **UNVERIFIED**.

## 7. Cách location được lưu và tải

### 7.1. Database representation

`historical_events` có:

- `geo_type`;
- một cặp `lat`/`lng`;
- `province_names` JSON;
- `historical_locations` JSON;
- `raw_json` chứa source event document.

Bằng chứng: `backend/src/main/resources/db/migration/V2__events_core.sql:14-18`, `backend/src/main/resources/db/migration/V2__events_core.sql:31-32`.

Không có bảng event-location hoặc spatial geometry riêng trong migrations hiện tại.

### 7.2. Import

Importer:

- đọc `mapData.geoType`;
- lấy `lat`/`lng` từ primary `marker`, fallback sang `focusGeometry.center`;
- lưu `provinceNames` và `historicalLocations`;
- không normalize `markers[]`, `gadmRefs` hoặc polygon geometry thành cột/bảng riêng.

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:691-700`.

Không có altitude trong schema/API. Hàm đọc coordinate chỉ chấp nhận JSON number và không validate biên `lat [-90,90]` hoặc `lng [-180,180]`: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:542-558`.

### 7.3. Read path

- List SQL đọc `geo_type`, `lat`, `lng`, `province_names` trực tiếp trong cùng query: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:73-101`.
- Detail SQL đọc thêm `historical_locations` và toàn bộ `raw_json`: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-170`.
- `detailMapper()` parse các JSON list và parse `raw_json` ngay khi map row; location không được lazy-load: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:532-570`.
- JSON list lỗi/sai shape bị đổi âm thầm thành list rỗng; `raw_json` lỗi bị đổi thành object rỗng: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:612-640`.

### 7.4. Dữ liệu thực sự đến Cesium

API adapter list/detail-summary chỉ tạo:

```ts
coordinates: { lat, lng }
primaryRegions: provinceNames
```

và truyền thẳng `geoType`: `frontend/src/services/eventApi.ts:176-204`.

Map chọn event có gọi detail, nhưng `getHistoricalEventFromBackend()` chuyển detail DTO qua `summaryToHistoricalEvent()`, do đó bỏ `sourceJson`, `markers[]`, `gadmRefs`, `focusGeometry` và `historicalLocations`: `frontend/src/services/eventApi.ts:479-482`. Chỉ Event Detail adapter mới đọc `sourceJson`: `frontend/src/services/eventApi.ts:299-348`.

Cesium nhận đúng thứ tự `fromDegrees(lng, lat)`: `frontend/src/components/CesiumMap.tsx:253-275`.

Polygon hiện không do backend trả. Frontend tải bất đồng bộ `/geojson/vietnam-provinces.json`, sau đó match `provinceNames` với property `NAME_1`: `frontend/src/components/CesiumMap.tsx:168-186`, `frontend/src/components/CesiumMap.tsx:387-415`.

## 8. Query count, lazy loading và rủi ro N+1-like

### 8.1. Không có Hibernate lazy-loading N+1 cho Event

Event read flow dùng JDBC DTO projection, không dùng Event JPA relation: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:29-38`. `spring.jpa.open-in-view=false`: `backend/src/main/resources/application.properties:10-15`.

Do đó không có rủi ro `LazyInitializationException` hay Hibernate lazy N+1 cổ điển trong Event API này.

### 8.2. Detail fan-out cố định

Một `GET /api/events/{idOrSlug}` hiện thực hiện:

1. base event query;
2. grades query;
3. textbook refs query;
4. media query;
5. relations query;
6. related-events query.

Luồng gọi được thể hiện tại `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-214`, các query phụ tại `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:251-362` và `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:400-450`.

`findRelations()` và `findRelatedEvents()` đọc lại cùng quan hệ để trả hai shape tương thích, tạo truy vấn trùng ý nghĩa: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:251-297`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:299-363`.

Map lại gọi detail và children song song cho mỗi lần chọn event, rồi gọi POST view: `frontend/src/pages/MapPage.tsx:330-354`. Detail bị overfetch vì map chỉ giữ summary fields.

### 8.3. Correlated subquery theo từng row

List, children và relations dùng correlated subquery để:

- lấy thumbnail đầu tiên;
- đếm children cho từng event.

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:73-101`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:217-248`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:251-286`.

Đây không phải N+1 network/JDBC round trips, nhưng có thể tạo N+1-like database work khi page lớn. Map đang yêu cầu tối đa 1000 items: `frontend/src/services/eventApi.ts:431-437`.

Chưa có `EXPLAIN`, query metrics hoặc load test để đo chi phí thực tế: **UNVERIFIED**.

## 9. Bất nhất `geo_type` giữa các layer

### 9.1. Migration

Migration ban đầu chỉ có bốn tên cũ:

```text
single_point
multi_region
nationwide
no_location
```

Bằng chứng: `backend/src/main/resources/db/migration/V2__events_core.sql:14-18`.

V12 giữ bốn tên cũ và thêm:

```text
point
multi_point
multi_polygon
mixed
```

Bằng chứng: `backend/src/main/resources/db/migration/V12__expand_event_geo_type_enum.sql:1-11`.

V12 không cho phép `polygon`.

Snapshot remote ngày 10-07-2026 có schema tám giá trị: `crawData/stage5_media_enrich/output/remote_backups/remote_pre_stage5_import_20260710_013632.sql:15-61`. Parse tĩnh 361 row tại dòng 66 cho thấy chỉ sáu giá trị đang được dùng trong snapshot:

| `geo_type` | Số row trong snapshot |
| --- | ---: |
| `point` | 23 |
| `multi_point` | 4 |
| `multi_polygon` | 2 |
| `mixed` | 107 |
| `nationwide` | 56 |
| `no_location` | 169 |

Database live sau snapshot: **UNVERIFIED**.

### 9.2. Backend validation sai contract dữ liệu

`EventReadService` chỉ cho phép bốn tên cũ: `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:50-53`.

Hệ quả:

- `GET /api/events?geoType=point|multi_point|multi_polygon|mixed` bị trả `400`.
- `single_point` và `multi_region` được chấp nhận dù snapshot không có row mang hai giá trị này.
- List không truyền filter vẫn trả chuỗi mới vì DTO và mapper chỉ dùng `String`: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:574-598`.

### 9.3. Importer làm mất thông tin

Importer hiện normalize:

```text
point -> single_point
multi_point -> multi_region
multi_polygon -> multi_region
mixed -> multi_region
```

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503`.

Importer chỉ chạy khi bật profile `import-events`: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:30-32`.

Nếu chạy importer này trên dataset sáu loại hiện tại:

- cột normalized `geo_type` sẽ dùng tên cũ;
- `raw_json.mapData.geoType` vẫn giữ tên mới;
- cùng một detail response có thể mâu thuẫn giữa `data.geoType` và `data.sourceJson.mapData.geoType`.

### 9.4. Frontend tiếp tục dùng type cũ

Frontend `GeoType` chỉ khai báo bốn tên cũ: `frontend/src/types/event.ts:53-55`. Adapter static collapse tên mới về tên cũ: `frontend/src/data/eventAdapter.ts:10-28`.

Tuy nhiên API adapter truyền thẳng `dto.geoType` vào `HistoricalEvent` mà không runtime-validate: `frontend/src/services/eventApi.ts:176-204`. Cesium chỉ highlight/fly-to vùng khi giá trị đúng bằng `multi_region`: `frontend/src/components/CesiumMap.tsx:321-341`, `frontend/src/components/CesiumMap.tsx:420-454`.

Do đó `multi_point`, `multi_polygon` và `mixed` từ backend hiện không kích hoạt đúng logic vùng.

Backend không có định nghĩa typed cho semantics của `mixed`, `multi_point` hoặc `multi_polygon`. Không được suy diễn semantics chỉ từ tên; contract này cần được chuẩn hóa từ dữ liệu thực tế.

## 10. Backend có bắt buộc thay đổi không?

### 10.1. Phương án MVP: không bắt buộc đổi schema

MVP có thể triển khai chủ yếu ở frontend nếu:

- tiếp tục gọi detail endpoint;
- đọc `sourceJson.mapData`;
- tạo terrain targets từ `marker`, `markers`, `provinceNames`, `gadmRefs` và `focusGeometry`;
- dùng GeoJSON local cho polygon.

Ưu điểm:

- không cần database migration;
- tận dụng raw data đã có.

Nhược điểm:

- phụ thuộc vào `Object sourceJson` không có type;
- MapPage hiện đang bỏ `sourceJson`;
- detail endpoint tải quá nhiều nội dung và chạy sáu query;
- contract có thể mâu thuẫn giữa `geoType` normalized và raw;
- malformed raw JSON bị đổi âm thầm thành object rỗng.

Vì vậy phương án này phù hợp cho prototype/MVP có kiểm soát, không phải contract dài hạn.

### 10.2. Thay đổi tối thiểu bắt buộc để không tiếp tục sai dữ liệu

1. Sửa allow-list geo type trong `EventReadService` thành sáu giá trị thực tế.
2. Sửa `EventJsonImportRunner.normalizeGeoType()` để giữ nguyên sáu giá trị thay vì collapse.
3. Thêm test cho filter và importer.
4. Quyết định rõ cách xử lý tên cũ trong DB trước khi xóa chúng khỏi enum.

Các thay đổi này không nhất thiết cần migration ngay vì V12 đã cho phép cả sáu giá trị đang dùng.

### 10.3. Contract production được khuyến nghị

Tạo DTO typed cho location/terrain target, ví dụ:

```text
EventMapDataDto
EventTerrainTargetDto
EventMarkerDto
EventFocusGeometryDto
```

Một target tối thiểu nên có:

```text
targetId
kind
displayName
latitude
longitude
provinceNames
gadmRefs
focusCenter
focusZoom
confidence
```

Nên tạo endpoint nhẹ:

```text
GET /api/events/{idOrSlug}/terrain-targets
```

Lý do:

- chỉ gọi khi người dùng mở terrain mode;
- tránh đưa raw JSON lớn vào list;
- tránh sáu query không liên quan của detail endpoint;
- cho phép backend validate/normalize sáu geo type;
- cung cấp stable target id cho click/highlight/restore;
- tách contract terrain khỏi schema raw crawler.

Repository có thể parse `raw_json.mapData` thành DTO typed nên chưa cần migration. Nếu frontend tiếp tục dùng GeoJSON local, backend chỉ cần trả `gadmRefs`/province key, không cần gửi polygon vertices.

## 11. File dự kiến cần sửa ở giai đoạn triển khai

### 11.1. Bắt buộc để sửa contract hiện tại

| File | Thay đổi dự kiến | Lý do |
| --- | --- | --- |
| `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java` | Thay allow-list geo type; validate id/slug/location request nếu thêm endpoint. | Service hiện chỉ chấp nhận bốn tên cũ: `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30`. |
| `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java` | Giữ nguyên sáu geo type; validate coordinate/map data. | Hàm normalize hiện làm mất phân biệt: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503`. |
| `backend/src/test/java/com/lichsuvn/backend/importer/EventJsonImportRunnerChronologyTest.java` hoặc test importer mới | Thêm matrix bảo toàn geo type. | Ngăn importer quay lại tên cũ. |
| Test service/controller mới dưới `backend/src/test/java/com/lichsuvn/backend/event/` | Test filter sáu giá trị, invalid value và response serialization. | Hiện test event tập trung chronology, chưa chứng minh geo contract. |

### 11.2. Bắt buộc nếu thêm terrain endpoint typed

| File | Thay đổi dự kiến | Lý do |
| --- | --- | --- |
| `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java` | Thêm GET terrain-targets/location. | Controller hiện chưa có endpoint location riêng: `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:23-82`. |
| `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java` | Điều phối use case và eligibility. | Giữ controller mỏng theo pattern hiện tại. |
| `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java` | Query projection nhẹ và parse `raw_json.mapData` thành DTO typed. | Tránh dùng full detail fan-out. |
| `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventMapDataDto.java` | File mới, typed contract map data. | Thay `Object sourceJson` trong luồng terrain. |
| `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventTerrainTargetDto.java` | File mới, danh sách target ổn định. | Hỗ trợ multi-point/multi-polygon/mixed. |
| Test controller/repository mới | Test JSON shape, empty/malformed geometry, id/slug và nhiều target. | Bảo vệ API contract. |

### 11.3. Có thể cần

- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java`: thêm `mapData` typed hoặc bỏ dần phụ thuộc terrain vào `sourceJson`.
- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java`: chỉ sửa nếu product thực sự cần eligibility/summary target ngay trong list; không nên đưa full geometry vào list.
- Migration mới dưới `backend/src/main/resources/db/migration/`: chỉ cần nếu quyết định lưu server-authoritative geometry/location table hoặc loại bỏ hoàn toàn enum names cũ.

Không nên tạo Event JPA entity chỉ cho feature này; pattern runtime hiện tại là JDBC projection.

## 12. Migration considerations

### Không cần migration khi

- terrain target được dựng từ `raw_json.mapData`;
- polygon tiếp tục lấy từ frontend GeoJSON;
- DB vẫn giữ enum V12 có cả sáu giá trị đang dùng.

### Cần migration khi

- tạo bảng `event_locations`/`event_geometries`;
- lưu GeoJSON/spatial geometry server-side;
- thêm stable target id vào DB thay vì derive;
- loại bỏ `single_point`/`multi_region` khỏi enum;
- thêm constraint kiểm tra coordinate/geometry.

Remote production tắt Flyway lúc app start: `backend/src/main/resources/application-remote-production.properties:1-3`. Vì vậy migration mới phải đi qua quy trình gated, không được giả định deploy app sẽ tự apply.

Trước khi migration loại bỏ tên cũ, cần query read-only trên DB live để xác minh distinct values và kiểm tra row nào có `geo_type` khác `raw_json.mapData.geoType`. Việc này hiện **UNVERIFIED**.

## 13. UNVERIFIED và blockers backend

| Câu hỏi | Vì sao chưa xác minh | Mặc định an toàn |
| --- | --- | --- |
| DB production hiện có đúng sáu geo type hay không? | Chỉ có snapshot 10-07-2026, không kết nối live DB. | Coi sáu giá trị trong snapshot là contract mục tiêu, nhưng chạy audit query trước migration. |
| `mixed`, `multi_point`, `multi_polygon` có semantics target chính thức nào? | Backend chỉ lưu chuỗi và raw JSON, không có enum/DTO mô tả. | Không suy diễn; derive target từ từng record và validate shape. |
| Geometry authoritative là GADM hiện đại hay ranh giới lịch sử? | Backend không lưu polygon và không có metadata version. | Dùng GADM ref hiện có cho MVP, ghi rõ giới hạn lịch sử. |
| Có cần backend trả polygon vertices không? | Product/data ownership chưa chốt. | Giữ polygon local ở MVP; chỉ thêm server geometry khi có yêu cầu authoritative/versioning. |
| Chi phí thực tế của correlated subquery/detail fan-out? | Chưa chạy `EXPLAIN`, profiling hoặc load test. | Tạo terrain endpoint projection nhẹ, tránh tái dùng detail nặng. |
| Runtime deploy/start command và container? | Không có Docker/deploy manifest có thể xác nhận. | Không ghi giả định deployment vào implementation prompt. |
| Raw JSON có luôn hợp lệ/đủ `mapData` không? | Mapper hiện nuốt lỗi thành object/list rỗng; chưa audit live toàn bộ rows. | Endpoint typed phải trả trạng thái unsupported/error rõ ràng cho dữ liệu thiếu hoặc lỗi. |
