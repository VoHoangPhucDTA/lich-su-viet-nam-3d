# Accessibility and responsive results

| Criterion | Result |
|---|---|
| Native buttons for CTA, targets, overview, restore, close | PASS |
| `role=dialog` with accessible event name | PASS |
| `aria-live` loading/error messaging | PASS (source/runtime structure) |
| Overview `aria-pressed` | PASS; active overview reported `true` |
| Visible selected target text/icon | PASS |
| Desktop 1280x720 terrain popup | PASS |
| Mobile 375x800 terrain popup | PASS after responsive fix |
| Narrow 320x700 terrain popup | PASS after responsive fix |
| Horizontal overflow at all three sizes | PASS; scrollWidth matched viewport |
| Tab/Enter/Space focus traversal in browser harness | UNVERIFIED; harness did not advance focus with synthetic Tab |
| Escape close | PASS in browser lifecycle check |

The mobile fix hides the fixed 320px sidebar below `md`, overlays the popup above the timeline, and allows the popup content to scroll while keeping actions visible.
