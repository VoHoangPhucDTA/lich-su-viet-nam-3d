# Schema Canonical Decision

## Decision

GĐ4 giữ schema code hiện tại làm canonical: 17 top-level keys = 4 field định danh (`id`, `slug`, `entityType`, `eventLevel`) + 13 khối chức năng.

Lý do: output hiện tại đã validate PASS, frontend/map cần `display.showOnMap`, `mapData.geoType`, `marker`, `markers`, `provinceNames`, `gadmRefs` trực tiếp và dễ tiêu thụ hơn. Tài liệu/docx nên được cập nhật theo schema này thay vì đổi code theo docx cũ.

## So Sánh Code vs Docx Cũ

| Khu vực | Code canonical hiện tại | Docx cũ / lệch | Quyết định |
|---|---|---|---|
| Top-level | 17 keys cố định | từng gọi 15/16 khối | Chốt 17 top-level keys |
| `display` | `showOnMap`, `showOnTimeline`, `priority` | `showOnHomepage`, `showOnTimeline`, `featured` | Giữ code, vì map cần `showOnMap` |
| `sourcePolicy` | `primarySource`, `supplementalSources`, `lastUpdated` | `canonicalSource` | Giữ code; synthetic node sẽ dùng `primarySource="derived"` |
| `mapData` | `geoType`, `marker`, `markers`, `provinceNames`, `gadmRefs`, `focusGeometry` | tách `displayGeometry/focusGeometry` | Giữ code; trực tiếp hơn cho frontend |
| `textbookRefs` | trong `textbookContent.textbookRefs` | từng có file mẫu để top-level | Giữ trong `textbookContent` |
| debug fields | không xuất final | file mẫu cũ có `notes/merge/validation` | Không đưa vào canonical |

## Canonical 17 Keys

`id`, `slug`, `entityType`, `eventLevel`, `titles`, `classification`, `coverage`, `chronology`, `mapData`, `summary`, `textbookContent`, `externalContent`, `media`, `hierarchy`, `associations`, `display`, `sourcePolicy`.

## Notes For Frontend / GĐ5

- Không dùng `displayRole`.
- Node được chấm trên bản đồ khi `mapData.geoType != "no_location"` và có marker hợp lệ.
- Node level 0 có `geoType=no_location` sẽ không chấm ở tổng quan; frontend cần timeline/sidebar để không làm các node này biến mất.
