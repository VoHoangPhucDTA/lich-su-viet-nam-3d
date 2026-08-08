# Final Map Browser Matrix

| Case | Sidebar | Map/footer | Popup/terrain | Result |
|---|---|---|---|---|
| Year 40 | Bắc thuộc collection | `1 mục chính • 1 điểm` | Usable | PASS |
| Year 40 + `điện` | No result | `0 mục chính • 0 điểm` | No orphan marker | PASS |
| Year 938 + cultural | Chăm-pa only | `1 mục chính • 0 điểm` | `Không có địa điểm` | PASS_EXPECTED_NO_LOCATION |
| Year 1010 | Collection plus atomic children after expand | `2 mục chính • 1 điểm` | Atomic selection usable | PASS |
| 1287 | Selected detail | Four canonical targets | Four terrain controls exercised | PASS |
| Điện Biên 1954 | Selected detail | Five canonical targets | Him Lam and Mường Thanh exercised | PASS |

Marker/legend verification: atomic and collection legend samples, selected state, dimmed peers, selected label policy, numbered cluster badge wording, and footer were present. Cluster expansion behavior is covered by focused tests; no naked cluster number was observed.
