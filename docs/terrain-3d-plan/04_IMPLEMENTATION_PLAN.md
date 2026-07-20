# Kế hoạch triển khai MVP

## Phạm vi MVP

MVP chỉ mở terrain cho event có target hợp lệ và `geo_type` canonical `point`, `multi_point`, `multi_polygon`, `mixed`. `nationwide` và `no_location` không có CTA terrain. Target model:

```ts
type TerrainTarget =
  | { id: string; kind: 'point'; label: string; position: { lat: number; lng: number }; confidence?: string }
  | { id: string; kind: 'region'; label: string; gadmRef: string; provinceName?: string }
```

Eligibility là `targets.length > 0` sau validation và region resolve; malformed target bị loại độc lập, không làm hỏng event. Point finite, lat trong `[-90,90]`, lng trong `[-180,180]`; region exact GADM rồi name fallback. `focusGeometry` không phải target.

## Architecture và state machine

`MapPage` sở hữu serializable terrain state và transition intent; `CesiumMap` sở hữu Viewer, provider, datasource, entity, handler, camera refs. Không tạo global store/Resium.

```text
idle
  └─ ENTER(event) → terrain-entering
terrain-entering
  ├─ provider/targets OK → terrain-active
  ├─ provider/target error → terrain-error
  └─ CLOSE/SWITCH/ROUTE → terrain-exiting
terrain-active
  ├─ SELECT_TARGET → terrain-active (giữ snapshot)
  └─ EXIT/CLOSE/SWITCH → terrain-exiting
terrain-error
  ├─ RETRY → terrain-entering
  └─ EXIT/CLOSE → terrain-exiting
terrain-exiting
  ├─ restore complete → idle hoặc event-selected
  └─ unmount → resources destroyed
```

Mọi event async mang `eventId`, `requestId`, `terrainSessionId`; callback không khớp là no-op. Pending intent dùng latest-wins, không `setTimeout` vô chủ. Event switch phải restore/cancel phiên cũ trước khi commit event mới.

## Camera/resource lifecycle

1. Enter: snapshot một lần trước flight đầu tiên (`positionWC`, `directionWC`, `upWC`, transform), tạo session ID.
2. Provider: lấy token từ `import.meta.env.VITE_CESIUM_ION_TOKEN`; lazy `createWorldTerrainAsync`; `loading/error/ready`; lỗi giữ ellipsoid map dùng được và không tuyên bố terrain thành công.
3. Render: await provider/GeoJSON/datasource; mọi promise kiểm tra mounted + session/generation; region datasource/entity thuộc session.
4. Overview/target: point dùng tilted camera; region gom mọi polygon part để bounds; mixed có overview và picker; duration obey `prefers-reduced-motion`.
5. Target change: không overwrite snapshot; chỉ đổi selected target và camera operation ID.
6. Exit: cancel flight hiện tại, restore exact snapshot; chỉ clear snapshot khi restore operation hiện tại complete. Close popup, đổi event/year/grade/parent-child đều đi qua exit.
7. Cleanup: destroy handler, remove terrain/marker datasource, remove polygon materials/listeners, cancel animation/provider callbacks, destroy Viewer khi unmount. Không set state sau unmount.

## Phases, file, dependency, risk, test, acceptance, rollback

| Phase | File/logic | Dependency | Risk | Test/acceptance | Rollback |
|---|---|---|---|---|---|
| 0 Baseline | Không sửa source; ghi Git/typecheck/test/lint | Node/npm hiện có | Generated build side effect | PASS typecheck, 4 tests; lint baseline 38/6; build deferred | Không có |
| 1 Contract | `types/event.ts`, `eventApi.ts`; giữ `sourceJson.mapData`, canonical + legacy parser | Detail API hiện tại | Mapper list/detail lệch | Fixtures flat/nested, canonical thắng normalized, malformed fallback | Revert hai file |
| 2 Targets | Tạo `utils/terrainTargets.ts` và test | GeoJSON schema/GADM resolver interface | ID/duplicate/mismatch sai | Sáu geo type, invalid coordinate, mixed, unresolved, duplicate, array mismatch | Xóa utility/test mới |
| 3 Provider | `.env.example`, `lib/cesium.ts`, `CesiumMap.tsx` nhỏ | Cesium `^1.139.1`, Ion token | Token/quota, async leak, ellipsoid false success | missing/wrong token, reject, retry, unmount-before-resolve, typecheck | Tắt CTA/provider, giữ ellipsoid |
| 4 State | `MapPage.tsx`; reducer, request/session IDs | Phase 1–3 | stale A→B, close/deep-link/year race | reducer transitions, latest-wins, route unmount | Revert reducer; feature flag off |
| 5 Camera | `CesiumMap.tsx`; snapshot/flight operation | Viewer camera API | cancel ghi đè restore, auto-fly legacy | enter/exit 10 lần, A→B giữa flight, tolerance restore, reduced motion | Disable terrain entry |
| 6 Region | `CesiumMap.tsx`, resolver utility | GADM `GID_1`/MultiPolygon | Wrong historical boundary, duplicate datasource | bounds tất cả part, click/highlight/cleanup, unresolved isolation | Chỉ point terrain |
| 7 Popup | `EventPopup.tsx`, optional `Sidebar.tsx` | State/target/provider status | mất hierarchy UX, mobile/a11y | CTA/status/list/retry/back-camera, keyboard, 320/375px | Ẩn CTA, map 2D |
| 8 Integration | MapPage/Cesium/Popup regression | Tất cả phase | timeline/filter/deep-link regression | parent-child, close, đổi năm/lớp, marker/sidebar, WebGL | Revert phase cuối |
| 9 Test/release | Unit + scoped lint/typecheck/build controlled + manual | staging token/data | Baseline lint nhiễu; provider chưa có quota | six types, resource counts, WebGL, performance, acceptance matrix | Feature disabled/config rollback |

## File-by-file manifest

**Dự kiến sửa:** `.env.example`, `types/event.ts`, `services/eventApi.ts`, `lib/cesium.ts`, `pages/MapPage.tsx`, `components/CesiumMap.tsx`, `components/EventPopup.tsx`; thêm `utils/terrainTargets.ts`, `utils/terrainTargets.test.ts`. `Sidebar.tsx` chỉ sửa nếu cần keyboard/selection metadata.

**Không sửa trong MVP:** backend, migration, `App.tsx` route, `main.tsx`, GeoJSON/canonical data, image mapping, auth, quiz, media. Nếu typed backend contract trở thành bắt buộc sau audit, dừng decision gate và tạo plan riêng.

## Acceptance criteria

- Supported four types chỉ active khi có target resolve; unsupported two types không có CTA.
- Terrain loading/error/ready hiển thị rõ; ellipsoid fallback vẫn dùng được và không bị gọi là terrain thật.
- Point, multi-point, region, mixed render/select/highlight đúng; region bounds bao phủ toàn bộ MultiPolygon.
- Snapshot khôi phục khi Back/close/switch/year/grade/route; đổi target không overwrite.
- A→B latest-wins; không duplicate Viewer, handler, datasource; unmount không stale callback.
- Existing sidebar, timeline, search, parent/child, deep-link ID/slug và marker flow không regression.
- Unit/typecheck/test pass; lint file sửa không có lỗi mới; full lint baseline được phân biệt khỏi regression.

## Blocker thực sự

1. `VITE_CESIUM_ION_TOKEN`/quota/domain/CSP chưa được cung cấp: không nghiệm thu elevation thật.
2. DB live `raw_json.mapData` đầy đủ và đồng bộ là `UNVERIFIED`: cần audit read-only staging.
3. GeoJSON là ranh giới hành chính hiện đại GADM, không phải ranh giới lịch sử; cần product/content approval.
4. Base path/CSP/asset hosting production chưa xác minh; local `/cesium` và `/geojson` không đủ chứng minh deploy.
5. UX default cho `mixed`, camera pitch/duration và reduced motion cần duyệt.

## Điều kiện rollback

Rollback theo từng phase bằng revert semantic diff hoặc feature-disable CTA/provider; không `git reset --hard`, không xóa source/data/migration, không chạy importer. Nếu provider/token/data fail, giữ map ellipsoid và ẩn CTA thay vì fallback im lặng.
