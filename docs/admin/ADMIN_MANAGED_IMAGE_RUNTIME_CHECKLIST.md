# Admin managed-image runtime checklist

This checklist is the operator-run, read-only validation of the completed
Admin managed-image lifecycle against the production TiDB instance. **It
must never produce a production write, importer run, cleanup worker
execution, Cloudinary mutation or schema-history change.**

Use this checklist on a single dedicated host, with operator-supplied
production read credentials only, and the bounded process-scoped overrides
documented in `runtime configuration overlays` below. The companion
human-controlled test plan lives in
[`ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md`](ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md).

## Phase 0 — Pre-flight

- [ ] V42 closure evidence validated
  ([`RELEASE_E_V42_DATABASE_CLOSURE.md`](RELEASE_E_V42_DATABASE_CLOSURE.md))
- [ ] Lifecycle commit validated: `94ae243cf14842a32683be09e480313497106286`
- [ ] Repository checkout is exactly:
  - branch `feat/admin-managed-image-lifecycle`
  - HEAD `94ae243cf14842a32683be09e480313497106286`
  - working tree has only pre-existing unrelated changes (no new local edits)
- [ ] V42 SQL unchanged; no `V43__*` exists; V42 manifest pin unchanged

## Phase 1 — Runtime configuration (safe no-write overlays)

The backend reads configuration from
`backend/src/main/resources/application.properties` plus the supply-tree.
The runtime must use **only the production application read account** and
must disable every feature that could produce a write. Apply all of the
following process-scoped overrides (matching Spring Boot env / `-D` syntax):

| Variable | Required value | Effect |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | `remote-production` (also acceptable: `default` with explicit overrides) | Sets Spring to remote-profile; the bridge profile must never combine with this |
| `SPRING_FLYWAY_ENABLED` | `false` | Flyway must not run on startup |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `validate` | Hibernate must not mutate schema |
| `APP_EVENT_IMAGE_UPLOAD_ENABLED` | `false` | New managed uploads must be disabled for read-only smoke |
| `APP_EVENT_IMAGE_CLEANUP_ENABLED` | `false` | Scheduled cleanup worker must not run |
| `AI_RECEIPT_CLEANUP_ENABLED` | `false` | AI receipt cleanup must not run |
| `exam.retention.enabled` | `false` | Exam retention must not run |
| `app.tts.asset-flow-enabled` | `false` | TTS asset flow must not run |
| `SPRING_DATASOURCE_URL` | production read URL (no wider scope) | Read-only DB connection |
| `SPRING_DATASOURCE_USERNAME` | application read account only | No migration / restore account |
| `SPRING_DATASOURCE_PASSWORD` | supplied by operator | Never stored in source, logs, screenshots |

Credentials reaching the JVM must come only from the operator-supplied
mechanism (User environment, local `.env`, or signed wrapper). Never set
them in command arguments, source, logs, screenshots, or chat.

The following variables must be **absent** (no value set, no default
fallback):

* `TIDB_PRODUCTION_MIGRATE_USER`
* `TIDB_PRODUCTION_MIGRATE_PASSWORD`
* `TIDB_PRODUCTION_RESTORE_USER`
* `TIDB_PRODUCTION_RESTORE_PASSWORD`
* `APP_CLOUDINARY_*` (Cloudinary upload/delete is disabled for read-only
  smoke; replace/replace substitute remains a logical contract only)
* `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Phase 2 — Read-only production baseline (before backend startup)

Run carefully-scoped SQL through the bounded read-only account before
starting the backend, recording the values to a temporary, sanitised file:

- [ ] users total
- [ ] historical events total
- [ ] event media total
- [ ] active admins total
- [ ] cleanup task total + status counts
- [ ] successful V42 Flyway history row count
- [ ] maximum Flyway installed rank/version

Only known counts must equal:

* users `20`
* historical events `361`
* event media `537`
* active admins `2`

Cleanup counts are not assumed; record actual values.

## Phase 3 — Backend startup (read-only mode)

- [ ] Backend started with safe no-write overlays
- [ ] Logs show application started; datasource connected; health endpoint
      available
- [ ] Logs do NOT show: `Migrating schema`, `Applying migration`, `Hibernate`
      create/update, `seed/import started`, cleanup `claim`/`process`/`delete`,
      or Cloudinary `upload`/`delete`
- [ ] Backend health endpoint responds 200/healthy
- [ ] No Flyway migrate / repair / baseline / clean call observed

## Phase 4 — Read-only backend smoke checks (GET only)

All requests must be `GET` or `HEAD`. Use an existing legitimate Admin
browser session only where required. **Never bypass authentication,
fabricate an Admin token, disable security, or invoke CSRF bootstrap
unnecessarily for writes.**

- [ ] `GET /actuator/health` returns 200/healthy
- [ ] Readiness endpoint (if present) returns a healthy/live signal without
      invoking write paths
- [ ] Public event list/read endpoint returns successfully
- [ ] `GET /api/admin/events` (Admin list) returns successfully
- [ ] `GET /api/admin/events/{id}` (Admin detail) returns successfully
- [ ] Admin media data inside the event detail deserialises correctly
      with managed media fields populated
- [ ] `GET /api/admin/media-cleanup/summary` returns expected status
      keys (`pending`, `claimed`, `failed`, `completed`)
- [ ] `GET /api/admin/media-cleanup` returns a bounded paginated list
- [ ] Replacement route exists in mappings but is NOT invoked during read-only
      smoke

## Phase 5 — Frontend (Vite dev server only)

Start the frontend dev server pointing to the local backend. Do NOT
deploy to a hosting platform.

- [ ] Admin event list renders
- [ ] Admin event editor media section renders existing media items with
      status badges
- [ ] **Replace** action button is visible only for eligible active managed
      images; legacy/unmanaged media do NOT have it
- [ ] Replacement confirmation dialog opens and closes without submitting
      (do NOT upload any file; do NOT click the confirm button)
- [ ] Cleanup navigation entry is present
- [ ] Cleanup summary/list page renders loading, success, and error states
- [ ] No form is submitted; no upload/replacement/thumbnail/detach/delete
      is performed

## Phase 6 — Read-only production baseline (after smoke)

Run the same carefully-scoped SQL as Phase 2. The values must be
**identical** to the Phase 2 baseline. Required outcomes:

- [ ] users total unchanged
- [ ] historical events total unchanged
- [ ] event media total unchanged
- [ ] active admins total unchanged
- [ ] cleanup task total + status counts unchanged
- [ ] successful V42 Flyway history row count unchanged
- [ ] Flyway maximum installed rank/version unchanged
- [ ] Zero `POST`, `PUT`, `PATCH`, `DELETE` application requests in
      backend access logs
- [ ] Zero Cloudinary operations in logs
- [ ] Zero cleanup-worker claims in logs
- [ ] Zero Flyway migrate calls in logs

## Phase 7 — Manual production test readiness (operator-controllable)

After Phase 6 passes, the operator may execute the bounded
[`ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md`](ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md)
on a **separate, explicit operator-controlled run** — not in this
read-only validation session.

- [ ] Manual test event selected (dedicated **draft** event only)
- [ ] Manual baseline captured (one initial + one replacement image)
- [ ] Upload test ready
- [ ] Replacement test ready
- [ ] Cleanup observation ready
- [ ] Detach test ready
- [ ] Final cleanup ready

These steps require:
* Explicit operator decision to leave read-only mode.
* An explicit `APP_EVENT_IMAGE_UPLOAD_ENABLED=true` override.
* An explicit `APP_EVENT_IMAGE_CLEANUP_ENABLED=true` override.
* Cloudinary credentials in the running JVM.
* A real Cloudinary write path.

Until those are explicitly enabled, the managed-image lifecycle cannot be
exercised end-to-end because the runtime is locked into no-write mode.

## Stop conditions

The following stop conditions map to the classifier in the operator's
final readiness report:

- Unique mismatch of any pre-flight evidence (file SHA, detached SHA,
  canonical SHA, schema, bounded counts, lineage) →
  `BLOCKED_DATABASE_RELEASE_CLOSURE_STATE`
- Failure to disable Flyway / Hibernate schema mutation / importer / cleanup /
  upload / TTS / AI receivers at startup →
  `BLOCKED_RUNTIME_CONFIGURATION`
- Forbidden startup activity observed (migrate, repair, baseline, clean,
  schema-mutation, importer, cleanup worker execution, Cloudinary mutation)
  →
  `BLOCKED_RUNTIME_STARTUP`
- Any of the read-only checks fails to return the expected contract →
  `BLOCKED_ADMIN_IMAGE_RUNTIME_API`
- Any phase 2 vs phase 6 count drift not explained by the documented
  non-write activity →
  `BLOCKED_RUNTIME_READ_ONLY_SIDE_EFFECT`
- Any feature-focused test, compile, targeted lint check regression
  during preparation →
  `BLOCKED_TEST_REGRESSION`

Only when all of the above pass may the final readiness classifier become:

`ADMIN_IMAGE_RUNTIME_READY_FOR_MANUAL_TEST`
