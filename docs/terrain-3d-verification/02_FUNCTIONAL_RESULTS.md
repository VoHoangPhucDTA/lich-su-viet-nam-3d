# Functional runtime results

| Check | Result | Evidence |
|---|---|---|
| Local backend API returns all six slugs and `sourceJson.mapData` | PASS | six localhost detail requests, HTTP 200 |
| Point CTA / active controls | PASS | browser |
| Multi-point target list | PASS | browser observed 2 point buttons |
| Multi-polygon target list | PASS | browser observed 19 region buttons |
| Mixed target list | PASS | browser observed 2 point + 2 region buttons |
| Overview and restore controls | PASS | browser; `aria-pressed=true` on overview |
| Nationwide/no-location policy | PASS | no terrain CTA and no terrain session |
| World Terrain provider / relief | PASS | Cesium canvas and active terrain UI observed |

The browser verified UI/session state and visible Cesium rendering. Exact camera coordinates, provider request totals, and historical boundaries remain observational rather than numerically measured.
