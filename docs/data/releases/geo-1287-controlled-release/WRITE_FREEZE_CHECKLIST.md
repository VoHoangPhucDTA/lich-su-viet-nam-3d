# Release F operational write-freeze checklist

The repository owner is the only actor authorized to assert this freeze. The
owner must inspect the current deployment/tooling state, copy the attestation
template to a non-template evidence file, enter their real owner identity and
start time, and approve it only after every competing writer below is disabled.
The template itself is intentionally invalid (`owner` and `freezeStartedAt` are
blank and `ownerApproved=false`). It contains no credential.

The freeze covers all writes to `historical_events`, not only geography fields
or the target row. The exact guarded Release F update is the sole write admitted
after attestation validation. The JDBC transaction does not globally freeze
TiDB and the CLI does not establish the organizational freeze.

## Source-grounded writer inventory

| Writer | Can affect `historical_events`? | Required state during freeze |
| --- | --- | --- |
| `AdminEventMutationRepository` | Yes: Admin event INSERT/UPDATE. | Backend mutation traffic stopped; verification runtime uses DB read account. |
| `AdminEventPublicationRepository` | Yes: publication/status UPDATE. | Disabled by read-account runtime and no Admin mutation requests. |
| `AdminEventMediaMutationRepository` | Yes: media mutation bumps event version. | Disabled by read-account runtime and no media mutations. |
| `AdminEventImageRepository` | Yes: managed image operations bump event version. | Upload disabled; read account; no mutation requests. |
| `AdminEventGeographyMutationRepository` | Yes: Admin geography UPDATE. | Disabled by read-account runtime and no Admin mutation requests. |
| `EventJsonImportRunner` (`import-events` profile) | Yes: event INSERT/UPDATE. | Profile absent; process stopped. |
| `HistoryRagImportService` (`history-rag-import` profile) | Yes: package event UPDATE. | Profile absent; all release/import write flags false; process stopped. |
| `CanonicalGeographySyncRunner`/repository | Yes: geography UPDATE. | Profile/process absent; `allow-write=false`; `APP_CANONICAL_GEO_SYNC_ENABLED` absent. |
| `scripts/ApplyEventAssociationsToDb.java` | Yes: event association UPDATE. | Tool not running. |
| `scripts/e2e/run_admin_e2e.py` | Yes: test event INSERT against its configured datasource. | Tool not running and never pointed at the release target. |
| Flyway event-data migrations V12/V14/V16/V20 | Yes if a migration runner executes them. | All migration runners stopped; Flyway startup disabled. |

Repository audit found no `@Scheduled` method that directly updates
`historical_events`. Scheduled jobs are nevertheless disabled during the freeze
so verification has no background write path, and the owner attests
`scheduledWriters=DISABLED`.

## Owner sequence

1. Stop/drain every ordinary backend instance and every importer, sync, script,
   migration runner, CI job, terminal, or operator session capable of event writes.
2. Establish the read-only verification runtime below and confirm no other
   developer/operator is writing events.
3. Record `freezeStartedAt`, the exact writer inventory/states, statement, real
   owner identity, and `ownerApproved=true` in a new evidence artifact.
4. Pass that artifact to the Release F apply CLI. The gate must pass before the
   CLI loads datasource credentials or opens its write connection/transaction.
5. Keep the freeze active through apply, commit, full postflight, and API GET.
6. End it only after `SUCCESS`, or guarded recovery plus verified
   `SAFE_FAILURE_STATE`. Postflight failure never releases the freeze.

## Repository-supported read-only API runtime

The API postflight may run only after ordinary backend instances are drained.
Launch a dedicated backend verification instance with:

- profile `remote-production` (where `spring.flyway.enabled=false`), plus the
  process override `SPRING_FLYWAY_ENABLED=false`;
- `SPRING_TASK_SCHEDULING_ENABLED=false`;
- `APP_EVENT_IMAGE_UPLOAD_ENABLED=false`;
- `APP_EVENT_IMAGE_CLEANUP_ENABLED=false`;
- `AI_RECEIPT_CLEANUP_ENABLED=false`;
- `APP_TTS_ASSET_FLOW_ENABLED=false`;
- no `import-events`, `history-rag-import`, or `canonical-geo-sync` profile;
- `HISTORY_RAG_IMPORT_ALLOW_WRITE=false` and
  `CANONICAL_GEO_SYNC_ALLOW_WRITE=false`, with all release/import/sync enable
  variables absent;
- `SPRING_JPA_HIBERNATE_DDL_AUTO=validate`;
- the production **read account**, never a migration, restore, importer, or
  Release F write account.

Only `GET /api/events/khang-chien-chong-quan-nguyen-1287-1288` (and read-only
health requests if needed) may be sent. The database read account is the final
technical barrier: endpoint configuration alone is not treated as read-only.
If a verified read account or any listed override is unavailable, API postflight
is blocked and Release F cannot be classified successful.
