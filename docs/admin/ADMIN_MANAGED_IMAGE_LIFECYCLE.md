# Admin managed-image lifecycle

This document defines the application lifecycle for managed event images after
the completed Release E V42 schema release. It does not authorize a database
migration, production write, Cloudinary administration action, or cleanup
worker execution.

## API and authorization

All endpoints below are under `/api/admin`, require `ROLE_admin`, and use the
normal authenticated Admin session. Mutating requests also require the CSRF
header.

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Read event media | `GET /events/{eventId}` | Media is in the typed event detail response. |
| Upload managed image | `POST /events/{eventId}/media/images` | Existing managed upload flow. |
| Edit metadata | `PATCH /events/{eventId}/media/{mediaId}` | Does not accept managed storage identity fields. |
| Select thumbnail | `PUT /events/{eventId}/media/{mediaId}/thumbnail` | Uses the event optimistic version. |
| Replace managed image | `POST /events/{eventId}/media/{mediaId}/replacement` | Multipart file plus `expectedUpdatedAt` and optional metadata. |
| Detach media | `DELETE /events/{eventId}/media/{mediaId}` | Managed assets become asynchronous cleanup work. |
| Cleanup summary | `GET /media-cleanup/summary` | Read-only count by status. |
| Cleanup list | `GET /media-cleanup` | Read-only bounded pagination; optional `status`, `operation`, `sortBy`, and `sortDir`. |

There is deliberately no browser endpoint for arbitrary provider deletion,
process-all cleanup, or retry. The bounded scheduler owns cleanup execution and
backoff. Browser input never supplies a Cloudinary public ID or managed asset
ID as deletion authority.

## Managed storage contract

New identifiers use the established namespace:

`events/{eventId}/{thumbnail|media}/{uuid}`

The lifecycle does not require a physical `event_detail_images` folder. Each
upload and replacement sends non-secret Cloudinary ownership metadata:

- tags: `lsvn3d`, `managed-event-media`, `event-{eventId}`, and the media role;
- context: `managed_asset_id`, `event_id`, `media_role`, and `source=lsvn3d`.

The adapter uses image upload only, server-generated public IDs, `overwrite`
false, `unique_filename` false, and strips metadata. It preserves the existing
thumbnail/gallery delivery transformations. Cloudinary API keys, secrets, and
signed responses are neither returned by these APIs nor written to audit data.

On a ready asset, the V42 fields are populated as one managed identity:
`managed_asset_id`, provider/public/provider-asset IDs, original URL/version,
format and MIME type, byte size, SHA-256, dimensions, uploader/timestamp, and
`READY` state. `upload_token`, `upload_started_at`, and `upload_expires_at` are
cleared after successful publication. Legacy external media remains readable;
its `storage_type` is not treated as a V42 managed identity.

## Replacement state machine

Replacement is allowed only for a ready Cloudinary-managed image belonging to
the requested event. It preserves the media row ID, event ownership, status,
sort order, and thumbnail flag.

1. Validate the multipart image and parse the caller's exact event version.
2. Lock and validate the event/media pair before any provider call.
3. Generate a new UUID-based public ID, upload it, and validate the provider
   identity, format, dimensions, and delivery URL.
4. In a transaction, lock again, enforce the same expected version, replace
   only the managed fields on that media row, and enqueue deletion of the old
   provider/public-ID pair.
5. Emit bounded replacement and cleanup-enqueued audit entries, then commit.
6. A worker may delete the old object only after the new database reference is
   durable. The request never deletes it synchronously.

The event `updated_at` optimistic version makes a replay or stale duplicate
fail before a provider upload. A concurrent replacement cannot win the second
lock with the prior version. The API returns a stable conflict instead of
creating a second active reference.

If the provider upload fails, no database change or old-asset cleanup is made.
If database persistence fails after the new upload, a separate bounded
transaction enqueues cleanup of the new orphan only. If that compensation
cannot be recorded, the response uses the stable
`EVENT_IMAGE_REPLACEMENT_COMPENSATION_FAILED` code and logs only safe IDs for
operator reconciliation. Failure of old-asset cleanup never rolls back the new
durable reference.

## Cleanup safety and observability

Cleanup tasks use operation `DELETE` with `PENDING`, `CLAIMED`, `COMPLETED`,
or `FAILED` status. Claims have leases, attempts are bounded, retryable
provider failures use backoff, and non-retryable failures become terminal with
a bounded error code. The worker checks current storage state before deletion:
an exact `READY` active identity is never sent to the provider.

The list API permits only the status and operation values above, sorting by
`createdAt` or `nextAttemptAt`, limit 1–100, and offset 0–5000. It shows safe
task identifiers, state, attempts, timing, bounded error code, and linked media
identity where present. It exposes no provider credentials, response bodies,
or stack traces.

## Verification boundary

The local suite covers replacement success, stale version rejection, provider
failure, persistence compensation, old/new cleanup separation, ownership
metadata, active-asset cleanup protection, read-query allowlists, and Admin
route authorization. Manual production testing must follow
`ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md`; it is the first point at which a
human may perform a controlled write.
