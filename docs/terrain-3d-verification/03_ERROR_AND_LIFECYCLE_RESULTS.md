# Error and lifecycle results

| Scenario | Result | Evidence |
|---|---|---|
| Backend startup against local MySQL | PASS after V12→V23 fix | Flyway validated 24 migrations; schema V23 |
| Enter → active → restore → close | PASS | browser |
| Layer change while terrain active | PASS | session/dialog cleared |
| Mixed target → overview → restore | PASS | browser |
| Resource lifecycle 10 rounds | PASS | 10/10 UI rounds completed: open, overview, restore, close; no stale dialog/state observed |
| Viewer zero-size at 320px | FIXED and PASS after layout fix | reproduced before fix; no zero-size error after fix |
| Provider/network error fallback | UNVERIFIED | no forced provider outage |
| Viewer destroyed during an in-flight promise | UNVERIFIED | source guards observed; no forced route race |

The browser console also showed existing non-fatal Cesium geometry warnings and an unrelated event-view CORS warning. No unhandled terrain exception was observed after the responsive fix.
