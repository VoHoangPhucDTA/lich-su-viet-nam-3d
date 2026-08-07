# GEO Phase C1 — Canonical Geography Runtime Contract

**Status:** COMPLETE
**Date:** 2026-08-04
**Branch:** feature/geo-canonical-runtime
**Worktree:** C:\Users\CITY\Desktop\CLASS\KLTN\lich-su-viet-nam-3d-geo-runtime

## 1. Baseline

- Base commit (canonical promotion): `531f3cdc47f551b1f378432be817831c14a55d5c`
- Canonical dataset: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`
- Canonical SHA-256: `dfbe695d6eb12002be35d3e6430c97a3073cf2863222392ca53345f77707dfb2`
- Boundary GeoJSON: `frontend/public/geojson/vietnam-provinces.json`
- Boundary SHA-256: `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`
- Release evidence: `docs/data/releases/geo-owner-approved-2026-08-04/`

## 2. Canonical contract

Six canonical GeoType values (only these are valid in the canonical runtime):

- `point` (46)
- `multi_point` (19)
- `multi_polygon` (24)
- `mixed` (0)
- `nationwide` (18)
- `no_location` (254)

Legacy values (`single_point`, `multi_region`, `polygon`, `unknown`) are NOT valid in the canonical runtime. There is no silent fallback to `no_location`.

## 3. Importer changes

File: `backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java`

- `mapData.geoType` is mapped verbatim to `historical_events.geo_type`.
- Legacy normalization (`point → single_point`, `multi_point → multi_region`, `multi_polygon → multi_region`, `mixed → multi_region`, `invalid → no_location`) is **removed**.
- Values outside the six canonical set **fail import** with a clear error recording event ID and the actual value (no fallback).
- Projection rules:
  - `point`: lat/lng from `marker`.
  - `multi_point`: lat/lng from primary marker; primary marker must equal `markers[0]` (otherwise import fails).
  - `multi_polygon`: lat/lng = null.
  - `mixed`: lat/lng from primary marker.
  - `nationwide`: lat/lng = null; `province_names` empty; no operational geometry.
  - `no_location`: lat/lng = null; `province_names` empty.
- lat/lng is never taken from `focusGeometry.center`, polygon centroid, province centroid, or camera center.
- `raw_json.mapData` is stored whole (geoType, marker, markers, provinceNames, gadmRefs, historicalLocations, focusGeometry). No field is dropped or restructured.

## 4. Backend changes

- New contract: `backend/src/main/java/com/lichsuvn/backend/event/domain/EventGeoType.java` — six canonical constants, `isCanonical`, `canonicalOrNull`, `dualRead` (legacy single_point → point; multi_region/polygon → raw mapData canonical or null).
- `EventReadService`: GEO_TYPES filter allowlist is now the six canonical values; legacy filter values are rejected with a clear validation error.
- `AdminService`: GEO_TYPES allowlist canonical. Geography is **read-only**: admin create defaults to `no_location`; update preserves existing geography unless the body matches it exactly; attempts to change geoType/lat/lng/provinceNames/historicalLocations independently throw a clear error. No new geography editor was built (out of scope for C1).
- `EventReadRepository`: dual-read + consistency guard — DB `geo_type` is compared to `raw_json.mapData.geoType`; mismatch prefers the canonical raw mapData value and logs a diagnostic; list, detail, admin, and related-events paths all use the canonical mapping. API responses are canonical only.
- Admin `event()` consistency guard: mismatch between top-level `geo_type` and `raw_json.mapData.geoType` logs a diagnostic and resolves canonically.

## 5. Frontend changes

- `frontend/src/types/event.ts`: `GeoType` is now exactly `'point' | 'multi_point' | 'multi_polygon' | 'mixed' | 'nationwide' | 'no_location'`. No primary model values (`single_point`, `multi_region`, `polygon`).
- `frontend/src/services/eventApi.ts`: canonical guard at the API boundary — a legacy value from the API logs a clear error and is not silently collapsed or guessed.
- `frontend/src/data/eventAdapter.ts`: canonical mapping; legacy adapter retained **only** for old fixtures/local snapshots (never applied to canonical API responses). Removed province-centroid/`focusGeometry` fallbacks for operational geometry; `provinceNames` is a display label only.
- `frontend/src/data/eventRegistry.ts`: `markers` added to the mapData type.
- `frontend/src/components/CesiumMap.tsx`: rendering by canonical type — point → single marker; multi_point → all markers (each linked to the same event); multi_polygon → polygons resolved via gadmRefs (provinceNames fallback only when sourceMapData is absent on summary-list events); mixed → markers + polygons; nationwide/no_location → nothing rendered. `focusGeometry` is never used for camera, markers, geoType, lat/lng, or terrain. Malformed/absent mapData fails closed (no geometry, dev diagnostic, no page crash). Missing `mapData` for summary-list events falls back to `primaryRegions` labels.
- `frontend/src/pages/MapPage.tsx` + `frontend/src/components/EventPopup.tsx`: event click sets the selected event and opens the right-side sidebar/popup; **no automatic flyTo**, no zoom, no terrain session, no scene-mode change, no selected-state loss on re-click. Generic terrain CTA, terrain target selector, overview/restore terrain session, and generic target camera controls were removed from the overview flow. The dedicated Bạch Đằng module (if present) is untouched and separated from the generic flow.
- GeoJSON conversion regression kept: GeoJSON position is [lng, lat], app marker is {lat, lng}.

## 6. Map UX behavior

- Overview map renders markers and/or representative polygons by canonical geoType.
- Click geometry → select event → open right-side sidebar/popup. No flyTo, no zoom, no terrain session, no scene-mode change.
- GeoType describes only overview-map representation.

## 7. DB schema finding (read-only, no connection)

- `geo_type` column: VARCHAR/TEXT (inserted via plain text parameter in AdminService; no ENUM/CHECK constraint observed in migrations).
- Full canonical DB sync is possible **without a migration** (C2 can do a data-only sync).
- No DB connection was made; no migration was created or run.

## 8. Tests

Backend (Maven):

- `EventGeoTypeTest` — 6 tests (six canonical types, legacy rejection, dual-read).
- `EventJsonImportRunnerGeoContractTest` — 3 tests (verbatim geoType, projection rules, invalid rejection, no focusGeometry projection).
- `EventJsonImportRunnerChronologyTest` — 12 tests, still green.
- Total: 21/21 passed, BUILD SUCCESS.
- Full backend compile: OK.

Frontend (Vitest):

- New: `frontend/src/services/__tests__/geoTypeCanonical.test.ts` — six-type parsing, legacy rejection, point/multi_point/multi_polygon/mixed/nationwide/no_location rendering contract, [lng,lat] ↔ {lat,lng}, primary marker handling.
- Updated fixtures: `EventCard.test.tsx`, `EventCardImageProfiles.test.tsx` (legacy `single_point` → canonical).
- Full suite: 605 tests pass.
- TypeScript (`tsc -b --noEmit`): clean.
- ESLint on changed files: clean.
- Production build (`vite build`): passes.

## 9. Data audit

- Canonical SHA-256 unchanged: `dfbe695d...` (committed blob matches; on-disk hash differs only by CRLF line endings; git shows no modification).
- 361 records parse.
- geoType counts: point=46, multi_point=19, multi_polygon=24, mixed=0, nationwide=18, no_location=254.
- No legacy geoType values in the canonical file.
- All GADM refs in the canonical file resolve against the 63-feature boundary GeoJSON.

## 10. git hygiene

- `git diff --check`: clean (exit 0).
- Canonical dataset untouched in the worktree.
- No DB, migration, DOCX, or runtime-data changes in the diff.

## 11. Remaining compatibility layer

- Legacy fixtures/local snapshots may use the adapter; canonical API responses never pass through the legacy adapter.
- Transitional dual-read in the backend exists for pre-sync DBs and logs diagnostics; it is temporary.

## 12. C2 prerequisites (exact)

- Full canonical DB sync of `historical_events.geo_type` (and lat/lng/province_names) to the six canonical values, possible without a schema migration.
- Remove or retire the transitional dual-read after sync, once metrics confirm zero legacy values.
- Optional: replace the temporary provinceNames-based fallback for summary-list multi_polygon events once detail-level sourceMapData is always present.

## 13. Confirmations

- Canonical dataset unchanged: YES.
- No DB accessed: YES.
- No migration created/run: YES.
- Module 3D chuyên sâu (Bạch Đằng) not modified: YES.
- No push, no merge: YES.
- No expert historical-verification claim: YES.
