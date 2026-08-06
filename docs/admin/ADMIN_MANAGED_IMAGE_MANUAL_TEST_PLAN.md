# Admin managed-image manual test plan

Use this plan only after the operator has confirmed the completed V42 release
and the backend is configured for the intended production operation. This plan
does not authorize Flyway, imports, or changes outside one dedicated draft
event.

## Isolation and baseline

- [ ] Choose exactly one dedicated **draft** event; never use an important or
  published historical event. Record its ID and slug.
- [ ] Use a non-sensitive image with a unique filename and visible marker such
  as `release-e-manual-YYYYMMDD-HHMM`.
- [ ] Record browser time, backend log start time, event status, media count,
  current thumbnail, and the Admin cleanup summary/list count.
- [ ] Where the operator has read access, record the relevant Cloudinary
  resource count under the event namespace; do not reveal credentials.

## Upload and readback

- [ ] Upload the image through the Admin UI. Confirm typed success, one new
  media row, expected thumbnail flag, image dimensions/format, and one
  Cloudinary object at `events/{eventId}/{role}/{uuid}`.
- [ ] Verify all V42 managed fields identify the same asset and Cloudinary
  tags/context identify the event and media role. Confirm an audit entry.
- [ ] Refresh the browser; restart the backend only through the approved safe
  operator process; confirm one visible media record, working URL, and no
  duplicate asset.
- [ ] Edit caption and alt text, refresh, and confirm persistence without an
  unnecessary asset upload.
- [ ] Set the test image as thumbnail and confirm exactly one intended active
  thumbnail, public rendering, and no duplicate provider object.

## Replacement

- [ ] Capture the old media ID, event version, public ID, and asset marker.
- [ ] Choose a second uniquely marked image and select **Thay asset** only on
  the ready managed image. Confirm the dialog and client-side file validation.
- [ ] Confirm the media row ID, event ownership, status, sort order, and
  thumbnail flag are retained while the V42 storage identity becomes new.
- [ ] Confirm the new Cloudinary object has a new UUID public ID and ownership
  tags/context. Confirm the old object remains available until the new database
  reference is durable.
- [ ] Open `/admin/media-cleanup`; confirm exactly the old public ID is queued
  for `DELETE`, with no task for the new active asset. The browser must not run
  cleanup itself.
- [ ] After the approved scheduler has run, confirm old-object deletion or an
  explained retry/failed task. A failed old cleanup does not invalidate the new
  image.

## Detach and final cleanup

- [ ] Detach only the test media using the existing confirmation dialog.
- [ ] Confirm the media reference changes as expected and cleanup owns the
  exact test public ID; never accept an unrelated cleanup target.
- [ ] Confirm the scheduler completes cleanup or leaves an explicit,
  explainable failed task. Do not use an arbitrary provider delete command.
- [ ] Remove the dedicated draft event only through an approved supported
  workflow, then verify media/cleanup counts return to the recorded baseline
  and no test Cloudinary object remains.
- [ ] Retain screenshots and sanitized log excerpts; never retain secrets,
  access tokens, cookies, or complete provider responses.

## Failure checks and abort rules

Check unsupported formats, oversized files, stale version/replayed request,
expired upload token, unauthorized non-admin account, interrupted upload,
Cloudinary failure, database failure after upload, and cleanup failure only
through a safe non-production mechanism when possible. Do not deliberately
damage production infrastructure.

Stop immediately if the wrong event is selected, an important image would be
overwritten, more than one unexpected row changes, more than one thumbnail is
active, the old asset is deleted before replacement commits, cleanup targets an
unrelated public ID, count drift is unexplained, Flyway attempts a migration,
or logs expose credentials.
