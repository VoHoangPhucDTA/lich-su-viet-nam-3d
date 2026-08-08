# Release evidence — Owner-approved canonical geography release (2026-08-04)

Phase B5 promoted the owner-approved technical geography release into the canonical dataset and
froze it in a local release commit on branch `data/geo-canonical-promotion`.

## Release facts

- Release date: 2026-08-04
- B1 commit: `f4b6f93e3a4ce88529dbbc2b08b3a70b0d9d502a`
- Previous canonical SHA-256: `4674284bed8be87e01045df88db90b8c4898fe0cc8a1c63baaaae5d1a3c1f1f9`
- New canonical SHA-256: `dfbe695d6eb12002be35d3e6430c97a3073cf2863222392ca53345f77707dfb2`
- Boundary GeoJSON SHA-256 (63-feature reference layer): `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`
  (files: `frontend/public/geojson/vietnam-provinces.json`, `MVP_KLTN/public/geojson/vietnam-provinces.json`)
- Decision origin: `owner_delegated_policy` (global decision `ACCEPT_GLOBAL_POLICY`)
- Records: 361; ID set and order preserved.

## Canonical dataset

- File: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`
- Projection: approved release minus `reviewMetadata` (kept in this evidence folder and in the
  approved geography artifact), re-serialized to the canonical schema/format. Only `mapData` and
  `display.showOnMap` differ from the previous canonical file; non-geography diff = 0.
- GeoType counts: `point` 46, `multi_point` 19, `multi_polygon` 24, `mixed` 0, `nationwide` 18,
  `no_location` 254.
- Map availability: renderable 89, non-renderable 272.
- Review status counts: `policy_auto_pass` 212, `owner_policy_approved` 84,
  `owner_approved_correction` 32, `owner_approved_no_geometry` 33.

## Caveat

This is an **owner-approved technical fail-closed geography release**. It is **not** expert
historical verification, not a full coordinate-accuracy certification, and not proof that every
event has been spatially reconstructed. The project retains its 63-province reference layer and
it does not represent current administrative boundaries. Events without adequate geometry
evidence may remain `no_location`. See `historical-verification-caveat.json` and
`APPROVED_RELEASE_REPORT.md`.

## GADM index

Option B applied: the GADM index is **not** committed. The pipeline regenerates it deterministically
before use (`prepare_indexes.build_gadm_index()` runs before `build_final_events.py`), producing
content identical to the B2-rebuilt index (verified byte-identical modulo line endings).
Regeneration: `python -X utf8 crawData/stage4_assemble/prepare_indexes.py`; input hash:
boundary GeoJSON `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`.
All `gadmRefs` in the promoted dataset resolve against the regenerated index (gadm-audit: 0 errors).

## Source paths (outside repository)

- Approved core release: `C:/Users/CITY/Desktop/geo-phase-b4-delegated-release/release/core_events.approved-release.jsonl` (SHA-256 `b2d81f479eb849a6a14eff25fb4dfb785581a5a22fb39505b74a5b26ecc95fc1`)
- Approved geography artifact: `C:/Users/CITY/Desktop/geo-phase-b4-delegated-release/release/approved_event_geography.jsonl`
- Decision manifest: `C:/Users/CITY/Desktop/geo-phase-b4-delegated-release/decision-manifest.json` (SHA-256 `467a0eb07e3cb2549d158eb96d5c4698db7ad5a0ff0a14200596cc634620533d`)
- Signed decisions: `C:/Users/CITY/Desktop/geo-phase-b4-delegated-release/signed-decisions/`
- B4-D package SHA-256: `d631817039bffe6492923b1ea0ab96e356fdb61cced570a30e52c597925bfbe2`

## Files

- `README.md` — this file
- `APPROVED_RELEASE_REPORT.md`, `DELEGATED_DECISION_REPORT.md` — Phase B4-D reports
- `approved-release-manifest.json`, `decision-manifest.json` — manifests
- `GLOBAL_POLICY_DECISION.signed.md` — signed global decision
- `final-decisions.signed.csv`, `final-decisions.signed.jsonl` — signed per-event decisions (88)
- `approved_event_geography.jsonl` — per-event approved geography (361 records, review metadata)
- `approved-geography-schema.json` — geography schema
- `historical-verification-caveat.json` — caveat record
- `release-checksums.sha256` — SHA-256 of every file in this folder

## Phase C

The original Phase C handoff used canonical SHA-256
`dfbe695d6eb12002be35d3e6430c97a3073cf2863222392ca53345f77707dfb2` before the hotfix below.

## GEOMETRY-HOTFIX-1

On 2026-08-08, `geometry-hotfix-1287-decision.json` superseded the original
signed fail-closed decision for only `khang-chien-chong-quan-nguyen-1287-1288`.
The signed B4-D files are retained unchanged as provenance. The current approved
projection is `multi_point` with Bạch Đằng, Cửa Lục, Thăng Long, and Vân Đồn;
province polygons and the administrative Quảng Ninh representative point remain
excluded. Downstream consumers must now use canonical logical SHA-256
`7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0`.
