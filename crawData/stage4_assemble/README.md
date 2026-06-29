# Stage 4A Assemble

Stage 4A transform deterministic tu `stage3_review_submission/deduped_events.jsonl` sang canonical schema cho web. Stage nay la candidate generation/output canonical truoc khi sang Stage 4B curate tree.

## Current Inputs

- Stage 3 events: 680 dong trong `stage3_dedup/stage3_review_submission/deduped_events.jsonl`.
- Stage 3 locations: 474 dia danh goc trong `stage3_dedup/stage3_review_submission/locations_dict.json`.
- Stage 4 location index: 475 dia danh sau khi them alias `Da Chu Thap -> Chu Thap`.

## Current Output

- Final candidate dataset: `stage4_assemble/output/final_events.jsonl`
- Event count: 407
- Validation: PASS, errors = 0, warnings = 0
- Canonical schema: 17 top-level keys

Stage 4A output van la candidate dataset phang. Cay su kien/curation cuoi nam o Stage 4B:

```text
stage4b_curate_tree/output/phase2/core_events.jsonl
stage4b_curate_tree/output/phase2/event_tree.json
stage4b_curate_tree/output/phase2/supporting_items.jsonl
```

## Commands

```powershell
python -X utf8 stage4_assemble/build_vietnam_candidates.py
python -X utf8 stage4_assemble/build_vietnam_include_suggestion.py
python -X utf8 stage4_assemble/apply_stage4A_include_fix.py
python -X utf8 stage4_assemble/prepare_indexes.py
python -X utf8 stage4_assemble/build_final_events.py
python -X utf8 stage4_assemble/build_event_display_review.py
python -X utf8 stage4_assemble/validate_stage4.py
```

## Canonical Schema

Stage 4A giu schema code hien tai lam canonical: 17 top-level keys = `id`, `slug`, `entityType`, `eventLevel` + 13 khoi chuc nang (`titles`, `classification`, `coverage`, `chronology`, `mapData`, `summary`, `textbookContent`, `externalContent`, `media`, `hierarchy`, `associations`, `display`, `sourcePolicy`).

Chi tiet quyet dinh schema nam o `output/schema_canonical_decision.md`.

## Manual Files

- `config/manual_vietnam_include.json`: whitelist event `region=world` nhung thuoc pham vi Viet Nam.
- `config/manual_geotype_override.json`: override cac ca geoType can quyet dinh tay.
- `config/associations_seed.json`: tuy chon, de bo sung lien ket su kien thu cong o giai doan sau.
- `config/hierarchy_seed.json`: parent/child seed cu cua Stage 4A; hierarchy final hien nam o Stage 4B.
- `config/manual_coords_override.json`: override toa do khi location dictionary thieu hoac sai.
- `config/province_aliases.json`: alias dia danh/tinh sang GADM `NAME_1`.
- `config/region_province_map.json`: map vung lich su/dia ly sang danh sach tinh GADM.

## Boundary

Stage 4A khong sua/cat giam thanh final curated tree. Khong chay Stage 5 enrichment tai day. Stage 4B moi xu ly merge approved, supporting/core split, synthetic roots, tree hierarchy va semantic validation.
