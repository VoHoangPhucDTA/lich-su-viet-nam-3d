# Stage 4B Curate Tree

Cap nhat: 2026-06-27

Stage 4B hoan thien cay su kien sau `stage4_assemble`. Day van la phan cua Giai doan 4, khong phai Stage 5. Stage 5 sau nay moi danh cho enrichment nhu Wikipedia, media, associations, RAG chunks.

Input chinh:

```text
stage4_assemble/output/final_events.jsonl
```

Stage 4B khong sua Stage 1-4A va khong sua `stage4_assemble/output/final_events.jsonl`.

## Workflow

Stage 4B chay theo hai pha:

1. Phase 1 chi sinh de xuat review, khong xuat dataset cuoi.
2. Phase 2 chi build dataset curated sau khi config da duoc duyet.

Lenh Phase 1:

```powershell
python -X utf8 stage4b_curate_tree/curate_events.py --phase 1
```

Lenh Phase 2:

```powershell
python -X utf8 stage4b_curate_tree/curate_events.py --phase 2
```

`config/curation_rules.json` hien da duoc duyet voi `phase2Approved=true`.

## Phase 1 Result

Phase 1 da chay thanh cong voi input `stage4_assemble/output/final_events.jsonl`:

- input events: 407
- proposed merge groups: 6
- supporting suggestions: 50
- remove suggestions: 0
- fallback-to-root rows: 354

Outputs review:

```text
stage4b_curate_tree/output/phase1/curation_review.md
stage4b_curate_tree/output/phase1/merge_log.proposed.md
stage4b_curate_tree/output/phase1/fallback_to_root_review.md
stage4b_curate_tree/output/phase1/supporting_suggestions.jsonl
stage4b_curate_tree/output/phase1/remove_suggestions.jsonl
stage4b_curate_tree/output/phase1/parent_suggestions.jsonl
```

## Phase 2.3 Result

Phase 2 da chay thanh cong sau cac buoc hierarchy fix, cleanup va schema/display cleanup:

- core nodes: 361
- supporting items: 50
- removed events: 0
- root periods: 9
- synthetic collection nodes from `force_parent.json`: 6
- total synthetic nodes: 15
- collection count: 24
- atomic count: 337
- duplicate groups merged: 10
- fallback-to-root count: 233
- mixed geoType count: 107
- mixed events with only markers and no polygon: 0
- validation errors: 0
- validation warnings: 5 semantic chronology/root warnings
- display type errors: 0
- dangling parent/child links: 0
- root chain mismatches: 0
- `no_location` with `showOnMap=true`: 0

Output final:

```text
stage4b_curate_tree/output/phase2/core_events.jsonl
stage4b_curate_tree/output/phase2/supporting_items.jsonl
stage4b_curate_tree/output/phase2/removed_events.jsonl
stage4b_curate_tree/output/phase2/event_tree.json
stage4b_curate_tree/output/phase2/hierarchy_seed.generated.json
stage4b_curate_tree/output/phase2/merge_log.md
stage4b_curate_tree/output/phase2/semantic_validation.md
```

## Config

- `config/root_periods.json`: 9 synthetic root periods.
- `config/merge_aliases.json`: approved duplicate groups.
- `config/parent_rules.json`: deterministic parent suggestion rules.
- `config/curation_rules.json`: Phase 2 approval and display/overview config.
- `config/force_keep.json`: manually approved core events.
- `config/force_supporting.json`: events moved to supporting items.
- `config/force_remove.json`: removed events, currently empty.
- `config/force_parent.json`: approved parent overrides and synthetic collection roots.

## Validator

`validate_curated_tree.py` currently checks:

- display field types
- parent/child two-way links
- dangling parent and child links
- rootId chain consistency
- level consistency
- atomic/collection invariants
- duplicate id/slug
- `no_location` with `showOnMap=true`
- merged ids still present in core
- semantic root chronology warnings
- mixed geoType statistics

Current validator result: validation errors = 0.
