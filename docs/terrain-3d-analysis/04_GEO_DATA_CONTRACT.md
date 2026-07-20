# Geo Data Contract

## 1. Phạm vi và kết luận chính

Tài liệu này mô tả hợp đồng dữ liệu địa lý đang tồn tại trong repository, từ dữ liệu canonical, quá trình import, database, backend API đến frontend Cesium. Đây là kết quả phân tích tĩnh; không có dữ liệu, migration hay source code nào được thay đổi.

Kết luận quan trọng nhất:

1. Dataset canonical hiện tại có đúng sáu `geo_type`: `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, `no_location`.
2. Database, backend và frontend runtime vẫn dùng hợp đồng bốn kiểu cũ: `single_point`, `multi_region`, `nationwide`, `no_location`.
3. Importer hiện gộp `multi_point`, `multi_polygon` và `mixed` thành `multi_region`, nên runtime mất thông tin cần thiết để triển khai lựa chọn từng target địa hình.
4. Polygon của event không được nhúng trực tiếp trong event JSON. Event tham chiếu tỉnh bằng `provinceNames` và `gadmRefs`; geometry thật đến từ GeoJSON GADM cấp tỉnh.
5. Runtime Cesium chỉ nhận một cặp `lat/lng` và danh sách tên tỉnh từ API list/detail. `markers[]`, `gadmRefs[]` và `focusGeometry` đầy đủ chỉ còn trong `raw_json`/`sourceJson`.

Bằng chứng về nguồn import canonical và profile one-shot:

- `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:30-45`
- `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:47-79`

## 2. Nguồn dữ liệu canonical và số lượng thực tế

Nguồn mặc định của importer là:

```text
crawData/stage4b_curate_tree/output/phase2/core_events.jsonl
```

Đường dẫn này được khai báo tại `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:38-45`. Stage 4B cũng xác nhận đây là final core output tại `crawData/stage4b_curate_tree/README.md:80-90`.

Kết quả parse đọc-only toàn bộ 361 dòng của `core_events.jsonl`:

| `geo_type` | Số event | Tỉ lệ xấp xỉ |
|---|---:|---:|
| `point` | 23 | 6,4% |
| `multi_point` | 4 | 1,1% |
| `multi_polygon` | 2 | 0,6% |
| `mixed` | 107 | 29,6% |
| `nationwide` | 56 | 15,5% |
| `no_location` | 169 | 46,8% |
| **Tổng** | **361** | **100%** |

Nguồn dùng để đếm: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1-361`. Tổng 361 core node, 107 `mixed`, không có `mixed` chỉ mang marker mà thiếu polygon, và validation không có error cũng được ghi nhận tại:

- `crawData/PROGRESS.md:83-98`
- `crawData/stage4b_curate_tree/README.md:57-78`

### 2.1. Vì sao `polygon` không nằm trong tập thực tế

Stage 4A vẫn cho phép `polygon` trong tập giá trị kỹ thuật:

```text
point, multi_point, polygon, multi_polygon, nationwide, no_location, mixed
```

Bằng chứng: `crawData/stage4_assemble/stage4_common.py:48-56`.

Tuy nhiên:

- Dataset Stage 4A hiện tại có tổng 407 event nhưng không có `polygon` trong thống kê thực tế: `crawData/PROGRESS.md:39-47`.
- Core Stage 4B hiện tại cũng không có dòng `polygon`: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1-361`.
- Export cũ vẫn có `polygon`; xem mục 12.

Vì vậy, `polygon` là giá trị được pipeline cũ cho phép nhưng không phải một `geo_type` có mặt trong dataset canonical hiện tại.

## 3. Ý nghĩa dữ liệu của sáu `geo_type`

Quy tắc sinh `geo_type` được triển khai tại `crawData/stage4_assemble/build_final_events.py:268-348`:

- phát hiện từ khóa toàn quốc trước;
- vừa có marker vừa có tỉnh thì là `mixed`;
- một marker là `point`;
- nhiều marker là `multi_point`;
- một tỉnh từng có thể là `polygon`;
- nhiều tỉnh là `multi_polygon`;
- không có target hợp lệ là `no_location`.

Validator Stage 4A kiểm tra shape tại `crawData/stage4_assemble/validate_stage4.py:137-172`.

| `geo_type` | Ý nghĩa canonical đã xác minh | Geometry/target canonical |
|---|---|---|
| `point` | Một địa điểm có tọa độ đại diện đủ để đặt marker | `marker {name, lat, lng, confidence}` |
| `multi_point` | Nhiều địa điểm điểm độc lập | `marker` đại diện và `markers[]` |
| `multi_polygon` | Nhiều đơn vị hành chính cấp tỉnh | `provinceNames[]`, `gadmRefs[]`; polygon lấy từ GADM |
| `mixed` | Đồng thời có điểm cụ thể và phạm vi tỉnh | `markers[]` cùng `provinceNames[]`/`gadmRefs[]` |
| `nationwide` | Phạm vi toàn quốc, không phải một target địa hình cục bộ | Không marker/GADM bắt buộc; có `focusGeometry` toàn Việt Nam |
| `no_location` | Không có vị trí bản đồ hợp lệ hoặc vị trí nằm ngoài phạm vi bản đồ Việt Nam | Không marker, province hay GADM ref |

Các invariant được validator chứng minh:

- `point` phải có `marker.lat/lng`: `crawData/stage4_assemble/validate_stage4.py:157-159`.
- `multi_point` phải có `markers[]`: `crawData/stage4_assemble/validate_stage4.py:160-161`.
- `multi_polygon` phải có ít nhất hai `gadmRefs`: `crawData/stage4_assemble/validate_stage4.py:162-165`.
- `mixed` phải có marker và ít nhất một `gadmRef`: `crawData/stage4_assemble/validate_stage4.py:166-167`.
- `no_location` không được mang marker, province hay GADM ref: `crawData/stage4_assemble/validate_stage4.py:168-169`.

## 4. Mẫu dữ liệu thật đã ẩn bớt nội dung

Các ví dụ dưới đây chỉ giữ lại ID và trường địa lý cần thiết. Không có thông tin xác thực, secret hoặc media URL.

### 4.1. `point`

Mẫu `nha-minh-xam-luoc-dai-ngu`:

```json
{
  "geoType": "point",
  "marker": {"lat": 16.0, "lng": 107.0, "confidence": "low"},
  "markers": [],
  "provinceNames": [],
  "gadmRefs": [],
  "focusGeometry": {"mode": "marker", "zoom": 12}
}
```

Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:51-51`.

### 4.2. `multi_point`

Mẫu `viet-nam-danh-chiem-nua-phia-dong-hoang-sa`:

```json
{
  "geoType": "multi_point",
  "marker": {"lat": 16.6833, "lng": 112.3333},
  "markers": [
    {"name": "target A", "lat": 16.6833, "lng": 112.3333},
    {"name": "target B", "lat": 16.6833, "lng": 112.3333}
  ],
  "focusGeometry": {"mode": "bounds", "zoom": 8}
}
```

Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:229-229`.

Mẫu này cho thấy hai target có thể khác tên nhưng trùng tọa độ. UI không được giả định mọi marker trong `multi_point` đều có tọa độ khác nhau.

### 4.3. `multi_polygon`

Mẫu `van-hoa-tien-oc-eo`:

```json
{
  "geoType": "multi_polygon",
  "provinceNames": ["province A", "province B", "..."],
  "gadmRefs": ["VNM.xx_1", "VNM.yy_1", "..."],
  "marker": null,
  "markers": [],
  "focusGeometry": {"mode": "bounds", "zoom": 6}
}
```

Mẫu thật có 19 `provinceNames` và 19 `gadmRefs`. Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:11-11`.

### 4.4. `mixed`

Mẫu `van-hoa-sa-huynh`:

```json
{
  "geoType": "mixed",
  "provinceNames": ["province A", "province B"],
  "gadmRefs": ["VNM.xx_1", "VNM.yy_1"],
  "marker": {"lat": 17.5, "lng": 106.3},
  "markers": [
    {"name": "target A", "lat": 17.5, "lng": 106.3},
    {"name": "target B", "lat": 10.9333, "lng": 108.0}
  ],
  "focusGeometry": {"mode": "bounds", "zoom": 7}
}
```

Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:10-10`.

### 4.5. `nationwide`

Mẫu `viet-nam-thoi-dung-nuoc`:

```json
{
  "geoType": "nationwide",
  "provinceNames": [],
  "gadmRefs": [],
  "marker": null,
  "markers": [],
  "focusGeometry": {
    "mode": "bounds",
    "center": {"lat": 16.0, "lng": 106.0},
    "zoom": 5
  }
}
```

Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1-1`.

### 4.6. `no_location`

Mẫu `phu-nam-tro-thanh-vuong-quoc-hung-manh`:

```json
{
  "geoType": "no_location",
  "historicalLocations": ["historical label A", "historical label B"],
  "provinceNames": [],
  "gadmRefs": [],
  "marker": null,
  "markers": [],
  "focusGeometry": {"mode": "auto", "center": null, "zoom": null}
}
```

Bằng chứng: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:17-17`.

## 5. Nguồn dữ liệu theo từng `geo_type`

| `geo_type` | Nguồn canonical | Nguồn geometry thật | Database hiện lưu | API list/detail hiện trả |
|---|---|---|---|---|
| `point` | `mapData.marker` | Tọa độ marker | `lat`, `lng`, `raw_json` | Một `lat/lng`; detail có `sourceJson` |
| `multi_point` | `mapData.markers[]` | Từng marker | Chỉ marker đại diện/focus center trong `lat/lng`; đầy đủ trong `raw_json` | Một `lat/lng`; không có `markers[]` trong DTO |
| `multi_polygon` | `provinceNames[]`, `gadmRefs[]` | GADM level 1 | `province_names`, focus center trong `lat/lng`, `raw_json` | `provinceNames`; không có `gadmRefs[]` |
| `mixed` | markers cùng province/GADM | Marker + GADM level 1 | Một `lat/lng`, `province_names`, `raw_json` | Một `lat/lng` + `provinceNames`; không có target list đầy đủ |
| `nationwide` | `geoType` và `focusGeometry` | Không có local geometry riêng | Importer có thể lấy `focusGeometry.center` làm `lat/lng`; `raw_json` | `nationwide` và có thể có center |
| `no_location` | `geoType`, có thể giữ nhãn lịch sử | Không có | `lat/lng` null, province rỗng, `raw_json` | Không coordinates |

Importer chọn `mapData.marker`; nếu thiếu marker thì fallback sang `focusGeometry.center`, sau đó lưu `provinceNames` và `historicalLocations`:

- `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:691-700`
- `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:136-219`

Database không có bảng event geometry riêng. Bảng `historical_events` lưu trực tiếp:

- `geo_type`
- `lat`
- `lng`
- `province_names` JSON
- `historical_locations` JSON
- `raw_json` JSON

Bằng chứng: `backend/src/main/resources/db/migration/V2__events_core.sql:1-32`.

## 6. Biểu diễn theo từng layer

### 6.1. Database

Schema ban đầu chỉ cho bốn kiểu cũ:

```sql
ENUM('single_point', 'multi_region', 'nationwide', 'no_location')
```

Bằng chứng: `backend/src/main/resources/db/migration/V2__events_core.sql:14-18`.

Migration mở rộng enum thành tám giá trị:

```text
single_point, multi_region, nationwide, no_location,
point, multi_point, multi_polygon, mixed
```

Bằng chứng: `backend/src/main/resources/db/migration/V12__expand_event_geo_type_enum.sql:1-11`.

Migration này không có `polygon`.

### 6.2. Importer backend

Importer hiện chuẩn hóa mất dữ liệu:

| Canonical input | Giá trị ghi vào DB |
|---|---|
| `point` | `single_point` |
| `multi_point` | `multi_region` |
| `multi_polygon` | `multi_region` |
| `mixed` | `multi_region` |
| legacy `polygon` | `multi_region` |
| `nationwide` | `nationwide` |
| `no_location`/không hợp lệ | `no_location` |

Bằng chứng trực tiếp: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503`.

### 6.3. Backend service và DTO

Filter `geoType` của backend chỉ chấp nhận bốn kiểu cũ:

```text
single_point, multi_region, nationwide, no_location
```

Bằng chứng: `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30` và `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:39-53`.

`EventSummaryDto` chỉ có một `lat`, một `lng`, `provinceNames` và chuỗi `geoType`:

- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`

`EventDetailDto` bổ sung `historicalLocations` và `sourceJson`, nhưng vẫn không có typed field cho `markers`, `gadmRefs` hoặc `focusGeometry`:

- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:6-43`

Repository đọc `raw_json` cùng các cột normalized từ `historical_events`:

- `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-170`

### 6.4. Frontend

Frontend public type vẫn là:

```ts
type GeoType = 'multi_region' | 'single_point' | 'nationwide' | 'no_location';
```

Bằng chứng: `frontend/src/types/event.ts:13-36` và `frontend/src/types/event.ts:53-54`.

Static adapter cũng gộp kiểu mới về bốn kiểu cũ:

- `point` → `single_point`
- `multi_point`, `multi_polygon`, `polygon`, `mixed` → `multi_region`

Bằng chứng: `frontend/src/data/eventAdapter.ts:10-28`.

API adapter chỉ chuyển một `lat/lng` và `provinceNames` sang `HistoricalEvent`:

- `frontend/src/services/eventApi.ts:176-204`

Map chính lấy danh sách từ backend, không fallback sang static data khi API lỗi:

- `frontend/src/pages/MapPage.tsx:238-254`
- `frontend/src/services/eventApi.ts:431-441`

Static dataset vẫn còn được dùng làm fallback tra parent trong popup:

- `frontend/src/pages/MapPage.tsx:457-466`

Do đó static data là nguồn secondary/legacy, không phải nguồn geo chính của map.

## 7. GeoJSON/GADM: shape, CRS, coordinate order và altitude

### 7.1. Nguồn boundary

Runtime Cesium tải:

```text
/geojson/vietnam-provinces.json
```

Bằng chứng: `frontend/src/components/CesiumMap.tsx:168-186`.

File runtime:

```text
frontend/public/geojson/vietnam-provinces.json
```

Nó là GADM 4.1 cấp 1, tên collection `gadm41_VNM_1`, CRS:

```text
urn:ogc:def:crs:OGC:1.3:CRS84
```

Bằng chứng: `frontend/public/geojson/vietnam-provinces.json:1-1`.

Audit SHA-256 đọc-only xác nhận file này giống byte-for-byte với `data/gadm/lv1.json`. Không có code runtime đọc trực tiếp `data/gadm/lv1.json`.

### 7.2. Thống kê geometry

Kết quả parse cấu trúc toàn bộ các file:

| File | Feature | Geometry của feature | Polygon parts | Interior rings | Bounds `[west,south,east,north]` |
|---|---:|---|---:|---:|---|
| `data/gadm/lv0.json` | 1 | 1 `MultiPolygon` | 1.202 | 4 | `[102.1446, 8.3814, 109.4690, 23.3927]` |
| `data/gadm/lv1.json` | 63 | 63 `MultiPolygon` | 1.263 | 4 | `[102.1450, 8.3814, 109.4692, 23.3922]` |
| `data/gadm/lv2.json` | 710 | 710 `MultiPolygon` | 1.910 | 6 | `[102.1450, 8.3814, 109.4690, 23.3927]` |
| `data/gadm/lv3.json` | 11.163 | 11.163 `MultiPolygon` | 12.419 | 13 | `[102.1451, 8.3814, 109.4690, 23.3922]` |
| `frontend/public/geojson/vietnam-provinces.json` | 63 | 63 `MultiPolygon` | 1.263 | 4 | `[102.1450, 8.3814, 109.4692, 23.3922]` |

Nguồn được parse:

- `data/gadm/lv0.json:1-1`
- `data/gadm/lv1.json:1-1`
- `data/gadm/lv2.json:1-1`
- `data/gadm/lv3.json:1-1`
- `frontend/public/geojson/vietnam-provinces.json:1-1`

### 7.3. Hệ tọa độ và thứ tự

GeoJSON dùng CRS84 và coordinate pair `[longitude, latitude]`. Ví dụ tọa độ đầu trong runtime GeoJSON là dạng `[105.5486,10.4295]` tại `frontend/public/geojson/vietnam-provinces.json:1-1`.

Frontend tuân thủ cùng thứ tự:

- marker Cesium: `Cartesian3.fromDegrees(lng, lat)` tại `frontend/src/components/CesiumMap.tsx:253-281`;
- API detail marker: `[Number(dto.lng), Number(dto.lat)]` tại `frontend/src/services/eventApi.ts:373-381`;
- static adapter: `[rawDg.marker.lng, rawDg.marker.lat]` tại `frontend/src/data/eventAdapter.ts:161-177`.

### 7.4. Altitude

Không có altitude trong event geometry hoặc GADM:

- event marker chỉ có `lat/lng`: `crawData/stage4_assemble/build_final_events.py:199-215`;
- DTO chỉ có `lat/lng`: `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:17-20`;
- toàn bộ coordinate GADM kiểm tra được đều là pair 2D.

Marker hiện dùng `HeightReference.CLAMP_TO_GROUND`:

- `frontend/src/components/CesiumMap.tsx:272-293`

Các giá trị 30 km, 500 km, 800 km và 1.500 km trong frontend là camera altitude, không phải độ cao địa hình:

- `frontend/src/components/CesiumMap.tsx:456-480`

## 8. Đối chiếu tên tỉnh và GADM

### 8.1. Pipeline build-time

Build-time index lấy:

- `NAME_1` làm GADM name;
- `GID_1` làm `gadmRef`;
- centroid của geometry làm center;
- alias thủ công để resolve biến thể tên.

Bằng chứng: `crawData/stage4_assemble/prepare_indexes.py:329-352`.

Các alias bao gồm biến thể cho Hà Nội, Sài Gòn/Hồ Chí Minh, Huế, Bà Rịa - Vũng Tàu, Đắk Lắk, Thanh Hóa và các tỉnh khác:

- `crawData/stage4_assemble/config/province_aliases.json:1-76`

Quá trình classify và resolve tỉnh:

- normalize chuỗi và tìm alias/GADM name: `crawData/stage4_assemble/build_final_events.py:150-185`;
- phân loại point/province/region/foreign: `crawData/stage4_assemble/build_final_events.py:188-221`;
- chuyển display name về `gadmRef`: `crawData/stage4_assemble/build_final_events.py:333-348`.

### 8.2. Runtime frontend

Runtime không dùng `gadmRefs`. Nó:

1. lowercase;
2. xóa whitespace;
3. so `provinceNames` với property `NAME_1`.

Bằng chứng:

- highlight: `frontend/src/components/CesiumMap.tsx:325-377`;
- tính bounds: `frontend/src/components/CesiumMap.tsx:387-415`.

Runtime matching yếu hơn build-time vì không:

- bỏ dấu tiếng Việt;
- chuẩn hóa dấu nối/dấu chấm;
- áp dụng `province_aliases.json`;
- đối chiếu trực tiếp bằng `GID_1`.

Vì vậy một tên tỉnh được pipeline resolve đúng chưa chắc được runtime highlight nếu display name và `NAME_1` khác theo cách ngoài whitespace/case.

### 8.3. Thay đổi tên và địa giới

Repository chỉ có một snapshot GADM 4.1 cấp tỉnh gồm 63 feature. Bảng centroid frontend cũng tự mô tả bộ 63 tỉnh/thành:

- `frontend/src/data/vietnamProvinceCentroids.ts:1-10`
- `frontend/src/data/vietnamProvinceCentroids.ts:35-114`

Không có:

- effective date cho boundary;
- version boundary theo thời kỳ lịch sử;
- mapping từ tỉnh lịch sử sang nhiều phiên bản địa giới;
- quy tắc chuyển đổi sau sáp nhập/tách tỉnh;
- API chọn boundary theo năm của event.

`historicalLocations` chỉ giữ nhãn lịch sử và không quyết định geometry. Việc dữ liệu GADM 4.1 còn phù hợp với địa giới hành chính tại thời điểm triển khai là **UNVERIFIED**; cần xác nhận nguồn boundary chính thức và mốc hiệu lực trước khi triển khai production.

## 9. Geometry lỗi, geometry rỗng, ring và MultiPolygon

### 9.1. Kết quả audit dữ liệu hiện có

Parse đọc-only toàn bộ `lv0`–`lv3` và file GeoJSON runtime cho kết quả:

| Kiểm tra | `lv0` | `lv1` | `lv2` | `lv3` | Runtime lv1 |
|---|---:|---:|---:|---:|---:|
| Geometry null/rỗng | 0 | 0 | 0 | 0 | 0 |
| Polygon part rỗng | 0 | 0 | 0 | 0 | 0 |
| Ring rỗng | 0 | 0 | 0 | 0 | 0 |
| Ring ít hơn 4 điểm | 0 | 0 | 0 | 0 | 0 |
| Ring không khép kín | 0 | 0 | 0 | 0 | 0 |
| Coordinate không phải 2D | 0 | 0 | 0 | 0 | 0 |

Đây là kết quả kiểm tra dữ liệu hiện tại, không phải bảo đảm do validator runtime.

### 9.2. Xử lý runtime hiện tại

Frontend giao việc parse Polygon/MultiPolygon và holes cho `GeoJsonDataSource.load`:

- `frontend/src/components/CesiumMap.tsx:168-186`

Nếu load cả datasource lỗi:

- lỗi chỉ được ghi warning;
- map tiếp tục chạy không có boundary;
- không có retry hoặc fallback boundary.

Khi tính bounds, code bỏ qua entity:

- không có `polygon`;
- không có `hierarchy`;
- không có `hierarchy.positions`.

Bằng chứng: `frontend/src/components/CesiumMap.tsx:398-413`.

Code ứng dụng không tự duyệt `hierarchy.holes`. Việc Cesium chuyển tất cả part của một GADM `MultiPolygon` thành entity/hierarchy như thế nào trong phiên bản dependency hiện tại chưa được test runtime trong nhiệm vụ này: **UNVERIFIED**.

### 9.3. Khoảng trống validation

Validator Stage 4A kiểm tra quan hệ giữa `geoType`, marker và `gadmRefs`, nhưng không validate topology/ring của GeoJSON:

- `crawData/stage4_assemble/validate_stage4.py:137-172`

Giai đoạn triển khai nên:

1. validate target có `GID_1` tồn tại;
2. bỏ target không có polygon hợp lệ nhưng vẫn giữ các target còn lại;
3. trả error có kiểm soát nếu mọi target đều rỗng;
4. không để một ring lỗi làm hỏng toàn bộ danh sách target;
5. ghi rõ target nào bị bỏ qua để UI có thể thông báo.

## 10. Bounds, focus geometry và camera height

### 10.1. Focus canonical

Pipeline sinh `focusGeometry` như sau:

| `geo_type` | `mode` | `zoom` |
|---|---|---:|
| `point` | `marker` | 12 |
| `multi_point` | `bounds` | 8 |
| legacy `polygon` | `polygon` | 8 |
| `multi_polygon` | `bounds` | 6 |
| `nationwide` | `bounds` | 5 |
| `no_location` | `auto`, center null | null |
| `mixed` | `bounds` | 7 |

Bằng chứng: `crawData/stage4_assemble/build_final_events.py:224-245`.

Province center được lấy từ GADM index; marker center lấy từ marker list. Đây là center phục vụ focus, không phải terrain height.

### 10.2. Bounds runtime

Với event đã bị normalize thành `multi_region` và có hơn một `primaryRegions`, frontend:

1. tìm entity polygon theo tên tỉnh;
2. chuyển mọi `hierarchy.positions` tìm được sang Cartographic;
3. gọi `Rectangle.fromCartographicArray`;
4. truyền rectangle vào `viewer.camera.flyTo`.

Bằng chứng:

- tính rectangle: `frontend/src/components/CesiumMap.tsx:387-418`;
- fly tới rectangle: `frontend/src/components/CesiumMap.tsx:431-453`.

Không có `BoundingSphere` trong flow hiện tại. Height cho rectangle do Cesium tự xác định.

### 10.3. Camera altitude runtime

Nếu không dùng rectangle, camera dùng độ cao cố định:

| Trường hợp runtime | Altitude |
|---|---:|
| default/`single_point` | 30.000 m |
| event có children | 800.000 m |
| `multi_region` fallback | 500.000 m |
| `nationwide` | 1.500.000 m |

Bằng chứng: `frontend/src/components/CesiumMap.tsx:456-480`.

`focusGeometry.zoom` trong canonical source không được API map flow tiêu thụ. Đây là một mâu thuẫn giữa dữ liệu và runtime.

### 10.4. Hành vi khi không có vị trí

Nếu selected event thiếu coordinates hoặc là `no_location`, Cesium hiện bay về view toàn Việt Nam:

- `frontend/src/components/CesiumMap.tsx:487-501`

Đây là hành vi chọn event hiện tại, không phải eligibility của tính năng địa hình. Nút “Xem địa hình” không được hiển thị cho `no_location` hoặc `nationwide`.

## 11. Bảng eligibility, camera và tương tác đề xuất

Bảng này kết hợp semantics đã xác minh với yêu cầu sản phẩm. Nó không khẳng định tính năng đã tồn tại.

| `geo_type` | Có xem địa hình | Target cần tạo | Camera khi vào terrain mode | Tương tác |
|---|---|---|---|---|
| `point` | Có, nếu marker hợp lệ | Một point target | Fly gần marker; height cần hiệu chỉnh theo terrain/độ rộng mong muốn, không dùng mặc định 30 km một cách tuyệt đối | Một nút vào terrain; không cần danh sách vùng |
| `multi_point` | Có, nếu còn ít nhất một marker hợp lệ | Một target cho mỗi marker; dedupe tùy ID/tên, không chỉ tọa độ | Ban đầu fit toàn bộ marker; sau đó fly tới marker được chọn | Danh sách/click marker; đổi target không ghi đè camera snapshot ban đầu |
| `multi_polygon` | Có, nếu resolve được ít nhất một GADM polygon | Một target cho mỗi `gadmRef`/province | Fit toàn event; khi chọn vùng, fly tới rectangle/bounding sphere của vùng đó | Highlight và click từng vùng; cần label vùng đang chọn |
| `mixed` | Có, nếu có point hoặc polygon target hợp lệ | Hợp nhất point target và polygon target, giữ rõ `kind` | Fit toàn bộ target; chọn target thì dùng chiến lược tương ứng point/polygon | Danh sách có phân loại điểm/vùng; polygon và marker đều click được |
| `nationwide` | Không | Không tạo terrain target | Không thay camera vì terrain mode không được mở | Không hiển thị nút “Xem địa hình” |
| `no_location` | Không | Không tạo terrain target | Không thay camera vì terrain mode không được mở | Không hiển thị nút “Xem địa hình” |

Điều kiện eligibility an toàn:

```text
point:
  marker finite và nằm trong miền lat/lng hợp lệ

multi_point:
  ít nhất một marker hợp lệ sau validation

multi_polygon:
  ít nhất một GADM ref/name resolve thành polygon không rỗng

mixed:
  ít nhất một point hoặc polygon target hợp lệ

nationwide, no_location:
  false
```

Runtime hiện chưa thể thực hiện bảng này qua DTO list vì đã mất `markers[]`, `gadmRefs[]` và canonical `geoType`.

## 12. Export JSON cũ và dữ liệu static

Thư mục:

```text
history_events_export_2026-04-24T14-28-46-607Z/
```

có 251 file theo schema cũ `mapData.displayGeometry`. Kết quả parse:

| Giá trị cũ | Số file |
|---|---:|
| `point` | 66 |
| `multi_point` | 31 |
| `polygon` | 14 |
| `multi_polygon` | 5 |
| `mixed` | 3 |
| `nationwide` | 43 |
| `no_location` | 89 |

Mẫu schema cũ:

- `history_events_export_2026-04-24T14-28-46-607Z/json10/bach-dang-938-ngo-quyen-xung-vuong.json:44-73`

Hai thư mục static sau cũng có 251 file và cùng phân bố giá trị:

```text
frontend/src/data/history_events/
MVP_KLTN/src/data/history_events/
```

Frontend registry bundle dữ liệu static qua `import.meta.glob`:

- `frontend/src/data/eventRegistry.ts:1-11`

`frontend/src/data/events.ts` dựng cache/tree từ registry:

- `frontend/src/data/events.ts:1-19`
- `frontend/src/data/events.ts:22-60`

Tuy nhiên map chính dùng API backend, còn static chỉ còn vai trò secondary/fallback. Không được dùng export cũ để suy ra contract terrain mới.

## 13. Trạng thái các thư mục dữ liệu

| Đường dẫn | Vai trò đã xác minh | Trạng thái runtime |
|---|---|---|
| `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl` | Canonical core source, mặc định cho importer | Build/import-time, không được frontend đọc trực tiếp |
| `crawData/stage4_assemble/output/final_events.jsonl` | Intermediate 407 event trước Stage 4B | Không phải runtime |
| `history_events_export_2026-04-24T14-28-46-607Z/` | Export schema cũ | Không có import runtime trực tiếp được tìm thấy |
| `frontend/src/data/history_events/` | Static old-schema registry | Secondary runtime/fallback, không phải nguồn map chính |
| `data/gadm/lv0.json`–`lv3.json` | Kho dữ liệu GADM nhiều cấp | Không được frontend runtime đọc trực tiếp |
| `frontend/public/geojson/vietnam-provinces.json` | GADM cấp tỉnh | Runtime Cesium |
| `crawData/stage4_assemble/output/indexes/gadm_index.json` | Index build-time name/ref/center | Không phải runtime frontend |
| `MVP_KLTN/public/geojson/vietnam-provinces.json` | Nguồn từng được Stage 4 pipeline tham chiếu | Tư cách app deploy hiện tại: **UNVERIFIED** |

Stage 4 pipeline trỏ GADM vào `MVP_KLTN/public/geojson/vietnam-provinces.json`:

- `crawData/stage4_assemble/stage4_common.py:16-25`

Trong khi frontend runtime thật tải bản dưới `frontend/public`. Việc đồng bộ tự động giữa các bản sao GADM là **UNVERIFIED**.

Không tìm thấy first-party SQL seed chèn historical events. Dữ liệu event được nạp bằng JSONL importer; các file SQL liên quan là migration hoặc backup ngoài runtime.

## 14. AI service và geo runtime

`ai-service/main.py` chỉ khai báo health check và endpoint câu hỏi mẫu. Nó không đọc event, GADM, location, geometry hoặc điều khiển Cesium:

- `ai-service/main.py:1-31`

AI service không thuộc geo runtime hiện tại.

## 15. Các điểm không thống nhất giữa các layer

| ID | Không thống nhất | Bằng chứng | Tác động tới tính năng địa hình |
|---|---|---|---|
| GEO-01 | Canonical có sáu kiểu mới; DB/API/frontend dùng bốn kiểu cũ | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1-361`; `frontend/src/types/event.ts:53-54` | Không thể quyết định đúng UX theo từng loại |
| GEO-02 | Migration cho phép kiểu mới nhưng importer chủ động đổi về kiểu cũ | `backend/src/main/resources/db/migration/V12__expand_event_geo_type_enum.sql:1-11`; `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503` | Mất phân biệt `multi_point`/`multi_polygon`/`mixed` |
| GEO-03 | Pipeline từng cho phép `polygon`, migration không cho `polygon`, core hiện không có `polygon` | `crawData/stage4_assemble/stage4_common.py:48-56`; `backend/src/main/resources/db/migration/V12__expand_event_geo_type_enum.sql:1-11` | Import dữ liệu `polygon` tương lai sẽ tiếp tục bị gộp hoặc lỗi nếu bỏ normalization |
| GEO-04 | Backend filter chỉ chấp nhận bốn kiểu cũ | `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30` | Không thể query theo sáu kiểu canonical |
| GEO-05 | DTO không có `markers[]`, `gadmRefs[]`, `focusGeometry` | `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java:6-29`; `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:6-43` | Không tạo được danh sách terrain target typed |
| GEO-06 | Importer chỉ lưu marker đầu/focus center vào `lat/lng` | `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:691-700` | `multi_point` bị co thành một điểm |
| GEO-07 | Runtime highlight dùng tên tỉnh, bỏ qua `gadmRefs` | `frontend/src/components/CesiumMap.tsx:325-377` | Dễ mismatch tên; GADM ref canonical bị lãng phí |
| GEO-08 | Runtime normalization tên yếu hơn pipeline alias | `crawData/stage4_assemble/build_final_events.py:150-185`; `frontend/src/components/CesiumMap.tsx:330-365` | Province resolve build-time đúng nhưng highlight runtime có thể thất bại |
| GEO-09 | Canonical có `focusGeometry.zoom`; runtime dùng fixed altitude/rectangle | `crawData/stage4_assemble/build_final_events.py:224-245`; `frontend/src/components/CesiumMap.tsx:431-480` | Camera không tuân theo focus metadata |
| GEO-10 | `nationwide` có center và runtime hiện vẫn fly tới 1.500 km | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1-1`; `frontend/src/components/CesiumMap.tsx:461-480` | Terrain eligibility phải tách khỏi general selection camera |
| GEO-11 | `no_location` hiện làm camera bay về toàn Việt Nam khi chọn | `frontend/src/components/CesiumMap.tsx:487-501` | Không được tái sử dụng hành vi này cho nút terrain |
| GEO-12 | Static old-schema vẫn được bundle và dùng fallback parent, trong khi map dùng DB | `frontend/src/data/events.ts:22-60`; `frontend/src/pages/MapPage.tsx:457-466`; `frontend/src/services/eventApi.ts:431-441` | Một event có thể khác geo data tùy đường truy cập |
| GEO-13 | Có nhiều bản sao GADM ở `data`, `MVP_KLTN`, `frontend/public` | `crawData/stage4_assemble/stage4_common.py:16-25`; `frontend/src/components/CesiumMap.tsx:168-186` | Nguy cơ lệch boundary nếu chỉ cập nhật một bản |
| GEO-14 | Không có boundary version theo thời gian | `frontend/src/data/vietnamProvinceCentroids.ts:1-10`; `frontend/public/geojson/vietnam-provinces.json:1-1` | Không thể hiển thị địa giới lịch sử chính xác |
| GEO-15 | Runtime không có topology/ring validator | `crawData/stage4_assemble/validate_stage4.py:137-172`; `frontend/src/components/CesiumMap.tsx:168-186` | Một GeoJSON lỗi có thể làm mất toàn bộ layer boundary |

## 16. Contract tối thiểu cần bảo toàn khi triển khai

Không triển khai trong nhiệm vụ này, nhưng implementation sau phải bảo toàn ít nhất:

```ts
type CanonicalGeoType =
  | 'point'
  | 'multi_point'
  | 'multi_polygon'
  | 'mixed'
  | 'nationwide'
  | 'no_location';

type PointTerrainTarget = {
  kind: 'point';
  id: string;
  label: string;
  lat: number;
  lng: number;
  confidence?: string;
};

type RegionTerrainTarget = {
  kind: 'region';
  id: string;
  label: string;
  gadmRef?: string;
  provinceName: string;
};
```

Các yêu cầu contract:

1. Không normalize ba kiểu nhiều target thành một `multi_region` trước khi tạo terrain targets.
2. Giữ thứ tự `lat/lng` trong object và `[lng,lat]` khi truyền cho Cesium/GeoJSON.
3. Không giả định có altitude trong dữ liệu.
4. Dùng `gadmRef` làm khóa ưu tiên; tên tỉnh chỉ là fallback/display label.
5. `nationwide` và `no_location` luôn không đủ điều kiện mở terrain mode.
6. `mixed` phải giữ riêng point target và region target.
7. Một target lỗi không được làm mất các target hợp lệ khác.
8. Camera snapshot/restore thuộc feature state; không được suy ra từ `focusGeometry`.

## 17. Các điểm UNVERIFIED cần xác nhận ngoài static repository

1. **UNVERIFIED:** Database production đã áp dụng migration enum nào và hiện có giá trị `geo_type` thực tế nào. Cần truy vấn chỉ đọc:

   ```sql
   SELECT geo_type, COUNT(*) FROM historical_events GROUP BY geo_type;
   ```

2. **UNVERIFIED:** `raw_json` production có còn đầy đủ `markers[]`, `gadmRefs[]`, `focusGeometry` cho toàn bộ event hay không.
3. **UNVERIFIED:** GADM 4.1/63-feature snapshot có còn là boundary product muốn dùng sau các thay đổi hành chính.
4. **UNVERIFIED:** Cesium version hiện tại chuyển mọi part và holes của các `MultiPolygon` phức tạp thành entity hierarchy như thế nào trong browser thực.
5. **UNVERIFIED:** Các bản sao GADM trong `data`, `MVP_KLTN` và `frontend/public` có quy trình đồng bộ chính thức hay chỉ được copy thủ công.
