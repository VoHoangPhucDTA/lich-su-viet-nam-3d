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
| Engine | TiDB Serverless v8.5.3 |
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
| Image digests | ``TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST`` (``sha256:174513cc63...?``), ``TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST`` (``sha256:a532724022...?``) |

The runner refuses the migration account on the rehearsal fixture
prefix and refuses the read account if it would re-use the migrate
account or any prefix that smells like a child branch.

No credential value is logged, persisted, or accepted through command
arguments.  Credentials reach the pinned ``mysql:8.0.36`` and
``redgate/flyway:11.14.1`` containers via stdin only.

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
engine_version    references TiDB v8.5.3
collected_at      ISO-8601 with timezone
```

The runner refuses the file if the on-disk SHA-256 does not match the
operator-supplied ``--identity-evidence-sha256`` flag.

## 5. Confirmation string

The typed confirmation is constructed from the verified identity:

```
main@<host>/lichsuvn:41->42
```

``37->41`` confirmations are rejected.  Placeholders are rejected.
Branch IDs are rejected.

## 6. Preflight

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
* ``CURRENT_USER()`` matches the production user prefix and does not
  match the rehearsal fixture prefix.
* Bounded counts recorded for future unchanged-comparison.

Preflight evidence is written to a new ``.json`` file with a SHA-256
over the canonical payload (excluding the digest field).

## 7. Migrate

Approval gates (all required):

* Backup evidence file exists and is non-empty.
* Restore rehearsal evidence file exists and is non-empty.
* At least two active Admins.
* All application backends drained (single-tenant, non-deployed).
* Single migration owner.
* Maintenance window.
* Rollback owner.
* Runtime security settings verified (TLS, cookies, allowed origins,
  no fake-storage, no ``admin-e2e`` profile).
* Explicit ``--execute-migrate`` confirmation.

The migrate stage runs Flyway ``info`` + ``validate`` + ``migrate``
with the migration account, then ``info`` + ``validate`` with the read
account.  Flyway's JSON response is parsed and validated against
``V42 only``.

Post-migration MySQL metadata is queried (read account); the V42
schema footprint (18 managed-storage columns, 4 indexes, FK,
cleanup-task table, 6 CHECK constraints visible in
``information_schema.CHECK_CONSTRAINTS`` and
``information_schema.TIDB_CHECK_CONSTRAINTS``) is asserted; the V42
Flyway history row count + checksum is asserted; bounded counts are
asserted unchanged.

## 8. Postflight

Requires:

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

## 9. Failure handling

On any failure, the runner: stops immediately; never retries; never
runs ``repair`` / ``baseline`` / ``clean``; never completes partial
DDL; never edits the Flyway schema history.  The error message
includes the failing stage and exit code; no secret is logged.

Empty subprocess output surfaces as
``EMPTY_SUBPROCESS_OUTPUT: stage=<stage> outer_exit=<code>`` so the
operator can localize the failure.

## 10. Local backend / frontend run

After the database migration succeeds, the thesis application runs
locally:

* Backend ``./mvnw spring-boot:run`` (or the operator's preferred
  local launch).  Backend reads from the same TiDB; no schema
  rerun is performed against TiDB - V42 is already applied.
* Frontend ``npm run dev`` (or the operator's preferred local
  launch).  ``VITE_API_BASE_URL`` points at the local backend.
* Bound smoke-test Admin account is used for a bounded browser run,
  not a destructive automation loop.

## 11. Rollback limitations

V42 introduces managed-storage metadata, indexes, FK and CHECK
constraints.  Rollback is **schema-only restore-based**: the operator
must restore a backup taken before the V42 migrate; the runner will
not offer ``flyway repair`` or ``flyway clean``.  The rehearsal
branch (``lichsuvn3d-admin-v42-rehearsal``, ``bran-3uewl2rhirehfg67jczif3bet4``)
is **not** deleted by this migration.

## 12. Rehearsal branch retention

The V42 rehearsal branch remains intact:

* Branch: ``lichsuvn3d-admin-v42-rehearsal``
* Technical branch ID: ``bran-3uewl2rhirehfg67jczif3bet4``
* Parent cluster ID: ``10427158774816979902``

The rehearsal runner continues to enforce ``bran-`` prefix isolation
and CURRENT_USER() rejection of production prefixes.  This production
runner rejects any ``bran-*`` cluster ID and any rehearsal fixture
prefix.  The two runners share the parent cluster but never share
data; their userPrefixes must differ.

## 13. Sequence vs the production V37 -> V41 runner

| Concern | ``tidb_production_migration.py`` (V37->V41) | ``tidb_production_v42_migration.py`` |
|---|---|---|
| Target identity | ``main`` | ``main`` |
| Cluster ID | ``10427158774816979902`` | ``10427158774816979902`` |
| Display name | ``lichsuvn3d`` | ``lichsuvn3d`` |
| Database | ``lichsuvn`` | ``lichsuvn`` |
| Manifest | ``tidb-production-v41.sha256`` | ``tidb-production-v42.sha256`` |
| Transition | 37 -> 41 | 41 -> 42 |
| Production manifest SHA pin | runtime-computed | runtime-computed |
| V42 audit SQL via metadata_sql | n/a | required |
| Bran-* child branch detection | n/a | required |
| Rehearsal fixture prefix ban | n/a | required |
| Bounded counts | ``users`` + ``events`` + roles | ``users`` + ``events`` + ``event_media`` + active_admins |

## 14. Credential discipline

Reference values in this runbook are intentionally non-secret.  No
real production credential, password, or token is reproduced here.
Whoever runs the migration supplies the four ``TIDB_PRODUCTION_READ_*``
and ``TIDB_PRODUCTION_MIGRATE_*`` variables plus the two
``TIDB_PRODUCTION_*_IMAGE_DIGEST`` values via their preferred operator
mechanism (Windows User environment, local ``.env``, or signed shell
wrapper) and never pastes them into chat or screenshots.
