# Plan/apply and transaction contract

## PLAN

PLAN is SELECT-only. It loads the exact canonical package, validates the
canonical release contract, reads bounded database metadata and event rows,
computes deterministic fingerprints, and seals a deterministic JSON artifact.
It performs no DML or DDL.

The reviewed candidate is `REVIEWED_PLAN.json`. At future execution time, the
tool must generate a fresh live plan. The apply planner requires the live plan
to equal the reviewed artifact and retain the exact plan SHA. A new result is
not automatically accepted.

## APPLY

Preparation and review grant no write authority. A future apply additionally
requires separate owner approval for the reviewed commit and the exact value
`APPLY_EXACTLY_ONE_REVIEWED_ROW`. The CLI requires the exact release ID,
authorization value, plan SHA, canonical SHA, and event ID. Supplying only an
apply flag or only a plan SHA is insufficient.

After all read-only gates pass, apply uses:

1. explicit transaction;
2. rebuild of database identity, all-event snapshot, canonical diff, and live
   deterministic plan through the apply connection in that transaction;
3. equality checks against the reviewed DB fingerprint and plan artifact;
4. `SELECT ... WHERE id=? FOR UPDATE` on the target in that same transaction;
5. verification of ID, `updated_at`, before-geography hash, and non-geography hash;
6. a prepared `UPDATE` bounded by `WHERE id=? AND updated_at=?`;
7. an affected-row assertion of exactly one;
8. immediate locked readback;
9. after-geography and unchanged non-geography hash assertions;
10. commit only after all assertions, otherwise rollback.

The live full-database reads use the transaction's repeatable-read snapshot;
the subsequent locking read rechecks the target's current version and hashes.
This closes the previous two-connection authorization gap. It does not claim a
global application write freeze: operational recovery/write-freeze gates and
postflight validation remain required by governance.

The update contains only `geo_type`, `lat`, `lng`, and `raw_json` plus the exact
ID/version predicate. `province_names` and `historical_locations` are selected
for evidence but never assigned by Release F.

There is no generic SQL path and no arbitrary scope flag. This preparation task
did not invoke the apply form of the CLI and did not connect to production.

## Postflight required after any future authorized apply

- exact four-marker `multi_point` state and `showOnMap=true`;
- `CANONICAL=361`, `DB=361`, `MATCH=361`, `MISMATCH=0`;
- unchanged target non-geography hash;
- event-detail API returns the same geography for the authorized event;
- retained sanitized plan, transaction, readback, diff, and API evidence.
