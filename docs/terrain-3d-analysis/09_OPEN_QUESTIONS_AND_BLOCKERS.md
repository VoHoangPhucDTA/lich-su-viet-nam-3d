# Câu hỏi mở và blocker

Chỉ liệt kê điều không thể kết luận chắc chắn từ repository. Các vấn đề đã có bằng chứng source—frontend chính, route, sáu `geo_type`, API, terrain hiện tại—không được hỏi lại.

## Tóm tắt ưu tiên

| ID | Mức | Cần giải quyết trước khi |
|---|---|---|
| B1 | Blocker | Bật terrain thật ở bất kỳ môi trường nào |
| B2 | Blocker production | Dựa vào location data của DB deploy |
| B3 | Blocker nghiệp vụ | Công bố region boundary là đúng/đủ |
| B4 | Quyết định UX | Chốt trải nghiệm `mixed`/multi-target |
| B5 | Quyết định UX/accessibility | Chốt camera motion mặc định |
| B6 | Blocker deploy có điều kiện | Deploy dưới sub-path/domain production |
| B7 | Blocker nếu sửa DB/backend | Áp dụng geo-type migration/contract fix production |

## B1 — Terrain provider và credential production là gì?

- **Vì sao cần:** Viewer active đang dùng ellipsoid; World Terrain helper không được dùng (`frontend/src/components/CesiumMap.tsx:98-115`, `frontend/src/lib/cesium.ts:21-22`). Token lại được gán trong source, không qua env (`frontend/src/lib/cesium.ts:12-15`).
- **Đã kiểm tra:** `frontend/src/components/CesiumMap.tsx:98-135`, `frontend/src/lib/cesium.ts:1-22`, `frontend/.env.example:1-9`, `frontend/vite.config.ts:7-22`.
- **Không thể kết luận:** Product sẽ dùng Cesium World Terrain hay provider khác; credential hiện tại còn hợp lệ/đúng quota/origin hay không; ai có quyền rotate.
- **Tác động:** Không thể nghiệm thu “terrain thật”, elevation, provider error hoặc deployment an toàn.
- **Mặc định an toàn:** Giữ map cơ bản trên ellipsoid nhưng không coi đó là terrain; chỉ enable CTA sau khi provider ready. Dùng tên `VITE_CESIUM_ION_TOKEN`, không ghi value; rotate token đang nằm trong source và restrict theo domain/quota.

## B2 — `raw_json/sourceJson` có đầy đủ và đồng bộ trong DB đang deploy không?

- **Vì sao cần:** Sáu type và arrays `markers/gadmRefs` đầy đủ nằm trong raw JSON; normalized columns chỉ có một lat/lng và province names (`backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:691-700`, `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java:6-44`).
- **Đã kiểm tra:** default importer source tại `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:30-51`; detail query/source parse tại `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-170`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:532-571`; canonical JSONL 361 records.
- **Không thể kết luận:** Nội dung DB live sau các import gần nhất, tỷ lệ row có raw JSON hợp lệ và raw/normalized drift.
- **Tác động:** Event có thể được API gọi là eligible nhưng không tạo được target, hoặc ngược lại.
- **Mặc định an toàn:** Runtime-validate `sourceJson.mapData`; chỉ enable khi còn target hợp lệ. Không fallback suy đoán từ tên lịch sử. Ghi metric/diagnostic ID, không log toàn raw JSON.

## B3 — Bộ ranh giới hành chính nào là authoritative cho sản phẩm?

- **Vì sao cần:** Runtime dùng GADM 4.1 level 1/63 features, không có version theo thời gian; historical locations chỉ là nhãn (`frontend/public/geojson/vietnam-provinces.json:1`, `frontend/src/data/vietnamProvinceCentroids.ts:1-10`).
- **Đã kiểm tra:** GADM `GID_1/NAME_1` và MultiPolygon tại `frontend/public/geojson/vietnam-provinces.json:1`; pipeline alias tại `crawData/stage4_assemble/config/province_aliases.json:1-76`; runtime name matching tại `frontend/src/components/CesiumMap.tsx:325-377`.
- **Không thể kết luận:** Cần ranh giới hiện đại, ranh giới theo thời điểm lịch sử, hay snapshot giáo khoa; policy cho đổi tên/sáp nhập/chia tách.
- **Tác động:** Highlight có thể đúng kỹ thuật nhưng sai ngữ nghĩa lịch sử/hành chính.
- **Mặc định an toàn:** Freeze và hiển thị version dataset; lookup `gadmRefs` trước tên; không tự biến historical place name thành modern polygon nếu không có mapping đã duyệt. Ghi target unresolved thay vì đoán.

## B4 — Thứ tự/default interaction của `mixed` và event nhiều target?

- **Vì sao cần:** `mixed` thực tế có cả marker(s) và province/GADM refs (`crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:10`); repository chưa định nghĩa target ưu tiên.
- **Đã kiểm tra:** canonical builder semantics tại `crawData/stage4_assemble/build_final_events.py:268-348`; popup hiện chỉ render region label spans (`frontend/src/components/EventPopup.tsx:200-234`); map chưa có target selection.
- **Không thể kết luận:** Product muốn mở overview trước hay target đầu; sort point/region; có cần action “Toàn bộ phạm vi sự kiện”.
- **Tác động:** Không chặn core kỹ thuật nhưng ảnh hưởng UX/acceptance multi-target.
- **Mặc định an toàn:** Mở overview toàn event; giữ source order trong từng kind; hiển thị point trước region với type badge; có “Toàn bộ phạm vi sự kiện”; không auto-select tùy ý.

## B5 — Camera pitch, height, duration và reduced-motion policy?

- **Vì sao cần:** Current camera luôn top-down pitch `-90°` và height hard-code (`frontend/src/components/CesiumMap.tsx:440-480`), không phù hợp xem relief nhưng repository không có design spec cho góc mới.
- **Đã kiểm tra:** mọi `camera.flyTo` tại `frontend/src/components/CesiumMap.tsx:421-502`; không có camera config/design token khác.
- **Không thể kết luận:** Góc giáo khoa mong muốn, min/max height, animation duration và policy khi user bật reduced motion.
- **Tác động:** Có thể gây chóng mặt, che target hoặc làm địa hình không thấy rõ.
- **Mặc định an toàn:** Derive height từ bounds có clamp; pitch nghiêng vừa phải; duration ngắn; duration `0` khi `prefers-reduced-motion`; cho user tự điều khiển và luôn có Back.

## B6 — Frontend deploy ở domain root hay sub-path?

- **Vì sao cần:** Cesium assets, GeoJSON và app routes dùng absolute paths `/cesium`, `/geojson`, `/map` (`frontend/vite.config.ts:14-20`, `frontend/vite.config.ts:42-44`, `frontend/src/components/CesiumMap.tsx:168-174`).
- **Đã kiểm tra:** không tìm thấy Docker/CI/hosting manifest; Vite dev config chỉ chứng minh local (`frontend/vite.config.ts:24-35`).
- **Không thể kết luận:** base path, CDN/CSP, allowed origin của token và routing rewrite production.
- **Tác động:** Deploy sub-path có thể làm Workers/assets/GeoJSON 404 dù local pass.
- **Mặc định an toàn:** Giữ root-path assumption trong MVP và ghi rõ; trước production phải test đúng host/base path/CSP. Không sửa base URLs khi chưa biết deploy contract.

## B7 — Quy trình sửa `geo_type` ở remote production là gì?

- **Vì sao cần:** Backend filter/importer dùng tên cũ (`backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:27-30`, `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:496-503`), trong khi remote production profile tắt Flyway (`backend/src/main/resources/application-remote-production.properties:1-3`).
- **Đã kiểm tra:** migrations `V2`/`V12`, importer profile, remote Flyway bridge tests và production properties.
- **Không thể kết luận:** Ai áp dụng migration remote, maintenance window/backup/rollback và dữ liệu live hiện tại.
- **Tác động:** Chỉ phát sinh nếu chọn sửa normalized DB/typed backend contract trong phase triển khai production.
- **Mặc định an toàn:** MVP đọc/validate `sourceJson.mapData`, không migration. Nếu sửa DB, tạo migration mới, audit/backup trước, dry-run trên snapshot và không bật profile importer production tự động.

## Không phải blocker

- Frontend cần sửa: đã xác minh là `frontend/`.
- Route/event query: `/map?event=<id-or-slug>`.
- Component chính: `MapPage`, `CesiumMap`, `EventPopup`.
- Actual `geo_type`: sáu giá trị canonical.
- `nationwide`/`no_location`: product đã yêu cầu không hiển thị action.
- Có cần chuyển sang Resium: không; giữ imperative Cesium là phương án ít rủi ro.
- Có cần migration cho MVP: không, nếu dùng `sourceJson.mapData` + GADM hiện có.
