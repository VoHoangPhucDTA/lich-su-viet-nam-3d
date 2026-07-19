# Prompt đưa cho Codex ở phase tiếp theo

Bạn đang tiếp tục Stage5 media enrichment trong một codebase đã có post-review pipeline ổn định. Hãy đọc toàn bộ repo và package external-media trước khi sửa code.

## Mục tiêu cuối

Tích hợp hai lớp dữ liệu:

1. **Full re-review đã hoàn tất cho toàn bộ 348 textbook-image candidate records**.
2. **Bổ sung đúng 2 ảnh web cho mỗi core event hiện còn hoàn toàn thiếu ảnh**.

Không được dùng local score, token match, top-1 suggestion, same lesson hay nearby chronology làm bằng chứng approve.

## Nguồn package

Package có các artifact sau:

```text
reviewed_base/approved_event_image_mappings_reviewed.json
reviewed_base/manual_review_decisions_reviewed_v2.json
reviewed_base/full_review_audit.json
reviewed_base/full_review_summary.csv

activate_full_rereview.py
prepare_external_event_media.py
discover_trusted_verification_sources.py
download_external_event_images.py
review_external_event_media.py
validate_external_event_media.py
finalize_external_event_media.py
publish_approved_media_v2.py

event_source_plan.json
event_folder_index.csv
missing_events.tsv
package_stats.json
SOURCE_POLICY.md
INTEGRATION_CONTRACT.md
RUNBOOK.md
```

## Baseline đã được xác minh

```text
coreEvents = 361
reviewed textbook approved images = 121
reviewed textbook image-event relationships = 175
reviewed textbook covered events = 103
missing events = 258
required external assignments = 516
expected final relationships if complete = 691
```

`reviewed_base/approved_event_image_mappings_reviewed.json` đã pass:

```text
validate_approved_mappings.py
warnings = 0
errors = 0
```

## Ràng buộc cực kỳ quan trọng

### 1. Không rebuild full re-review bằng legacy finalizer

Current `finalize_manual_review.py` là finalizer tốt cho workflow decisions hiện tại, nhưng full re-review hoàn tất có:

- multi-event relationships
- thumbnail arbitration
- gallery relationships
- dedupe decisions

Vì vậy **không** feed `manual_review_decisions_reviewed_v2.json` vào current legacy finalizer để tái tạo config.

Hãy dùng:

```text
activate_full_rereview.py
```

để validate rồi activate trực tiếp artifact final:

```text
reviewed_base/approved_event_image_mappings_reviewed.json
```

Dry-run trước. Không `--apply` cho đến khi preview và validator đều sạch.

### 2. Current 4-image config bị full re-review supersede

Full re-review đã xét lại toàn bộ 348 records, kể cả những record cũ từng approved/deferred/no_suitable. Vì vậy current config 4 mapping không phải source of truth cuối.

Khi activate full re-review:

- backup current approved config
- replace bằng full re-review artifact sau dry-run + validation
- không merge mù 4 mapping cũ vào vì có thể duplicate/stale

### 3. External phase chỉ chạy cho 258 event còn hoàn toàn thiếu ảnh

Sau khi activate base, recompute missing set từ:

```text
361 core events - covered event IDs in approved mappings
```

Expected exact count:

```text
258
```

Nếu không phải 258, dừng và điều tra. Không tiếp tục acquisition trên một missing set sai.

### 4. Mỗi missing event cần 2 ảnh

```text
slot 1 = thumbnail, isThumbnail=true, sortOrder=1
slot 2 = gallery, isThumbnail=false, sortOrder=2
```

Folder:

```text
crawData/stage5_media_enrich/external_event_images/
  assets/<sha256>.<ext>
  by_event/<eventId>/image_01.<ext>
  by_event/<eventId>/image_02.<ext>
```

Canonical assets dedupe bằng SHA-256; event folders dùng hardlink/copy.

### 5. Mỗi ảnh phải qua 3 gate

#### Gate A — provenance/license

Auto-download chỉ dùng ảnh có explicit reusable status:

- Public Domain
- CC0
- CC BY
- CC BY-SA

Không auto-publish:

- fair use
- all rights reserved
- NC
- ND

#### Gate B — historical verification

Mỗi slot phải có `historicalVerificationUrl` thuộc trusted historical/official domain của event.

Ví dụ source families dùng:

```text
baotanglichsu.vn
luutru.gov.vn
hochiminh.vn
tulieuvankien.dangcongsan.vn
dangcongsan.vn
qdnd.vn
nhandan.vn
vietnamplus.vn
chinhphu.vn
quochoi.vn
mofa.gov.vn
un.org
unesco.org
asean.org
europa.eu
```

Không coi Wikipedia/Commons/search rank là historical evidence cuối. Commons có thể là reusable asset host; historical correctness phải được corroborate bởi trusted source.

#### Gate C — relation

Chỉ approve:

```text
direct
strong_contextual
```

Reject generic thematic/same-era/same-token matches.

### 6. Không force completeness bằng ảnh sai

Target là 516 assignments, nhưng nếu event không có 2 ảnh đạt chuẩn:

```text
needs_replacement / unresolved
```

Không nhét ảnh stock/generic để đủ số.

## Công việc cần thực hiện

### Phase 1 — inspect and integrate files only

1. Đọc:
   - current `finalize_manual_review.py`
   - current `validate_approved_mappings.py`
   - current `publish_approved_media.py`
   - current `verify_media_pipeline.py`
   - current tests
   - package `SOURCE_POLICY.md`
   - package `INTEGRATION_CONTRACT.md`

2. Copy/add integration scripts vào Stage5 theo repo conventions.

3. Không xoá các tool post-review hiện có.

4. Run `py_compile` và package tests.

### Phase 2 — activate full re-review base

Run dry-run:

```powershell
python -X utf8 crawData/stage5_media_enrich/activate_full_rereview.py `
  --reviewed-mappings <PACKAGE>/reviewed_base/approved_event_image_mappings_reviewed.json `
  --approved-mappings crawData/stage5_media_enrich/config/approved_event_image_mappings.json `
  --candidates crawData/stage5_media_enrich/output/image_event_candidates.jsonl `
  --core-events crawData/stage4b_curate_tree/output/phase2/core_events.jsonl `
  --validator crawData/stage5_media_enrich/validate_approved_mappings.py `
  --preview-output crawData/stage5_media_enrich/output/full_rereview_activation_preview.json
```

Verify exact stats:

```text
approvedImages = 121
relationships = 175
targetEvents = 103
thumbnails = 103
validator warnings = 0
validator errors = 0
```

Only then apply. Keep backup.

### Phase 3 — exact missing plan

Recompute via `prepare_external_event_media.py`.

Require:

```text
missingEventCount = 258
requiredImageAssignments = 516
```

### Phase 4 — trusted source discovery

Run:

```text
discover_trusted_verification_sources.py
```

Store:

```text
output/authoritative_verification_sources.json
```

If network search backend fails for some events, preserve unresolved list and use exact manual overrides. Do not silently fall back to untrusted pages.

### Phase 5 — download 2 candidates/event

Run:

```text
download_external_event_images.py
```

with:

```text
--plan
--verification-manifest
--overrides
--output-root
```

The script should write the exact folder structure above plus:

```text
external_event_image_manifest.json
unresolved_events.json
```

### Phase 6 — review/check

Launch:

```text
review_external_event_media.py
```

The reviewer UI must show:

- image
- event title/date/id
- asset source page
- license/provenance metadata
- trusted historical verification URL
- relation type

An event cannot be approved unless both slots are approved and each has a trusted historical verification URL.

### Phase 7 — validate external set

Run:

```text
validate_external_event_media.py --require-all-reviewed
```

No approved external image may lack:

- local file
- matching hash
- provenance
- historical verification URL
- direct/strong_contextual relation

### Phase 8 — finalize external + combined preview

Run:

```text
finalize_external_event_media.py
```

Expected outputs:

```text
approved_external_event_image_mappings.json
approved_event_image_mappings_combined_preview.json
external_event_image_candidates.jsonl
combined_image_candidates.jsonl
external_media_finalize_report.json
```

External candidates use:

```text
lessonId = external-web
sourceType = external-web
contentHash = sha256
```

Do not weaken candidate/hash safety.

### Phase 9 — validate combined config

Use current validator with:

```text
approved mappings = combined preview
candidates = combined_image_candidates.jsonl
core events = core_events.jsonl
```

Must be zero errors.

### Phase 10 — publisher integration

Current publisher has known restriction:

```text
only thumbnail relationships are supported in this slice
```

That restriction is incompatible with:

- the completed full re-review, which already has non-thumbnail relationships
- the new 2-images/event external phase

Use the behavior in `publish_approved_media_v2.py` to patch/replace publisher while preserving all existing safety checks.

Required mapping:

```text
isThumbnail=true  -> media.thumbnail
isThumbnail=false -> media.items[]
```

Gallery item:

```json
{
  "type": "image",
  "url": "/media/event-images/<sha256>.<ext>",
  "caption": "...",
  "sortOrder": 2
}
```

Do not duplicate thumbnail URL into `media.items[]`.

### Phase 11 — verification

Run all existing plus new tests:

```text
test_post_review_pipeline.py
test_manual_review_tool.py
package tests/test_external_media_pipeline.py
package tests/test_external_finalizer.py
validate_approved_mappings.py --self-test-mojibake
validate_approved_mappings.py
verify_media_pipeline.py
py_compile
```

Keep counts dynamic. No hardcoded `4`, `103`, `258`, `516`, or `691` in production logic; those values are only expected checkpoints for this dataset.

### Phase 12 — safety boundary

During this Codex phase:

- do not import DB until publish verification is clean
- do not modify backend/frontend production behavior except publisher media enrichment support required here
- do not call live API
- do not delete current post-review tools
- do not publish before combined config validation
- do not hide unresolved events

## Deliverable response expected from Codex

Report:

1. files added/modified
2. activation dry-run result
3. whether base was applied
4. exact missing event count
5. trusted-source discovery counts
6. download counts
7. unresolved/needs replacement counts
8. review status counts
9. final combined mapping counts
10. validator/test results
11. publisher/verify results
12. exact next action, if any

If network access is unavailable, stop after code integration + dry-run tests and report clearly that image bytes were not materialized. Do not fabricate downloaded images or source provenance.
