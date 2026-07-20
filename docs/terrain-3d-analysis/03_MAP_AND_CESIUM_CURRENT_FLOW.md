# Luồng map và Cesium hiện tại

## Route, page và component

- `/map` render `MapPage` (`frontend/src/App.tsx:69-76`).
- Deep link dùng query `event`, không dùng path parameter trên map (`frontend/src/pages/MapPage.tsx:232-235`).
- Giá trị query được gửi vào detail endpoint chấp nhận cả ID lẫn slug (`frontend/src/pages/MapPage.tsx:379-421`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-168`).
- `MapPage` là owner của event/UI state; `CesiumMap` là owner của Viewer, Entity/DataSource, handler và camera refs (`frontend/src/pages/MapPage.tsx:212-235`, `frontend/src/components/CesiumMap.tsx:39-62`).
- Popup chính là `EventPopup`, render khi `selectedEvent !== null` (`frontend/src/pages/MapPage.tsx:685-693`).
- Sidebar và popup dùng chung đúng object `selectedEvent` của `MapPage` (`frontend/src/pages/MapPage.tsx:637-656`, `frontend/src/pages/MapPage.tsx:685-693`).

## Selected-event flow

### Chọn từ sidebar

`Sidebar` render mỗi row bằng một `div` có `onClick`, sau đó gọi `onSelectEvent(event)` (`frontend/src/components/Sidebar.tsx:326-364`). `MapPage.handleSelectEvent` chạy detail và children request song song, merge kết quả, ghi view bất đồng bộ rồi cập nhật `selectedEvent`/navigation stack (`frontend/src/pages/MapPage.tsx:331-377`).

### Chọn từ marker

`ScreenSpaceEventHandler` gọi `scene.pick`; chỉ entity có property động `eventData` mới được hiểu là event marker (`frontend/src/components/CesiumMap.tsx:137-160`). Marker được gắn `eventData` khi tạo (`frontend/src/components/CesiumMap.tsx:271-301`).

### Deep link

Effect đọc `?event=...`, fetch detail + children, đổi timeline year nếu có, rồi set event (`frontend/src/pages/MapPage.tsx:379-421`). Các card detail tạo URL theo cùng contract (`frontend/src/components/event-detail/EventLocationCard.tsx:15-18`, `frontend/src/components/event-detail/EventHero.tsx:29-37`).

### Đóng và quay lại hiện có

- Đóng popup chỉ đặt event về `null` và xóa navigation stack (`frontend/src/pages/MapPage.tsx:509-513`).
- “Quay lại” hiện tại là quay lại **event cha**, không phải khôi phục camera (`frontend/src/components/EventPopup.tsx:60-70`, `frontend/src/components/EventPopup.tsx:396-415`).
- Chưa có camera snapshot/restore, terrain state hoặc logic khôi phục khi close/chọn event khác/route change/unmount.

## Viewer hiện tại

`CesiumMap` dùng trực tiếp `Viewer`, `Entity`, `CustomDataSource`, `GeoJsonDataSource` và `ScreenSpaceEventHandler`; không import Resium (`frontend/src/components/CesiumMap.tsx:3-25`). `resium` chỉ tồn tại trong dependency (`frontend/package.json:19-27`).

Viewer được tạo trong `requestAnimationFrame` để đợi container có kích thước (`frontend/src/components/CesiumMap.tsx:64-99`). Initial view là `VIETNAM_CENTER` (`frontend/src/components/CesiumMap.tsx:130-135`).

### Cấu hình terrain/globe/render

| Cấu hình | Giá trị hiện tại | Bằng chứng |
|---|---|---|
| Cesium | `^1.139.1` | `frontend/package.json:19-27` |
| Resium | `^1.19.4`, không được component dùng | `frontend/package.json:19-27`, `frontend/src/components/CesiumMap.tsx:3-25` |
| Terrain provider active | `new EllipsoidTerrainProvider()` | `frontend/src/components/CesiumMap.tsx:98-115` |
| World Terrain helper | `createWorldTerrainAsync`, có helper nhưng Viewer không gọi | `frontend/src/lib/cesium.ts:1-22`, `frontend/src/components/CesiumMap.tsx:98-115` |
| `depthTestAgainstTerrain` | `false` | `frontend/src/components/CesiumMap.tsx:133-135` |
| Globe lighting | `false` | `frontend/src/components/CesiumMap.tsx:133-135` |
| Shadows | `false` | `frontend/src/components/CesiumMap.tsx:100-115` |
| Globe | mặc định Cesium, chỉ override hai cờ trên | `frontend/src/components/CesiumMap.tsx:100-135` |
| `maximumScreenSpaceError` | không cấu hình; dùng mặc định Cesium | Không có assignment trong `frontend/src/components/CesiumMap.tsx:64-135` |
| `requestRenderMode` | không cấu hình; dùng mặc định Cesium | Không có option trong `frontend/src/components/CesiumMap.tsx:100-115` |
| Camera controller | không cấu hình; dùng mặc định Cesium | Không có assignment trong `frontend/src/components/CesiumMap.tsx:64-216` |

Kết luận: bản đồ hiện tại là globe 3D trên ellipsoid, **không có elevation terrain thực**. Marker dùng `CLAMP_TO_GROUND`, nhưng ground hiện là ellipsoid (`frontend/src/components/CesiumMap.tsx:272-297`).

### Token và static assets

- Module Cesium hiện đặt Ion access token trực tiếp trong source; tài liệu này cố ý không ghi giá trị (`frontend/src/lib/cesium.ts:12-22`). Vì `CesiumMap` import constants từ module này, assignment có chạy (`frontend/src/components/CesiumMap.tsx:24-26`).
- Không có biến Cesium trong `.env.example`; các tên hiện có bắt đầu bằng `VITE_API_BASE_URL` và các cấu hình auth/media/TTS (`frontend/.env.example:1-9`).
- Tên biến đề xuất cho triển khai là `VITE_CESIUM_ION_TOKEN`; đây là tên **chưa tồn tại**, không phải secret value.
- Vite copy `Workers`, `ThirdParty`, `Assets`, `Widgets` từ Cesium build vào `/cesium` và định nghĩa `CESIUM_BASE_URL` tương ứng (`frontend/vite.config.ts:7-22`, `frontend/vite.config.ts:42-44`).

Hard-coded token là blocker bảo mật/vận hành: cần rotate token ngoài nhiệm vụ này và chuyển sang environment trước khi bật World Terrain.

## Marker flow

1. `MapPage` lọc event có coordinates và khác `no_location` (`frontend/src/pages/MapPage.tsx:198-200`, `frontend/src/pages/MapPage.tsx:296-316`).
2. `CesiumMap.renderMarkers` xóa datasource marker cũ, tạo `CustomDataSource('eventMarkers')`, bật clustering và add một point entity cho mỗi event (`frontend/src/components/CesiumMap.tsx:219-309`).
3. Coordinates được kiểm tra finite và truyền theo thứ tự `fromDegrees(lng, lat)` (`frontend/src/components/CesiumMap.tsx:253-275`).
4. Hover sidebar làm thay đổi pixel size; vì callback phụ thuộc `highlightedEventId`, datasource được dựng lại (`frontend/src/components/CesiumMap.tsx:267-315`).

Chỉ một `coordinates` được giữ trên `HistoricalEvent` (`frontend/src/types/event.ts:13-36`), nên `multi_point` hiện không thể render nhiều marker.

## Polygon/highlight flow

1. Province GeoJSON được tải bất đồng bộ bằng `GeoJsonDataSource.load` (`frontend/src/components/CesiumMap.tsx:168-186`).
2. Highlight chỉ chạy khi `event.geoType === 'multi_region'` và `primaryRegions` không rỗng (`frontend/src/components/CesiumMap.tsx:321-348`).
3. Mỗi feature được match bằng `NAME_1` sau khi chỉ xóa whitespace và lowercase; primary/secondary nhận material khác nhau (`frontend/src/components/CesiumMap.tsx:350-377`).
4. Event data mới có `gadmRefs`, nhưng runtime highlight hiện không dùng ID ổn định này; mapper API cũng không truyền nó.

GeoJSON khai báo CRS84, feature level-1 có `GID_1`, `NAME_1`, và geometry `MultiPolygon` (`frontend/public/geojson/vietnam-provinces.json:1`). Không có polygon coordinates trực tiếp trong event row/API summary; vùng được tham chiếu bằng tên/mã rồi lấy geometry từ GADM.

## Camera flow

Effect camera chạy mỗi khi `selectedEvent` đổi (`frontend/src/components/CesiumMap.tsx:421-502`):

- `multi_region` có hơn một tỉnh: gom outer positions từ các feature phù hợp, tạo `Rectangle`, rồi `camera.flyTo(destination: bounds)` (`frontend/src/components/CesiumMap.tsx:387-452`).
- Có một `coordinates`: fly tới `Cartesian3.fromDegrees(lng, lat, altitude)` (`frontend/src/components/CesiumMap.tsx:456-484`).
- Altitude hard-code: 30 km mặc định, 500 km cho `multi_region`, 800 km nếu có children, 1.500 km cho `nationwide` (`frontend/src/components/CesiumMap.tsx:461-469`).
- Không có vị trí: fly về `VIETNAM_CENTER` (`frontend/src/components/CesiumMap.tsx:487-501`).
- Orientation mọi nhánh đều heading `0`, pitch `-90°`, roll `0`; không có góc nghiêng quan sát địa hình (`frontend/src/components/CesiumMap.tsx:440-448`, `frontend/src/components/CesiumMap.tsx:471-480`).

Không dùng `viewer.flyTo`, `viewer.zoomTo` hoặc `flyToBoundingSphere`; chỉ dùng `camera.flyTo`.

## Event handlers và tương tác nhiều vùng

- Một handler LEFT_CLICK được tạo lúc init (`frontend/src/components/CesiumMap.tsx:137-163`).
- Handler nhận diện marker qua `picked.id.eventData`; polygon GADM không có `eventData`, nên click polygon hiện không chọn region (`frontend/src/components/CesiumMap.tsx:145-154`, `frontend/src/components/CesiumMap.tsx:359-377`).
- Click khoảng trống deselect event; click cluster không làm gì (`frontend/src/components/CesiumMap.tsx:145-154`).
- Không có `selectedTerrainRegion`, target ID namespace, list target, target highlight hay listener riêng cho terrain mode.

Triển khai nên tái sử dụng handler duy nhất: gắn metadata có namespace rõ ràng (`kind: 'event-marker' | 'terrain-target'`, `eventId`, `targetId`) lên entity thay vì tạo handler mới mỗi render.

## Cleanup hiện tại

| Resource | Cleanup hiện tại | Đánh giá |
|---|---|---|
| `ScreenSpaceEventHandler` | destroy khi effect cleanup | Có (`frontend/src/components/CesiumMap.tsx:198-206`) |
| Marker datasource | datasource cũ remove với `destroy=true`; remove khi unmount | Có (`frontend/src/components/CesiumMap.tsx:226-229`, `frontend/src/components/CesiumMap.tsx:209-213`) |
| Viewer | cố ý giữ module-level khi unmount; destroy khi gặp container khác | Partial (`frontend/src/components/CesiumMap.tsx:69-80`, `frontend/src/components/CesiumMap.tsx:198-208`) |
| Province datasource | không remove trực tiếp trong unmount cleanup | Thiếu cleanup tường minh |
| Highlight | reset material khi event không đủ điều kiện | Có khi effect chạy (`frontend/src/components/CesiumMap.tsx:343-377`) |
| Async GeoJSON promise | không có cancelled flag | Có khả năng hoàn tất sau cleanup |
| Camera snapshot | không tồn tại | Missing |

## UI hiện tại

- Action area nằm ở footer của `EventPopup`; nút “Xem chi tiết” và placeholder “3D Địa hình” ở `frontend/src/components/EventPopup.tsx:346-395`.
- Placeholder terrain luôn render nhưng disabled, không phụ thuộc geo type, có title và `tabIndex=-1` (`frontend/src/components/EventPopup.tsx:380-394`).
- Đây là vị trí phù hợp để thay bằng nút “Xem địa hình”; điều kiện phải dựa trên actual `geo_type` và target hợp lệ.
- Không có shared general Button; chỉ có component `BackButton` chuyên điều hướng (`frontend/src/components/shared/BackButton.tsx:1-43`). Giữ pattern button inline hiện tại là thay đổi ít nhất.
- `no_location` và `nationwide` đã có message riêng (`frontend/src/components/EventPopup.tsx:173-198`), nhưng button placeholder vẫn xuất hiện.
- Regions hiện là các `span`, không click/keyboard được (`frontend/src/components/EventPopup.tsx:200-234`).
- Popup rộng cố định `400px`, Sidebar `320px`; layout chính luôn ngang (`frontend/src/components/EventPopup.tsx:33-46`, `frontend/src/components/Sidebar.tsx:130-141`, `frontend/src/pages/MapPage.tsx:623-695`). Không có breakpoint mobile trong các đoạn này.
- Popup/Sidebar đều z-index `10`; Cesium soft error cũng z-index `10` (`frontend/src/components/EventPopup.tsx:35-45`, `frontend/src/components/Sidebar.tsx:130-141`, `frontend/src/components/CesiumMap.tsx:511-519`), nên thứ tự DOM đang quyết định một phần stacking.
- Close button có `aria-label`; event rows sidebar là clickable `div` không có role/tabIndex/keyboard handler (`frontend/src/components/EventPopup.tsx:118-142`, `frontend/src/components/Sidebar.tsx:357-364`).
- Có loading list/search và soft Cesium error, nhưng không có loading/error riêng cho terrain (`frontend/src/pages/MapPage.tsx:665-672`, `frontend/src/components/Sidebar.tsx:266-276`, `frontend/src/components/CesiumMap.tsx:511-522`).

## Rủi ro đã xác minh

1. **Geo type drift:** frontend type chỉ có bốn tên cũ (`frontend/src/types/event.ts:53-96`), trong khi source có sáu tên mới; API mapper không normalize/validate (`frontend/src/services/eventApi.ts:176-204`).
2. **Lossy multiple geometry:** mapper giữ một `lat/lng` và province names, bỏ `markers`, `gadmRefs`, focus settings (`frontend/src/services/eventApi.ts:176-204`, `frontend/src/services/eventApi.ts:373-383`).
3. **Selection race:** click nhanh hai event có thể để request cũ hoàn tất sau và ghi đè state (`frontend/src/pages/MapPage.tsx:331-377`).
4. **GeoJSON/camera race:** highlight được reapply khi GeoJSON xong nhưng bounds fly-to không được re-trigger (`frontend/src/components/CesiumMap.tsx:168-186`, `frontend/src/components/CesiumMap.tsx:421-502`).
5. **StrictMode handler risk:** cleanup destroy handler nhưng giữ Viewer; nhánh reuse same container return trước khi tạo lại handler (`frontend/src/main.tsx:6-10`, `frontend/src/components/CesiumMap.tsx:69-73`, `frontend/src/components/CesiumMap.tsx:198-208`).
6. **Name matching mong manh:** polygon matching không dùng `GID_1`, không bỏ dấu/punctuation/alias (`frontend/src/components/CesiumMap.tsx:330-365`).
7. **No true terrain:** ellipsoid provider làm yêu cầu elevation bị blocked (`frontend/src/components/CesiumMap.tsx:98-115`).
8. **No restore:** mọi selection hiện ghi đè camera và không lưu position/orientation trước đó (`frontend/src/components/CesiumMap.tsx:421-502`).
