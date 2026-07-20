# Cấu trúc repository liên quan

## Kết luận

Frontend phải dùng cho chức năng này là `frontend/`, không phải `MVP_KLTN/`. Bằng chứng quyết định là route `/map` hiện chỉ được khai báo trong `frontend/src/App.tsx:69-76`, `MapPage` tại `frontend/src/pages/MapPage.tsx:212-235` gọi Event API thật tại `frontend/src/pages/MapPage.tsx:238-294`, và Vite của workspace này proxy `/api` sang Spring Boot tại `frontend/vite.config.ts:24-35`.

Root README cũng mô tả `frontend/` là React + Cesium và `backend/` là Spring Boot (`README.md:7-49`). `.cursorrules` lại nói tập trung ở `MVP_KLTN/` (`.cursorrules:30-45`), nhưng đó không phải bằng chứng runtime hiện tại: router của `MVP_KLTN` chỉ render map tại `/` và không khai báo `/map` (`MVP_KLTN/src/App.tsx:62-68`). Vì vậy chỉ dẫn này được xem là cũ đối với phạm vi `/map`.

## Cây thư mục có liên quan

```text
lich-su-viet-nam-3d/
├── frontend/                              # Frontend runtime cho /map
│   ├── package.json                       # Vite/React/Cesium scripts + versions
│   ├── vite.config.ts                     # Cesium assets, /api proxy
│   ├── public/geojson/
│   │   └── vietnam-provinces.json         # GADM 4.1 level 1 đang được Cesium tải
│   └── src/
│       ├── main.tsx                       # React entry
│       ├── App.tsx                        # Router, gồm /map
│       ├── pages/MapPage.tsx              # Orchestrator state của map
│       ├── components/
│       │   ├── CesiumMap.tsx              # Raw Cesium Viewer/Entity/DataSource
│       │   ├── EventPopup.tsx             # Panel sự kiện bên phải
│       │   ├── Sidebar.tsx                # Danh sách sự kiện bên trái
│       │   └── Timeline.tsx
│       ├── services/
│       │   ├── apiClient.ts               # API envelope/base URL
│       │   └── eventApi.ts                # Event endpoints + mapper
│       ├── types/event.ts                 # Type hiện tại (đang dùng tên geo cũ)
│       ├── lib/cesium.ts                  # Cesium token/helper/marker styles
│       └── data/
│           ├── eventRegistry.ts           # import.meta.glob JSON cục bộ
│           ├── eventAdapter.ts            # adapter dữ liệu cục bộ
│           ├── vietnamProvinceCentroids.ts
│           └── history_events/**/*.json
├── backend/
│   ├── pom.xml                            # Spring Boot, Java 21, MySQL, Flyway
│   └── src/main/
│       ├── java/com/lichsuvn/backend/
│       │   ├── BackendApplication.java    # Backend entry
│       │   ├── event/api/                 # EventController + DTO
│       │   ├── event/application/         # EventReadService
│       │   ├── event/infrastructure/      # JDBC read repository
│       │   └── importer/                  # JSONL import/sync
│       └── resources/db/migration/        # MySQL/Flyway schema
├── crawData/
│   └── stage4b_curate_tree/output/phase2/
│       └── core_events.jsonl              # Default input của event importer
├── data/gadm/                             # GADM lv0-lv3 nguồn
├── ai-service/                            # FastAPI prototype, không nằm trong flow terrain
├── MVP_KLTN/                              # Frontend snapshot cũ đối với route /map
├── AppInputData/                          # Ứng dụng editor dữ liệu độc lập
├── history_events_export_.../             # Bản export/archive
├── thumbnails_event/                      # Media; ngoài phạm vi terrain
└── docs/
```

## Entry points và scripts

| Phần | Entry/script | Bằng chứng | Kết luận |
|---|---|---|---|
| Frontend | `frontend/src/main.tsx` | `createRoot` render `<App />` trong StrictMode tại `frontend/src/main.tsx:1-10` | Entry React thật của workspace `frontend` |
| Router | `frontend/src/App.tsx` | BrowserRouter và providers tại `frontend/src/App.tsx:129-143`; `/map` tại `frontend/src/App.tsx:69-76` | Route mục tiêu đã xác minh |
| Frontend dev | `npm run dev` | `frontend/package.json:6-17` | Vite; `predev` chạy build dữ liệu |
| Frontend build | `npm run build` | `frontend/package.json:6-17` | `prebuild` gọi `build:data`, có khả năng ghi manifest/index nên không dùng trong audit chỉ-đọc |
| Frontend test | `npm run test` | `frontend/package.json:6-17` | Vitest hiện có, không cần package mới |
| Backend | `BackendApplication.main` | `backend/src/main/java/com/lichsuvn/backend/BackendApplication.java:10-21` | Spring Boot entry |
| Backend build | Maven wrapper/POM | Java 21 và Spring Boot plugin tại `backend/pom.xml:30-30`, `backend/pom.xml:128-149` | Workspace backend chính |
| AI prototype | `python main.py`/Uvicorn | `ai-service/main.py:20-31` | Chỉ có health và endpoint mẫu; không tham gia map/event runtime |

`frontend/package.json:19-43` xác nhận Cesium `^1.139.1`, Resium `^1.19.4`, React Router `^7.13.1` và Vite `^7.3.1`. Dù Resium có trong dependency, component bản đồ import trực tiếp Cesium API (`frontend/src/components/CesiumMap.tsx:3-25`) và không dùng Resium.

## Frontend–backend thực tế

- Frontend dev dùng Vite port `5173` và proxy `/api` tới `http://localhost:8080` (`frontend/vite.config.ts:24-35`).
- Production base URL được lấy từ tên biến `VITE_API_BASE_URL`; không ghi giá trị trong tài liệu (`frontend/src/services/apiClient.ts:9-16`).
- `MapPage` lấy năm, tìm kiếm, detail và children qua `frontend/src/services/eventApi.ts` (`frontend/src/pages/MapPage.tsx:15-23`, `frontend/src/pages/MapPage.tsx:238-294`, `frontend/src/pages/MapPage.tsx:331-421`).
- Backend event flow là `EventController` → `EventReadService` → `EventReadRepository` (`backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:17-29`, `backend/src/main/java/com/lichsuvn/backend/event/application/EventReadService.java:17-37`).

Không tìm thấy Dockerfile/docker-compose hay cấu hình deploy/hosting trong repository. Frontend deploy production thực tế là `UNVERIFIED`; kết luận `frontend/` ở đây là kết luận về import graph và route `/map` trong source hiện tại.

## Các thư mục dữ liệu

| Đường dẫn | Vai trò đã xác minh | Có nằm trong request-time runtime của `/map`? |
|---|---|---|
| `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl` | Default input của profile importer (`backend/src/main/java/com/lichsuvn/backend/importer/EventJsonImportRunner.java:30-51`) | Không đọc trực tiếp mỗi request; được import vào DB |
| `backend/.../historical_events.raw_json` | Giữ JSON nguồn; detail query trả thành `sourceJson` (`backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:147-170`, `backend/src/main/java/com/lichsuvn/backend/event/infrastructure/EventReadRepository.java:532-571`) | Có, qua detail API |
| `frontend/public/geojson/vietnam-provinces.json` | `CesiumMap` tải bất đồng bộ để vẽ/đánh dấu tỉnh (`frontend/src/components/CesiumMap.tsx:168-186`) | Có |
| `frontend/src/data/history_events/**/*.json` | Được registry bundle bằng `import.meta.glob` (`frontend/src/data/eventRegistry.ts:161-169`) | Chỉ là nguồn cục bộ phụ; danh sách map chính đến từ backend |
| `frontend/src/data/vietnamProvinceCentroids.ts` | Fallback centroid theo tên tỉnh (`frontend/src/data/vietnamProvinceCentroids.ts:1-10`, `frontend/src/data/vietnamProvinceCentroids.ts:169-189`) | Có thể được dùng bởi adapter cục bộ |
| `data/gadm/lv0.json` … `lv3.json` | Kho dữ liệu GADM nguồn | Không thấy import request-time từ frontend/backend: `UNVERIFIED` cho pipeline tạo file public |
| `history_events_export_2026-04-24T14-28-46-607Z/` | Bản export nhiều JSON | Không có import graph từ `/map`; archive/đối chiếu |

## Workspace phụ/cũ đối với tính năng này

| Workspace | Bằng chứng | Phân loại trong phạm vi terrain |
|---|---|---|
| `MVP_KLTN/` | Router chỉ map `/`, không có `/map` (`MVP_KLTN/src/App.tsx:62-68`); package tương tự nhưng snapshot ít route hơn (`MVP_KLTN/package.json:6-20`) | Không sửa; frontend cũ/nhánh phụ cho tính năng `/map` |
| `AppInputData/` | Package có tên `event-editor` (`AppInputData/package.json:2-10`) | Công cụ nhập/editor độc lập; không sửa |
| `ai-service/` | FastAPI chỉ có `/health`, `/generate-question` mẫu (`ai-service/main.py:20-31`) | Không liên quan terrain; không sửa |
| `lsvn3d/` | Chỉ thấy assets, không có manifest/entry trong inventory | `UNVERIFIED`; không có bằng chứng là runtime |
| `crawData/stage5_*`, `thumbnails_event/`, `frontend/src/data/eventTitleImages.ts` | Luồng media/image | Ngoài phạm vi; tuyệt đối không sửa/refactor/tạo dependency |
