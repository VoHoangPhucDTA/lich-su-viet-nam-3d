# Stage5 external historical image source policy

## Goal

For every event that still has no approved image after the full re-review, acquire exactly two reviewable web images:

1. `image_01.*` — proposed thumbnail
2. `image_02.*` — proposed gallery item

No web image becomes approved merely because a search engine or local algorithm ranks it highly.

## Three-gate evidence model

Every approved external image must pass all three gates:

### 1. Asset provenance and reuse

Where the image file comes from, who created it, and what license permits reuse.

Automatic acquisition accepts only explicit reusable licenses/public-domain markers. A manual source override must record rights metadata.

### 2. Authoritative historical verification

Why the image actually belongs to the event must be supported by a page on a trusted history/official domain.

The package therefore has a separate artifact:

```text
authoritative_verification_sources.json
```

The review UI requires a `historicalVerificationUrl` for **each slot** before an event can be approved. The external finalizer and validator reject an approved image when the URL is absent or outside that event's trusted domain list.

### 3. Image → event relationship

A reviewer must classify the relation as only:

- `direct`
- `strong_contextual`

Any weaker relation is rejected.

## Asset-source priority

### Tier A — automatically downloadable when reuse metadata is explicit

1. Wikimedia Commons file pages with an explicit free license or public-domain status.
2. Official international/national archives with explicit reusable-media terms, supplied via an exact manual override.

### Tier B — authoritative historical verification sources

Depending on period/topic, the plan prefers domains such as:

- `baotanglichsu.vn` — National Museum of History
- `luutru.gov.vn` — archival material
- `hochiminh.vn` — Hồ Chí Minh portal
- `tulieuvankien.dangcongsan.vn` / `dangcongsan.vn`
- `qdnd.vn` / military museum sources
- `nhandan.vn`
- `vietnamplus.vn` / Vietnam News Agency
- `chinhphu.vn`, `quochoi.vn`, `mofa.gov.vn`
- `un.org`, `unesco.org`, `asean.org`, `europa.eu`

These sites are historical/official verification sources. Their images are **not automatically assumed reusable** unless the page/file states a suitable license.

## Why the asset and historical source can be different

For safe publication, one page may provide reusable image bytes while a second authoritative page establishes historical correctness.

Example pattern:

```text
asset source        = Commons file page with CC/Public Domain license
historical source   = National Museum / archive / official institution page
review result       = direct or strong_contextual
```

This is stricter than treating search rank, Wikipedia, or a caption token match as historical evidence.

## Automatic license gate

The automatic downloader accepts only raster images with metadata indicating one of:

- Public Domain
- CC0
- CC BY
- CC BY-SA

It rejects obvious:

- NonCommercial
- NoDerivatives
- fair use
- all-rights-reserved/copyright-only markers

## Historical relationship gate

Approve only:

### `direct`

The image is the person, document, place, object, map, ceremony, battle, or action directly identified with the event.

### `strong_contextual`

The image is not a photograph of the exact moment but directly illustrates the event's concrete historical content.

Reject:

- generic modernization/development symbolism
- same-era-only matches
- same-lesson-only matches
- shared token matches
- broad thematic similarity
- wrong country
- wrong period
- wrong historical actor
- attractive but non-specific stock imagery

## Search/retrieval score policy

All local retrieval scores are clues only.

Never approve because:

```text
score is high
candidate is top 1
same lesson
nearby chronology
many title/caption tokens match
```

Approval is based on the image itself, event content, provenance, authoritative verification, and relation classification.

## Folder and dedupe rules

Human-review tree:

```text
external_event_images/
  by_event/
    <eventId>/
      image_01.<ext>
      image_02.<ext>
      sources.json
```

Canonical storage:

```text
external_event_images/
  assets/
    <sha256>.<ext>
```

Event folders use hardlinks when possible. The same physical image can validly serve multiple events without duplicated bytes. Final mappings group one canonical source asset with multiple event targets.

## Integration rule

For each previously image-less event:

- slot 1: `isThumbnail = true`, `sortOrder = 1`
- slot 2: `isThumbnail = false`, `sortOrder = 2`

The original 103 events covered by the full textbook re-review remain unchanged by this acquisition phase.

## Completeness rule

The target is two images for all 258 missing events, but correctness wins over forced completeness.

If either slot lacks:

- a correct historical relationship,
- an authoritative verification URL,
- or safe provenance/license metadata,

then the event remains `needs_replacement`/unresolved rather than receiving a generic or misleading image.
