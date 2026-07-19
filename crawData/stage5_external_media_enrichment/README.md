# Stage5 full re-review + external historical media enrichment

## Mục tiêu

Gói này nối liền hai phần:

1. **Kết quả full re-review 348 ảnh sách giáo khoa** đã hoàn tất.
2. **Bổ sung 2 ảnh web cho mỗi event còn hoàn toàn thiếu ảnh**.

Kết quả nền đã được xác định:

- `361` core events
- `121` ảnh sách giáo khoa được giữ
- `175` quan hệ ảnh → event
- `103` event đã có ít nhất một ảnh sau full re-review
- `258` event còn thiếu hoàn toàn
- mục tiêu bổ sung: `516` quan hệ ảnh web mới (`2 x 258`)
- nếu tất cả 258 event vượt review: `361` event có ảnh và tổng `691` quan hệ ảnh → event

Các con số này nằm trong `package_stats.json`.

## Trạng thái thực tế của gói này

### Đã hoàn thành

- xác định chính xác 258 event còn thiếu ảnh
- tạo sẵn 258 folder theo `eventId` trong `by_event/`
- mỗi folder có `event.json` và `sources.json` stub
- xây source plan theo thời kỳ/lĩnh vực
- giữ nguyên full re-review làm base chuẩn
- xây downloader 2 ảnh/event
- thêm bước tìm nguồn lịch sử đáng tin cậy
- thêm review UI cho 2 ảnh/event
- thêm validator riêng cho ảnh web
- thêm external finalizer
- thêm combined-candidate strategy để không phá hash/candidate safety
- thêm publisher v2 hỗ trợ cả thumbnail và `media.items[]`
- thêm activation tool cho full re-review base
- thêm tests

### Chưa thể materialize trong sandbox hiện tại

**516 file ảnh web thật chưa được tải xuống trong gói này.** Runtime hiện tại cho phép web search nhưng chặn public DNS/binary download từ container. Vì vậy không thể trung thực tuyên bố rằng 258 folder đã có đủ 2 file ảnh thật.

Khi chạy trong repo/Codex environment có Internet, `download_external_event_images.py` sẽ điền:

```text
external_event_images/
  assets/<sha256>.<ext>
  by_event/<eventId>/image_01.<ext>
  by_event/<eventId>/image_02.<ext>
```

## Quy tắc nguồn

Một ảnh được approve cần đồng thời có:

1. **Asset provenance/reuse**: file ảnh có nguồn và license rõ.
2. **Historical verification**: có URL từ một domain lịch sử/chính thống phù hợp event.
3. **Relationship**: chỉ `direct` hoặc `strong_contextual`.

Không approve dựa trên score, token match, same lesson, same period, hay chủ đề rộng.

Chi tiết: `SOURCE_POLICY.md`.

## File quan trọng

### Full re-review base

```text
reviewed_base/
  approved_event_image_mappings_reviewed.json
  manual_review_decisions_reviewed_v2.json
  full_review_audit.json
  full_review_summary.csv
```

`approved_event_image_mappings_reviewed.json` là artifact chuẩn để activate. Không rebuild nó từ current `finalize_manual_review.py`, vì full re-review có multi-event và đã giải quyết thumbnail/gallery arbitration.

### Acquisition/integration

```text
activate_full_rereview.py
prepare_external_event_media.py
discover_trusted_verification_sources.py
download_external_event_images.py
review_external_event_media.py
validate_external_event_media.py
finalize_external_event_media.py
publish_approved_media_v2.py
```

### Index và plan

```text
event_source_plan.json
event_folder_index.csv
missing_events.tsv
package_stats.json
by_event/<258 event IDs>/...
```

## Luồng tích hợp khuyến nghị

1. Activate full re-review base bằng dry-run.
2. Validate base bằng validator hiện có.
3. Chỉ sau khi kiểm tra preview mới `--apply` base.
4. Discover authoritative verification pages cho 258 event.
5. Download 2 reviewable images/event.
6. Review nhanh qua local UI.
7. Validate external package.
8. Finalize external mappings + combined candidates/config preview.
9. Validate combined config với validator hiện có.
10. Thay/merge publisher bằng `publish_approved_media_v2.py`.
11. Run tests, publish, verify.
12. Sau đó mới DB/API/UI.

Xem lệnh đầy đủ trong `RUNBOOK.md`.

## Nguyên tắc quan trọng

- 103 event đã có ảnh từ full re-review **không được external phase tự động bổ sung/chèn đè**.
- 258 event mới nhận đúng 2 ảnh khi đủ tiêu chuẩn.
- Slot 1: thumbnail, `sortOrder=1`.
- Slot 2: gallery item, `sortOrder=2`.
- Một physical asset có thể dùng cho nhiều event nếu thực sự hợp lệ; canonical asset dedupe bằng SHA-256.
- Nếu không tìm được ảnh đúng: để unresolved/needs replacement, không nhét ảnh chung chung cho đủ số lượng.
