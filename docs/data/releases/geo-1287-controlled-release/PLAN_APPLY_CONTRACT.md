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
2. `SELECT ... WHERE id=? FOR UPDATE`;
3. verification of ID, `updated_at`, before-geography hash, and non-geography hash;
4. a prepared `UPDATE` bounded by `WHERE id=? AND updated_at=?`;
5. an affected-row assertion of exactly one;
6. immediate locked readback;
7. after-geography and unchanged non-geography hash assertions;
8. commit only after all assertions, otherwise rollback.

There is no generic SQL path and no arbitrary scope flag. This preparation task
did not invoke the apply form of the CLI and did not connect to production.

## Postflight required after any future authorized apply

- exact four-marker `multi_point` state and `showOnMap=true`;
- `CANONICAL=361`, `DB=361`, `MATCH=361`, `MISMATCH=0`;
- unchanged target non-geography hash;
- event-detail API returns the same geography for the authorized event;
- retained sanitized plan, transaction, readback, diff, and API evidence.
