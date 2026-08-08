# Fail-closed preconditions

All 16 gates must pass before a future write:

1. canonical SHA-256 equals the reviewed value;
2. canonical record count is 361;
3. canonical unique-ID count is 361;
4. the full database identity/fingerprint equals the reviewed `lichsuvn` target;
5. database event count is 361;
6. the target event exists exactly once;
7. its ID exactly matches the authorized event ID;
8. its before-state geography fingerprint matches the reviewed stale state;
9. its `updated_at` equals `2026-08-06T18:43:22.767893`;
10. the fresh exact canonical/database diff contains exactly one mismatch;
11. that mismatch has exactly the authorized event ID;
12. no unrelated event differs;
13. the target non-geography fingerprint equals the reviewed value;
14. a current recovery artifact for the approved target is retained and identified;
15. restoration of the exact captured one-event before-state has been rehearsed
    successfully on an isolated target.
16. the repository owner has established the full `historical_events` write
    freeze and supplied an approved attestation whose release, event, canonical
    SHA, reviewed-plan SHA, database, scope, writer inventory, writer states,
    owner, start time, statement, and approval exactly satisfy the Release F
    operational contract.

The read-only planner also verifies Flyway V42, bounded SELECT statements, the
exact set of 361 IDs, artifact self-hash, `expectedAffectedRows == changes`, and
that every change has `nonGeographyChanged=false`.

For apply, these release-critical checks are repeated on the apply connection
inside its transaction before target locking or DML. A plan produced on an
earlier connection is advisory only and cannot authorize the update.

The attestation path is mandatory on the apply form of the CLI. It is validated
before datasource secrets are loaded and before a connection or transaction is
opened. A missing or invalid artifact is a hard stop. This is enforcement of a
repository-owner operational authorization; it is not a runtime concurrency
proof and the apply process must never report that it established the freeze.

Any preflight failure aborts before opening the apply transaction. Any repeated
transactional validation failure rolls that transaction back before DML. No
force, unsafe, skip, all-events, alternate-event, or alternate-canonical flag
is supported.
