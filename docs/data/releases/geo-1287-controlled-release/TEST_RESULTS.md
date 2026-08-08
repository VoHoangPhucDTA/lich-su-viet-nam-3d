# Test results

Verified locally on 2026-08-09 (Asia/Saigon). No command in this verification
connected to production or invoked the apply CLI.

## Focused release and safety tests

Command:

```text
.\mvnw.cmd '-Dtest=ControlledGeographyRelease1287ContractTest,RemoteCanonicalGeographyApplyPlannerTest,RemoteCanonicalGeographyReadOnlyPlannerTest,CanonicalGeographyReleaseContractTest,CanonicalGeographyDatasourceGuardTest,CanonicalGeographyPlanShaGateTest,CanonicalGeographyNonGeoHashDeterminismTest' test
```

Result: `BUILD SUCCESS`; 48 tests, 0 failures, 0 errors, 0 skipped.

Coverage includes exact success identity, wrong release/event/canonical/plan
identity, changed database fingerprint, second/unexpected mismatch, stale
`updated_at`, stale before-geography, non-geography drift, affected rows zero or
two, post-read mismatch, transaction exception rollback, bounded prepared SQL,
artifact consistency, deterministic IDs/non-geography hashes, canonical release
contract, and datasource guards.

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
