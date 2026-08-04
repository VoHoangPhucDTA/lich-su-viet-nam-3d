# GEO Phase C2 — Plan: Guarded Canonical Geography Database Sync

**Status:** PLAN (approved for implementation)
**Date:** 2026-08-04
**Branch/worktree:** `feature/geo-canonical-db-sync` @ `C:\Users\CITY\Desktop\CLASS\KLTN\lich-su-viet-nam-3d-geo-db-sync`
**Base commit:** `6559acddfc5f8395a2ad08a5c9398bff7521aab5` (C1 canonical runtime)

## 1. Baseline (locked)

- Canonical dataset: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`
- Canonical SHA-256: `dfbe695d6eb12002be35d3e6430c97a3073cf2863222392ca53345f77707dfb2`
- Canonical record count: 361, zero duplicate IDs
- Canonical geoType counts: point=46, multi_point=19, multi_polygon=24, mixed=0, nationwide=18, no_location=254
- Boundary GeoJSON: `frontend/public/geojson/vietnam-provinces.json` (SHA `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`)
- C1 report: `docs/data/GEO_PHASE_C1_RUNTIME_REPORT.md`

## 2. Database identity (designated local target)

- Container: `mysql-lichsuvn-phase4a-local` (user-authorized to start)
- Host: `127.0.0.1` (loopback) port `3307` → container MySQL 8.4.8
- Database/catalog: `lichsuvn_phase4a`, user `lichsuvn_local`
- Flyway: 38 successful migrations (V1..V38), Flyway enabled by default in `application.properties`
- `historical_events` rows: 361 (matches canonical count; ID-set membership to be verified in preflight)
- Current geo_type distribution (pre-sync): single_point=23, multi_region=113, nationwide=56, no_location=169
- Credentials are never printed, never committed, and never placed in repo files.

**C1 report correction (schema):** C1 recorded `geo_type` as VARCHAR/TEXT. Actual schema (V2 + V34) is:

- `geo_type` **ENUM('single_point','multi_region','nationwide','no_location','point','multi_point','multi_polygon','mixed') NOT NULL** — the ENUM already contains all six canonical values, so a **data-only sync is possible without any migration**.
- `lat` DECIMAL(10,7) NULL; `lng` DECIMAL(10,7) NULL
- `province_names` JSON NULL (stored as JSON array of strings; `[]` for empty)
- `historical_locations` JSON NULL — **dedicated column exists** and is actively read by the detail mapper, so it belongs to the geography contract and is synchronized
- `raw_json` JSON NOT NULL — never null by constraint; may be malformed/non-object in content → blocked rows
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP — **second precision only** (no fractional seconds)
- Stable identity column: `id VARCHAR(160)` PRIMARY KEY
- `show_on_homepage` BOOLEAN — maps from `display.showOnMap` at import; **not** part of the C2 column allowlist (raw_json `display.showOnMap` is)

## 3. Fields the synchronizer MAY update (allowlist)

Top-level columns:

1. `historical_events.geo_type`
2. `historical_events.lat`
3. `historical_events.lng`
4. `historical_events.province_names`
5. `historical_events.historical_locations` (dedicated geography column, actively read by detail DTO)

Raw JSON paths (patched inside existing raw_json, never replacing it):

6. `raw_json.mapData` (replaced with canonical `mapData`)
7. `raw_json.display.showOnMap` (canonical `display.showOnMap`)

## 4. Fields that must NEVER be updated

title, slug, short_title, chronology (start_year/end_year/effective_end_year/display_date/date_precision), event_level, event_type, event_subtype, card_summary, canonical_summary, detailed_narrative, significance, key_facts, parent_id, root_id, level, order_in_parent, show_on_homepage, show_on_timeline, featured, status, content_hash, published_at, created_at, and every other raw_json path outside `mapData` and `display.showOnMap`.

A **non-geography canonical hash** (SHA-256 over a canonical projection of all non-allowlisted top-level geography-adjacent fields + raw_json minus the two patched paths) is computed before and after every row; any change blocks/blocks apply.

## 5. Projection rules (canonical record → DB)

- **point**: geo_type=point; lat/lng=marker.lat/lng; province_names=`[]`; showOnMap per release
- **multi_point**: geo_type=multi_point; primary marker must equal markers[0] (validated); lat/lng=primary marker; province_names=`[]`
- **multi_polygon**: geo_type=multi_polygon; lat/lng=NULL; province_names=mapData.provinceNames
- **mixed**: geo_type=mixed; lat/lng=primary marker; province_names=mapData.provinceNames
- **nationwide**: geo_type=nationwide; lat/lng=NULL; province_names=`[]`; showOnMap=false
- **no_location**: geo_type=no_location; lat/lng=NULL; province_names=`[]`; showOnMap=false

Never project from focusGeometry.center, polygon centroid, province centroid, camera center, or legacy top-level fallback.

## 6. Raw JSON patch strategy

1. Read existing `raw_json` (never null by constraint, but content validated).
2. Parse as JSON object; must contain the stable `id` matching the row.
3. Preserve every path outside `mapData` and `display.showOnMap` byte-identical (deep JSON, re-serialized deterministically by Jackson with fixed order).
4. Replace only `mapData` and `display.showOnMap`.
5. Compute non-geography projection hash before/after; must be equal.
6. Invalid raw_json (null-by-content, non-object, missing/inconsistent id) → row is **blocked**, apply prevented unless explicit reviewed policy exists (none in C2 → apply gate fails on any blocked row).
7. Parameterized JDBC only; no SQL string concatenation of JSON.

## 7. Transaction strategy

- Explicit Spring-managed transaction boundary on the apply service method (`@Transactional` via proxy) — consistent with `HistoryRagImportService.apply`.
- Any failed row, stale row, wrong affected-row count, or post-update verification failure → full rollback of all DB updates.
- No DDL inside the transaction; parameterized updates; per-row affected-count verification; no inserts/deletes.

## 8. Optimistic concurrency / stale detection

- `updated_at` has **second precision** (schema has no fractional seconds), so it is a secondary guard only.
- Primary strategy: `SELECT ... FOR UPDATE` inside the transaction, re-read the row, then verify:
  - event id
  - `updated_at` equals the dry-run captured value
  - current geography hash equals dry-run captured current hash
  - current non-geography hash equals dry-run captured hash
- Any mismatch → STALE_ROW → abort the entire transaction.
- Documented fallback satisfies the "no safe concurrency field" branch of the spec (row lock + re-verification).

## 9. Dry-run plan format

Immutable artifact `canonical-geo-sync-plan.jsonl`, one record per DB event:

- eventId, title (readability only)
- expectedUpdatedAt (string, as captured in dry-run)
- expectedCurrentGeoHash (SHA-256 of current geography projection)
- expectedCurrentNonGeoHash (SHA-256 of current non-geography projection)
- desiredGeoHash
- changedFields (list)
- beforeGeography (projection)
- afterGeography (projection)
- rawJsonGeoPatch (summary)
- updateRequired (bool)
- blockedReason (nullable)
- warnings

Plus: plan-summary.json, plan-summary.md, plan SHA-256, canonical SHA, DB fingerprint, Flyway version, timestamp, tool commit.

## 10. DB identity guard & fingerprint

`CanonicalGeographyDatasourceGuard` (mirrors `HistoryRagDatasourceGuard` style):

- JDBC URL must be `jdbc:mysql://` and host must be loopback (localhost/127.0.0.1/host.testcontainers.internal) — never TiDB/remote
- active profile must not be `remote-production`/`remote-release-*`
- expected database must match the guard result
- Flyway history present and expected version matches
- `historical_events` schema matches expected ENUM
- row count/identity shape plausible
- fingerprint (non-secret): hostClass, port, database, server version, schema hash, Flyway version, row count, sorted event ID-set hash
- Apply requires the exact fingerprint from the plan's dry-run

## 11. Feature flag / CLI gates

- Profile: `canonical-geo-sync` (non-web, mirrors `import-exams`/`history-rag-import` pattern)
- `--canonical-geo-sync.dry-run=true` default (never writes)
- `--canonical-geo-sync.allow-write=false` default
- Apply additionally requires: `--canonical-geo-sync.expected-canonical-sha=<full>`, `--canonical-geo-sync.expected-plan-sha=<full>`, `--canonical-geo-sync.expected-db-fingerprint=<safe>`, `--canonical-geo-sync.expected-flyway-version=<v>`, `--canonical-geo-sync.output-dir=<external>`
- Environment flag `APP_CANONICAL_GEO_SYNC_ENABLED=true`
- Apply consumes the exact plan file and verifies its SHA; no implicit re-plan
- No `--force`; explicit acknowledgement via the required gate flags (not an interactive prompt)

## 12. Rollback snapshot

- Before apply, export `rollback-snapshot.jsonl` (geo-only): eventId, geo_type, lat, lng, province_names, raw_json.mapData, raw_json.display.showOnMap, updated_at, geoHash, nonGeoHash
- Snapshot SHA-256 recorded
- Rollback tool restores only geography fields, requires post-apply release hash + DB fingerprint, transactional, never inserts/deletes, never auto-executed
- Rollback tested on a **disposable Testcontainers DB**, never on the synced local DB

## 13. Test matrix

Unit:

- projection for six types (incl. nationwide/no_location null lat/lng + empty province_names)
- invalid canonical type rejected
- raw JSON patch preserves non-geo paths (deep equality)
- plan hashing
- DB fingerprint construction + loopback/TiDB rejection
- field allowlist enforcement
- stale-row detection (hash mismatch, updated_at mismatch)
- expected update count
- idempotent comparison (second run → updateRequired=0)
- province_names serialization (`[]` vs list)

Testcontainers integration (disposable MySQL 8.0.36, Flyway V1..V38, seeded 361-ID fixture):

1. full apply converts legacy types; 2. raw mapData replaced; 3. non-geography preserved; 4. commit on success; 5. injected failure rolls back all; 6. stale updated_at rolls back; 7. wrong affected-row count rolls back; 8. malformed raw_json blocks apply; 9. canonical-only ID blocks; 10. DB-only ID untouched by policy (reported, not deleted); 11. second dry-run → zero updates; 12. old plan cannot reapply; 13. rollback snapshot restores disposable DB; 14. microsecond/second-precision updated_at behavior documented (row-lock strategy); 15. nationwide/no_location null projection; 16. no focusGeometry projection.

Regression: existing C1 backend tests (`EventGeoTypeTest`, `EventJsonImportRunnerGeoContractTest`, `EventJsonImportRunnerChronologyTest`) must stay green; full backend test suite if practical.

## 14. Local DB execution policy (order)

1. Implementation + unit + Testcontainers tests pass FIRST.
2. Read-only identity check (already performed minimally; full schema/version via tooling).
3. Read-only preflight → plan.
4. Stop and evaluate gates.
5. Apply only if every gate is clean.
6. Post-apply audit.
7. Second dry-run / idempotence.

No remote DB access under any condition. Dual-read (C1) retained.

## 15. Expected blockers / decisions

- `updated_at` second precision → row-lock strategy (documented; no migration).
- Legacy `multi_region` (113 rows) has insufficient info by itself → canonical source of truth is raw_json.mapData.geoType; the plan derives desired values from the canonical release, never guesses.
- `show_on_homepage` column intentionally NOT in allowlist (raw_json `display.showOnMap` is; column mapping is an import concern, out of C2 scope).

## 16. Commit gate

Commit only when: implementation + tests pass, canonical dataset unchanged, no migration, no frontend/runtime changes, no secrets or raw snapshots committed, `git diff --check` clean. Message: `feat(data): add guarded canonical geography database sync`.
