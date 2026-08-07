# TiDB V42 isolated rehearsal runbook

This runbook is for the isolated rehearsal only. It is not production
authorization. Production base cluster `lichsuvn3d` must never be used as a rehearsal branch
fallback.

The runner is:

```text
scripts/deploy/tidb_rehearsal_v42_migration.py
```

It permits only `V41 -> V42`, uses the pinned local Flyway/MySQL images with
`--pull=never`, and does not implement `repair`, `baseline`, `clean`, manual
DDL, or manual DML.

## Identity semantics

The previous value `lichsuvn3d-admin-v39-rehearsal` is a display name. It is
**not** a technical branch ID. Do not derive a technical ID from a display name
or hostname.

The production identity is the base cluster, not a child returned by branch
listing:

```text
TIDB_PRODUCTION_CLUSTER_ID=10427158774816979902
TIDB_PRODUCTION_USER_PREFIX=<base-cluster-userPrefix>
```

The runner requires these non-secret branch target variables:

```text
TIDB_REHEARSAL_PARENT_CLUSTER_ID=10427158774816979902
TIDB_REHEARSAL_BRANCH_NAME=lichsuvn3d-admin-v42-rehearsal
TIDB_REHEARSAL_BRANCH_ID=bran-<technical-branch-id>
TIDB_REHEARSAL_USER_PREFIX=<branch-userPrefix>
TIDB_REHEARSAL_HOST=<shared-or-exclusive-tidbcloud-gateway>
TIDB_REHEARSAL_PORT=4000
TIDB_REHEARSAL_DATABASE=lichsuvn
```

A shared gateway hostname is allowed. Isolation is proved by the parent cluster,
non-empty technical branch ID, exact branch display name, distinct branch
`userPrefix`, branch-bound SQL users, TLS hostname verification, and Flyway
state—not by requiring different hostnames or cluster IDs.

## Approved identity evidence

Before any Docker command or TiDB connection, provide a small JSON export from
an approved TiDB Cloud metadata source (`ticloud`, the TiDB Cloud console, or
the TiDB Cloud API). The file must contain exactly these fields:

```json
{
  "source": "ticloud",
  "state": "ACTIVE",
  "parent_cluster_id": "10427158774816979902",
  "branch_id": "bran-<technical-branch-id>",
  "branch_name": "lichsuvn3d-admin-v42-rehearsal",
  "host": "<sanitized-tidbcloud-host>",
  "database": "lichsuvn",
  "user_prefix": "<branch-userPrefix>",
  "engine_version": "TiDB Server v8.5.3"
}
```

The operator must supply the file and its detached SHA-256 separately:

```text
--identity-evidence <path>
--identity-evidence-sha256 <sha256>
```

The runner verifies the detached digest, rejects duplicate JSON keys and
non-string fields, validates technical ID formats, requires an available/running
state, and binds every identity field to the environment configuration before
connecting. The detached SHA-256 proves file integrity only; it does not
authenticate the TiDB Cloud origin. The digest must therefore come from an
independently approved/recorded operator or signed metadata workflow. Do not
commit the evidence file or any credential. Do not create a guessed or fixture
identity artifact.

A separate approved clone/reset provenance record is also required. Matching
V41 Flyway state is not proof that the instance was freshly derived from the
approved production V41 snapshot; provenance must be independently recorded and
bound to the technical instance and branch IDs before any write.

The manifest SHA-256 verifies the committed V1-V42 SQL bytes. Flyway's integer
history checksum is implementation-specific and is intentionally not derived
from the manifest; after migration, the runner compares the database history
value with Flyway's own validated V42 `info` output.

The typed authorization is bound to the verified technical branch ID:

```text
<bran-technical-id>@<verified-host>/lichsuvn:41->42
```

## Fresh clone gate

Use a fresh or reset isolated clone derived from production V41. The preferred
human display name is `lichsuvn3d-admin-v42-rehearsal`, but that name alone is
not proof. Before the write phase, prove through read-only checks:

- production base cluster ID and technical `bran-*` branch ID match metadata;
- branch display name is exactly `lichsuvn3d-admin-v42-rehearsal`, database is exactly `lichsuvn`;
- shared gateway is allowed, but TLS uses hostname verification and the SQL session user is branch-prefix bound;
- engine is TiDB v8.5.3;
- Flyway is exactly V41 current with only V42 pending;
- Flyway validate passes and failed history count is zero;
- `@@global.tidb_enable_check_constraint = 1`;
- bounded users, events, media, and active Admin counts are recorded.

If branch identity, branch-specific credentials, or fresh-branch provenance cannot
be proven, stop with `BLOCKED_REHEARSAL_BRANCH_CREDENTIALS` or
`BLOCKED_REHEARSAL_CONFIGURATION`. Never fall back to production.

## Execution order

After read-only preflight succeeds, run the same runner in `migrate` mode with
separate branch-bound `TIDB_REHEARSAL_READ_*` and
`TIDB_REHEARSAL_MIGRATE_*` credentials. The runner also accepts the existing
`TIDB_REHEARSAL_MIGRATION_*` names as non-printing compatibility aliases. The
runner rechecks the preflight state immediately before migration and requires
an independently detached preflight evidence SHA-256. It then runs Flyway
`info`, `validate`, and exactly one `migrate` operation targeting V42.

Postflight checks require V42 current, no pending/failed migrations, successful
validate, the committed V42 checksum, all managed-storage columns, cleanup
queue table, required indexes, foreign key, all six CHECK constraints in both
`information_schema.CHECK_CONSTRAINTS` and
`information_schema.TIDB_CHECK_CONSTRAINTS`, enabled checks, and unchanged
bounded counts.

No application fixtures are created. No backend/frontend deployment occurs.
