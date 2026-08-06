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

## Validation run results

These checkboxes record what was actually completed in this validation
session. They must be re-checked by the operator on a separate
credential-supplied run for the residual items below.

| Phase | Description | Status in this session |
| --- | --- | --- |
| 1 | Repository state, lifecycle commit, V42 unchanged | PASS — see "Phase 0 — Pre-flight" and "Phase 1 — Runtime configuration" below |
| 2 | V42 evidence SHA bindings revalidated | PASS — see "Phase 2 — Read-only production baseline" run is documented but requires operator-supplied credential; see "Operator session for residual phases" below for manual procedure |
| 3 | No-write runtime overlay established from source | PASS — see "Phase 1 — Runtime configuration" |
| 4 | Pre-start production read-only baseline captured | NOT EXECUTED — operator-supplied production read credential is required |
| 5 | Backend startup logs (no write paths) | NOT EXECUTED — credential-gated |
| 6 | GET/HEAD smoke against backend | NOT EXECUTED — credential-gated |
| 7 | Frontend dev server read-only rendering | PARTIAL — see "Operator session for residual phases" below for manual operator procedure |
| 8 | Post-smoke baseline identical to pre-start | CANNOT BE PROVEN without phases 4 and 6 — operator session for residual phases below |
| 9 | Documentation update | COMPLETED through this document |
| 10 | Documentation-only commit | PENDING on operator `Documentation commit` step (see "Operator session for residual phases") |

Final classification pending operator completion of phases 4, 6 and 8.
Until then: `BLOCKED_RUNTIME_STARTUP`.

## Operator session for residual phases

The operator runbook for completing phases 4 through 8 on a separate,
credential-supplied machine is documented at the end of this
document under `Operator session for residual phases`. The final
classification may move from `BLOCKED_RUNTIME_STARTUP` to
`ADMIN_IMAGE_RUNTIME_READY_FOR_MANUAL_TEST` only after phases 4, 6
and 8 produce identical before/after counts and zero forbidden
activity in logs.

## Phase 0 — Pre-flight

- [x] V42 closure evidence validated
  ([`RELEASE_E_V42_DATABASE_CLOSURE.md`](RELEASE_E_V42_DATABASE_CLOSURE.md))
- [x] Lifecycle commit validated: `94ae243cf14842a32683be09e480313497106286`
- [x] Repository checkout is exactly:
  - branch `feat/admin-managed-image-lifecycle`
  - HEAD `7fe0e3ebbcb2d578bcbe3f4cbba40f6e51b02ad5` (docs commit; lifecycle commit `94ae243` is an ancestor)
  - working tree has only pre-existing unrelated changes (no new local edits)
- [x] V42 SQL unchanged; no `V43__*` exists; V42 manifest pin unchanged

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

## Operator session for residual phases (phases 4–8)

The remaining phases require operator-supplied production read credentials
and an existing legitimate Admin browser session, **outside this
validation session**. The operator who runs them must complete, in order:

### Required environment on a credential-supplied machine

* Production application **read** account only. No migration, restore, or
  rehearsal credentials may be present on the host or in the JVM.
* A `.env` (or equivalent operator wrapper) carrying only:
  * `SPRING_DATASOURCE_URL`
  * `SPRING_DATASOURCE_USERNAME`
  * `SPRING_DATASOURCE_PASSWORD`
  The user and password must be supplied via env, never in the command.
* Spring Boot wrapper script providing `SPRING_PROFILES_ACTIVE=remote-production`
  and the overrides listed in `Phase 1 - Runtime configuration`. The
  script must run `java` (or `./mvnw.cmd spring-boot:run`) only after
  the env is loaded and must redirect stdout/stderr to a temporary
  local log file under `run-logs/` inside the operator's working
  directory. The log file is sanitised after the session.

### Phase 4 (Pre-start baseline)

Run these **count-only** SQL statements, no row dumps, no media content
fetch:

```sql
SELECT COUNT(*) FROM users;                                            -- users_total
SELECT COUNT(*) FROM historical_events WHERE status='published';     -- published events
                                                              -- (informational only)
SELECT COUNT(*) FROM historical_events;                                -- historical_events_total
SELECT COUNT(*) FROM event_media;                                      -- event_media_total
SELECT COUNT(*) FROM users u WHERE EXISTS (                          -- active_admin_count
    SELECT 1 FROM user_roles r
    WHERE r.user_id = u.id
      AND r.role = 'admin'
      AND u.status = 'active'
);
SELECT task_status, COUNT(*) FROM event_media_storage_cleanup_tasks
  GROUP BY task_status;                                                -- cleanup status counts
SELECT COUNT(*) AS v42_history_row_count FROM flyway_schema_history
  WHERE version='42' AND success=1;                                    -- V42 success row count
SELECT MAX(installed_rank) AS max_rank, MAX(version) AS max_version
  FROM flyway_schema_history;                                          -- Flyway max rank/version
```

Record every value to a temporary `pre-start-baseline.json` (delete after
the session). The session is aborted with
`BLOCKED_RUNTIME_READ_ONLY_SIDE_EFFECT` if `users_total`,
`historical_events_total`, `event_media_total`, or
`active_admin_count` differ from the canonical baseline
(`20`, `361`, `537`, `2`) without an explained authorised change.

### Phase 5 (Backend startup in no-write mode)

Start the backend with the documented overlays. Allow 30s of startup
time. Inspect the temporary log for **forbidden** terms:

- `Migrating schema`, `Successfully applied`, `Migration of schema`
- `Schema-validation: schema update`, `drop table`, `alter table`
- `seed/import started`, `DataImportRunner`, `HistoryRagImportRunner`
- `Cleanup claimed`, `cleanupId=`, `Storage delete`
- `Cloudinary upload`, `Cloudinary destroy`, `signed_url`

A clean start produces:

- `Started BackendApplication in N.NN seconds`
- `Tomcat started on port 8080`
- `Active profile: remote-production`
- `HikariPool-1 - Start completed.`
- Either no `- Flyway Community Edition N.N.N` line, or a line that
  explicitly reports `disabled`

If any forbidden term appears in startup, the operator must stop the
backend immediately and classify
`BLOCKED_RUNTIME_STARTUP`.

### Phase 6 (Read-only GET/HEAD smoke)

The operator uses the existing legitimate Admin browser session:

- `GET /actuator/health` (must be public via SecurityConfig line 164)
- `GET /actuator/health/liveness` and `/readiness` if implemented
- `GET /api/home` (a public endpoint, used to confirm Tomcat routing)
- `GET /api/admin/events?limit=10&offset=0`
- `GET /api/admin/events/{existingEventId}` (use a known dedicated
  draft)
- `GET /api/admin/media-cleanup/summary`
- `GET /api/admin/media-cleanup?limit=10&offset=0`

The event-detail response must include `media.items[*]` with the
V42 managed-shape fields (`managedAssetId`, `storageProvider`,
`storagePublicId`, `storageState`, `storageMimeType`).

The replacement route exists at
`POST /api/admin/events/{eventId}/media/{mediaId}/replacement`, but
**must not be invoked** during the smoke. The operator must confirm
its presence in the running route table without sending a request
(only GET is allowed in this session).

A failure of any of the above contracts classifies
`BLOCKED_ADMIN_IMAGE_RUNTIME_API`.

### Phase 7 (Frontend dev server read-only rendering)

The operator starts the Vite dev server
(`npm run dev -- --port 5173`) and uses the same Admin browser session:

- Open `/admin/events` — list renders.
- Open `/admin/events/{id}` for the draft event — editor page renders.
- In the media section, verify that active managed images show the
  **Replace** button and legacy/unmanaged media do not.
- Click **Replace** once on an eligible managed image, observe the
  dialog opens, then click **Hủy** (cancel) and confirm the dialog
  closes. **Do not** click the confirm action.
- Open `/admin/media-cleanup` — summary cards and list render.
  Confirm no retry/process-all button exists.
- Inspect network: only `GET`/`HEAD` calls during the session.
  **No `POST`/`PUT`/`PATCH`/`DELETE`.**

A failure of any of the above classifies
`BLOCKED_ADMIN_IMAGE_RUNTIME_API`.

### Phase 8 (Post-smoke baseline)

Re-run the Phase 4 SQL. The values must be **identical**. The operator
also inspects the backend log for any `POST`, `PUT`, `PATCH`, `DELETE`
hits, any `Migration`/`Schema update`/`Cloudinary`, and any cleanup
worker claim. A drift classifies
`BLOCKED_RUNTIME_READ_ONLY_SIDE_EFFECT`.

### Phase 9 (Documentation update)

The operator (not the validating agent) updates
[`RELEASE_E_V42_DATABASE_CLOSURE.md`](RELEASE_E_V42_DATABASE_CLOSURE.md)
only to add a short cross-reference to the now-completed runtime
smoke. Database closure facts remain unchanged.

### Phase 10 (Commit)

The operator commits via:

```
git add docs/admin/ADMIN_MANAGED_IMAGE_RUNTIME_CHECKLIST.md
git add docs/admin/RELEASE_E_V42_DATABASE_CLOSURE.md
git commit -m "docs(admin): verify image runtime read-only smoke"
```

After this commit, the readiness classifier becomes:

`ADMIN_IMAGE_RUNTIME_READY_FOR_MANUAL_TEST`

After all of the above the bounded
[`ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md`](ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md)
becomes executable by a separate, operator-supplied Admin browser
session with explicit image-upload/cleanup and Cloudinary credentials
never present in this read-only validation run.
