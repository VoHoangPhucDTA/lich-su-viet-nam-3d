# Kế hoạch triển khai “Xem địa hình 3D”

## Phạm vi

Bộ tài liệu này chỉ phân tích runtime `/map`, popup sự kiện, Cesium, mapper Event API và Event read flow cần cho MVP xem địa hình thật theo target. Đây là **planning only**: chưa sửa source, chưa áp dụng patch tham khảo, chưa chạy importer/migration và chưa đụng image/media mapping.

Canonical contract của kế hoạch gồm đúng sáu `geo_type`: `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, `no_location`. `single_point` và `multi_region` chỉ là input legacy cần tương thích, không phải contract mới.

## Git baseline — 2026-07-20

Các lệnh bắt buộc đã chạy trước khi phân tích:

```text
git status --short
git branch --show-current
git diff --stat
```

Kết quả:

```text
branch: main
tracked diff: none
untracked trước nhiệm vụ:
  .editorconfig
  PULL_REQUEST_UI_REFACTOR.md
  TERRAIN_3D_IMPLEMENTATION_REPORT.md
  docs/terrain-3d-analysis/
  docs/terrain-3d-plan/
  docs/ui-refactor/
  terrain-3d-implementation-patch.zip
  terrain-3d-implementation-source.zip
  terrain-3d-implementation.patch
```

`docs/terrain-3d-plan/` đã tồn tại ở baseline với 11 tệp planning tên cũ. Theo yêu cầu hiện tại, nội dung đó được hợp nhất thành đúng sáu tệp mới trong cùng thư mục. Các mục untracked khác được giữ nguyên.

## Build/test baseline

Chạy từ `frontend/`:

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | PASS | Typecheck hiện tại pass. |
| `npm test` | PASS | 1 test file, 4 tests. |
| `npm run lint` | FAIL baseline | 38 errors, 6 warnings; trong phạm vi terrain có lỗi sẵn ở `CesiumMap.tsx` và `MapPage.tsx`, ngoài ra còn nhiều module ngoài phạm vi. |
| `npm run build` | NOT RUN | `prebuild` gọi `build:data`, có thể ghi manifest/index; tránh phát sinh file ngoài tài liệu trong phiên planning (`frontend/package.json:12-16`). Typecheck được dùng làm build gate tĩnh. |

Lần chạy đầu trong sandbox bị `EPERM` khi Node truy cập runtime ngoài workspace; chạy lại ngoài sandbox cho các kết quả trên. Lần gọi typecheck đầu dùng cú pháp `npm exec` bị npm hiểu sai tham số; kết quả authoritative là lệnh `npx tsc` đã PASS.

## Tệp đã đọc

Tài liệu đọc trước source:

- `docs/terrain-3d-analysis/00_README.md`
- `docs/terrain-3d-analysis/03_MAP_AND_CESIUM_CURRENT_FLOW.md`
- `docs/terrain-3d-analysis/04_GEO_DATA_CONTRACT.md`
- `docs/terrain-3d-analysis/05_BACKEND_API_CONTRACT.md`
- `docs/terrain-3d-analysis/06_FEATURE_GAP_ANALYSIS.md`
- `docs/terrain-3d-analysis/07_IMPLEMENTATION_PLAN.md`
- `docs/terrain-3d-analysis/08_TEST_AND_ACCEPTANCE_PLAN.md`
- `docs/terrain-3d-analysis/09_OPEN_QUESTIONS_AND_BLOCKERS.md`
- `docs/terrain-3d-analysis/10_FILES_REQUIRED_FOR_IMPLEMENTATION.md`

Source được đọc có chọn lọc đúng danh sách ưu tiên: cấu hình frontend, `main/App/MapPage`, `CesiumMap`, `EventPopup`, `Sidebar`, types, API client/mapper, helper Cesium, schema/mẫu GeoJSON; Event controller/service/repository/DTO/importer và hai application properties. Ngoại lệ root được đọc: `TERRAIN_3D_IMPLEMENTATION_REPORT.md` và các hunk frontend của `terrain-3d-implementation.patch`.

## Tệp cố ý không đọc

- Không quét `MVP_KLTN/`, `AppInputData/`, `ai-service/`, `crawData/`, `data/`, `thumbnails_event/`, export history, `node_modules/`, `dist/`, `build/`, `target/`, `.git/`.
- Không đọc `frontend/src/data/eventTitleImages.ts`, stage5 media enrichment hoặc image mapping.
- Không đọc lại `01_REPOSITORY_STRUCTURE.md`, `02_RUNTIME_ARCHITECTURE.md`, `11_IMPLEMENTATION_HANDOFF_PROMPT.md` vì tài liệu bắt buộc và source hiện tại đã đủ.
- Không dump toàn bộ GeoJSON; chỉ xác minh FeatureCollection 63 feature, property và ba feature mẫu.
- Không phân tích auth/progress/user/quiz/media/admin ngoài contract GET Event và call view đã có trên `/map`.

## Kết luận điều hướng

- MVP **frontend-only khả thi có điều kiện** vì detail endpoint đã trả `sourceJson`; frontend hiện làm mất phần này khi map detail sang `HistoricalEvent` (`frontend/src/services/eventApi.ts:65-98`, `frontend/src/services/eventApi.ts:479-486`).
- Không bắt buộc sửa backend hay migration cho MVP; cần fail closed nếu live `raw_json` thiếu/sai.
- Terrain thật bị chặn ở môi trường chạy cho đến khi có `VITE_CESIUM_ION_TOKEN` hợp lệ và policy quota/domain; ellipsoid fallback không được báo là thành công (`frontend/src/components/CesiumMap.tsx:98-115`, `frontend/src/lib/cesium.ts:12-22`).
