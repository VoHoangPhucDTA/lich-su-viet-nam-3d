# Stage 4.A Change Log

## Changed Files

| File | Lines | Change |
|---|---:|---|
| `stage4_assemble/prepare_indexes.py` | 21-85, 127-134 | Added GADM display-name mapping so `provinceNames` can show human-readable province names while internal lookup still uses GADM `NAME_1`. |
| `stage4_assemble/build_final_events.py` | 162-178, 214-225, 279-292, 321-326 | Converts internal GADM names to display province names in final JSON and resolves display names back to GADM refs for validation/map data. |
| `stage4_assemble/validate_stage4.py` | 23-39, 156-163 | Adds validation that final `provinceNames` do not leak glued GADM names such as `HảiDương`. |
| `stage4_assemble/build_vietnam_include_suggestion.py` | 1-181 | New A3 report generator; proposes include candidates only, does not mutate whitelist. |
| `stage4_assemble/README.md` | 12-22 | Documents canonical schema and new review command. |
| `stage4_assemble/output/schema_canonical_decision.md` | 1-32 | Records A1 decision to keep code schema as canonical. |
| `stage4_assemble/output/vietnam_include_suggestion.md` | generated | A3 review report: nên đưa / cần nhắc / không đưa. |

## Validation

- Rebuilt indexes and final output.
- At this historical checkpoint, final count remained 321 because `manual_vietnam_include.json` was not changed.
- Current status: Stage 4A now outputs 407 candidate events; Stage 4B Phase 2.3 curates them into 361 core tree nodes and 50 supporting items.
- `validate_stage4.py` passes after A2.

## Stop Point A

Waiting for human review of:

1. `output/schema_canonical_decision.md`
2. `output/vietnam_include_suggestion.md`

No whitelist entries have been applied yet.
