title: "[Terrain 3D] Địa hình Cesium theo sự kiện và bộ công cụ khám phá"

detail: |
  Các thay đổi trong lần này:

  Bối cảnh

  Branch `terrain_3d_update_sync_origin_main_20260720` dựa trên `origin/main` tại
  commit `99296ca` và mang 11 commit đi kèm các thay đổi về địa hình 3D, sự
  kiện và UI khám phá. Commit mới nhất trên branch là
  `0ed7147 feat(map): add terrain exploration toolbar`; commit Task A–B
  được tích hợp tại `ce05a23 fix(map): clarify timeline counts and sidebar
  chronology layout`. Tổng số file thay đổi so với `origin/main` là 68
  (khoảng 9236 dòng thêm, 195 dòng xoá). Phạm vi tài liệu này chỉ mô tả
  các thay đổi Terrain có trên branch so với `origin/main`; không mô tả
  các thay đổi của UI Refactor hoặc exam/dashboard nằm ngoài branch.

  Mục tiêu

  Cho phép học sinh mở bản đồ địa hình Cesium gắn với một sự kiện lịch sử,
  xem toàn cảnh khu vực hoặc một target cụ thể, và dùng bộ công cụ tối
  thiểu (phóng to/thu nhỏ, hướng dẫn điều khiển, chọn vị trí để xem
  vĩ độ/kinh độ/độ cao địa hình) ngay trên bản đồ 3D. Học sinh vẫn xem
  được danh sách sự kiện, popup chi tiết và Timeline; Terrain chỉ là một
  cách đọc thêm.

  Loại hình học liệu được hỗ trợ

  | Canonical geoType | Có Terrain | Ghi chú |
  | --- | --- | --- |
  | `point`           | Có | Một điểm, fly tới point. |
  | `multi_point`     | Có | Nhiều điểm, danh sách target. |
  | `multi_polygon`   | Có | Nhiều khu vực, danh sách target. |
  | `mixed`           | Có | Kết hợp marker + region, danh sách target. |
  | `nationwide`      | Không | Hiển thị banner "Phạm vi: Toàn quốc". |
  | `no_location`     | Không | Không có vị trí bản đồ. |

  Kiến trúc

  - CesiumJS 1.139.1, World Terrain chỉ tải khi mở session.
  - Terrain session là một state machine có id:
    `idle → entering → active → exiting → idle` (hoặc `error`). Mỗi
    session có `cameraRequestId` để vô hiệu hoá callback của lần fly
    trước nếu user đổi target liên tục.
  - Camera snapshot được chụp ngay trước khi terrain fly để phục hồi
    khi `Quay lại góc nhìn`.
  - GADM region resolve qua `regionGeometry.ts`: map GADM ref sang
    polygon trong GeoJSON tỉnh Việt Nam (cache ở
    `regionGeometryIndexRef`).
  - Imperative API cho Explore Toolbar: `CesiumMapHandle` chỉ phơi ra
    `zoomByFactor` và `clearInspectionMarker` — Viewer/Scene/Camera
    không bao giờ đi vào React state.

  Cấu trúc UI khi mở Terrain

  - Trong `EventPopup` (panel phải):
    - Khi idle mà eligible → nút "Xem địa hình".
    - Khi entering → loader "Đang tải địa hình…".
    - Khi active → nhãn "Đang xem địa hình", `TerrainTargetList` (khi
      nhiều target), nút "Xem toàn bộ", nút "Quay lại góc nhìn".
    - Khi error → thông báo lỗi + "Thử lại" + "Quay lại góc nhìn".
  - Trên map (Toolbar khám phá): chỉ hiện khi `terrain.mode === 'active'`.
    - Desktop: 3 nút (Phóng to / Thu nhỏ / Công cụ) anchor `bottom-left`
      trong map-area để không đè Sidebar/EventPopup; panel Công cụ
      mở lên trên hàng nút với heading, close button, hai section:
      "Cách điều khiển" (5 dòng Cesium 1.139 default mapping) và
      "Xem tọa độ và độ cao" (toggle với `aria-pressed`).
    - Mobile (<640 px): 3 nút thành hàng ngang đáy. Panel co lại thành
      card dưới hàng nút, nội dung responsive.

  Stacking order

  - Toolbar/panel: `z-index: 26`.
  - Sidebar: cao hơn (đã có sẵn).
  - EventPopup: cao hơn toolbar (đã có sẵn).
  - Toolbar bị EventPopup và Sidebar phủ lên nhưng không che click vào
    popup (stacking-context cô lập trên map-area relative).

  Accessibility

  - 44×44 touch target cho 3 nút toolbar.
  - `aria-pressed` cho nút "Xem tọa độ và độ cao".
  - `aria-expanded` + `aria-controls` cho nút Công cụ (id từ `useId()`,
    stable, unique mỗi instance).
  - `aria-live="polite"` cho height loading + result.
  - `role="status"` cho error inline.
  - Escape đóng panel Công cụ trước, không đồng thời thoát Terrain
    hoặc đóng EventPopup (capture-phase listener + cleanup đối xứng).
  - Panel có heading riêng (`<h2>`) với `id` để `aria-labelledby` đúng.
  - Focus quay về nút Công cụ khi panel đóng.

  Inspect-location pipeline (Task C)

  - Inspect mode toggle: button Toolbar with `aria-pressed`.
  - LEFT_CLICK khi mode bật: chạy `runInspectionAt(pixel)` (chưa có
    handler riêng, tận dụng `LEFT_CLICK` đã có của CesiumMap với
    inspect-branch ưu tiên terrain-target).
  - Lấy vị trí mặt: `scene.pickPosition(pixel)` nếu
    `depthTestAgainstTerrain && pickPositionSupported`, fallback
    `camera.pickEllipsoid`. Cả hai miss → `unavailable`.
  - Độ cao: `Cartographic.fromCartesian` → nếu provider là
    `EllipsoidTerrainProvider` hoặc depth-test tắt → `ellipsoid_only`.
    Ngược lại `sampleTerrainMostDetailed(provider, [carto])` →
    `available`. Bắt lỗi → `error`.
  - Marker tạm: một `Entity` trong `CustomDataSource('terrain-inspect-marker')`.
    Click mới `removeAll` + add. Tắt inspect → xoá datasource. Exit
    Terrain → xoá datasource. Unmount → xoá.
  - Latest-wins: mỗi click bump `internalInspectOpRef.current`; mỗi toggle
    bump `inspectSessionId`. Cả hai ref được so sánh sau mỗi `await`
    async; kết quả cũ không bao giờ ghi đè kết quả mới.

  Validation gần đây (Task C verification)

  | Kiểm tra | Kết quả |
  | --- | --- |
  | `npx tsc --noEmit -p tsconfig.app.json` | PASS |
  | Targeted vitest: `terrainInspection.test.ts` + `TerrainExplorationToolbar.test.tsx` | PASS (26/26) |
  | `npm test` (full frontend) | PASS (145/145 across 32 files) |
  | Scoped ESLint (6 Task C files) | PASS |
  | `npx vite build` | PASS |
  | `git diff --cached --check` | PASS |
  | Manual browser smoke cho Task C | UNVERIFIED |

  Các phần Terrain cũ (trước Task C) đã được xác minh run-time từ
  người dùng nội bộ tại branch trước khi tích hợp `origin/main`; chi
  tiết xem `docs/terrain-3d-verification/` trong cùng branch.

  Commit list trên branch (oldest → newest)

  ```
  c92f919 feat: normalize terrain targets from canonical geo data
  f54ca66 feat(map): add regional terrain sessions and popup controls
  fc70020 docs(terrain): add implementation plan and audit evidence
  ec0df9e docs(terrain): add verification results and blockers
  1c02b49 fix(security): remove revoked Cesium token from legacy source
  1804006 fix(db): add canonical event geo type migration
  4875dc2 fix(map): stabilize terrain popup and mobile layout
  e93723d docs(terrain): record local end-to-end verification
  278f6cd merge(main): integrate latest origin main into terrain update
  ce05a23 fix(map): clarify timeline counts and sidebar chronology layout
  0ed7147 feat(map): add terrain exploration toolbar
  ```

  Có thể gộp theo nhóm:

  - Terrain core: `c92f919`, `f54ca66`, `4875dc2`.
  - Bảo mật/migration: `1c02b49`, `1804006`.
  - Docs/verification: `fc70020`, `ec0df9e`, `e93723d`.
  - Sync `origin/main`: `278f6cd`.
  - Task A–B timeline/sidebar UX: `ce05a23`.
  - Task C toolbar khám phá: `0ed7147`.

  Vùng file thay đổi (so với `origin/main`)

  - `frontend/src/components/CesiumMap.tsx` (M): viewer lifecycle,
    LEFT_CLICK + Cesium 1.139 gesture defaults, terrain session
    camera op IDs, marker, inspect pipeline.
  - `frontend/src/components/terrain/TerrainControls.tsx` (A): state
    machine → UI cho `idle | entering | active | exiting | error`.
  - `frontend/src/components/terrain/TerrainTargetList.tsx` (A):
    danh sách target dạng `aria-pressed`.
  - `frontend/src/components/terrain/TerrainExplorationToolbar.tsx` (A)
    + `.test.tsx` (A): 3 nút toolbar + tools panel (Task C).
  - `frontend/src/components/Sidebar.tsx` (M) + `Sidebar.test.tsx` (A):
    responsive CSS grid cho title/chronology.
  - `frontend/src/components/Timeline.tsx` (M) + `Timeline.test.tsx`
    (A): wording "mốc năm", ARIA nâng cấp cho count + grade filter.
  - `frontend/src/types/terrain.ts` (A): `TerrainSessionCommand`,
    `TerrainRuntimeError`, `TerrainViewModel`.
  - `frontend/src/utils/cameraSnapshot.ts` + `.test.ts` (A): camera
    snapshot + duration theo `prefers-reduced-motion`.
  - `frontend/src/utils/regionGeometry.ts` + `.test.ts` (A): parse +
    resolve GADM region polygon.
  - `frontend/src/utils/terrainState.ts` + `.test.ts` (A):
    `terrainReducer` cho state machine.
  - `frontend/src/utils/terrainTargets.ts` + `.test.ts` (A):
    canonical geoType → `TerrainTarget[]` cho 6 kiểu.
  - `frontend/src/utils/terrainInspection.ts` + `.test.ts` (A): pure
    formatter cho lat/lng/height + heightStatus (Task C).
  - `frontend/src/pages/MapPage.tsx` (M): hoist state, callbacks
    `handleOpenTerrain`/`handleExitTerrain`/`handleTerrainTargetSelect`
    /`handleShowTerrainOverview`, cleanup `handleClearInspection`
    cho mọi đường dẫn thoát Terrain (Task C).
  - `frontend/src/index.css` (M): responsive layout Sidebar/Timeline,
    toolbar placement + media query <640 px và <1280 px.
  - `scripts/terrain-audit/audit.mjs` (A): chạy `node
    scripts/terrain-audit/audit.mjs` để audit `terrainTargetResult`
    trên dữ liệu thật.
  - Backend chỉ thay đổi `CanonicalGeoType` ở
    `EventReadRepository` (xem `1804006 fix(db): add canonical
    event geo type migration`).
  - `frontend/src/lib/cesium.ts`: cấu hình `getCesiumIonToken` đọc
    `import.meta.env.VITE_CESIUM_ION_TOKEN` (xem
    `1c02b49 fix(security): remove revoked Cesium token from legacy
    source`).
  - `docs/terrain-3d-{analysis,plan,audit,verification}/` (A):
    phân tích / kế hoạch / kiểm chứng — không ảnh hưởng runtime.

  Known limitations

  1. Manual browser smoke cho Task C chưa được chạy trong phiên này.
     Các flow Terrain cốt lõi đã được kiểm tra trước đó (xem
     `docs/terrain-3d-verification/02_FUNCTIONAL_RESULTS.md`), nhưng
     Toolbar và Inspect pipeline cần reviewer/codex kiểm chứng trên
     trình duyệt thật.
  2. `MapPage` có `useEffect([selectedEvent?.id])` gọi
     `clearInspection()`. Effect này dự phòng nhưng có thể clear
     inspection khi user điều hướng parent → child → parent trong cùng
     Terrain session. Đánh giá là non-blocking; tighten theo transition
     thực sự nếu phát hiện tình huống xấu.
  3. Marker `heightReference: HeightReference.NONE` được vẽ tại
     `Cartesian3.fromRadians(lng, lat, height)` với
     `disableDepthTestDistance: Number.POSITIVE_INFINITY`; trên địa
     hình dốc có thể có z-fighting nhẹ, có thể chấp nhận cho P0.
  4. `CesiumMapHandle` được publish qua `apiRef` effect; trong khoảng
     ngắn giữa hai effect tick (viewer lifecycle re-init) giá trị có
     thể là null. Caller phải dùng optional chaining, MapPage đã làm
     vậy.
  5. Chưa có distance, area, compass, scale, terrain profile hoặc
     line-of-sight. Cố ý không triển khai trong branch này.
  6. Browser WebGL test tự động không thay thế hoàn toàn manual
     smoke cho Cesium. Test tự động chỉ verify pure helpers + component
     state.
  7. Nếu Flyway remote đã được áp dụng trước branch này,
     `1804006 fix(db): add canonical event geo type migration` có thể
     trùng với remote migration. KHÔNG chạy migration/import ngược từ
     branch này; chỉ dùng cho fresh environment.

  Security và an toàn remote

  - Không hard-code Cesium token; `getCesiumIonToken()` chỉ đọc
    `import.meta.env.VITE_CESIUM_ION_TOKEN` (biến frontend build-time,
    không bundled vào commit).
  - Không commit `.env`, không commit credential.
  - Không in stack / token / session ID lên UI khi inspect thất bại;
    chỉ thông báo cục bộ ("Không thể xác định vị trí trên bản đồ.").
  - Không chạy `vite build --debug`.
  - Không migration/import lên remote từ branch này (xem limitation 7).

  Hướng dẫn test thủ công (reviewer)

  - Mở `/map`, chọn event kiểu `point` (ví dụ `nha-minh-xam-luoc-dai-ngu`):
    click "Xem địa hình"; xác nhận loader → fly tới point.
  - Click "Xem toàn bộ" (chỉ khi >1 target hoặc target multi): bay
    về bounding sphere.
  - Click "Quay lại góc nhìn": camera khôi phục về góc trước Terrain.
  - Trên map area: bấm "Phóng to" / "Thu nhỏ" nhiều lần, xác nhận
    camera di chuyển nhưng không tạo terrain session mới, không đổi
    selected target, không trượt vào terrain.
  - Click "Công cụ" → panel mở. Nhấn Escape lần một: panel đóng,
    Terrain/EventPopup vẫn nguyên, focus quay về nút Công cụ. Nhấn
    Escape lần hai: behavior Escape cũ của popup hoặc sidebar chạy.
  - Bật "Xem tọa độ và độ cao" → click một vị trí trên bản đồ. Quan
    sát: kết quả có vĩ độ / kinh độ / độ cao với chú thích trạng thái.
  - Click B trước khi A xong: kết quả B ghi đè kết quả A; không hiển
    thị lat/lng của click A.
  - Inspect mode bật: click polygon target không đổi selected target;
    tắt inspect: polygon picking hoạt động lại.
  - Đổi sự kiện, đổi năm, đổi lớp: marker + kết quả inspect bị xoá
    trước khi Terrain session mới.
  - Mount/unmount (`/map` navigate vào/ra): không double handler,
    không stale `apiRef`.
  - Responsive: 1280×720, 1024×768, 375×800, 320×700 — toolbar dùng
    được, không bị Timeline che, panel không tràn ngang.
  - Console không có stack trace hoặc token/credential log.

  Screenshots / manual recordings

  Screenshots/manual recordings: not included in this commit.

  Checklist

  - [x] TypeScript PASS.
  - [x] Targeted Task C tests PASS.
  - [x] Full frontend tests PASS (145/145).
  - [x] Scoped ESLint PASS cho 6 file Task C.
  - [x] Production build PASS.
  - [x] `git diff --check` PASS.
  - [x] Source scan: không credential, không local path.
  - [ ] Manual Task C Cesium browser smoke (chưa chạy trong phiên này;
        reviewer/codex cần kiểm chứng).
  - [ ] Push/deploy (theo lệnh cấm trong phiên).
  - [ ] P1/P2 tools (distance, area, profile, line-of-sight, compass,
        scale, 2D/3D toggle, terrain exaggeration, geocoder) — theo
        lệnh cấm trong phiên.

  Vùng reviewer/codex nên tập trung

  - Shared `LEFT_CLICK` handler: branch inspect phải chạy trước
    terrain-target pick khi `inspectMode === 'inspect-location'`, và
    không để click vừa inspect vừa chọn polygon ngoài ý muốn.
  - Async height sampling: stale checks tại `internalInspectOpRef` và
    `inspectionSessionIdRef` ở ba điểm (trước carto, sau
    `sampleTerrainMostDetailed`, trong catch).
  - Escape capture listener: cleanup `removeEventListener` phải khớp
    chính xác (cùng capture, cùng callback ref).
  - Cleanup `inspectDataSourceRef` trên viewer unmount và trên
    `inspectMode !== 'inspect-location'` để tránh orphan marker.
  - `CesiumMapHandle.zoomByFactor`: không gọi `viewer.camera.flyTo`,
    chỉ dùng `zoomIn`/`zoomOut` + bump `cameraOperationRef` để vô
    hiệu các terrain-flight callback cũ.
  - Responsive `z-index: 26` của `.map-exploration-toolbar` /
    `.map-exploration-panel` để không đè Sidebar/EventPopup.
  - `useEffect([selectedEvent?.id])` clearInspection: xác nhận có thật
    sự cần trong smoke hay có thể bỏ.

  Liên kết nội bộ cùng branch

  - Audit và verification trước branch:
    `docs/terrain-3d-verification/02_FUNCTIONAL_RESULTS.md`,
    `docs/terrain-3d-verification/03_ERROR_AND_LIFECYCLE_RESULTS.md`,
    `docs/terrain-3d-verification/05_ACCESSIBILITY_RESULTS.md`.
  - Kế hoạch implementation: `docs/terrain-3d-plan/04_IMPLEMENTATION_PLAN.md`.
  - Audit script chạy thủ công để kiểm tra dữ liệu target:
    `node scripts/terrain-audit/audit.mjs` (xem flag `--help`).

  Số liệu dữ liệu (để reviewer khỏi nhầm)

  - Tổng số sự kiện trong DB: 361.
  - Số sự kiện có ngày khởi đầu (`dated`): 308.
  - Số mốc năm (year-marks) trong timeline: 153.
  - 300 là default page size của API, không phải tổng DB.

  Không tự đề xuất hoặc triển khai P1/P2 trong branch này.

  Task D0 — Academic Integrity & Learning Alignment

  Tóm tắt

  - Đổi CTA mở Terrain thành "Khám phá địa hình khu vực" và chỉ hiển thị
    disclaimer khi Terrain đang active: mô hình địa hình là tham chiếu
    hiện đại; sông, bờ biển và cảnh quan có thể khác thời điểm lịch sử.
  - Toolbar công bố nguồn dữ liệu, phạm vi dùng/không dùng và ba gợi ý
    khám phá; không bổ sung công cụ P1/P2.

  Liên kết học tập và dữ liệu

  - Terrain là Cesium World Terrain được tải theo phiên Terrain. UI dùng
    trạng thái serializable (`world-terrain`, `ellipsoid-fallback`,
    `loading`, `unavailable`), không đưa Viewer hay provider vào React state.
  - Không cấu hình imagery provider riêng; Viewer sử dụng base layer mặc
    định theo cấu hình hiện tại. Source không tải Cesium OSM Buildings,
    Google Photorealistic 3D Tiles hoặc custom 3D Tiles.
  - Ellipsoid fallback không được hiển thị như phép đo độ cao địa hình:
    kết quả dùng dấu "—" cùng thông báo không có dữ liệu độ cao chi tiết.

  Giới hạn học thuật

  - Có thể dùng để đọc địa thế tổng quát, vị trí tương đối, độ cao tham
    khảo và phạm vi phân bố target.
  - Không dùng để chứng minh tuyến hành quân, dòng chảy, đường bờ hoặc
    ranh giới lịch sử chính xác; không phục dựng cảnh quan quá khứ.
  - Tài liệu đầy đủ: `docs/terrain-academic-alignment/TERRAIN_ACADEMIC_ALIGNMENT.md`.

  Kiểm thử Task D0

  - TypeScript: PASS (`npx tsc --noEmit -p tsconfig.app.json`).
  - Targeted tests: PASS — 2 files, 12 tests.
  - Scoped ESLint: PASS — 6 TypeScript/test files.
  - Production build: PASS (`npx vite build`).
  - Full test suite: 178/179 PASS; một lỗi timeout 5 giây có sẵn ngoài
    phạm vi D0 tại `src/pages/admin/__tests__/AdminAiCandidateDetailPage.test.tsx`.
  - Manual Cesium browser smoke: chưa chạy trong phiên này.

  Checklist / known limitations

  - [x] Nội dung D0, accessibility test (Escape/focus restore) và fallback
    height đã được kiểm thử tự động.
  - [x] Chỉ commit 8 file D0 trong `a8e4725`.
  - [ ] Manual smoke cần xác nhận với Cesium Ion token hợp lệ và dữ liệu event.
  - [ ] Không push/deploy, không database/migration, không P1/P2.

  Files Task D0

  - `frontend/src/types/terrain.ts`
  - `frontend/src/pages/MapPage.tsx`
  - `frontend/src/components/terrain/TerrainControls.tsx`
  - `frontend/src/components/terrain/TerrainControls.test.tsx`
  - `frontend/src/components/terrain/TerrainExplorationToolbar.tsx`
  - `frontend/src/components/terrain/TerrainExplorationToolbar.test.tsx`
  - `frontend/src/index.css`
  - `docs/terrain-academic-alignment/TERRAIN_ACADEMIC_ALIGNMENT.md`

  Task D1 — Optional Distance Comparison

  Tóm tắt

  - Bổ sung “So sánh khoảng cách” vào nhóm “Công cụ bổ sung” cùng công
    cụ xem tọa độ và độ cao. Đây là công cụ tùy chọn, không phải nhiệm vụ
    bắt buộc và không ảnh hưởng các event `nationwide` hoặc `no_location`.
  - Kết quả là khoảng cách geodesic tham chiếu trên ellipsoid giữa hai vị
    trí, không dùng độ cao và không phải terrain-following distance.
  - UI học sinh chỉ trình bày khoảng cách gần đúng giữa hai vị trí trên bản
    đồ, đồng thời nêu rõ kết quả không phải đường đi hoặc tuyến hành quân
    lịch sử.

  Hành vi kỹ thuật và lifecycle

  - Chỉ một exploration mode được active tại một thời điểm: inspect hoặc
    measure. Shared `LEFT_CLICK` handler giữ thứ tự ưu tiên
    measure → inspect → target; không tạo thêm `ScreenSpaceEventHandler`.
  - Measurement dùng datasource riêng với marker A/B và polyline geodesic.
  - Session/latest-operation guards chặn kết quả async stale; datasource và
    marker được cleanup khi tắt mode, đổi/thoát phiên Terrain, đổi event và
    unmount.
  - Escape/focus restore, `aria-pressed`, touch target và responsive panel
    được giữ nguyên; panel vẫn cuộn trong viewport hẹp.

  Kiểm thử Task D1

  - TypeScript: PASS (`npx tsc --noEmit -p tsconfig.app.json`).
  - Targeted tests: PASS — 3 files, 37/37 tests.
  - Full frontend tests: PASS — 38 files, 204/204 tests.
  - Scoped ESLint: PASS — 7 TypeScript/TSX files thuộc phạm vi D1.
  - Production build: PASS (`npx vite build`, 4167 modules transformed).
  - `git diff --check`: PASS trước khi commit.
  - Manual Cesium browser smoke: `MANUAL_D1_SMOKE_UNVERIFIED`.

  Checklist / known limitations

  - [x] Distance helper và reducer có unit tests, bao gồm stale-session guard.
  - [x] Toolbar có component tests cho wording học sinh, optional framing,
    Escape/focus restore và `aria-pressed`.
  - [x] D1 được commit riêng trong `34a505e` với đúng 8 file.
  - [ ] Manual smoke cần xác nhận click A/B, reset/clear, đổi exploration mode,
    đổi event, thoát Terrain và layout 320 px trước khi phát hành.
  - [ ] Không push/deploy và không bắt đầu Task D2 trong lượt này.
