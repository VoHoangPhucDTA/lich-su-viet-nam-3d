# Repository Guidance

## Modules

- `backend/`: Spring Boot 4, Java 21, Maven, MySQL/Flyway.
- `frontend/`: React, TypeScript, Vite, Vitest.
- `scripts/`, `data/`, `docs/`: data tooling, packages and reports.

## Commands

- Backend compile: from `backend/`, `./mvnw.cmd -DskipTests compile`.
- Backend tests: from `backend/`, `./mvnw.cmd test`.
- Frontend tests/build/lint: from `frontend/`, `npm run test`, `npm run build`,
  `npm run lint`.
## Database safety

- History RAG remains local-first. The canonical content source is the audited
  package under `data/history-rag/v1`; TiDB must never be used as a source to
  copy old narratives, SGK content, or `raw_json` back into the package.
- Remote database writes are denied by default.
- Do not edit Flyway migrations `V1` through `V28`. Do not place workbook data
  in Flyway migrations. Do not expose `local:` sources publicly.
- Never put TiDB credentials, tokens, or connection secrets in source code,
  scripts, logs, committed configuration, or documentation.

### Release A

- Release A is completed. It covered Flyway migrations `V23` through `V28`,
  importing the approved `data/history-rag/v1` package, and its audit rows.
- Release A must not be rerun as a way to overwrite canonical package content.

### Controlled Release B

- A single controlled Release B to the approved TiDB database `lichsuvn` is
  permitted only for:
  - creating and restore-testing a backup before the release;
  - applying Flyway migration `V29__drop_legacy_event_textbook_ref_content.sql`;
  - read-only validation of Flyway history, schema, API output, and data counts;
  - restoring the pre-release backup if rollback is required.
- Release B may not modify event narratives, textbook content, textbook-ref
  rows, source catalog rows, RAG package data, or any migration `V1` through
  `V28`. Its only intended remote schema change is removal of
  `event_textbook_refs.content`.
- Before every Release B remote write, verify and record:
  - active datasource hostname, database name, and active profile;
  - the approved TiDB hostname and database name `lichsuvn`;
  - Flyway migrations `V1` through `V28` are successful with no failed rows;
  - `event_textbook_contents` exists and has canonical content before dropping
    the compatibility column;
  - no production API, importer, or frontend code still reads or writes
    `event_textbook_refs.content`;
  - a backup containing at least `flyway_schema_history`,
    `historical_events`, `event_textbook_refs`, and
    `event_textbook_contents`;
  - restore evidence for that backup on a disposable database.
- Stop before applying V29 when any preflight, backup, restore-evidence, or
  Flyway-history gate fails. Do not use `flyway repair` unless a specific
  failed migration is inspected and explicitly approved.
- After V29, verify:
  - Flyway version `29` is successful and no failed migrations exist;
  - `event_textbook_refs.content` no longer exists;
  - `event_textbook_contents.content` remains present;
  - event-detail API returns `textbookContent`, does not return `sourceJson`,
    and still returns textbook refs and public external sources;
  - UTF-8 content and package-derived counts remain unchanged;
  - frontend event-detail smoke test passes.
- Rollback after V29 is restore-based: restore the verified pre-release backup.
  Do not recreate the dropped compatibility column ad hoc on TiDB.

### Controlled Release C

- A single controlled Release C to the approved TiDB database `lichsuvn` is
  permitted only for:
  - creating and restore-testing a full pre-release backup;
  - applying Flyway migration
    `V30__add_textbook_ref_detail_visibility.sql`;
  - importing the audited `data/history-rag/v1` package whose package SHA-256
    is exactly
    `25fea8369332b6585cab9d81ca60e9dbae6b6ffcd7cc350600a6e4878246a529`;
  - read-only validation of Flyway history, package-managed data, API output,
    and frontend event-detail behavior;
  - rollback from the import audit or verified pre-release backup when a
    release gate fails.
- Release C may modify only package-managed event narratives, textbook
  references and visibility, textbook content, textbook-content relations,
  source catalog rows, event-source relations, and the associated import audit
  rows. It must not modify users, authentication, progress, TTS assets, media,
  or unrelated application data.
- Do not edit Flyway migrations `V1` through `V30`. The workbook remains
  external to the repository and workbook data must not be embedded in Flyway.
- Before every Release C remote write, verify and record:
  - active datasource hostname, database name, and active profile;
  - the approved TiDB hostname and database name `lichsuvn`;
  - Flyway migrations through `V29` are successful with no failed rows or
    checksum mismatch, and V30 is the only pending migration;
  - workbook SHA-256
    `001751243f659c449c6622ff7b417ad74fc12cf2f72dcf59305fad11bca6ee4c`
    and the approved package SHA-256 above;
  - a full pre-release backup including Flyway history and every table that the
    package importer can read or modify;
  - successful restore evidence for that exact backup on a disposable MySQL
    database;
  - importer write mode remains disabled until V30 succeeds and a post-V30
    dry-run reports no missing identities, conflicts, or unexpected rows.
- Stop before applying V30 when target, Flyway, package, backup, or restore
  evidence is invalid. Stop before importing when the post-V30 dry-run is
  blocked. Do not use `flyway repair` and do not bypass datasource guards.
- After Release C, verify:
  - Flyway V30 is successful and no failed migrations exist;
  - `event_textbook_refs.show_on_detail` exists;
  - package-derived counts are 361 events, 386 active textbook references,
    359 visible references, 27 hidden references, 361 textbook contents, and
    386 textbook-content relations;
  - the nine approved removal/quarantine reference IDs are absent;
  - event `chien-thang-bach-dang-938` exposes only textbook reference `120272`;
  - event-detail API hides supporting references, excludes `local:` sources,
    and preserves UTF-8 content;
  - a second importer run is idempotent with zero writes;
  - frontend event-detail smoke tests pass.
- Data rollback should use the recorded import run ID and conditional audit
  rollback while no later writes exist. Full rollback, including V30, is
  restore-based from the verified pre-release backup; do not perform ad hoc
  remote schema reversal.
- Release C is complete after evidence is recorded and must not be rerun to
  overwrite canonical package content.

### Controlled Release D

- Release D covers only the reviewed Admin schema transition from Flyway V37
  to V41 on the approved TiDB production target `main`, database `lichsuvn`.
  It may apply only:
  - `V38__increase_event_updated_at_precision.sql`;
  - `V39__add_user_mutation_versions.sql`;
  - `V40__add_admin_mutation_guard.sql`;
  - `V41__add_active_admin_guard_counter.sql`.
- Read-only production preflight is permitted using the dedicated read
  account and the guarded runner documented in
  `docs/admin/TIDB_PRODUCTION_MIGRATION_RUNBOOK.md`.
- A production `migrate` is not authorized merely by this repository policy.
  It requires a separate explicit operator approval after all Release D gates
  pass. Only the standalone pinned runner may execute that one migration job;
  Spring Boot startup Flyway must remain disabled.
- Before the Release D write:
  - use a reviewed release commit on a short-lived PR branch, never an
    uncommitted checkout or a direct push to `main`;
  - prove the TiDB Cloud target is production `main`, the database is exactly
    `lichsuvn`, and the engine/version matches the successful rehearsal;
  - require Flyway V1-V37 successful, exactly V38-V41 pending, zero failed,
    missing, future, out-of-order, or checksum-mismatched migrations;
  - verify the exact V1-V41 manifest and approved Flyway/MySQL image digests;
  - retain the preflight evidence file and its detached SHA-256;
  - have a current encrypted backup and successful restore rehearsal for that
    exact backup on an isolated target;
  - verify at least two active Admin accounts, drain all backend instances,
    freeze application writes, assign one migration owner, a maintenance
    window, and a rollback owner;
  - use separate read and migration accounts and verified TLS hostname
    validation; never place credentials or certificate private keys in Git,
    command arguments, logs, or evidence.
- Release D must not run importers or modify event narratives, textbook/RAG
  content, media/storage, exam data, learning data, or unrelated application
  records. Do not use manual schema fixes, `flyway repair`, `baseline`,
  `clean`, or any migration other than V38-V41.
- After Release D, require Flyway V41 plus successful validation,
  `DATETIME(6)` version columns, signed `users.auth_version`, the singleton
  Last-Admin guard/counter, unchanged bounded operational counts, and no
  failed migration. Rollback is restore-based under the named rollback owner;
  do not reverse these migrations with ad-hoc SQL.
- Release D is complete only after its sanitized preflight, migration, and
  postflight evidence has been reviewed and recorded.

### Controlled Release E

- Release E covers exactly the Flyway V41 to V42 transition on the TiDB
  production base instance with cluster ID `10427158774816979902`, display
  name `lichsuvn3d`, target identity `main`, and database `lichsuvn`.
- It may apply only
  `backend/src/main/resources/db/migration/V42__add_managed_event_image_storage.sql`
  through `scripts/deploy/tidb_production_v42_migration.py`, using only Flyway
  `info`, `validate`, and `migrate`.
- Before the write, require fail-closed verification of the production
  identity and user-prefix binding, the immutable V1-V42 manifest and image
  digests, V41 with only V42 pending, successful validation, zero failed or
  unsafe migration states, `@@global.tidb_enable_check_constraint = 1`, a
  current backup and successful restore rehearsal, two active Admins, drained
  backends, one migration owner, a maintenance window, a rollback owner, and
  reviewed preflight evidence with its detached SHA-256.
- Postflight must prove Flyway V42 and successful validation, the exact V42
  columns, indexes, foreign key, cleanup-task table, and six CHECK constraints
  in both TiDB constraint metadata views, unchanged bounded counts, and no
  failed migration. Rollback is restore-based; do not reverse V42 ad hoc.
- Do not use the rehearsal runner, the historical V37-to-V41 runner, Spring
  Boot startup Flyway, or any root/bootstrap Flyway path against production
  for Release E. Do not run `repair`, `baseline`, `clean`, manual DDL, manual
  DML, an importer, or edits to `flyway_schema_history`.
- Do not deploy the backend or frontend to a hosting platform in Release E.
  After migration, only bounded local backend/frontend verification is
  permitted. Do not delete the retained V42 rehearsal branch during this
  release.
- Release E authorizes no migration after V42 and no other production write.

- For all work outside the explicitly authorized Release A, Release B,
  Release C, Release D, or Release E,
  only `localhost`, `127.0.0.1`, and Testcontainers are allowed write targets.

## Migrations and workspaces

- Do not edit existing Flyway migrations V1-V22. Add the next real version.
- Do not put large workbook data in Flyway migrations.
- Do not drop `event_textbook_refs.content` until the compatibility cleanup
  workspace is explicitly approved.
- Do only the workspace explicitly requested. Stop and report its result.
- Do not commit or push unless explicitly requested.

## Data conventions

- Keep textbook refs separate from event-level textbook content.
- Preserve provenance and exact workbook counts.
- Keep corrections pending page verification; do not mark them verified.
- Do not expose `local:` sources as public links.
