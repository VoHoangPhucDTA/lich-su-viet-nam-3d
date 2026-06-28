# Stage 1 Crawl Status

Cap nhat: 2026-06-27

File nay ghi trang thai hien tai cua Stage 1 va snapshot nhanh cua pipeline du lieu sau khi da chay den Stage 4B Phase 2.3.

## Stage 1

**Trang thai: Hoan thanh**

- Da crawl/parse SGK Lich su KNTT lop 10, 11, 12.
- Tong cong 47 bai hoc sau khi bo sung bai 9 lop 12 qua OCR.
- Du lieu goc duoc giu lai de tai xu ly offline:
  - `raw_html/`
  - `images/`
  - `lich_su_10_kntt.json`
  - `lich_su_11_kntt.json`
  - `lich_su_12_kntt.json`

## Pipeline Snapshot

- Stage 2 extraction: da tao `stage2_extract/output/event_candidates.jsonl`; chronology validation pass tai thoi diem chot output.
- Stage 3 dedup/review package: 680 events trong `stage3_dedup/stage3_review_submission/deduped_events.jsonl`.
- Stage 4A assemble: 407 final candidate events trong `stage4_assemble/output/final_events.jsonl`; validator PASS, errors = 0, warnings = 0.
- Stage 4B curate tree Phase 2.3:
  - core nodes: 361
  - supporting items: 50
  - removed events: 0
  - synthetic root periods: 9
  - synthetic collection nodes: 6
  - validation errors: 0
  - validation warnings: 5 semantic root/chronology warnings

## Stage 1 Known Limitations

- Mot so sitemap cua `sgkvn.com` khong index day du URL; `lessons_urls.py` van la source cau hinh chinh khi can bo sung bai.
- Parser van uu tien offline/resume tu HTML da luu de tranh request lai.
- Cac cai tien parser co the lam sau neu can: nested lists, page range theo bai, va validation block chi tiet hon.

## Next Steps

- Khong can chay lai Stage 1 neu khong bo sung nguon SGK moi.
- Neu can Stage 5 enrichment, dung output Stage 4B Phase 2.3 lam input chinh:

```text
stage4b_curate_tree/output/phase2/core_events.jsonl
stage4b_curate_tree/output/phase2/supporting_items.jsonl
stage4b_curate_tree/output/phase2/event_tree.json
```
