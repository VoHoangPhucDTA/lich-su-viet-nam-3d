# Production V41 -> V42 migration runbook

This runbook describes how an operator runs the fail-closed
``scripts/deploy/tidb_production_v42_migration.py`` against the
production TiDB base instance (``lichsuvn3d``, parent cluster
``10427158774816979902``) to apply exactly V42 to database ``lichsuvn``.

> **Scope.** This runbook does **not** apply to child branches.  The
> branch-rehearsal tooling lives in
> ``scripts/deploy/tidb_rehearsal_v42_*.py`` and is governed by
> ``docs/admin/TIDB_REHEARSAL_V42_RUNBOOK.md``.  The historical V37 ->
> V41 release path in ``scripts/deploy/tidb_production_migration.py`` is not
> exercised by this migration; the dedicated V42 runner uses only its neutral
> shared command and Docker-safety helpers.

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

### Docker CLI resolution contract

A successful ``docker version`` in the parent shell proves neither which
executable the Python runner will resolve nor that a later child environment
can resolve the same executable.  The runner therefore resolves Docker once,
before child-environment sanitization, from the trusted parent-process
``PATH`` and, on Windows, its platform ``PATHEXT`` behavior.  The resolver
accepts only a normalized absolute path to an existing regular Docker
executable in an absolute parent search directory.  It does not accept an
arbitrary executable override, implicitly trust the current working directory,
or hard-code a machine- or user-specific Docker Desktop path.

Every Docker subprocess -- context and daemon checks, image inspection,
Flyway/MySQL command execution and cleanup -- uses that same validated absolute
executable path as the first argument of an argument vector.  No shell or
command-string execution is used.  Resolution happens against the trusted
parent context before the sanitized child environment is built, so a child
``PATH`` that omits Docker's directory cannot hide or replace the already
resolved executable.  The resolver and runner do not modify the permanent
parent environment.

The runner reports these local failures as distinct fail-closed blockers:

* executable not found versus an empty, relative, nonexistent, directory or
  otherwise invalid executable path;
* executable launch failure, command timeout with sanitized operation and
  elapsed-time context, command nonzero exit, and daemon unavailable;
* exact approved image absent, repository-digest mismatch, and daemon or image
  OS/architecture mismatch.

Context and daemon probes retain their 15-second bound.  Local read-only image
inspection has a separate bounded 60-second allowance for Docker daemon
cold-start latency and is never retried.

None of these diagnostics weakens the immutable-image gate.  The exact Flyway
and MySQL digest-bound references listed above, Linux/amd64 platform checks,
local image-presence requirement and ``--pull=never`` remain mandatory.  A
resolved Docker executable never authorizes a pull or a mutable-tag
substitution.

Production V42 has already been installed successfully exactly once.  This
Docker-resolution correction authorizes no further migration attempt: migrate
must never be rerun.  Only the standalone read-only postflight may follow, and
this correction does not itself run that postflight or claim that it passed.

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
schema footprint (18 managed-storage columns, complete ordered index
definitions, complete FK definition, cleanup-task table, and 6 CHECK
constraint definitions visible in
``information_schema.CHECK_CONSTRAINTS`` and
``information_schema.TIDB_CHECK_CONSTRAINTS``) is asserted.  The V42 Flyway
history version, description, script, checksum and success state are pinned;
bounded counts are asserted unchanged.

## 11. Postflight

Production V42 has already been applied exactly once.  The authoritative
migration execution commit is
``f74b7b5e51e0a5f399bac96accacaf6ebfac071e``.  The schema-checker correction
was committed afterward; it changes the read-only checker contract and does
not authorize another migration attempt.

Standalone postflight deliberately has two separate release bindings:

* ``--expected-release-commit`` is the exact lowercase 40-hex commit at the
  current checker checkout and must equal ``git rev-parse HEAD``.
* ``--expected-migration-release-commit`` is required only for standalone
  postflight and must be exactly
  ``f74b7b5e51e0a5f399bac96accacaf6ebfac071e``.  It is forbidden in preflight
  and migrate modes; those modes retain their original same-checkout/same-
  artifact-commit binding.
* ``--before-evidence`` remains bound to the migration release commit, its
  exact file SHA-256 and embedded canonical SHA-256.  The separately supplied
  ``--failure-inspection`` is bound by its exact file SHA-256 and detached
  SHA-256 file to that same migration release, target, single migrate attempt,
  successful V42 history row, preflight counts and known old-checker mismatch.
  Neither retained artifact is rewritten or inferred from its filename.

The migration release must be an ancestor of the current checker checkout.
Git inspection permits post-migration changes only in the explicit reviewed
allowlist for the V42 checker, its focused tests, this runbook and the related
rehearsal diagnostic.  V1-V42 SQL, the production V42 manifest and Flyway
callbacks may not differ.  Protected runner AST contracts also reject changes
to credentials, production identity/target constants, confirmation tokens,
Flyway target construction or migration execution semantics.

### TiDB CHECK-metadata SQL compatibility correction

The previous final standalone read-only postflight reached TiDB Serverless
v8.5.3 but stopped on SQL error 1064 in the aggregate CHECK-metadata SELECT
list.  The generated subquery used the unquoted generic aggregate aliases
``schemas``, ``tables``, ``names``, ``clauses`` and ``enforced_values``; the
outer structured SELECT first failed while referencing ``schemas``.  Commas,
parentheses, ``GROUP_CONCAT`` ordering and ``SEPARATOR`` placement were intact.
No live V42 schema result was accepted, Flyway ``info`` and ``validate`` did
not follow, and no postflight evidence or detached SHA-256 was published.

The committed query now uses explicit ``AS`` aliases
``check_schema_values``, ``check_table_values``,
``check_constraint_names``, ``check_clause_values`` and
``check_enforcement_values``.  These ASCII purpose-specific identifiers are
also the exact parser field contract; legacy aliases, missing or additional
aliases, malformed SELECT items, or field-count drift fail the generated-SQL
structural check locally.  Each query remains bounded by ``DATABASE()``, its
exact owning table and one of the six exact V42 CHECK names.

That alias correction exposed a second, separate TiDB Serverless v8.5.3
capability mismatch.  The next standalone read-only postflight stopped with
SQL error 1054 because the query referenced
``information_schema.TABLE_CONSTRAINTS.ENFORCED``.  The production metadata
surface does not expose that column.  No live schema result was accepted,
Flyway did not run, and no postflight JSON or detached SHA was published.

The correction following that blocker used one bounded read-only capability
inventory over ``information_schema.columns``.  It inventoried only
``COLUMNS``, ``TABLES``, ``STATISTICS``, ``TABLE_CONSTRAINTS``,
``CHECK_CONSTRAINTS``, ``TIDB_CHECK_CONSTRAINTS``, ``KEY_COLUMN_USAGE`` and
``REFERENTIAL_CONSTRAINTS`` and selected only metadata table name, column name,
ordinal, data type, column type and nullability.  It did not query application
tables or records.  Every field used by the V42 column, table, index and
foreign-key checks exists.  The audit proved these CHECK-specific facts:

* none of the three constraint views exposes ``ENFORCED``;
* ``TABLE_CONSTRAINTS`` exposes no CHECK rows on this service;
* ``CHECK_CONSTRAINTS`` and ``TIDB_CHECK_CONSTRAINTS`` each expose the exact six
  V42 constraints and agree on names and expressions;
* ``TIDB_CHECK_CONSTRAINTS`` supplies the authoritative owning table;
* ``@@global.tidb_enable_check_constraint`` is ``1``;
* bounded ``SHOW CREATE TABLE`` output for ``event_media`` and
  ``event_media_storage_cleanup_tasks`` contains exactly the six declarations
  and no ``NOT ENFORCED`` clause.

Standalone postflight now runs the committed capability probe once before its
complex schema query.  Missing metadata tables or required columns, malformed
or duplicate capability rows, unexpected objects, or nondeterministic ordering
fail before Flyway and evidence publication.  Reviewed constants select the
query strategy; runtime metadata cannot inject a column identifier.  A direct
``ENFORCED`` field is used only when the capability model proves that exact
field exists, and multiple direct sources must agree.  Otherwise enforcement
is proven by the exact two-table ``SHOW CREATE TABLE`` contract together with
the global CHECK-support gate.  Missing, duplicated, ambiguous, altered or
``NOT ENFORCED`` declarations fail with enforcement unprovable; the checker
never invents or defaults an enforcement value.

The standard and TiDB CHECK views remain cross-bound by schema, constraint name
and expression, while the TiDB view additionally proves the exact owner table.
Together they remain cross-bound by schema, owner table, constraint name and
expression.
The cleanup CHECK count also comes from ``TIDB_CHECK_CONSTRAINTS`` because the
production ``TABLE_CONSTRAINTS`` view has no CHECK rows.  Generated SQL never
references an absent capability, including ``tc.ENFORCED``.  The conservative
expression normalizer and all semantic rejection cases are unchanged.

Production V42 was migrated exactly once; ``migrate`` must never be rerun.  No
Flyway operation occurred during this capability correction.  A final
standalone read-only postflight must still be run from the resulting reviewed
commit, and this document does not claim that final postflight has passed.

The next final-postflight preparation stopped locally before Docker and
credentials.  ``validate_postflight_release_lineage()`` correctly detected
that the reviewed metadata-capability implementation changed 20 top-level
runner symbols (five constants and 15 functions), but the explicit
``POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS`` contract had not yet listed
them.  The follow-up correction allowlists exactly those AST-derived symbols;
it does not derive permission from the current checkout, add a wildcard or
prefix rule, or alter migration, credential, target, Docker, identity or
evidence behavior.  Production V42 remains migrated exactly once and the
final standalone read-only postflight remains pending.

For a later read-only standalone postflight, backup/restore bytes, detached
hashes, capture bindings and identity bindings are still verified.  Backup
freshness is evaluated at the recorded successful V42 installation time,
proving it was valid for the completed write; the backup need not remain
unexpired forever merely to authorize read-only inspection.  Preflight and
migrate continue to evaluate freshness against the current clock, including
the final check immediately before migrate, so an expired backup can never
authorize a new write.

Standalone postflight rejects migrate-authorization flags, reads only
``TIDB_PRODUCTION_READ_*`` credentials, and has zero ``migrate``, ``repair``,
``baseline`` or ``clean`` calls.  It never reads
``TIDB_PRODUCTION_MIGRATE_*``, creates a replacement preflight artifact, or
rewrites retained evidence.

The shared TiDB gateway hostname is not sufficient identity proof.  Immediately
after parsing the live read-only identity result, standalone postflight checks
both ``CURRENT_USER()`` and ``USER()`` against the user prefix from the exact
committed production identity evidence.  A rehearsal, restore, malformed or
otherwise different prefix is rejected before Flyway or V42 schema acceptance.
Errors do not emit the complete SQL username or a prefix-bearing connection
string.

### Complete V42 object contract

The four V42 ``event_media`` indexes are verified from structured metadata by
table, exact ordered columns, uniqueness, sequence and reported index type:

* ``uk_event_media_managed_asset``: unique
  ``(managed_asset_id)``;
* ``uk_event_media_storage_identity``: unique
  ``(storage_provider, storage_public_id)``;
* ``idx_event_media_managed_read``: non-unique
  ``(event_id, storage_state, status, is_thumbnail, sort_order, id)``;
* ``idx_event_media_upload_expiry``: non-unique
  ``(storage_state, upload_expires_at, id)``.

Unrelated historical indexes remain outside this V42 migration delta and cannot
satisfy a missing V42 index.  ``fk_event_media_uploaded_by`` is likewise
verified by its full relational definition:
``event_media(uploaded_by) -> users(id)``, default ``ON UPDATE RESTRICT`` and
``ON DELETE SET NULL``.  Its name alone is never accepted.

``event_media_storage_cleanup_tasks`` is verified as one InnoDB table with the
exact ordered 13-column definition from V42:
``id``, ``provider``, ``public_id``, ``provider_asset_id``, ``operation``,
``task_status``, ``attempts``, ``next_attempt_at``, ``claim_token``,
``claim_expires_at``, ``last_error_code``, ``created_at`` and ``updated_at``.
The checker pins complete types, nullability, defaults, datetime precision,
additional attributes and the migration-defined character sets/collations.  It
also requires primary key ``(id)``, unique index
``uk_event_media_cleanup_identity(provider, public_id, operation)``, non-unique
index ``idx_event_media_cleanup_claim(task_status, next_attempt_at,
claim_expires_at, id)``, exactly zero foreign keys, and initial row count zero.
That zero-row expectation comes from the immutable V42 source containing no
``INSERT`` into this newly created table.

For the pinned TiDB Serverless v8.5.3 metadata contract, ``created_at`` reports
an empty ``information_schema.COLUMNS.EXTRA`` value while independently
reporting ``COLUMN_DEFAULT = CURRENT_TIMESTAMP(6)`` and
``DATETIME_PRECISION = 6``.  ``updated_at`` reports
``DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)``.  The checker verifies
those fields separately and exactly: an ``ON UPDATE`` attribute on
``created_at``, a missing ``ON UPDATE`` attribute on ``updated_at``, or drift
in either default or precision remains a fail-closed schema mismatch.  This is
a read-only metadata-representation correction and does not change V42 SQL or
authorize another migration.

The per-column query reads the exact matching ``COLUMNS`` row and does not
aggregate ``EXTRA``.  TiDB v8.5.3 can canonicalize
``MIN(EXTRA)`` for ``updated_at`` from ``CURRENT_TIMESTAMP(6)`` to
``CURRENT_TIMESTAMP``; accepting that lossy result would no longer prove the
V42 precision contract.  A missing row therefore omits the required metadata
key, a duplicate row produces a duplicate key, and either condition still
fails closed before evidence publication.

All six CHECK constraints are cross-bound between
``CHECK_CONSTRAINTS`` and ``TIDB_CHECK_CONSTRAINTS`` by schema, owner table,
name and expression.  Enforcement must agree across every direct metadata
source that the capability gate proves available; when none exists, the exact
two-table ``SHOW CREATE TABLE`` proof must pass and must contain no
``NOT ENFORCED`` declaration.  The conservative expression normalizer removes only whitespace,
identifier quoting, redundant outer parentheses, keyword case differences and
TiDB's ``_utf8mb4`` literal introducer.  It never removes operators, enum/state
values, conditions, or ``AND``/``OR`` relationships.  Duplicate, missing,
wrong-owner, non-enforced or semantically changed constraints fail closed.

The Flyway history proof requires exactly one V42 row with version ``42``,
description ``add managed event image storage``, script
``V42__add_managed_event_image_storage.sql``, checksum ``-769202000`` and
success true.  It additionally requires zero failed migrations and zero rows
above V42; an arbitrary numeric checksum is not accepted.

### Standalone postflight evidence

A completely successful standalone postflight must write a new canonical JSON
artifact with schema
``lsvn3d.release-e.v42.postflight-evidence.v1`` and a detached exact-byte
SHA-256 file supplied through ``--evidence-detached-sha256``.  The exact-key
schema contains only the checker/migration lineage, production identity proof,
retained identity/backup/restore/preflight/failure hashes, one historical
migrate attempt, zero postflight migrate calls, sanitized Flyway/schema
verification summaries, four bounded counts and the postflight timestamp.  It
contains no complete SQL username, credentials, raw environment, unrestricted
SQL output or application records.

The writer uses deterministic UTF-8 JSON with one trailing newline, computes
the internal canonical evidence hash, hashes the exact bytes for the detached
``<sha256>  <basename>`` line, and publishes complete files atomically.  The
dedicated committed postflight loader immediately reloads the artifact and
revalidates its exact schema/mode/keys, both hashes, checkout and migration
commits, linear ancestry, production and retained-artifact bindings, migrate
attempt counts, V42/Flyway/schema summaries, bounded counts and timestamp.  A
write, validation or immediate-reload failure removes final and temporary
outputs; success is not reported before reload passes.  This describes the
required checker contract only: production postflight has not yet been run or
declared successful by this correction.

### V42 managed-column migration-delta contract

``event_media.storage_type`` is a historical pre-V42 column.  It was
introduced by ``V3__event_support_tables.sql`` as
``ENUM('local','external','object_storage') NOT NULL DEFAULT 'external'``.
The approved V41 restore corroborated that definition.  V4 through V41 do not
alter it, and V42 does not add, alter, remove or reference it.

V42 introduces exactly these 18 separate managed-storage columns, in migration
source order:

```text
managed_asset_id
storage_provider
storage_public_id
storage_asset_id
storage_original_url
storage_version
storage_mime_type
storage_format
storage_byte_size
storage_sha256
storage_width
storage_height
uploaded_by
uploaded_at
storage_state
upload_token
upload_started_at
upload_expires_at
```

The postflight column gate is a V42 migration-delta checker, not a complete
historical ``event_media`` schema checker.  It selects columns through exact-
name membership in the reviewed 18-column contract; broad ``storage_*`` or
``upload_*`` matching is prohibited.  Historical or unrelated columns,
including ``storage_type``, remain outside this selection and cannot satisfy a
missing, substituted or malformed V42 requirement.  The immutable migration
source and manifest preserve the reviewed declarations, and the live metadata
gate requires all 18 exact names exactly once with their reviewed data type,
column type, nullability and default.  Any definition drift produces a
fail-closed schema mismatch.  ``storage_expires_at`` was a checker-only typo,
is not part of V42 and remains invalid; the authoritative expiration column is
``upload_expires_at``.

Production V42 has already been applied exactly once.  This checker correction
authorizes only standalone read-only postflight.  Migrate must never be rerun,
and no manual DDL is permitted to satisfy a checker.  Any postflight schema
mismatch remains fail-closed.

The retained rehearsal read-credential identity mismatch is a separate
operational issue.  It was not bypassed or modified for this migration-derived
membership correction, and no new identity-bound rehearsal query was run.

Requires:

* The same retained backup/restore evidence chain passes before any Flyway
  command, preserving audit continuity.

* Exactly one Flyway V42 success row.
* Zero failed migrations.
* Validate passes.
* V42 checksum matches the recorded value.
* The exact 18 V42 managed-storage column names exist on ``event_media``; no
  historical column can replace a missing V42 member.
* All 4 V42 indexes match their exact table, order, uniqueness and type.
* ``fk_event_media_uploaded_by`` matches the complete source/reference/rule
  contract.
* ``event_media_storage_cleanup_tasks`` matches all 13 columns, 3 indexes,
  zero-FK and zero-initial-row contracts.
* All 3 cleanup-task CHECK constraints match their exact expressions.
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
