# Môi trường kiểm thử Terrain 3D

Ngày kiểm tra: 2026-07-20 (Asia/Bangkok)

## Phiên bản và checkpoint

| Thành phần | Giá trị | Mức chứng cứ |
|---|---|---|
| Repository | `C:/Users/CITY/Desktop/CLASS/KLTN/lich-su-viet-nam-3d` | MEASURED |
| Branch | `terrain_3d_update` | MEASURED |
| Contract Phase 1–2 | `c92f919` | MEASURED |
| Runtime Phase 3–7 | `f54ca66` | MEASURED |
| Plan/audit | `fc70020` | MEASURED |
| Node.js | 22.14.0 | MEASURED |
| Java runtime | OpenJDK 23.0.1 | MEASURED |
| Java project target | 21 | MEASURED |
| Vite | 7.3.1 | MEASURED |
| Browser | Codex in-app browser | OBSERVED |

## Trạng thái môi trường

- `frontend/.env.local` không tồn tại; không có local Cesium Ion token. Trạng thái: `BLOCKED_BY_MISSING_CESIUM_TOKEN`.
- Backend có Maven wrapper, Spring Boot 4.0.3 và mặc định cổng 8080 qua Vite proxy.
- `backend/.env` được `BackendApplication` tự nạp và chứa datasource cloud/non-local cùng credentials. Backend không được khởi động để tránh khả năng ghi dữ liệu ngoài local. Trạng thái: `BLOCKED_BY_LOCAL_DATABASE`.
- Các importer chỉ active qua profile riêng (`import-events`, `sync-source-json`), nhưng Flyway mặc định được bật. Không profile importer hoặc backend nào được chạy.
- Nguồn thay thế là canonical JSONL và audit read-only đã commit. Database live vẫn `DB_LIVE_UNVERIFIED`.

Không token, password hoặc raw event JSON nào được ghi vào evidence.
