# GEO PHASE C1 PLAN — Canonical Geography Runtime Contract & Map Overview

- Date: 2026-08-04
- Base commit: `531f3cdc47f551b1f378432be817831c14a55d5c` (canonical promotion commit)
- Canonical SHA-256: `dfbe695d6eb12002be35d3e6430c97a3073cf2863222392ca53345f77707dfb2`
- Boundary SHA-256: `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`
- Branch: `feature/geo-canonical-runtime`
- Worktree: `C:\Users\CITY\Desktop\CLASS\KLTN\lich-su-viet-nam-3d-geo-runtime`

## 1. Scope

Adopt the six canonical geoType contract across importer, backend API, frontend types and the
overview map. Overview map: renders markers/polygons per canonical geoType, click selects event and
opens the right-side popup, no automatic flyTo, no generic terrain session, no "Xem địa hình" CTA.

Canonical geoType values: `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, `no_location`.
Not allowed in canonical runtime: `single_point`, `multi_region`, `polygon`, `unknown`, silent → `no_location`.

## 2. Files to change

### Backend
| File | Change |
| --- | --- |
| `backend/src/main/java/com/lichsuvn/backend/event/domain/EventGeoType.java` | NEW — shared canonical contract (six constants, isCanonical, dual-read helper) |
| `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java` | normalizeGeoType → preserve canonical; reject invalid with event ID + value; projection rules per geoType; no focusGeometry fallback; nationwide/no_location → null lat/lng + empty provinceNames |
| `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java` | `GEO_TYPES` allowlist → six canonical; reject legacy filter values with clear error |
| `backend/src/main/java/com/lichsuvn/backend/admin/application/AdminService.java` | `GEO_TYPES` → canonical; geography read-only in writeEvent (reject geoType/lat/lng/provinceNames changes, keep canonical-only) |
| `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java` | Dual-read: DB legacy `single_point` → canonical `point`; `multi_region` → prefer raw_json.mapData.geoType else mark incompatible; consistency guard on detail |

### Frontend
| File | Change |
| --- | --- |
| `frontend/src/types/event.ts` | `GeoType` → canonical six; keep `LegacyGeoType` for old fixtures; `GEO_TYPE_LABELS` canonical |
| `frontend/src/services/eventApi.ts` | Guard non-canonical API geoType: log/error clearly, no silent collapse |
| `frontend/src/data/eventAdapter.ts` | Legacy adapter only for old fixtures: map single_point→point, multi_region→multi_polygon (documented); remove province-centroid marker fallback & focusGeometry coordinate fallback |
| `frontend/src/pages/MapPage.tsx` | `visibleMapEvents` filter by canonical renderable types; remove terrain CTA wiring (no generic "Xem địa hình") |
| `frontend/src/components/EventPopup.tsx` | Remove TerrainControls CTA + terrain props from generic overview flow |
| `frontend/src/components/CesiumMap.tsx` | Render per canonical type (point marker, multi_point all markers, multi_polygon polygons by gadmRef, mixed both, nationwide/no_location none); remove selectedEvent-triggered flyTo; polygon resolve via gadmRefs against 63-feature GeoJSON |
| `frontend/src/components/event-detail/EventLocationCard.tsx` | geoTypeLabel canonical (point/multi_point/multi_polygon/mixed) |

### Tests
- Backend: `EventJsonImportRunnerGeoContractTest` (new), `EventGeoTypeTest` (new), update existing importer test if needed
- Frontend: update fixtures using `single_point` → `point`; new `eventApi` canonical guard tests; `eventAdapter` legacy mapping tests

## 3. Legacy mappings (documented)

| Legacy | Canonical | Where |
| --- | --- | --- |
| `single_point` | `point` | Backend dual-read (DB), frontend legacy fixture adapter |
| `multi_region` | `multi_polygon` (fixture only) or raw mapData geoType (DB dual-read) | Adapter; dual-read prefers raw mapData, never guesses multi_point/multi_polygon/mixed |
| `polygon` | `multi_polygon` (fixture only) | Adapter |

## 4. Compatibility strategy

- Backend API response is always canonical (dual-read normalizes legacy DB values).
- Legacy filter values are rejected at the boundary with a clear `INVALID_GEOTYPE` error.
- Frontend canonical API responses never pass through the legacy adapter.
- Legacy adapter retained ONLY for old fixture/snapshot/test-migration data.

## 5. Test matrix

Importer: six geoTypes; invalid rejected with event ID+value; no legacy output; raw mapData preserved;
point/multi_point marker projection; no focusGeometry projection; nationwide/no_location null + empty
provinceNames; multi_polygon null lat/lng.
Backend: canonical allowlist; legacy filter rejection; dual-read single_point→point; raw/top-level
mismatch behavior; six-type serialization.
Frontend: six canonical parsing; no API legacy collapse; point marker; multi_point markers;
multi_polygon polygons; mixed both; nationwide/no_location none; click opens popup without flyTo;
no generic terrain CTA; malformed mapData fails closed; [lng,lat]↔{lat,lng}.

## 6. DB schema constraints (observed from migrations, no DB connection)

- `V2__events_core.sql`: `geo_type ENUM('single_point','multi_region','nationwide','no_location') NOT NULL`
- `V34__expand_event_geo_type_enum.sql`: expands ENUM to also include `'point','multi_point','multi_polygon','mixed'`
  → the DB already accepts all six canonical values → **full canonical DB sync possible without migration** (case A).
- No migration created in C1. Canonical DB sync deferred to C2.

## 7. Blockers

None identified. V34 already contains the canonical values; importer can preserve raw mapData as-is;
removing flyTo is a self-contained effect in CesiumMap; the Bạch Đằng deep module is not yet
integrated, so generic overview only needs to not depend on it.

## 8. Constraints

No DB access. No migration. No DOCX. No push/merge. Canonical dataset unchanged.
