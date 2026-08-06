# Release E — V42 database closure

This document records that the V42 schema release for the production TiDB
base instance is **complete and frozen**. It does not authorize a new
migration, preflight, postflight, importer, cleanup worker execution, or any
production write of any kind. All future schema work must use V43 or later.

## Final classification

`PRODUCTION_V42_MIGRATION_PASSED`

## Immutable bindings

| Item | Value |
| --- | --- |
| Target cluster | `main` (display name `lichsuvn3d`, cluster ID `10427158774816979902`) |
| Target database | `lichsuvn` |
| Engine | TiDB Serverless, semantic version `8.5.3` |
| Migration release commit | `f74b7b5e51e0a5f399bac96accacaf6ebfac071e` |
| Final database checker commit | `5e64a451f6d0b0fc81d63a0a8659ab481cb1d687` |
| Lifecycle implementation commit | `94ae243cf14842a32683be09e480313497106286` |
| Flyway current version | `V42` |
| Flyway state | `Success` |
| Flyway validate | passed |
| V42 success checksum | `-769202000` |
| Historical migration attempts | exactly 1 |
| Additional migration attempts | 0 (zero) |
| Flyway above-target / missing / future / out-of-order / checksum-mismatched / failed rows | all 0 |

## V42 installation timestamp

The single canonical timestamping recorded in the postflight evidence is:

```
migration_execution.installed_at_utc = 2026-08-01T13:23:42Z
postflight_timestamp_utc = 2026-08-02T09:40:17.419290Z
```

The postflight timestamp strictly succeeds the migration installation
timestamp; this is enforced by the loader and confirmed by the retained
evidence below.

## Production baseline counts (recorded at postflight)

| Count | Record |
| --- | --- |
| `users_total` | `20` |
| `historical_events_total` | `361` |
| `event_media_total` | `537` |
| `active_admin_count` | `2` |

These counts are bounded and authoritative. They may only be re-recorded by
the next committed write operation, never by this document.

## Schema summary (recorded at postflight)

The V42 release adds the following immutable V42 surface to the production
TiDB cluster. **Any drift between these items and the canonical V42 source is
a fail-closed postflight mismatch**, which by policy has already correctly
stopped a hypothetical re-run.

| Object | Recorded in postflight `verification` |
| --- | --- |
| `event_media` added columns (V42) | exactly 18 named managed-storage columns, ordered as in the migration source |
| `event_media` indexes (V42) | `uk_event_media_managed_asset`, `uk_event_media_storage_identity`, `idx_event_media_managed_read`, `idx_event_media_upload_expiry` |
| `event_media` foreign key (V42) | `fk_event_media_uploaded_by` → `users(id)` |
| `event_media` CHECK constraints (V42) | 6, cross-bound by schema, owner table, name and expression across `CHECK_CONSTRAINTS` and `TIDB_CHECK_CONSTRAINTS`; enforced |
| `event_media_storage_cleanup_tasks` table | InnoDB, 13 ordered columns (id, provider, public_id, provider_asset_id, operation, task_status, attempts, next_attempt_at, claim_token, claim_expires_at, last_error_code, created_at, updated_at), 3 indexes (PRIMARY, `uk_event_media_cleanup_identity`, `idx_event_media_cleanup_claim`), zero foreign keys, zero initial rows |
| `@@global.tidb_enable_check_constraint` | `1` |

The full structured summaries live in the retained postflight evidence.

## Evidence (frozen artifacts)

These files are **frozen**. The committed standalone postflight loader
revalidates them precisely. They must not be rewritten, regenerated, moved,
or overwritten.

| Artifact | Path | File SHA-256 | Detached SHA file |
| --- | --- | --- | --- |
| Postflight JSON | `F:/tmp/release-e-v42/production-postflight-5e64a45-goal-4/postflight.json` | `b8550e7c72d81aaf0e1335c6ae307dc1bddb57267cb0fc201e5c53c37b1504db` | `F:/tmp/release-e-v42/production-postflight-5e64a45-goal-4/postflight.sha256` |
| Internal canonical SHA-256 (over payload, embedded) | `ae4c9ac2250753c44011939b548b23fe120257bc3ea5c7174b21376adbd6eb0d` | n/a — recorded in evidence `evidence_sha256` |
| Schema | `lsvn3d.release-e.v42.postflight-evidence.v1` | n/a |
| Mode | `postflight` | n/a |
| Top-level keys (exact) | `bounded_counts`, `evidence_sha256`, `flyway`, `migration_execution`, `mode`, `postflight_timestamp_utc`, `production_identity`, `release_lineage`, `retained_evidence`, `schema`, `verification` | n/a |

Retained evidence hashes referenced from the postflight (the upstream evidence
that this closure document summarises) are recorded inside
`retained_evidence`:

* `production_identity_evidence_sha256`
* `backup_evidence_sha256`
* `restore_evidence_sha256`
* `preflight_file_sha256`
* `preflight_evidence_sha256`
* `failure_inspection_file_sha256`

These upstream hashes are intentionally not reproduced here. Each one is its
own cryptographic binding to its own file outside this repository and is
verifiable only through the same postflight loader that produced them.

## Exactly-one migration statement

`migration_execution.historical_migrate_attempt_count = 1`.
The single production migrate attempt is the one recorded at
`migration_execution.installed_at_utc`. No further production migrate exists
and none is authorised.

## Zero-additional-migration statement

`migration_execution.postflight_migrate_call_count = 0`.
The standalone postflight run never produced a migrate. No future standalone
postflight run may produce a migrate.

## Flyway result

`flyway.state = Success`.
`flyway.current_version = 42`.
`flyway.pending_versions = []`.
`flyway.validate_success = true`.
`flyway.database = lichsuvn`.
`flyway.flyway_version = 11.14.1`.

## Production identity verification

`production_identity.live_user_prefix_verified = true`.
The postflight run validated the live `CURRENT_USER()` against the production
prefix documented in the identity evidence, and rejected the rehearsal
fixture prefix.

## Release lineage

`release_lineage.checkout_commit = 5e64a451f6d0b0fc81d63a0a8659ab481cb1d687`.
`release_lineage.migration_release_commit = f74b7b5e51e0a5f399bac96accacaf6ebfac071e`.
`release_lineage.linear = true` (migration release is an ancestor of the
final database checker).

## Frozen rule for future schema work

Any future schema change must:

1. Add a new Flyway migration file named `V43__*` or later under
   `backend/src/main/resources/db/migration/`.
2. Never modify migrations `V1` through `V42` (immutable).
3. Never add Flyway callbacks; the migration runner never registers one.
4. Re-run the postflight preparation only as described by the V43-onward
   release runner, after a fresh preflight evidence chain is built using
   the dedicated V43+ helper.
5. Be performed by a separate, operator-owned migration attempt. The
   V41→V42 migration was the bounded first and only production
   migration under Release E; subsequent releases follow the same
   runner pattern.

## Next phase

With V42 closed, the application lifecycle for managed event images can
begin runtime-side validation. See
[`ADMIN_MANAGED_IMAGE_LIFECYCLE.md`](ADMIN_MANAGED_IMAGE_LIFECYCLE.md),
[`ADMIN_MANAGED_IMAGE_RUNTIME_CHECKLIST.md`](ADMIN_MANAGED_IMAGE_RUNTIME_CHECKLIST.md),
and the bounded, operator-supervised manual procedure
[`ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md`](ADMIN_MANAGED_IMAGE_MANUAL_TEST_PLAN.md).
No production write, Cloudinary mutation, or production CSV import may
occur without an explicit, separately approved operator instruction.
