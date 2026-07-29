# 09 — Use-case specifications

## UC-001 — Browse/search/filter

**Main flow.** Visitor opens `/browse`, filters event data, and receives event list/timeline from `/api/events` or `/api/timeline`.

**Boundary.** No live backend response verified; treat UI/API contract as static evidence.

## UC-002 — Event detail

**Main flow.** Visitor selects an event, loads `/events/:slug`, reads canonical narrative/source fields and may navigate children/related events.

**Boundary.** Source content and media availability vary; 330/361 canonical records lack an image.

## UC-004 — Terrain target

**Main flow.** Map selection passes canonical `point`, `multi_point`, `multi_polygon`, or `mixed` data to target normalizer; invalid duplicates and unsupported nationwide/no_location targets are diagnosed.

**Boundary.** Focused terrain tests pass; World Terrain token/runtime is not verified.

## UC-005 — Terrain session

**Main flow.** Enter terrain session, select target, use stale-session guard, press Escape/exit, restore overview state.

**Boundary.** Static state-machine evidence and focused tests; no browser screenshot included.

## UC-006 — Authentication

**Main flow.** Student registers/logs in, verifies email, refreshes or resets password; protected route uses auth context.

**Boundary.** External mail/OAuth and live credentials not verified.

## UC-007 — Narration

**Main flow.** Detail page requests TTS audio; backend uses Viettel provider and optional asset flow/cache.

**Boundary.** Provider token and asset flow are configuration-dependent; asset flag defaults false.

## UC-008 — AI quiz

**Main flow.** Student posts quiz generation request; AI service retrieves/generates candidates, then frontend presents a quiz session.

**Boundary.** No live AI service/Chroma corpus or quality measurement verified.

## UC-009 — Exam submission

**Main flow.** Student creates session, answers questions, submits and reads result/recovery receipt.

**Boundary.** Database and authenticated end-to-end path not runtime verified.

Use cases UC-010–UC-013 are summarized in the catalog and UML; UC-013 is explicitly planned because no evaluation dataset or metric run was found.
