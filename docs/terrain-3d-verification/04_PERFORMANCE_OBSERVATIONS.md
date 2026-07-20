# Performance observations

- Vite dev server ready on localhost; Cesium canvas initialized at 1280, 375, and 320 pixel widths.
- 10 lifecycle rounds completed without a visible stale popup or terrain state.
- Production Vite build PASS: 3,553 modules; CSS 84.92 kB (gzip 16.31 kB); JavaScript 5,715.47 kB (gzip 1,445.46 kB); 474 static items copied; 44.78s in the latest pre-commit run.
- No FPS, GPU memory, provider request count, or exact terrain-load timing was instrumented; those remain `UNVERIFIED`.
- Existing production build warning about a large JavaScript chunk remains outside this runtime fix.
