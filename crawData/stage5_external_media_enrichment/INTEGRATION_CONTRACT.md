# Integration contract with the existing Stage5 post-review pipeline

## Existing post-review code is preserved

Keep the user's completed Stage5 post-review work:

```text
finalize_manual_review.py
verify_media_pipeline.py
test_post_review_pipeline.py
```

The external phase is additive. It does not remove their dry-run/apply safety or verifier.

## Full re-review base is authoritative

Use:

```text
reviewed_base/approved_event_image_mappings_reviewed.json
```

as the complete re-reviewed textbook-image base.

Important: do **not** rebuild this artifact from the current legacy `finalize_manual_review.py`. The completed re-review contains:

- multi-event relationships
- one-thumbnail-per-event arbitration
- non-thumbnail gallery relationships
- physical dedupe decisions

The activation tool validates and installs that final artifact directly, dry-run first.

Base scale:

```text
approved images = 121
relationships = 175
target events = 103
thumbnail relationships = 103
```

## New external-media artifacts

After trusted-source discovery, download, and review:

```text
external_event_images/
  assets/<sha256>.<ext>
  by_event/<eventId>/image_01.<ext>
  by_event/<eventId>/image_02.<ext>
  external_event_image_manifest.json
  external_event_media_review_decisions.json
```

Supporting source artifact:

```text
authoritative_verification_sources.json
```

Finalizer outputs:

```text
external_event_image_candidates.jsonl
approved_external_event_image_mappings.json
combined_image_candidates.jsonl
approved_event_image_mappings_combined_preview.json
external_media_finalize_report.json
```

## Why a combined candidate artifact is used

The current validator and publisher protect source hashes by requiring every approved `sourceImage` to exist in the candidate artifact.

Do not weaken that rule.

External reviewed assets become candidate rows with:

```text
lessonId = external-web
sourceType = external-web
contentHash = downloaded sha256
sourceMetadata = provenance + license + verification URLs
```

Then:

```text
combined_image_candidates.jsonl
= current image_event_candidates.jsonl
+ reviewed external candidate records
```

## Historical verification is target-specific

A canonical image can be shared across events. Therefore each approved external target records its own:

```text
historicalVerificationUrl
relationType
reviewNote
```

The asset-level metadata still records file source, download URL, author/credit, license, and known original source.

## Required publisher change

The current publisher rejects every relationship where `isThumbnail != true`.

That restriction is no longer compatible with:

- the completed full re-review (already has gallery relationships), and
- the new two-images-per-event external phase.

The included `publish_approved_media_v2.py` removes only that slice restriction while keeping:

- source image existence checks
- candidate lookup
- lessonId match
- content-hash match
- extension match
- event existence checks
- duplicate relationship checks
- one thumbnail per event
- unique positive sortOrder per event
- content-addressed public assets

Behavior:

```text
isThumbnail = true  -> media.thumbnail
isThumbnail = false -> media.items[]
```

Gallery item:

```json
{
  "type": "image",
  "url": "/media/event-images/<sha256>.<ext>",
  "caption": "...",
  "sortOrder": 2
}
```

The existing `verify_media_pipeline.py` already has dynamic expected counts and thumbnail/gallery checks, so keep using it after publish.

## Final merge order

```text
1. activate and validate completed full re-review base
2. compute the exact remaining uncovered set
3. acquire/review 2 external images for those events only
4. convert approved external assets into candidate rows
5. merge reviewed base mappings + approved external mappings
6. dedupe by sourceImage / physical hash
7. enforce one thumbnail per event
8. enforce unique sortOrder per event
9. validate combined config
10. publish with publisher v2
11. verify
```

No external image is added to the 103 already-covered events unless a later explicit phase requests it.

## Expected final scale when all 258 missing events pass review

```text
core events = 361
already covered = 103
missing = 258
external relationships = 2 x 258 = 516
base relationships = 175
expected total relationships = 691
expected final target events = 361
```

The number of **unique physical web assets may be lower than 516** because one historically valid source image can be shared across multiple events. All counts remain dynamic.

## Safety boundary

The downloader, reviewer, external validator, and external finalizer do not:

- mutate live approved config
- publish frontend assets
- import DB data
- call the API
- modify backend/frontend production code

Only explicit activation/apply and later Codex integration should mutate repository config. DB/API/UI checks remain after zero-error publish verification.
