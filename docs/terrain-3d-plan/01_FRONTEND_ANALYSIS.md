# Phân tích frontend `/map`

## 1. Route và component graph

```text
main.tsx (StrictMode)
  └─ App.tsx / BrowserRouter
      └─ /map → MapPage
          ├─ Sidebar ── onSelectEvent ─┐
          ├─ CesiumMap ─ onSelectEvent ├─ MapPage.selectedEvent
          ├─ Timeline                  │
          └─ EventPopup ←──────────────┘
```

- React chạy dưới `StrictMode`, nên lifecycle Viewer/handler phải chịu mount-cleanup-mount (`frontend/src/main.tsx:1-10`).
- `/map` được khai báo trực tiếp tại `App.tsx`; `/events/:slug` là route detail riêng và không phải nơi triển khai terrain (`frontend/src/App.tsx:69-76`).
- Deep link map dùng query `?event=<id-or-slug>` (`frontend/src/pages/MapPage.tsx:232-235`, `frontend/src/services/eventApi.ts:479-486`).

## 2. State và Event flow

`MapPage` hiện giữ `currentYear`, `selectedEvent`, hover ID, navigation stack, year/search results, cache children, search/loading, grade và timeline years; không có global store và không có terrain state (`frontend/src/pages/MapPage.tsx:212-230`). State terrain có thể đặt tại đây vì cả Sidebar, CesiumMap, popup, year/grade và close callbacks đều hội tụ trong cùng page (`frontend/src/pages/MapPage.tsx:623-697`). Không cần Context/store toàn cục.

Luồng chọn:

1. `Sidebar` gọi `onSelectEvent(event)` từ row click (`frontend/src/components/Sidebar.tsx:326-364`).
2. `CesiumMap` dùng một `ScreenSpaceEventHandler`, pick entity có `eventData`, rồi gọi cùng callback (`frontend/src/components/CesiumMap.tsx:137-163`).
3. `MapPage.handleSelectEvent` fetch detail + children song song, merge vào event, ghi view bất đồng bộ và set `selectedEvent` (`frontend/src/pages/MapPage.tsx:331-377`). Luồng này chưa có request sequence/cancel; A có thể hoàn tất sau B.
4. Cùng object `selectedEvent` được truyền cho Sidebar và CesiumMap; popup chỉ render khi object khác null (`frontend/src/pages/MapPage.tsx:637-657`, `frontend/src/pages/MapPage.tsx:685-693`).
5. Deep-link effect có `cancelled` flag nhưng luồng click thường không có guard tương đương (`frontend/src/pages/MapPage.tsx:379-421`).

Close, đổi năm và đổi lớp hiện chỉ set event null/reset navigation; chưa restore camera hoặc cleanup terrain session (`frontend/src/pages/MapPage.tsx:496-513`). Navigation back trong popup là quay về event cha, không phải “Quay lại góc nhìn” (`frontend/src/components/EventPopup.tsx:60-70`, `frontend/src/components/EventPopup.tsx:396-415`). Hai hành động phải giữ tách biệt.

## 3. API mapper và geo contract

- Type runtime chỉ chấp nhận bốn tên legacy: `multi_region`, `single_point`, `nationwide`, `no_location` (`frontend/src/types/event.ts:53-96`). Cần mở rộng additive cho sáu canonical, không thay toàn bộ consumer trong một lần.
- Detail DTO phía client đã khai báo `sourceJson`, và detail-page mapper có thể dùng raw JSON (`frontend/src/services/eventApi.ts:65-98`, `frontend/src/services/eventApi.ts:299-348`).
- Nhưng `/map` gọi `getHistoricalEventFromBackend`, rồi dùng `summaryToHistoricalEvent`; mapper này chỉ giữ một lat/lng và province names, bỏ `sourceJson.mapData`, `markers[]`, `gadmRefs[]`, `focusGeometry` (`frontend/src/services/eventApi.ts:176-204`, `frontend/src/services/eventApi.ts:479-486`). Đây là điểm mất dữ liệu cần sửa cho MVP.
- List/children vẫn chỉ có normalized single coordinate và province names. Không nên đưa raw JSON vào list; chỉ fetch detail khi chọn event như hiện tại.

Hợp đồng đề xuất trên `HistoricalEvent` là additive: giữ fields legacy cho consumer hiện có và thêm `sourceMapData?`/`terrainMapData?` đã parse. Canonical hợp lệ từ `sourceJson.mapData` thắng normalized legacy. Nếu canonical thiếu/malformed, dựng fallback an toàn từ single lat/lng + province names; `multi_region` phải suy từ targets, không tự mặc định thành polygon.

## 4. Viewer, provider và cleanup hiện tại

- Runtime dùng Cesium imperative trực tiếp; `resium` chỉ là dependency, không được import trong `CesiumMap` (`frontend/package.json:19-27`, `frontend/src/components/CesiumMap.tsx:1-25`). Không cần chuyển sang Resium.
- Cesium version là `^1.139.1`; Vite copy Workers/ThirdParty/Assets/Widgets vào `/cesium` và define `CESIUM_BASE_URL` (`frontend/package.json:19-27`, `frontend/vite.config.ts:7-22`, `frontend/vite.config.ts:42-44`).
- Viewer được tạo trong `requestAnimationFrame`; active provider là `new EllipsoidTerrainProvider()`, lighting/depth test tắt (`frontend/src/components/CesiumMap.tsx:64-115`, `frontend/src/components/CesiumMap.tsx:130-135`). Vì vậy map hiện chưa có elevation thật.
- Helper `createWorldTerrainAsync()` đã có nhưng Viewer không gọi; Ion token đang hard-code trong source và `.env.example` chưa có biến Cesium (`frontend/src/lib/cesium.ts:12-22`, `frontend/.env.example:1-9`). Phải chuyển sang `VITE_CESIUM_ION_TOKEN`, không ghi token value vào code/docs/log.
- Module-level Viewer được giữ sống khi unmount; cleanup chỉ destroy handler và remove marker datasource. Khi StrictMode reuse cùng container, init effect return sớm và không tạo handler mới; policy này có nguy cơ viewer sống nhưng click handler đã chết (`frontend/src/components/CesiumMap.tsx:69-80`, `frontend/src/components/CesiumMap.tsx:198-216`). MVP nên có một owner rõ: tạo/destroy Viewer theo mount, mọi async có mounted + generation guard.
- GeoJSON promise chưa có cancelled/session guard; datasource tỉnh không được remove tường minh trong cleanup (`frontend/src/components/CesiumMap.tsx:168-186`, `frontend/src/components/CesiumMap.tsx:198-214`).

## 5. Marker, polygon và click

- Map chỉ giữ event có một coordinate và khác `no_location`, nên event chỉ có vùng hoặc nhiều điểm có thể biến mất khỏi marker flow (`frontend/src/pages/MapPage.tsx:198-200`, `frontend/src/pages/MapPage.tsx:296-316`).
- Marker datasource cũ được remove với `destroy=true`, sau đó tạo `CustomDataSource('eventMarkers')`, clustering và entity point có `eventData` (`frontend/src/components/CesiumMap.tsx:219-309`). Đây là pattern cleanup có thể giữ.
- Province GeoJSON được load một lần; highlight hiện chỉ chạy cho `multi_region`, match tên `NAME_1` bằng lowercase/xóa whitespace, không dùng `GID_1` (`frontend/src/components/CesiumMap.tsx:321-377`).
- Asset thực tế là FeatureCollection 63 feature, có `GID_1`, `NAME_1`; ba mẫu đã kiểm tra đều `MultiPolygon` (`frontend/public/geojson/vietnam-provinces.json:1`). Resolver phải ưu tiên exact `GID_1 === gadmRef`, sau đó tên Unicode-normalized. Không đọc polygon từ event payload.
- Handler LEFT_CLICK được đăng ký một lần khi init và destroy trong cleanup (`frontend/src/components/CesiumMap.tsx:137-163`, `frontend/src/components/CesiumMap.tsx:198-206`). Không tạo handler terrain thứ hai; gắn metadata namespaced như `{kind:'event-marker'|'terrain-target', eventId, targetId}` lên entity và route trong cùng handler.

Để tránh duplicate handler/datasource: mỗi terrain session có `sessionId`, giữ ref datasource/entity đã add, `await viewer.dataSources.add`, bỏ kết quả stale, remove với `destroy=true` khi exit/switch/unmount; reset material vùng trước khi apply session mới.

## 6. Camera hiện tại và thiết kế cần có

Effect theo `selectedEvent` đang:

- fly bounds cho nhiều `multi_region` bằng positions polygon;
- fly tới single coordinate ở độ cao hard-code;
- nếu thiếu location thì về `VIETNAM_CENTER`;
- luôn top-down pitch `-90°`, không phù hợp quan sát relief (`frontend/src/components/CesiumMap.tsx:387-502`).

Không có snapshot/restore. Terrain lifecycle cần:

1. snapshot đúng một lần trước enter: transform, `positionWC`, `directionWC`, `upWC`;
2. không ghi đè khi đổi target;
3. mỗi flight/restore có `cameraOperationId`, callback cũ là no-op;
4. phân biệt complete/cancel/error;
5. restore trước close/switch event/year/grade/parent-child nếu viewer còn sống;
6. unmount thì cancel flight và destroy resources; không cố set React state sau unmount;
7. suppress legacy selected-event auto-fly trong terrain/restore để nó không ghi đè camera vừa restore.

Bounds region phải gom toàn bộ outer rings của mọi polygon part trong `MultiPolygon`, tạo rectangle/bounding sphere có padding theo overlay. Point dùng góc nghiêng và height clamp; overview nhiều target bao phủ tất cả target resolve được. Reduced motion dùng duration 0/ngắn.

## 7. Popup UX

Placeholder “3D Địa hình” hiện nằm ở footer popup, luôn disabled; đó là vị trí thay bằng CTA `Xem địa hình` (`frontend/src/components/EventPopup.tsx:346-395`). UI cần:

- ẩn/disable CTA theo eligibility thực, không chỉ geo type;
- trạng thái provider/GeoJSON `loading`, `ready`, `error`, retry;
- target picker khi >1 target, selected/highlight đồng bộ click map;
- nút riêng `Quay lại góc nhìn`;
- error không phá map ellipsoid;
- button semantics, keyboard/focus, Escape, reduced motion, viewport 320/375 px;
- ghi rõ vùng là ranh giới hành chính hiện đại nếu product duyệt.

`nationwide` và `no_location` không hỗ trợ dù raw payload chứa tọa độ. Bốn type còn lại chỉ eligible khi ít nhất một target validate và (với region) resolve được.

## 8. File frontend dự kiến sửa

Chắc chắn:

- `frontend/.env.example`
- `frontend/src/types/event.ts`
- `frontend/src/services/eventApi.ts`
- `frontend/src/lib/cesium.ts`
- `frontend/src/pages/MapPage.tsx`
- `frontend/src/components/CesiumMap.tsx`
- `frontend/src/components/EventPopup.tsx`
- mới: `frontend/src/utils/terrainTargets.ts`
- mới: `frontend/src/utils/terrainTargets.test.ts`

Có điều kiện: `frontend/src/components/Sidebar.tsx` chỉ nếu cần keyboard/race intent integration; không cần sửa route, Event detail, Timeline hoặc image mapping nếu props/callback hiện tại đủ.

Regression cần giữ: sidebar selection/hover, marker clustering, timeline year/grade, search, deep link ID/slug, parent-child navigation, `/events/:slug`, close popup và map 2D fallback.
