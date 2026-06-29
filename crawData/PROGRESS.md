# Tien trinh du an

Cap nhat: 2026-06-27

Tai lieu nay tom tat trang thai pipeline du lieu trong `crawData`, tu crawl SGK den output cay su kien da curate cho frontend map/timeline/drill-down.

---

## Giai doan 1: Crawl SGK - `stage1_crawl`

**Trang thai: Hoan thanh**

- Da crawl/parse SGK Lich su KNTT lop 10, 11, 12.
- Tong cong 47 bai hoc, bao gom bai 9 lop 12 duoc bo sung qua OCR.
- Du lieu goc van duoc luu de tai xu ly offline: `raw_html/`, `images/`, va cac JSON lop.

---

## Giai doan 2: Trich xuat su kien bang LLM - `stage2_extract`

**Trang thai: Hoan thanh**

- Da trich xuat cau truc event/concept tu noi dung SGK.
- Ket qua goc duoc ghi vao `stage2_extract/output/event_candidates.jsonl`.
- Validation chronology cua Stage 2 da pass o thoi diem chot output.

---

## Giai doan 3: Dedup va dia ly hoa - `stage3_dedup`

**Trang thai: Hoan thanh cho input Stage 4**

- File dau ra su dung cho Stage 4: `stage3_dedup/stage3_review_submission/deduped_events.jsonl`.
- Input Stage 4 ghi nhan 680 dong event da dedup/review.
- Location dictionary trong review package co 474 dia danh goc; Stage 4 location index co 475 dia danh sau khi bo sung alias.

---

## Giai doan 4A: Assemble canonical dataset - `stage4_assemble`

**Trang thai: PASS**

- Transform deterministic sang canonical schema 17 top-level keys.
- Dau ra chinh: `stage4_assemble/output/final_events.jsonl`.
- So event hien tai: **407 final events**.
- Validator Stage 4A: **PASS**, errors = 0, warnings = 0.
- GeoType counts hien tai: `mixed` 124, `multi_point` 8, `multi_polygon` 2, `nationwide` 50, `no_location` 199, `point` 24.

---

## Giai doan 4B: Curate tree - `stage4b_curate_tree`

**Trang thai: Phase 2.3 hoan thanh**

Stage 4B la buoc hoan thien con thieu cua Giai doan 4, nam sau Stage 4A va truoc Stage 5 enrichment. Stage nay khong sua Stage 1-4A; input chinh la:

```text
stage4_assemble/output/final_events.jsonl
```

### Phase 1

- Input events: 407
- Proposed merge groups: 6
- Supporting suggestions: 50
- Remove suggestions: 0
- Fallback-to-root rows: 354

Output review nam trong:

```text
stage4b_curate_tree/output/phase1/
```

### Phase 2.3 output

Output cuoi nam trong:

```text
stage4b_curate_tree/output/phase2/
```

Ket qua hien tai:

- Core events/nodes: **361**
- Supporting items: **50**
- Removed events: **0**
- Root periods synthetic: **9**
- Synthetic collection nodes: **6**
- Total synthetic nodes: **15**
- Collection count: **24**
- Atomic count: **337**
- Duplicate groups merged: **10**
- Fallback-to-root count: **233**
- Mixed geoType count: **107**
- Mixed events with only markers and no polygon: **0**
- Validation errors: **0**
- Validation warnings: **5** semantic root/chronology warnings duoc chap nhan

Validator Stage 4B hien co cac nhom check:

- Display type validation
- Tree link validation
- Root chain validation
- General validation
- Semantic root warnings
- Mixed geoType review

Acceptance Phase 2.3 da pass:

- Khong con `display.showOnOverviewTimeline` kieu list.
- Tat ca `display.showOnMap`, `display.showOnTimeline`, `display.showOnOverviewTimeline`, `display.featured` la boolean.
- `display.priority` la number.
- Dangling parent/child = 0.
- Parent-child two-way link pass.
- Root chain mismatch = 0.
- `no_location` nhung `showOnMap=true` = 0.

---

## Buoc tiep theo

1. Tich hop `stage4b_curate_tree/output/phase2/core_events.jsonl` va `event_tree.json` vao frontend/data pipeline.
2. Neu can giam tiep core dataset, tiep tuc review supporting/fallback rows thay vi sua Stage 1-4A.
3. Stage 5 moi bat dau enrichment: Wikipedia, media, associations, RAG chunks.
