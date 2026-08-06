# Goal 3-R.1 test commands

Working directory: `D:\KLTN\lich-su-viet-nam-3d\frontend`.

| Command nguyên văn | Exit | Kết quả |
|---|---:|---|
| `npm run check:encoding` | 0 | PASS |
| `npm exec tsc -- -b --pretty false` | 0 | PASS |
| `npm exec vitest -- run src/components/terrain/TerrainControls.test.tsx src/components/terrain/TerrainInsightCard.test.tsx src/data/terrainInsights.test.ts` | 0 | 3 files; 29/29 PASS |
| `npm exec vitest -- run src/services/__tests__/eventApi.test.ts` | 0 | 1 file; 12/12 PASS; adapter baseline 9, delta +3 |
| `npm exec vitest -- run src/utils/terrainTargets.test.ts src/utils/terrainState.test.ts src/utils/cameraSnapshot.test.ts src/utils/regionGeometry.test.ts src/utils/terrainInspection.test.ts src/utils/terrainMeasurement.test.ts src/utils/terrainProvider.test.ts src/utils/terrainScene.test.ts src/utils/terrainCamera.test.ts src/components/terrain/TerrainControls.test.tsx src/components/terrain/TerrainExplorationToolbar.test.tsx src/data/terrainInsights.test.ts src/components/terrain/TerrainInsightCard.test.tsx` | 0 | 13 files; 147/147 PASS; duration 10.32s |
| `npm exec vitest -- run` | 0 | 82 files; 669/669 PASS; duration 46.22s |
| `npm run lint` | 0 | PASS |
| `npm exec vite -- build --outDir terrain-build-smoke --emptyOutDir` | 0 | PASS; Vite 7.3.1; 4196 modules; 474 items; 28.45s; chỉ chunk warning |
| `git diff --check` | 0 | PASS |

Reconciliation:

```text
Baseline focused: 13 / 140
New focused:      13 / 147
Delta focused:    +0 files / +7 tests

Baseline full:    82 / 659
New full:         82 / 669
Delta full:       +0 files / +10 tests

Adapter/API:       1 / 9 -> 1 / 12 (+3 tests)
```

Full delta bằng focused `+7` cộng ba adapter/API cases không nằm trong focused terrain command. Test mới của patch accessibility xác minh status region active, selected target, card nằm ngoài status và card không có `aria-live`. Không có test case hoặc test file bị giảm.

Production bundle grep trước khi xóa smoke output:

```text
__CESIUM_DEBUG__=0
setTerrainCameraOverride=0
forceFallback=0
force-fallback=0
```

Forbidden insight lookup grep trong `frontend/src`:

```text
dto.slug ?? dto.id=0
stableEventIds=0
getTerrainInsight(old API)=0
```

Không chạy `npm run dev`, `npm run build`, backend, MySQL, importer hoặc dataset regeneration. `terrain-build-smoke` đã được xóa sau kiểm tra.
