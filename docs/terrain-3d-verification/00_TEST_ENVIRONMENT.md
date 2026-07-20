# Terrain 3D test environment

Test date: 2026-07-20 (Asia/Bangkok)

| Component | Result |
|---|---|
| Repository / branch | `C:/Users/CITY/Desktop/CLASS/KLTN/lich-su-viet-nam-3d` / `terrain_3d_update` |
| Browser | Codex in-app browser |
| Frontend | Vite 7.3.1, localhost:5173 |
| Backend | Spring Boot 4.0.3, localhost:8080, Java 21.0.8 |
| MySQL | container `mysql-lichsuvn`, `mysql:lts` / server 8.4.8 / localhost:3306 |
| Database | `lichsuvn` (local only), 361 imported canonical events |
| Flyway | enabled; validated and migrated to V23 |
| Hibernate | `ddl-auto=validate` |
| Cesium token | present in ignored `frontend/.env`; value omitted |
| Canonical source | `crawData/stage5_media_enrich/output/enriched_core_events.jsonl` (361 lines) |
| Code checkpoint | migration `1804006`; responsive runtime fix `4875dc2` |

The tracked `.env.example` contains only an empty Cesium placeholder. No token, password, JDBC secret, or raw event JSON is recorded here.

Runtime launch initially reproduced a Flyway duplicate V12 failure. The terrain migration was renamed to V23, committed as `1804006`, and recorded successfully in the local Flyway history.
