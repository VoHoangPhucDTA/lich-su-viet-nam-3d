# Terrain 3D data audit

## Nguồn và phạm vi

- Ngày audit: `2026-07-20T04:33:44.898Z`.
- Nguồn event: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl` (SHA-256 `4674284bed8be87e01045df88db90b8c4898fe0cc8a1c63baaaae5d1a3c1f1f9`).
- GeoJSON: `frontend/public/geojson/vietnam-provinces.json` (SHA-256 `54275398c7054a9d035fc6adf657a6fdc4e11ba0492e942ca11b662a88da132f`).
- Command: `node scripts/terrain-audit/audit.mjs`.
- Phạm vi: canonical JSONL read-only và lookup exact `gadmRef ↔ GID_1`.
- Không kết nối database/API production, không chạy importer/migration và không sửa input.
- Database live: **DB_LIVE_UNVERIFIED**. Các chỉ số `raw_json`/normalized column của DB không được suy ra từ canonical source.

## Kết quả tổng quan

| Chỉ số | Kết quả |
|---|---:|
| Tổng dòng/event | 361 |
| Parse thành công | 361 |
| Parse lỗi | 0 |
| Source JSON hợp lệ | 361 |
| Có `mapData` | 361 |
| Eligible terrain | 136 |
| Ineligible | 225 |
| Coverage toàn dataset | 37.67% |
| Coverage nhóm theoretically supported | 100% |

## Geo type và eligibility

| Geo type | Total | Eligible | Ineligible |
|---|---:|---:|---:|
| `point` | 23 | 23 | 0 |
| `multi_point` | 4 | 4 | 0 |
| `multi_polygon` | 2 | 2 | 0 |
| `mixed` | 107 | 107 | 0 |
| `nationwide` | 56 | 0 | 56 |
| `no_location` | 169 | 0 | 169 |

Legacy: `single_point=0`, `multi_region=0`. Unknown/missing: 0.

## Point targets

- Marker đơn: 146 total; 146 hợp lệ; 0 lỗi.
- `markers[]`: 327 phần tử; 327 hợp lệ; 0 lỗi.
- Duplicate coordinate occurrences trong cùng event: 134; trong đó khác label: 23.
- Canonical point-type event không tạo được point target: 0.

Duplicate được tính trên cả `marker` và `markers[]` trong cùng event. Trùng cùng label thường là primary-marker mirror và không tự động bị coi là dữ liệu sai; trùng khác label phải được giữ hoặc review theo identity policy, không tự động xóa.

## Region targets và GADM

- Tổng `gadmRefs`: 380.
- Resolve exact `GID_1`: 380 (100%).
- Không resolve: 0.
- Duplicate ref trong cùng event: 0.
- Event lệch độ dài `gadmRefs[]`/`provinceNames[]`: 0.
- Resolved Polygon: 0; MultiPolygon: 380; other: 0.
- Canonical region-type event không tạo được region target: 0.

Audit chính không fuzzy-match tên tỉnh; suggestion bằng tên không được tính là resolved.

## Issues

| Mã lỗi | Số lượng |
|---|---:|
| `DUPLICATE_COORDINATE` | 111 |
| `DUPLICATE_COORDINATE_DIFFERENT_LABEL` | 23 |
| `UNSUPPORTED_NATIONWIDE` | 56 |
| `UNSUPPORTED_NO_LOCATION` | 169 |

Diagnostic chi tiết tối thiểu nằm trong `terrain-audit-issues.csv`; file không chứa raw JSON hoặc secret.

## Quality gates

| Gate | Kết quả |
|---|---|
| Mọi input được parse an toàn | **PASS** |
| Mọi coordinate được validate | **PASS** |
| Mọi region được hiển thị đều resolve bằng GID | **PASS** |
| Event lỗi không gây crash audit | **PASS** |
| Eligibility có thể xác định deterministic | **PASS** |
| Không sửa input/database | **PASS** |
| Coverage đủ cho demo khóa luận | **NEEDS_DECISION** |
| Frontend-only có khả thi | **CONDITIONAL** |

Coverage demo chưa có ngưỡng được product chốt nên giữ `NEEDS_DECISION`, dù số liệu thực được báo cáo đầy đủ.

## Điều chưa xác minh

- **DB_LIVE_UNVERIFIED:** số row có/parse được `raw_json`, tỷ lệ `sourceJson.mapData` ở API live và mismatch với normalized DB column.
- Coverage theo period không tính vì canonical source không có taxonomy period ổn định; không suy giai đoạn từ năm trong audit này.
- Token/provider/WebGL không thuộc data audit.

## Quyết định

**B — FRONTEND_ONLY_CONDITIONAL**.

Nguồn canonical giữ đầy đủ mapData và cho phép xác định target deterministic, nhưng độ tương đồng raw_json/sourceJson của database live chưa được xác minh; target lỗi hoặc không resolve phải bị loại an toàn.

Điều kiện trước Phase 1:

- Audit snapshot DB/staging read-only được phép để xác nhận raw_json và sourceJson.mapData tương đồng với nguồn canonical.
- Giữ sourceJson.mapData trong frontend detail mapper và validate mọi target trước khi bật CTA.
- Loại coordinate lỗi và GADM ref không resolve kèm diagnostic; không suy ranh giới lịch sử bằng fuzzy matching.
- Chọn các event eligible đại diện và duyệt ngưỡng coverage demo trước Phase 1.

Không cần backend change hoặc migration dựa trên canonical source hiện tại. Quyết định này phải được review lại nếu audit read-only DB/staging cho thấy `raw_json` thiếu hoặc không đồng bộ.
