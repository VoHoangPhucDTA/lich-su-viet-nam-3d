# Final Map Browser QA Report

Status: **READY_FOR_MAP_DEFENSE**

- Branch/HEAD: `view-terrain` / `511f133f1851da4dcdcbd7970bd867ce86f4e697`.
- MAP-FIX-2-R and MAP-API-FIX-1 are contained in combined commit `511f133f`.
- Runtime: disposable MySQL 8.0.36, Flyway V42, local-only backend and direct Vite frontend.
- Canonical import: SHA-256 `7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0`; 361 input rows and 361 unique events.
- API: list count/total 361/361; 1287 `multi_point`/4 markers; Điện Biên `multi_point`/5 markers; Chăm-pa `no_location`; no Jackson introspection fields.
- Browser routing: `127.0.0.1:5173` -> Vite proxy -> `127.0.0.1:18080` -> disposable backend. No remote fallback.
- Year 40: one main collection and one projected point; search `điện`: zero main items and zero map points.
- Year 938 cultural: one Chăm-pa main item, zero map points, popup states `Không có địa điểm`. Classification: `PASS_EXPECTED_NO_LOCATION`.
- Year 1010: collection expansion exposed the atomic Lý Thái Tổ event; selection remained usable.
- Marker UX: atomic/collection legend, selected/dim/default lifecycle and technical footer were present. No fake geography or stale popup was observed.
- 1287 terrain: exactly Bạch Đằng, Cửa Lục, Thăng Long and Vân Đồn; all four target controls exercised. Vạn Kiếp appeared only as contextual note.
- Điện Biên terrain: five targets; Him Lam and Mường Thanh exercised.
- Lifecycle: 10/10 sequential cycles passed with one footer and zero dialogs after every checkpoint.
- Production source was not edited during this QA. No remote write, commit or push was performed.

## Final invariants

1. Filtered visible events may include no-location events.
2. Visible IDs need not equal point-marker IDs.
3. No-location selection creates no synthetic geography.
4. Dimming occurs only when the selected event has an effective rendered marker.
5. Canonical geography is the source of truth.
6. 1287 operational targets are Bạch Đằng, Cửa Lục, Thăng Long and Vân Đồn.
