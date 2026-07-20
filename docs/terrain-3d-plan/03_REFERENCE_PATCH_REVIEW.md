# Review patch tham khảo

## Phạm vi và baseline review

`terrain-3d-implementation.patch` và `TERRAIN_3D_IMPLEMENTATION_REPORT.md` chỉ được đọc tĩnh; **không apply**. `git apply --stat` cho thấy patch chạm 9 file frontend, thêm 3.439 dòng và xóa 2.430 dòng. Report mô tả trạng thái đã triển khai nhưng source worktree hiện vẫn là trước patch; các claim test trong report không phải test trên repository này.

| Khối thay đổi | Đánh giá | Có thể dùng lại | Cần sửa trước | Rủi ro |
|---|---|---|---|---|
| `.env.example` | `ACCEPT_WITH_CHANGES` | Tên `VITE_CESIUM_ION_TOKEN`, không hard-code | Diff tối thiểu; public token phải có domain/quota/CSP policy | Lộ credential hoặc provider 401 |
| `types/event.ts` | `ACCEPT_WITH_CHANGES` | Tách canonical khỏi legacy additive | Giữ consumer cũ, type guard runtime, không đổi label ngoài scope | Regression route/detail/sidebar |
| `eventApi.ts` | `ACCEPT_WITH_CHANGES` | Giữ `sourceJson.mapData`, đọc flat/nested | Canonical thắng normalized; validate; không suy `multi_region` thành polygon mặc định | Mất mixed/marker hoặc bật sai CTA |
| `terrainTargets.ts` | `ACCEPT_WITH_CHANGES` | Pure target normalization, stable ID, range check | Resolve GADM, mismatch diagnostics, duplicate policy, fail closed | Target không có geometry |
| `terrainTargets.test.ts` | `ACCEPT_WITH_CHANGES` | Khung test point/region/unsupported | Bổ sung đủ sáu type, malformed, mixed, unresolved, array mismatch và chạy Vitest repo thật | False confidence |
| `lib/cesium.ts` | `ACCEPT_WITH_CHANGES` | World Terrain factory, token env | Verify API Cesium 1.139.1; lazy ready/error/retry; lifecycle-bound provider | Promise/provider sống sau unmount |
| `CesiumMap.tsx` | `REJECT` wholesale | Mounted guard, cleanup intent, camera snapshot pattern | Viết lại session/resource lifecycle; await datasource; cancel ≠ complete; giảm `any` | Duplicate Viewer/handler, stale callback, mất highlight |
| `MapPage.tsx` | `REJECT` wholesale | Selection sequence và ý tưởng terrain state | Reducer + generation/session/pending intent; giữ deep-link, hierarchy, year/grade | Timer stale, state bất hợp lệ, event A ghi đè B |
| `EventPopup.tsx` | `ACCEPT_WITH_CHANGES` | CTA, target list, status/error copy | Ghép vào popup hiện tại; giữ back-to-parent; keyboard/mobile/focus/retry | Mất UX cũ, fixed 400px |

## Các điểm có giá trị

- Patch nhận ra detail cần giữ raw map data, tạo utility thuần và có ý tưởng provider ready/error, camera snapshot, cleanup, selection sequence.
- Contract legacy được giữ additive thay vì xóa đột ngột.
- Token được hướng ra env và `nationwide`/`no_location` được loại khỏi eligibility.

## Những phần không được nhận nguyên trạng

1. `multi_region` legacy không đủ thông tin để mặc định là `multi_polygon`; phải suy từ targets đã validate.
2. `focusGeometry.center` chỉ là camera hint, không tự tạo point target.
3. `gadmRefs` phải resolve exact `GID_1` trước tên; unresolved region không được làm CTA active.
4. Lệch độ dài `markers`, `provinceNames`, `gadmRefs` cần diagnostic và isolation, không ghép đoán.
5. Async provider/GeoJSON/datasource phải có mounted + session/generation check.
6. Camera cancel không phải restore complete; mỗi flight cần operation ID để callback cũ không xóa snapshot mới.
7. Không dùng timer không ownership trong MapPage; reducer phải bảo vệ close, route, year/grade, parent/child và deep-link.
8. Phải bảo toàn secondary-region highlight, marker hover/clustering và per-marker error isolation hiện có.

## Kết luận áp dụng

Không nên áp dụng patch nguyên khối. Có thể cherry-pick **ý tưởng**, viết semantic diff nhỏ theo thứ tự: (1) canonical types/mapper, (2) pure target utility + tests, (3) provider env/status, (4) reducer/session orchestration, (5) camera snapshot/restore, (6) region interaction, (7) popup UX. Sau mỗi bước chạy test scoped, kiểm tra diff stat và rollback bằng revert bước đó; không reset/xóa untracked của người dùng.

## Claim chưa xác minh

Report nói typecheck/test utility đã pass trong workspace stub và hướng dẫn giải nén/apply patch. Đây là `UNVERIFIED` cho repository hiện tại; baseline thật ở `00_README.md` mới là nguồn test. Không dùng report để tuyên bố provider/camera end-to-end đã chạy.
