# Fail-closed preconditions

All 15 gates must pass before a future write:

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

The read-only planner also verifies Flyway V42, bounded SELECT statements, the
exact set of 361 IDs, artifact self-hash, `expectedAffectedRows == changes`, and
that every change has `nonGeographyChanged=false`.

Any failure aborts before opening the apply transaction or executing DML. No
force, unsafe, skip, all-events, alternate-event, or alternate-canonical flag
is supported.
