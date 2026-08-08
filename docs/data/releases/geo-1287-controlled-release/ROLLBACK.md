# One-event rollback contract

Rollback is defined but was not executed or exposed as a generic CLI in this
preparation task.

Before a future apply, retain the exact target row and its reviewed
before-geography and non-geography fingerprints. Immediately after apply,
capture a signed/sanitized receipt containing the release ID, plan SHA,
canonical SHA, event ID, post-apply `updated_at`, after-geography fingerprint,
unchanged non-geography fingerprint, and exact before-state payload.

A rollback requires separate owner approval for that receipt and must:

1. target only `khang-chien-chong-quan-nguyen-1287-1288`;
2. verify the exact release/plan/canonical identity;
3. open an explicit transaction and lock that event with `FOR UPDATE`;
4. require the receipt's post-apply version, after-geography hash, and
   non-geography hash before changing anything;
5. restore only the authorized geography fields from the captured before-state
   using a prepared statement bounded by exact ID and version;
6. require exactly one affected row;
7. read back and verify the original before-geography hash and unchanged
   non-geography hash;
8. commit only after verification, otherwise roll back the transaction.

If another write occurred after Release F, or any fingerprint/version differs,
the rollback must stop for owner investigation. The contract cannot restore an
arbitrary event, accept caller-supplied geography, or roll back a later plan.
Rollback must leave `province_names` and `historical_locations` untouched,
matching the narrowed apply scope.

## Failure after commit

A successful one-row commit followed by a failed mandatory postflight is
`RELEASE_STATUS=RELEASE_FAILURE`, never partial success or a warning. The owner
must keep the operational write freeze active, retain sanitized failure evidence,
and decide whether the guarded rollback contract above applies. There is no
automatic or unguarded rollback.

If rollback is approved, all receipt, version, target, geography, and
non-geography gates above must pass. After rollback commits, rerun the full exact
canonical/database comparison, direct target read, non-geography preservation
check, and read-only API check for the intended recovered state. The freeze may
end only when that rollback postflight verifies `SAFE_FAILURE_STATE`. A failed
rollback gate or failed rollback postflight keeps the freeze active for owner-led
recovery and investigation.
