# Stage 4.A2.5 Display Review Change Log

## Changed Files

| File | Lines | Change |
|---|---:|---|
| `stage4_assemble/build_event_display_review.py` | 1-205 | New deterministic review script to classify events into `keep_major`, `keep_child`, `exclude_display`, and `review`. |
| `stage4_assemble/config/display_exclude_seed.json` | 1 | Empty manual seed for later human-approved exclusions. |
| `stage4_assemble/README.md` | 18-18 | Adds display review command to the Stage 4 command list. |
| `stage4_assemble/output/event_display_review.md` | generated | Human review report for event display eligibility. |
| `stage4_assemble/output/display_exclude_suggestion.json` | generated | Machine-proposed IDs for display exclusion and human review. |

## Stop Point

No event has been removed or hidden from `final_events.jsonl`. Human review is required before applying exclusions.
