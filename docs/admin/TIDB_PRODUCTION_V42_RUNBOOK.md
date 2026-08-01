# Production V41 -> V42 migration runbook

This runbook describes how an operator runs the fail-closed
``scripts/deploy/tidb_production_v42_migration.py`` against the
production TiDB base instance (``lichsuvn3d``, parent cluster
``10427158774816979902``) to apply exactly V42 to database ``lichsuvn``.

> **Scope.** This runbook does **not** apply to child branches.  The
> branch-rehearsal tooling lives in
> ``scripts/deploy/tidb_rehearsal_v42_*.py`` and is governed by
> ``docs/admin/TIDB_REHEARSAL_V42_RUNBOOK.md``.  The historical V37 ->
> V41 runner ``scripts/deploy/tidb_production_migration.py`` remains
> unchanged and is not exercised by this migration.

## 1. V41 prerequisite

* Flyway history must be at V41.
* Pending set must be exactly ``{V42}``.
* The dedicated runner passes Flyway ``-target=42`` explicitly for ``info``,
  ``validate``, and ``migrate``.  V41 is the installed source version, never
  the Flyway CLI target for Controlled Release E.
* Validate must pass with no invalid migrations.
* Failed migration count must be zero.
* Future, missing, ignored, deleted, baseline, out-of-order states are
  rejected.
* ``@@global.tidb_enable_check_constraint`` must be ``1``.
* At least two active Admin accounts must exist.
* Bounded baseline counts (users, historical_events, event_media,
  active Admins) are recorded before and after.

## 2. Production identity

The runner refuses anything that does not match:

| Property | Required value |
|---|---|
| Cluster ID | ``10427158774816979902`` |
| Display name | ``lichsuvn3d`` |
| Target identity | ``main`` |
| Database | ``lichsuvn`` |
| Port | ``4000`` |
| Engine | TiDB Serverless 8.5.3; authenticated Cloud metadata is exactly ``v8.5.3`` |
| User prefix | (production base prefix from authenticated TiDB Cloud metadata; not the rehearsal fixture prefix) |
| User account | CURRENT_USER() must be bound to the production prefix; never to the rehearsal fixture prefix ``3c7ghU483VQ9Ynn`` |
| TLS | ``ssl-mode=VERIFY_IDENTITY`` with the Oracle-RHCSA ca bundle |

The shared gateway hostname is permitted because production and the V42
rehearsal branch share the same TiDB Cloud gateway.  Hostname alone is
never treated as identity; the cluster ID, target identity, display
name, and prefix binding are the proof.

## 3. Required credential categories

Only canonical production variables are accepted:

| Account | Variables |
|---|---|
| Read | ``TIDB_PRODUCTION_READ_USER``, ``TIDB_PRODUCTION_READ_PASSWORD`` |
| Migrate | ``TIDB_PRODUCTION_MIGRATE_USER``, ``TIDB_PRODUCTION_MIGRATE_PASSWORD`` |
| Image digests | ``TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST`` (``sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d``), ``TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST`` (``sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964``) |

The runner refuses the migration account on the rehearsal fixture
prefix and refuses the read account if it would re-use the migrate
account or any prefix that smells like a child branch.

No credential value is logged, persisted, or accepted through command
arguments.  Credentials reach the pinned ``mysql:8.0.36`` and
``redgate/flyway:11.14.1`` containers via stdin only.

The exact immutable references passed by the runner to Docker are:

* Flyway: ``redgate/flyway@sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d``
* MySQL: ``mysql@sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964``

The mutable tags ``redgate/flyway:11.14.1`` and ``mysql:8.0.36`` are
informational version labels only; the digest-bound references above are the
execution identities.  Production execution keeps ``--pull=never`` mandatory,
so each exact digest-bound image must already exist locally.  No alternate
image or mutable-tag substitution is allowed.

## 4. Operator-supplied identity-evidence file

The runner requires an operator-supplied TiDB Cloud identity evidence
file written before any remote write.  The file is JSON and contains
exactly these keys:

```
source            approved metadata source (ticloud | tidb-cloud-console | tidb-cloud-api)
state             AVAILABLE | ACTIVE | RUNNING
cluster_id        10427158774816979902
display_name      lichsuvn3d
target_identity   main
host              *.tidbcloud.com
database          lichsuvn
user_prefix       production base prefix
engine_version    exact raw authenticated TiDB Cloud value: v8.5.3
collected_at      ISO-8601 with timezone
```

The runner refuses the file if the on-disk SHA-256 does not match the
operator-supplied ``--identity-evidence-sha256`` flag.

The evidence stores ``engine_version`` exactly as emitted by the authenticated
TiDB Cloud CLI/API.  It is not rewritten into a display label.  The Cloud
metadata validator first requires the complete raw form ``^v8\.5\.3$`` and
only then derives semantic version ``8.5.3`` for comparison.  This is distinct
from SQL ``VERSION()``, whose complete approved server structure is
``8.0.11-TiDB-v8.5.3-serverless``.  The restore diagnostic returned that exact
29-byte value (hex
``382E302E31312D546944422D76382E352E332D7365727665726C657373``).  The runner
preserves the raw value and requires a strict full match, including the stable
``-serverless`` suffix, before deriving semantic version ``8.5.3``.  Plain
MySQL strings, alternate compatibility prefixes, missing or extra suffixes,
and arbitrary text containing ``v8.5.3`` are rejected.

## 5. Backup evidence contract

The former acknowledgement-string gate is removed.  The following variables
must name existing local files; arbitrary values such as ``backup complete``
are rejected:

| Variable | File |
|---|---|
| ``TIDB_PRODUCTION_BACKUP_EVIDENCE`` | canonical backup JSON |
| ``TIDB_PRODUCTION_BACKUP_EVIDENCE_SHA256`` | detached SHA-256 for that JSON |
| ``TIDB_PRODUCTION_BACKUP_CAPTURE`` | reviewed TiDB Cloud automatic-backup capture |
| ``TIDB_PRODUCTION_RESTORE_EVIDENCE`` | canonical restore JSON |
| ``TIDB_PRODUCTION_RESTORE_EVIDENCE_SHA256`` | detached SHA-256 for that JSON |
| ``TIDB_PRODUCTION_RESTORE_CAPTURE`` | reviewed isolated-restore capture |
| ``TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE`` | independently authenticated restore identity metadata |
| ``TIDB_PRODUCTION_RESTORE_IDENTITY_EVIDENCE_SHA256`` | detached SHA-256 for the restore identity file |

Backup JSON uses schema ``lsvn3d.release-e.backup-evidence.v1`` and has exactly
the following keys.  This synthetic example contains no real credential or
UserPrefix:

```json
{"backup_id_source":"deterministic_capture_binding","backup_identity":"<lowercase-64-hex>","backup_state":"SUCCEEDED","backup_time_utc":"2026-01-01T00:00:00Z","backup_type":"automatic_snapshot","capture_path_basename":"backup-source.png","capture_sha256":"<lowercase-64-hex>","database":"lichsuvn","expires_at_utc":"2026-01-02T00:00:00Z","generated_at_utc":"2026-01-01T00:05:00Z","production_identity_evidence_sha256":"<lowercase-64-hex>","schema":"lsvn3d.release-e.backup-evidence.v1","source_cluster_id":"10427158774816979902","source_display_name":"lichsuvn3d","target_identity":"main"}
```

The authenticated production identity file from section 4 must first pass the
runner's existing identity loader.  Its exact file SHA-256 is copied into
``production_identity_evidence_sha256``.  The capture SHA is calculated from
the actual reviewed screenshot bytes; the capture must visibly show the
automatic backup time, ``SUCCEEDED`` state, and expiration time.  OCR is not a
trust input and the tool never invents a TiDB backup ID.

Because the UI does not expose a technical backup ID, the sole allowed
fallback is:

```
backup_identity = sha256(canonical_json({
  source_cluster_id, database, backup_type, backup_time_utc,
  expires_at_utc, capture_sha256
}))
backup_id_source = "deterministic_capture_binding"
```

The identity JSON above is UTF-8, sorted by key, uses compact ``,`` and ``:``
separators, has no BOM or insignificant whitespace, and has **no** trailing
newline.  The complete stored evidence JSON uses the same serialization plus
exactly one final LF byte.

All timestamps are strict RFC3339 UTC ending in ``Z``.  At both preflight and
migrate, ``backup_time_utc`` must not be in the future,
``expires_at_utc > backup_time_utc``, and ``now_utc < expires_at_utc``.  If the
automatic backup expires after preflight, migrate stops with
``BLOCKED_PRODUCTION_BACKUP_EVIDENCE`` and fresh backup **and restore** evidence
must be produced.

## 6. Restore evidence contract

Restore JSON uses schema ``lsvn3d.release-e.restore-evidence.v1`` and has
exactly these keys:

```json
{"active_admin_count":2,"check_support_enabled":true,"event_media_total":0,"failed_migration_count":0,"flyway_current_version":"41","flyway_validate_passed":true,"generated_at_utc":"2026-01-01T04:00:00Z","historical_events_total":361,"production_not_overwritten":true,"production_prefix_rejected":true,"rehearsal_prefix_rejected":true,"restore_capture_path_basename":"restore-active.png","restore_capture_sha256":"<lowercase-64-hex>","restore_cluster_id":"<isolated-non-production-cluster-id>","restore_created_at_utc":"2026-01-01T01:00:00Z","restore_database":"lichsuvn","restore_display_name":"<isolated-restore-name>","restore_engine_version":"v8.5.3","restore_identity_evidence_sha256":"<lowercase-64-hex>","restore_prefix_match":true,"restore_project_id":"<authenticated-project-id>","restore_region":"Singapore / ap-southeast-1","restore_state":"ACTIVE","schema":"lsvn3d.release-e.restore-evidence.v1","source_backup_evidence_sha256":"<lowercase-64-hex>","source_cluster_id":"10427158774816979902","source_database":"lichsuvn","users_total":3,"v42_history_row_count":0,"validated_at_utc":"2026-01-01T03:55:00Z"}
```

The restore cluster must differ from production and must not be a ``bran-*``
rehearsal branch.  It must be ACTIVE in ``Singapore / ap-southeast-1``, retain
the exact authenticated Cloud engine value ``v8.5.3``, contain database
``lichsuvn``, match its authenticated restore UserPrefix, and reject both
production and rehearsal prefixes.  Validation
must prove Flyway V41, successful validate, zero failed migrations, no V42
history row, CHECK support enabled, non-negative bounded counts, and
``production_not_overwritten=true``.  Merely creating a restore target is not
evidence.  ``validated_at_utc`` cannot precede ``restore_created_at_utc``.

``source_backup_evidence_sha256`` must equal the SHA-256 of the validated
stored backup JSON.  ``restore_identity_evidence_sha256`` must equal the
verified detached SHA of the independently authenticated restore identity
file.  The restore screenshot hash is independently recomputed from the exact
file named by ``TIDB_PRODUCTION_RESTORE_CAPTURE``.

## 7. Canonical detached hashes and local utility

Each detached file is ASCII and contains exactly one lowercase digest, in one
of these two forms, with an optional single final LF:

```
<64-lowercase-hex>
<64-lowercase-hex>  <evidence-basename>
```

There are exactly two spaces before the basename.  CRLF, uppercase, truncated
hashes, an incorrect basename, extra lines, and byte mismatches are rejected.
The digest covers the exact stored bytes, not a re-serialized object.

``scripts/deploy/tidb_release_e_v42_evidence.py`` is local-only.  Its builder
functions accept explicit operator fields, hash captures, build the canonical
objects, and ``write_evidence`` writes a new JSON plus detached SHA using
explicit output paths outside the repository.  It refuses repository output
and overwrite.  Its ``validate-backup`` and ``validate-restore`` commands
perform offline checks only.  It does not use OCR, credentials, TiDB, Flyway,
or Docker.

Keep identity, capture, JSON, and detached-SHA files in access-controlled
temporary storage outside Git.  Retain the exact immutable set through
preflight, migrate, postflight, and review.  Delete it only after Controlled
Release E is formally closed under the operator's retention policy.

## 8. Confirmation string

The typed confirmation is constructed from the verified identity:

```
main@<host>/lichsuvn:41->42
```

``37->41`` confirmations are rejected.  Placeholders are rejected.
Branch IDs are rejected.

## 9. Preflight

* Manifest pinned against its on-disk SHA-256.
* No Flyway callbacks.
* Docker context is the local daemon (no ``DOCKER_HOST`` /
  ``DOCKER_CONTEXT`` / ``DOCKER_TLS_VERIFY`` / ``DOCKER_CERT_PATH``).
* Pinned images present locally and approved by their repository
  digest.
* Flyway info returns V41 + V42 pending only.
* Flyway validate succeeds with zero invalid migrations.
* MySQL metadata confirms engine V8.5.3, database ``lichsuvn``, TLS
  v1.2 or v1.3, no failed migration, at least two active Admins,
  bounded counts captured.
* The SQL ``VERSION()`` value is exactly
  ``8.0.11-TiDB-v8.5.3-serverless`` and its extracted TiDB semantic version
  equals ``8.5.3``; Cloud metadata is never passed through this SQL-specific
  parser.
* ``CURRENT_USER()`` matches the production user prefix and does not
  match the rehearsal fixture prefix.
* Only after Flyway ``info`` and ``validate`` pass, the dedicated bounded
  baseline query returns exactly four aggregate key/value rows:
  ``users_total``, ``historical_events_total``, ``event_media_total``, and
  ``active_admin_count``.  The active-Admin definition remains the distinct
  active users joined through the ``admin`` role assignment.
* The query uses TiDB-compatible scalar-subquery grouping: a scalar ``SELECT``
  is closed before any outer ``COALESCE`` fallback argument.  The four count
  rows themselves use ``COUNT`` directly and never infer or default a count.
* The parser rejects duplicate, missing, unexpected, malformed, non-integer,
  or negative metrics.  A SQL syntax error or incomplete result is fail-closed;
  there is no retry query and no empty-string/zero substitution.
* A complete four-metric baseline is recorded for future unchanged-comparison
  and is required before the runner can return the confirmation target used to
  issue a separately authorized migration token.
* Backup and restore JSON, detached hashes, captures, cross-bindings, and
  backup freshness pass before any Flyway ``info`` or ``validate`` command.

Preflight evidence is written to a new ``.json`` file with a SHA-256
over the canonical payload (excluding the digest field).

Release D and Release E have separate, non-interchangeable preflight-evidence
state contracts.  The historical ``tidb_production_migration.py`` loader
accepts only V37 with exactly V38-V41 pending.  The dedicated Release E loader
accepts only the artifact emitted here: format version ``1``, mode
``preflight``, the reviewed release commit and production target binding,
current Flyway version V41, and the exact pending set ``{V42}``.  It also
requires the exact V42 preflight metadata shape, CHECK support equal to ``1``,
no failed or already-installed V42 history, a verified production SQL user
prefix, and all four bounded baseline counts.

For Release E, ``--before-evidence-sha256`` is the SHA-256 of the exact stored
JSON file bytes.  The loader independently verifies the artifact's embedded
``evidence_sha256`` over the canonical payload, so both byte-level file
integrity and content integrity must pass.  Target, release commit, timestamp,
and production identity binding are then checked before migration credentials
are read.  The V42 path never calls the historical Release D
``_read_evidence()`` and has no fallback to historical evidence.

There is no separate preflight-age duration.  The retained artifact is an
audited input, not a replacement for live gates: backup/restore evidence and
expiration are revalidated around artifact loading, the read account repeats
production identity, Flyway ``info``/``validate`` and bounded baseline checks,
and the backup expiration is checked again immediately before ``migrate``.  A
malformed, tampered, differently bound, or non-V41/``{V42}`` artifact stops
fail-closed before migration credential access and produces zero migrate
attempts.

## 10. Migrate

Approval gates (all required):

* Backup and restore evidence contracts in sections 5-7 pass; non-empty
  acknowledgement text is never accepted.
* At least two active Admins.
* All application backends drained (single-tenant, non-deployed).
* Single migration owner.
* Maintenance window.
* Rollback owner.
* Runtime security settings verified (TLS, cookies, allowed origins,
  no fake-storage, no ``admin-e2e`` profile).
* Explicit ``--execute-migrate`` confirmation.

The migrate stage first revalidates the Release E artifact with the dedicated
V42 loader and revalidates the identity/backup/restore evidence contract.  It
then completes live read-account Flyway ``info`` + ``validate`` and bounded
baseline checks before reading migration credentials.  It re-reads both
backup/restore JSON files, all detached hashes and capture bindings, and checks
backup expiration again immediately before the Flyway ``migrate`` command; it
never relies only on a prior preflight report.
It then runs ``migrate`` with the migration account, followed by ``info`` +
``validate`` with the read account.  Flyway's JSON response is parsed and validated against
``V42 only``.

Post-migration MySQL metadata is queried (read account); the V42
schema footprint (18 managed-storage columns, 4 indexes, FK,
cleanup-task table, 6 CHECK constraints visible in
``information_schema.CHECK_CONSTRAINTS`` and
``information_schema.TIDB_CHECK_CONSTRAINTS``) is asserted; the V42
Flyway history row count + checksum is asserted; bounded counts are
asserted unchanged.

## 11. Postflight

Production V42 has already been applied exactly once.  The authoritative
migration column is ``upload_expires_at`` as declared by
``V42__add_managed_event_image_storage.sql``; ``storage_expires_at`` was a
checker-only typo and was never part of the production schema contract.  The
checker correction permits a read-only postflight only.  The V42 migration
must not be rerun, and no manual DDL is permitted to make production match a
faulty checker.  Any postflight schema mismatch remains fail-closed.

Requires:

* The same retained backup/restore evidence chain passes before any Flyway
  command, preserving audit continuity.

* Exactly one Flyway V42 success row.
* Zero failed migrations.
* Validate passes.
* V42 checksum matches the recorded value.
* All 18 managed-storage columns exist on ``event_media``.
* All 4 V42 indexes exist.
* ``fk_event_media_uploaded_by`` exists.
* ``event_media_storage_cleanup_tasks`` exists.
* All 3 cleanup-task CHECK constraints exist.
* All 6 CHECK constraints are visible in both
  ``information_schema.CHECK_CONSTRAINTS`` and
  ``information_schema.TIDB_CHECK_CONSTRAINTS``.
* ``@@global.tidb_enable_check_constraint`` remains ``1``.
* Bounded counts unchanged versus the preflight baseline.

## 12. Failure handling

On any failure, the runner: stops immediately; never retries; never
runs ``repair`` / ``baseline`` / ``clean``; never completes partial
DDL; never edits the Flyway schema history.  The error message
includes the failing stage and exit code; no secret is logged.

Empty subprocess output surfaces as
``EMPTY_SUBPROCESS_OUTPUT: stage=<stage> outer_exit=<code>`` so the
operator can localize the failure.

## 13. Local backend / frontend run

After the database migration succeeds, the thesis application runs
locally:

* Backend ``./mvnw spring-boot:run`` (or the operator's preferred
  local launch).  Backend reads from the same TiDB; no schema
  rerun is performed against TiDB - V42 is already applied.
* Frontend ``npm run dev`` (or the operator's preferred local
  launch).  ``VITE_API_BASE_URL`` points at the local backend.
* Bound smoke-test Admin account is used for a bounded browser run,
  not a destructive automation loop.

## 14. Rollback limitations

V42 introduces managed-storage metadata, indexes, FK and CHECK
constraints.  Rollback is **schema-only restore-based**: the operator
must restore a backup taken before the V42 migrate; the runner will
not offer ``flyway repair`` or ``flyway clean``.  The rehearsal
branch (``lichsuvn3d-admin-v42-rehearsal``, ``bran-3uewl2rhirehfg67jczif3bet4``)
is **not** deleted by this migration.

## 15. Rehearsal branch retention

The V42 rehearsal branch remains intact:

* Branch: ``lichsuvn3d-admin-v42-rehearsal``
* Technical branch ID: ``bran-3uewl2rhirehfg67jczif3bet4``
* Parent cluster ID: ``10427158774816979902``

The rehearsal runner continues to enforce ``bran-`` prefix isolation
and CURRENT_USER() rejection of production prefixes.  This production
runner rejects any ``bran-*`` cluster ID and any rehearsal fixture
prefix.  The two runners share the parent cluster but never share
data; their userPrefixes must differ.

## 16. Sequence vs the production V37 -> V41 runner

| Concern | ``tidb_production_migration.py`` (V37->V41) | ``tidb_production_v42_migration.py`` |
|---|---|---|
| Target identity | ``main`` | ``main`` |
| Cluster ID | ``10427158774816979902`` | ``10427158774816979902`` |
| Display name | ``lichsuvn3d`` | ``lichsuvn3d`` |
| Database | ``lichsuvn`` | ``lichsuvn`` |
| Manifest | ``tidb-production-v41.sha256`` | ``tidb-production-v42.sha256`` |
| Transition | 37 -> 41 | 41 -> 42 |
| Preflight evidence state | V37 + exactly V38-V41 pending | V41 + exactly V42 pending |
| Preflight evidence loader | Historical ``_read_evidence()`` only | Dedicated V42 loader only; no historical fallback |
| Production manifest SHA pin | runtime-computed | runtime-computed |
| V42 audit SQL via metadata_sql | n/a | required |
| Bran-* child branch detection | n/a | required |
| Rehearsal fixture prefix ban | n/a | required |
| Bounded counts | ``users`` + ``events`` + roles | ``users`` + ``events`` + ``event_media`` + active_admins |

## 17. Credential discipline

Reference values in this runbook are intentionally non-secret.  No
real production credential, password, or token is reproduced here.
Whoever runs the migration supplies the four ``TIDB_PRODUCTION_READ_*``
and ``TIDB_PRODUCTION_MIGRATE_*`` variables plus the two
``TIDB_PRODUCTION_*_IMAGE_DIGEST`` values via their preferred operator
mechanism (Windows User environment, local ``.env``, or signed shell
wrapper) and never pastes them into chat or screenshots.
