# Admin event image upload

Phase B adds a backend-only, managed image path for event thumbnails and gallery
images. It does not add frontend upload controls.

## Runtime gate

New uploads and cleanup are independent capabilities:

```text
APP_EVENT_IMAGE_UPLOAD_ENABLED=false
APP_EVENT_IMAGE_CLEANUP_ENABLED=false
```

Keep upload disabled until Flyway V42 has been applied and a dedicated
non-production Cloudinary smoke check has passed. Cleanup may be enabled while
upload remains disabled so already-created cleanup tasks can drain. There is no
local-disk fallback.

For TiDB, the migration owner must verify through a new TLS connection that
`@@global.tidb_enable_check_constraint = 1` before applying V42. The deployment
must fail closed when this value is not `1`; V42 deliberately does not change a
cluster-global setting. The reviewed V42 SHA-256 is
`e24949201f5d291e57b04472b3cda1d65811b26ea6a899a550f38ab70ff15a43`.

Cloudinary credentials remain environment-only. The adapter keeps Cloudinary's
official signing and response handling but supplies a bounded HTTP5 strategy
with connect, connection-pool and response timeouts and automatic retry
disabled. It uses exact backend-generated public IDs, no folder option, no
overwrite and a metadata-stripping incoming transformation.

## Accepted input

Phase B accepts static JPEG and PNG files only. Input WebP is intentionally
deferred because the Java 21 runtime does not have a pinned, reviewed ImageIO
reader that passes the required lossy, lossless, alpha, malformed, truncated and
animation capability gate. Cloudinary delivery may still negotiate WebP or AVIF
through `f_auto`.

The endpoint limits a file to 10 MiB, each dimension to 6000 pixels and decoded
pixel count to 25,000,000. It requires meaningful alternative text and ignores
the browser filename and claimed MIME type.

## Saga and cleanup

The database reservation commits before the provider upload, so no event lock or
database transaction remains open during a network call. A second transaction
finalizes a successful upload and bumps the event version exactly once.
Reservations and delete-pending rows are hidden from Admin/public reads and
completeness calculations.

Cleanup tasks are durable and survive media/event cascade deletion. The worker
claims one expired task using a token and lease, performs provider deletion
outside a database transaction, treats provider not-found as success, retries
only retryable failures with bounded backoff, and marks terminal failures
hidden. Cloudinary CDN invalidation is requested but may be eventually
consistent.

Provider original URLs, public IDs, asset IDs, checksums and raw responses are
storage-only data. API responses expose only backend-generated transformed
delivery URLs.
