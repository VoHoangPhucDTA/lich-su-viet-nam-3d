# Tệp cần cung cấp cho giai đoạn triển khai

Mọi đường dẫn dưới đây tính từ repository root. “Toàn bộ” nghĩa là gửi nguyên tệp nhưng vẫn phải loại secret; “đoạn” nghĩa là đủ các line được chỉ ra. Không gửi giá trị `.env`.

## Bắt buộc

| File | Vai trò | Vì sao cần | Phần quan trọng | Cần gửi |
|---|---|---|---|---|
| `frontend/package.json` | Scripts/dependencies | Xác nhận Cesium/Resium/Vitest và prebuild side effect | `scripts`, `dependencies` (`:6-43`) | Toàn bộ |
| `frontend/vite.config.ts` | Cesium assets, API proxy, base URL | Terrain/Workers/GeoJSON phải chạy đúng dev/build | `:7-44` | Toàn bộ |
| `frontend/src/main.tsx` | React StrictMode entry | Lifecycle/duplicate Viewer/handler phải test dưới StrictMode | `:1-10` | Toàn bộ |
| `frontend/src/App.tsx` | Router/providers | Xác nhận đúng `/map`, route-change cleanup | `:60-76`, `:129-143` | Đoạn |
| `frontend/src/pages/MapPage.tsx` | Owner selected event và terrain state machine | Điều phối popup/map, close/change/deep-link/loading | `:198-235`, `:238-421`, `:496-520`, `:623-697` | Toàn bộ |
| `frontend/src/components/CesiumMap.tsx` | Viewer, entity, camera, pick, terrain resource lifecycle | Tệp triển khai chính | `:1-522` | Toàn bộ |
| `frontend/src/components/EventPopup.tsx` | CTA, target list, Back/loading/error | Có placeholder đúng vị trí | `:15-47`, `:173-234`, `:300-420` | Toàn bộ |
| `frontend/src/types/event.ts` | Event/geo contract | Hiện chỉ có bốn geo type cũ | `:13-36`, `:53-96` | Toàn bộ |
| `frontend/src/services/eventApi.ts` | API DTO/mapping | Detail đã có sourceJson nhưng map mapper đang bỏ geometry | `:34-98`, `:176-204`, `:299-405`, `:431-507` | Toàn bộ |
| `frontend/src/services/apiClient.ts` | Envelope/base URL/error semantics | Không phá auth/cookie/API unwrap | `:1-16`, `:81-138` | Toàn bộ |
| `frontend/src/lib/cesium.ts` | Token/provider/constants/styles | Phải bỏ token trong source và thống nhất provider với Viewer | `:1-64` | Toàn bộ, nhưng redact token value khi chuyển ngoài repo |
| `frontend/.env.example` | Danh sách env công khai | Thêm tên Cesium env, không secret | `:1-9` | Toàn bộ, không value |
| `frontend/public/geojson/vietnam-provinces.json` | Runtime GADM region geometry | Lookup `GID_1`, bounds, MultiPolygon, click region | FeatureCollection/schema tại `:1` | Toàn bộ để chạy; review chỉ cần schema + vài feature |
| `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventDetailDto.java` | Detail contract | Chứng minh `sourceJson` tồn tại | `:6-44` | Toàn bộ |
| `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java` | Detail/raw JSON mapping | Xác minh sourceJson/location query và parse behavior | `:147-214`, `:532-640` | Đoạn |
| `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java` | Canonical JSONL → DB | Biết normalized columns đang lossy | `:30-51`, `:136-219`, `:496-503`, `:691-727` | Đoạn |
| `docs/terrain-3d-analysis/04_GEO_DATA_CONTRACT.md` | Contract sáu type | Không để AI quay lại tên cũ | Toàn bộ | Toàn bộ |
| `docs/terrain-3d-analysis/07_IMPLEMENTATION_PLAN.md` | State/camera/phases | Trình tự triển khai đã kiểm chứng | Toàn bộ | Toàn bộ |
| `docs/terrain-3d-analysis/08_TEST_AND_ACCEPTANCE_PLAN.md` | Test/acceptance | Definition of done | Toàn bộ | Toàn bộ |

Các tệp mới dự kiến AI tạo:

- `frontend/src/utils/terrainTargets.ts`
- `frontend/src/utils/terrainTargets.test.ts`

Không bắt buộc tạo Context/store/hook lớn hoặc chuyển sang Resium.

## Có thể cần

| File | Vai trò | Khi nào cần | Phần quan trọng | Cần gửi |
|---|---|---|---|---|
| `frontend/src/components/Sidebar.tsx` | Selection/hover/mobile/a11y | Nếu sửa keyboard/mobile hoặc metadata selection | `:15-24`, `:69-128`, `:326-393` | Đoạn |
| `frontend/src/components/Timeline.tsx` | Year/grade exit trigger, z-index | Nếu terrain exit phải chặn/serialize year change | callbacks/range/layout | Đoạn |
| `frontend/src/index.css` | Responsive/focus/z-index tokens | Nếu fixed panels cần CSS breakpoint | map/panel/focus rules | Toàn bộ |
| `frontend/src/components/onboarding/OnboardingGuide.tsx` | Overlay stacking | Nếu target UI va chạm onboarding | overlay wrapper/z-index | Đoạn |
| `frontend/src/data/eventRegistry.ts` | Raw local JSON typing/glob | Nếu giữ static fallback tương thích sáu type | `:11-86`, `:161-169`, lookup exports | Đoạn |
| `frontend/src/data/eventAdapter.ts` | Local fallback adapter | Nếu bỏ collapse geo type cho static parent/detail paths | `:10-28`, `:161-199`, `:226-300` | Đoạn |
| `frontend/src/data/vietnamProvinceCentroids.ts` | Name normalization/aliases | Fallback/diagnostic khi GADM ref thiếu | `:20-33`, `:129-189` | Toàn bộ |
| `frontend/src/components/event-detail/EventLocationCard.tsx` | Deep-link producer | Nếu URL state được đồng bộ | `:13-18` | Đoạn |
| `frontend/src/components/event-detail/EventHero.tsx` | Deep-link producer | Nếu URL contract đổi | `:28-37` | Đoạn |
| `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java` | Event endpoints | Nếu thêm endpoint location/terrain target | `:23-82` | Toàn bộ |
| `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java` | Filter/validation | Nếu sửa allow-list sáu type hoặc service method | `:27-69`, `:81-92` | Toàn bộ |
| `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventSummaryDto.java` | List contract | Nếu list cần eligibility/location metadata | `:6-29` | Toàn bộ |
| `backend/src/main/resources/db/migration/V2__events_core.sql` | Base schema | Chỉ để hiểu legacy columns | `:1-49` | Đoạn |
| `backend/src/main/resources/db/migration/V12__expand_event_geo_type_enum.sql` | Geo enum expansion | Nếu audit/migration mới | `:1-11` | Toàn bộ |
| Migration mới | Server-authoritative geometry/enum cleanup | Chỉ khi quyết định thay DB; không sửa migration cũ | N/A | Tạo sau phê duyệt |
| `backend/src/main/resources/application-remote-production.properties` | Remote Flyway policy | Nếu có migration production | `:1-3` | Toàn bộ, không secret |

Nếu chọn endpoint typed, có thể tạo:

- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventMapDataDto.java`
- `backend/src/main/java/com/lichsuvn/backend/event/api/dto/EventTerrainTargetDto.java`
- test service/repository/controller tương ứng.

## Dữ liệu mẫu

Không cần gửi toàn bộ pipeline 361 records cho AI. Gửi sáu line canonical đã lược bỏ field không liên quan:

| `geo_type` | Đường dẫn/record | Cần giữ |
|---|---|---|
| `nationwide` | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl:1` | `id`, `mapData` |
| `mixed` | cùng file `:10` | marker, markers, provinceNames, gadmRefs, focusGeometry |
| `multi_polygon` | cùng file `:11` | provinceNames, gadmRefs, focusGeometry |
| `no_location` | cùng file `:17` | empty geometry + historicalLocations |
| `point` | cùng file `:51` | marker + focusGeometry |
| `multi_point` | cùng file `:229` | primary marker + markers array |

Thêm:

- Hai GADM features đại diện, gồm một MultiPolygon nhiều part/hole nếu có, từ `frontend/public/geojson/vietnam-provinces.json`.
- Fixtures invalid/empty tự tạo trong test, không sửa canonical data.
- Có thể gửi một response detail API đã **xóa media/narrative và mọi thông tin nhạy cảm**, giữ `id`, `geoType`, `lat/lng`, `provinceNames`, `sourceJson.mapData`.

## File không nên gửi hoặc không được sửa

| File/thư mục | Lý do |
|---|---|
| `frontend/.env`, `backend/.env`, mọi secret/credential dump | Tuyệt đối không gửi giá trị |
| `node_modules/`, `dist/`, `build/`, `backend/target/`, `.git/` | Generated/cache, không phải context |
| `MVP_KLTN/` | Không phải frontend của route `/map` hiện tại |
| `AppInputData/` | Event editor độc lập |
| `frontend/src/data/eventTitleImages.ts` | Image mapping ngoài phạm vi |
| `crawData/stage5_media_enrich/`, `crawData/stage5_external_media_enrichment/` | Review/enrichment hình ảnh ngoài phạm vi |
| `thumbnails_event/` | Media ngoài phạm vi |
| `history_events_export_2026-04-24T14-28-46-607Z/` toàn bộ | Export cũ, quá lớn và contract cũ; chỉ dùng mẫu khi điều tra compatibility |
| Remote backup SQL toàn bộ | Có thể chứa dữ liệu/metadata không cần thiết; chỉ trích schema/count đã kiểm duyệt |
| Các trang quiz/exam/auth/profile/admin | Không liên quan trừ khi test route regression |
| `.editorconfig`, `PULL_REQUEST_UI_REFACTOR.md`, `docs/ui-refactor/` | Thay đổi untracked có sẵn của người dùng; phải giữ nguyên |

## Biến môi trường

Chỉ truyền **tên**, không truyền giá trị:

| Tên | Trạng thái | Vai trò |
|---|---|---|
| `VITE_API_BASE_URL` | Đang dùng | Backend production base URL (`frontend/src/services/apiClient.ts:9-16`) |
| `VITE_CESIUM_ION_TOKEN` | Đề xuất, chưa có | Cesium Ion/World Terrain credential |

`CESIUM_BASE_URL` hiện là compile-time define `/cesium`, không phải Vite environment variable (`frontend/vite.config.ts:42-44`).

Lưu ý: mọi `VITE_*` được bundle cho browser, nên token không phải server secret. Phải dùng public client token có domain/URL/quota restrictions, không dùng master credential.

## Gói tối thiểu cho AI frontend-only

Nếu dung lượng bàn giao hạn chế, tối thiểu phải có:

```text
frontend/package.json
frontend/vite.config.ts
frontend/src/main.tsx
frontend/src/App.tsx
frontend/src/pages/MapPage.tsx
frontend/src/components/CesiumMap.tsx
frontend/src/components/EventPopup.tsx
frontend/src/types/event.ts
frontend/src/services/eventApi.ts
frontend/src/services/apiClient.ts
frontend/src/lib/cesium.ts
frontend/.env.example
frontend/public/geojson/vietnam-provinces.json
six sanitized core_events mapData records
docs/terrain-3d-analysis/04_GEO_DATA_CONTRACT.md
docs/terrain-3d-analysis/07_IMPLEMENTATION_PLAN.md
docs/terrain-3d-analysis/08_TEST_AND_ACCEPTANCE_PLAN.md
```
