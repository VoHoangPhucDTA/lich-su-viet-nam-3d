# Stage 4.A Include Fix Change Log

## Changed Files

| File | Lines | Change |
|---|---:|---|
| `stage4_assemble/apply_stage4A_include_fix.py` | 1-259 | New deterministic script for ASEAN 1995 check, forced include verification, pure-Vietnam whitelist policy, and review reports. |
| `stage4_assemble/config/manual_vietnam_include.json` | 1-88 | Updated manual whitelist to 86 dataset-existing event IDs. |
| `stage4_assemble/README.md` | 16-16 | Added the include-fix command to the Stage 4 command sequence. |
| `stage4_assemble/output/missing_asean_check.md` | 1-17 | Records that `viet-nam-gia-nhap-asean` exists with `region=vietnam`; no synthetic event was added. |
| `stage4_assemble/output/manual_vietnam_include_decision.md` | 1-112 | Records forced includes, kept/dropped `cần nhắc` decisions, and no-location candidates for GĐ4.D. |
| `stage4_assemble/output/final_events.jsonl` | generated | Rebuilt canonical output after applying manual include. |
| `stage4_assemble/output/events_json/*.json` | generated | Rebuilt per-event JSON files after applying manual include. |
| `stage4_assemble/output/build_summary.json` | 1-8 | Updated output count and manual include count. |
| `stage4_assemble/output/validation_stage4.md` | 1-28 | Validation report after rebuild. |

## Validation

- `manual_vietnam_include.json`: 86 IDs.
- `final_events.jsonl`: 407 events.
- `validate_stage4.py`: PASS, 0 errors.

## Stop Point

Stopped before GĐ4.B. No tree building or synthetic event generation was performed.
