# Test results

Verified locally on 2026-08-09 (Asia/Saigon), including the corrective owner-review
patch. No command in this verification connected to production or invoked the
apply CLI.

## Focused release and safety tests

Command:

```text
.\mvnw.cmd '-Dtest=ControlledGeographyRelease1287ContractTest,RemoteCanonicalGeographyApplyPlannerTest,RemoteCanonicalGeographyReadOnlyPlannerTest,CanonicalGeographyReleaseContractTest,CanonicalGeographyDatasourceGuardTest,CanonicalGeographyPlanShaGateTest,CanonicalGeographyNonGeoHashDeterminismTest,CanonicalGeographyProjectionTest,CanonicalGeographySemanticComparisonTest,CanonicalGeographySyncServiceZeroCountTest' test
```

Result: `BUILD SUCCESS`; 78 tests, 0 failures, 0 errors, 0 skipped.

Coverage includes exact success identity, wrong release/event/canonical/plan
identity, changed database fingerprint, second/unexpected mismatch, stale
`updated_at`, stale before-geography, non-geography drift, affected rows zero or
two, post-read mismatch, transaction exception rollback, bounded prepared SQL,
artifact consistency, deterministic IDs/non-geography hashes, canonical release
contract, datasource guards, preserved-column scope, same-transaction validation,
and stale-preflight/transactional-state changes.

Corrective tests prove that `province_names` and `historical_locations` are absent
from both `UpdateCommand` and the prepared UPDATE. Province drift after the live
snapshot blocks before update; standalone historical-location drift is preserved
because that column is not written. A valid earlier preflight cannot authorize
apply when the transactional DB fingerprint, exact diff, or plan changes. The
fake transaction port also observes revalidation, target lock, update, and
readback inside one transaction context. A JDBC-port test additionally proves
that transactional plan generation receives the identical open connection with
`autoCommit=false` and repeatable-read isolation before commit.

The reviewed plan artifact was not regenerated because its semantic before/after
geography, DB fingerprint, and canonical diff did not change. The planner
recomputed and accepted the same deterministic SHA-256:
`4f406ab21890544fa1b351551e000f408f6c484308fa1c5f16f6da0c6a0ad98e`.

## Compile/static checks

- `.\mvnw.cmd -DskipTests compile`: `BUILD SUCCESS`.
- `.\mvnw.cmd -DskipTests test-compile`: `BUILD SUCCESS`.
- `git diff --check`: PASS.

An initial focused run correctly failed because the newly copied reviewed JSON
contained incorrectly encoded Vietnamese marker names. The artifact was fixed
to UTF-8 and the complete 48-test command above was rerun successfully. An
initial `testCompile` spelling attempt was rejected by Maven; the correct
`test-compile` phase then passed.

Remote DML/DDL commands executed: `0`.
