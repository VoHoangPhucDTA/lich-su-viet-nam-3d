# Kết quả chức năng

## Verification tự động và dữ liệu

| Hạng mục | Trạng thái | Chứng cứ |
|---|---|---|
| Point normalization và coordinate validation | PASS | MEASURED — Vitest |
| Multi-point giữ duplicate coordinate với stable ID | PASS | MEASURED — Vitest |
| Multi-polygon exact GID, MultiPolygon parts và holes | PASS | MEASURED — Vitest + audit |
| Mixed loại mirror nhưng giữ target khác biệt | PASS | MEASURED — Vitest |
| Mixed còn eligible khi một target kind lỗi | PASS | MEASURED — Vitest |
| Nationwide không eligible | PASS | MEASURED — Vitest |
| No-location không eligible | PASS | MEASURED — Vitest |
| Target/overview chỉ đổi khi session active | PASS | MEASURED — reducer test |
| Provider → camera → polygon render thật | BLOCKED | Thiếu local token và backend local an toàn |

## Functional matrix runtime

Các thao tác CTA, camera fly/restore, polygon picking, target switching và terrain relief thật là `UNVERIFIED`. Source và unit tests chứng minh contract/state/geometry, nhưng không thay thế runtime WebGL.

- Point: contract PASS; CTA/provider/camera/cleanup runtime BLOCKED.
- Multi-point: target count/stable ID PASS; liên tiếp chọn target và snapshot runtime UNVERIFIED.
- Multi-polygon: exact lookup, bounds mọi part và holes PASS; rendering/click/highlight runtime UNVERIFIED.
- Mixed: normalization và partial-target survival PASS; point ↔ region runtime UNVERIFIED.
- Nationwide/no-location: reducer/normalizer không tạo target PASS; UI runtime với detail API BLOCKED.

Không phát hiện functional bug mới có bước tái hiện hợp lệ trong môi trường hiện tại.
