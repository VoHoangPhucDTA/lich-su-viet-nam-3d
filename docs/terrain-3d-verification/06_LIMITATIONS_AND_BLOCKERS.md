# Limitations and remaining blockers

1. Token value, provider quota, exact request count, GPU/FPS, and memory growth were not recorded.
2. Browser harness could not prove Tab/Enter/Space traversal; static semantics and mouse activation were verified.
3. Cesium reports existing non-fatal geometry outline/heightReference warnings; no terrain crash followed.
4. Event-view recording still logs an `Invalid CORS request` warning; it is outside the terrain workflow.
5. GADM boundaries are modern reference regions, not historical borders.
6. No production deploy, cloud database, or push was performed.

## Reproduced bug fixed locally

- Steps: open `/map?event=van-hoa-sa-huynh` at 320px while the popup is open.
- Expected: Cesium canvas and terrain CTA remain usable.
- Actual: fixed sidebar plus popup collapsed Cesium container to zero; timeline also covered the popup footer.
- Root cause: fixed 320px sidebar, flex popup in the same row, popup `z-index:10` below timeline `z-index:50`, and an unbounded popup content flex item.
- Files changed: `frontend/src/components/Sidebar.tsx`, `frontend/src/components/EventPopup.tsx`, `frontend/src/pages/MapPage.tsx`.
- Verification: 320/375/1280 browser checks PASS with canvas present, no zero-size error, active terrain controls, and no horizontal overflow.
