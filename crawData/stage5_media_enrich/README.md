# Stage 5 Media Enrichment

Stage 5 is reserved for media enrichment after the Stage 4B curated event tree has been built.

## Workflow through Phase 2A

```text
Stage1 data
-> generated candidates
-> human review
-> approved mapping config
-> validation
```

The workflow stops there for Phase 2A. Approved mappings are still not published, imported, enriched into event JSON, copied into frontend assets, or displayed to users.

## Phase 1 scope

Phase 1 builds a deterministic, reviewable candidate analysis from Stage 1 crawl images to possible historical events. It does not approve, publish, import, or display any image.

This phase may generate files under `crawData/stage5_media_enrich/output/` only. Source crawl JSON, source image files, Stage 4B event JSONL, database data, backend code, and frontend code must remain unchanged.

## Inputs

- `crawData/stage1_crawl/lich_su_10_kntt.json`
- `crawData/stage1_crawl/lich_su_11_kntt.json`
- `crawData/stage1_crawl/lich_su_12_kntt.json`
- `crawData/stage1_crawl/images/`
- `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`

## Outputs

- `output/image_event_candidates.jsonl`: one record per Stage 1 image JSON record.
- `output/image_event_candidates_review.md`: human-readable review report grouped by grade, lesson, and image.
- `output/image_candidate_summary.json`: machine-readable summary and statistics.

The output directory is generated data. Re-running the generator overwrites these artifacts deterministically.

## Command

Run the Phase 1 candidate generator from the repository root:

```powershell
python crawData/stage5_media_enrich/build_image_candidates.py
```

Optional overrides:

```powershell
python crawData/stage5_media_enrich/build_image_candidates.py `
  --stage1-dir crawData/stage1_crawl `
  --core-events crawData/stage4b_curate_tree/output/phase2/core_events.jsonl `
  --output-dir crawData/stage5_media_enrich/output
```

## Phase 2A approved mapping

Phase 2A introduces a human-maintained approved mapping config:

```text
crawData/stage5_media_enrich/config/approved_event_image_mappings.json
```

This file is not generated automatically. It records explicit image-event approval decisions after human review. Candidate output can suggest possible events, but it must not be treated as approval.

Generated source metadata lives in `output/image_event_candidates.jsonl`, including source captions, source alt text, image metadata, and candidate event lists.

Human-maintained approval metadata lives in `config/approved_event_image_mappings.json`, including image identity, approved targets, thumbnail choice, sort order, review notes, curated alt text, and optional `captionOverride`.

Do not copy source captions manually into the approved mapping config. The validator fails any stale `caption` field in that config. The effective caption is resolved as `captionOverride` when present, otherwise the generated candidate `caption`.

Each image mapping uses `targets[]` because relationship metadata belongs to an individual image-event relationship:

```json
{
  "sourceImage": "crawData/stage1_crawl/images/grade_12/12952/img_01.png",
  "lessonId": "12952",
  "altText": "Reviewed alt text",
  "status": "approved",
  "targets": [
    {
      "eventId": "ho-chi-minh-cong-bo-tuyen-ngon-doc-lap",
      "isThumbnail": true,
      "sortOrder": 1,
      "reviewNote": "Caption directly identifies the event."
    }
  ]
}
```

Do not replace this with a top-level `targetEventIds[]`; one source image may later map to multiple events with different `isThumbnail`, `sortOrder`, and review notes.

Use `captionOverride` only when a reviewer intentionally changes the candidate caption. When present, it must be a non-empty UTF-8 string and is checked for likely mojibake along with `altText`, `reviewNote`, and `overrideReason`.

Validate approved mappings from the repository root:

```powershell
python crawData/stage5_media_enrich/validate_approved_mappings.py
```

## Mapping rule

The only deterministic mapping used in Phase 1 is:

```text
Stage1 image -> lesson_id -> textbookContent.textbookRefs[].lessonId -> core event id
```

No title matching, caption matching, filename matching, semantic matching, or LLM inference is used.

## Mapping statuses

- `single_candidate`: the image record is valid and its lesson ID maps to exactly one core event. This is still not approval.
- `ambiguous`: the image record is valid and its lesson ID maps to multiple core events.
- `unresolved`: the image record is valid, but no core event references its lesson ID.
- `invalid`: the image record cannot produce a valid local image candidate, for example `src = "#"`, malformed path, or missing file.

## Important warning

Candidate output is not approved mapping data. Approved mapping config is still not published/imported media data. Neither artifact may be imported into the database or shown to users in Phase 1 or Phase 2A.

## Summary metric note

`candidateCardinality.lessonsMappingToMultipleEvents` counts all lesson IDs referenced by core event textbook refs. `candidateCardinality.imageLessonsMappingToMultipleEvents` counts only Stage 1 lesson IDs that have image records and map to multiple events.

## Known limitations

- Lesson-level matches are many-to-many and do not prove that an image belongs to a specific event.
- Stage 1 captions are preserved as-is, including any markup or OCR/crawl artifacts.
- Empty `alt` values are reported but not generated or fixed.
- Duplicate physical image files are detected by SHA-256 and reported only; no duplicate is removed in Phase 1.
