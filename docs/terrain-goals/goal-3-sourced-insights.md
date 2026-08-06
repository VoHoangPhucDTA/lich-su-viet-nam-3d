# Goal 3-R.1 — Slug-only lookup, content layers và accessibility

## Trạng thái

- Goal 3 original: `BLOCKED — PENDING_MANUAL_SOURCE_VERIFICATION`
- Goal 3-R scope decision: `SCOPE_REDUCED_APPROVED`
- Goal 3-R.1 code: `PASS`
- Goal 3-R overall: `PARTIAL — manual UI pending`
- Manual UI: `PENDING_BACKEND_AND_DATABASE`
- Goal 4: `CHƯA BẮT ĐẦU`

Branch `view-terrain`; baseline HEAD `ccc8c59aca91c19ed296bb5ea813bbe1bacd6b2c`. Staging area trước và sau trống. Không reset, checkout, stash, clean, stage, commit hoặc push.

## Insight lookup

Policy: `SLUG_ONLY_FAIL_CLOSED`.

- Backend contract guarantees slug (`historical_events.slug VARCHAR(180) NOT NULL`; backend DTO `String slug`).
- Frontend adapter preserves only a real, trimmed API slug.
- `HistoricalEvent.slug` tiếp tục optional để không mở rộng thay đổi sang static path chưa audit.
- `event.id` không được dùng làm slug fallback.
- `stableEventIds` đã bị loại bỏ; không có stable runtime ID khác slug được suy đoán.
- Malformed/legacy payload thiếu hoặc có slug rỗng vẫn trả event; generic terrain flow còn hoạt động, nhưng sourced insight và custom CTA không xuất hiện.
- `EventPopup` lookup đúng một lần bằng `getTerrainInsightBySlug(event.slug)`; không hard-code production keys ngoài data module.

Adapter trước:

```ts
slug: dto.slug ?? dto.id
```

Adapter sau:

```ts
slug: normalizeEventSlug(dto.slug)
```

Legacy detail shape vẫn yêu cầu `slug: string`; payload detail thiếu slug được biểu diễn bằng `''`, không dùng ID/title và không tạo insight match.

## Source-layer separation

- `headline + explanation + sourceRef`: verified textbook layer.
- `observePoints`: reviewed observation prompts.
- `scopeNote`: project-data/tool scope limitation, không phải nội dung SGK.
- Target-list label: project map-data provenance.

### Điện Biên Phủ

- Headline: `Chiến dịch Điện Biên Phủ diễn ra qua ba đợt`
- Explanation: `SGK cho biết Chiến dịch Điện Biên Phủ diễn ra qua ba đợt, từ ngày 13-3-1954 đến ngày 7-5-1954.`
- Scope note: `Danh sách địa điểm lấy từ dữ liệu bản đồ của đề tài và không biểu diễn thứ tự từng đợt tiến công.`

### Kháng chiến 1287–1288

- Headline: `Vân Đồn, Vạn Kiếp và Bạch Đằng trong cuộc kháng chiến 1287–1288`
- Explanation: `SGK nêu các mốc Vân Đồn, Vạn Kiếp và Bạch Đằng trong cuộc kháng chiến năm 1287–1288. SGK cũng đưa ra nhận định chung rằng quân xâm lược thường gặp bất lợi vì không thông thạo địa hình và không chủ động được nguồn lương thực; nhận định này không được SGK nêu riêng cho cuộc kháng chiến năm 1287–1288.`
- Scope note: `Dữ liệu bản đồ của đề tài hiện chưa có tọa độ Vạn Kiếp.`
- CTA: `Xem không gian các trận đánh 1287–1288`

Cả hai entry vẫn `contextual`, không `decisive`, không preferred target; camera giữ `KEEP_OVERVIEW`.

## Accessibility

- `TerrainInsightCard` không phải live region.
- Trạng thái active `Đang xem địa hình…` dùng một status region nhỏ.
- Khi đổi target, chỉ dòng trạng thái được thông báo.
- Nội dung SGK, nguồn, `observePoints` và `scopeNote` không tự động được đọc lại như live content.
- Card tách ba DOM layer theo thứ tự sourced → observation → scope note.
- Dòng nguồn dùng nhãn `Nguồn:` và cỡ chữ `11.5px`.
- `scopeNote` nằm ngoài sourced block, sau observation list; không tạo node rỗng khi vắng mặt.
- `TerrainTargetList` bỏ `aria-label` trên outer div, dùng `useId()` và `aria-labelledby` trên node `role="list"`; accessible name lấy đúng visible text.
- Không đổi click/selection behavior, button icon, màu, callback, loading hoặc disabled behavior.

## Automated results

| Gate | Baseline | New | Delta | Exit |
|---|---:|---:|---:|---:|
| Focused | 13 files / 140 tests | 13 files / 147 tests | +0 files / +7 tests | 0 |
| Full | 82 files / 659 tests | 82 files / 669 tests | +0 files / +10 tests | 0 |
| Adapter/API focused | 1 file / 9 tests | 1 file / 12 tests | +0 files / +3 tests | 0 |
| Encoding | PASS | PASS | — | 0 |
| TypeScript | PASS | PASS | — | 0 |
| Lint | PASS | PASS | — | 0 |
| Vite smoke | PASS | PASS; 4196 modules, 474 copied items | — | 0 |

Ba test full-only bổ sung là adapter/API tests; vì vậy full delta `+10` bằng focused delta `+7` cộng adapter delta `+3`. Production build grep: `__CESIUM_DEBUG__=0`, `setTerrainCameraOverride=0`, `forceFallback=0`, `force-fallback=0`. Smoke output đã xóa.

## Phạm vi và vấn đề còn lại

- Source matrix giữ nguyên mọi status claim, bao gồm `NOT_SUPPORTED`.
- Manual UI vẫn `PENDING_BACKEND_AND_DATABASE`; cần kiểm tra hai production event, missing-slug/no-insight flow và exit terrain khi môi trường hoạt động.
- Không sửa camera, terrain provider, backend, database, canonical/static event data hoặc exam dataset.
- Không commit/push; Goal 4 chưa bắt đầu.
