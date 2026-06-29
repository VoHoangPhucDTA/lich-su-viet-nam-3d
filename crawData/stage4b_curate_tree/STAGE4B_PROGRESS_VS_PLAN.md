# Stage 4B Progress vs Plan

Cap nhat: 2026-06-27

## Muc tieu tu plan

Stage 4B (`stage4b_curate_tree`) la buoc hoan thien con thieu cua Giai doan 4, nam sau `stage4_assemble` va truoc Stage 5 enrichment.

Input chinh:

```text
stage4_assemble/output/final_events.jsonl
```

Muc tieu la bien dataset phang thanh dataset co cay su kien phuc vu ban do 3D, timeline va drill-down.

## Trang thai hien tai

- Da tao day du folder `stage4b_curate_tree/`.
- Da tao config nen va config review: root periods, merge aliases, parent rules, curation rules, force keep/supporting/remove/parent.
- Da tao cac script chinh: `curate_events.py`, `build_tree.py`, `validate_curated_tree.py`, `build_review_reports.py`.
- Phase 1 da chay thanh cong va sinh review outputs.
- Phase 2 da chay sau khi config duoc duyet.
- Phase 2.3 da hoan thanh schema/display cleanup va validator hardening.

## Checklist so voi plan

| Hang muc | Trang thai | Ghi chu |
|---|---|---|
| Tao thu muc `stage4b_curate_tree` | Done | Da co `config/`, `output/phase1/`, `output/phase2/`. |
| Tao config root periods | Done | Da co 9 root period synthetic trong `config/root_periods.json`. |
| Tao config merge aliases | Done | Da ap dung 10 duplicate groups approved. |
| Tao config parent rules | Done | Co rule deterministic va `force_parent.json` approved. |
| Tao force config | Done | `force_keep`, `force_supporting`, `force_remove`, `force_parent` da duoc dung trong Phase 2. |
| Phase 1 suggestion only | Done | Da sinh curation, merge, supporting/remove, parent va fallback-to-root review. |
| Hop nhat review cu A2.5 | Done | Da doc `stage4_assemble/output/event_display_review.md` neu ton tai. |
| Phase 2 build final curated output | Done | Da xuat core/supporting/removed/tree/hierarchy/merge_log/semantic_validation. |
| Validation tree invariants | Done | Validator hien pass voi validation errors = 0. |
| Display schema validation | Done | Phase 2.3 da ep display fields ve type dung va validate. |
| Mixed geoType review | Done | Chi thong ke/canh bao, khong auto-doi geoType trong Phase 2.3. |

## Ket qua Phase 1

- Input events: 407
- Proposed merge groups: 6
- Supporting suggestions: 50
- Remove suggestions: 0
- Fallback-to-root rows: 354

Output Phase 1:

```text
output/phase1/curation_review.md
output/phase1/merge_log.proposed.md
output/phase1/fallback_to_root_review.md
output/phase1/supporting_suggestions.jsonl
output/phase1/remove_suggestions.jsonl
output/phase1/parent_suggestions.jsonl
```

## Ket qua Phase 2.3

- Core nodes: 361
- Supporting items: 50
- Removed events: 0
- Root periods: 9
- Synthetic collection nodes tu `force_parent.json`: 6
- Total synthetic count: 15
- Collection count: 24
- Atomic count: 337
- Duplicate groups merged: 10
- Fallback-to-root count: 233
- Mixed geoType count: 107
- Mixed events with only markers and no polygon: 0
- Validation errors: 0
- Validation warnings: 5, da ghi trong `semantic_validation.md`

Output Phase 2:

```text
output/phase2/core_events.jsonl
output/phase2/supporting_items.jsonl
output/phase2/removed_events.jsonl
output/phase2/event_tree.json
output/phase2/hierarchy_seed.generated.json
output/phase2/merge_log.md
output/phase2/semantic_validation.md
```

## Cac moc da thuc hien

### Phase 2 hierarchy fix

- Merge `C:\Users\ADMIN\Downloads\force_parent.json` vao `config/force_parent.json`, giu cac root fix uu tien.
- Synthetic collection tao tu `force_parent.json` co `_synthetic=true` va `_syntheticCollection=true`.
- Synthetic collection co parent root explicit khong con fallback ve `viet-nam-1975-den-nay`.
- RootId cua node con duoc ke thua tu root dung sau khi build tree.
- Mismatch chronology/root co chu y duoc giu o muc warning.

### Phase 2.2 cleanup

- Merge `C:\Users\ADMIN\Downloads\force_supporting.json` vao `config/force_supporting.json` vi khong tim thay file dung ten `force_supporting.final_cleanup.json`.
- Khong thay doi `force_parent.json` trong buoc cleanup.
- Core dataset giam con 369 nodes, supporting tang len 42 items tai moc Phase 2.2.

### Phase 2.3 schema/display cleanup

- Normalize `display` de `showOnMap`, `showOnTimeline`, `showOnOverviewTimeline`, `featured` luon la boolean va `priority` luon la number.
- Them validator sections: `Display Type Validation`, `Tree Link Validation`, `Root Chain Validation`, `General Validation`, `Semantic Root Warnings`, `Mixed GeoType Review`.
- Them `force_parent` cho `my-can-thiep-vao-dong-duong` va `quan-li-hanh-chinh-chinh-quyen-sai-gon-hoang-sa-truong-sa`.
- Them 8 id non-event ro rang vao `force_supporting.json`.
- Acceptance pass: display type bad = 0, dangling parent = 0, dangling child = 0, root chain mismatch = 0, `no_location` showOnMap = 0.

## Quyet dinh an toan

- Khong sua Stage 1-4A.
- Khong sua `stage4_assemble/output/final_events.jsonl`.
- Khong chay Stage 5 enrichment trong Stage 4B.
- Khong auto-doi `geoType=mixed` trong Phase 2.3, chi thong ke de review sau.

## Buoc tiep theo

1. Tich hop `output/phase2/core_events.jsonl` va `output/phase2/event_tree.json` vao frontend/data pipeline.
2. Neu muon giam tiep fallback-to-root, duyet them `output/phase1/fallback_to_root_review.md` va bo sung collection/force_parent moi.
3. Stage 5 co the tiep tuc enrichment Wikipedia/media/associations/RAG tren output Phase 2.3.
