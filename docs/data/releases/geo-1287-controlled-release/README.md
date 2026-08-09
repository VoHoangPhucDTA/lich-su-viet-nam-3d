# Controlled Release F: geography reconciliation for event 1287

Status: final operational gates prepared only; owner review, owner freeze attestation,
and a separate write authorization are required.

Release ID: `CONTROLLED_RELEASE_F_GEO_1287`

This release exists solely to reconcile the canonical geography of
`khang-chien-chong-quan-nguyen-1287-1288`. It is not an importer, bulk sync,
generic SQL facility, or authorization for a future mismatch. No remote write
was performed while preparing this release.

## Governance audit

| Release | Scope | Why it does not authorize this write |
| --- | --- | --- |
| A | Completed V23-V28 canonical package import | Completed and may not be rerun. |
| B | V29 compatibility-column removal | Schema-only scope; no event geography. |
| C | V30 and audited History RAG package import | Completed package-content scope; no geography reconciliation. |
| D | V38-V41 Admin schema transition | Admin schema only; event data excluded. |
| E | V42 managed image-storage schema | Migration only; manual DML explicitly excluded. |

Conclusion: `NO_EXISTING_RELEASE_AUTHORIZES_1287_GEOGRAPHY_DML`.
Controlled Release F is the smallest new exception and preserves the default
remote-write denial for every other operation.

## Review set

- repository policy: `AGENTS.md`;
- immutable identity: `ControlledGeographyRelease1287Contract.java`;
- guarded planner/transaction: `RemoteCanonicalGeographyApplyPlanner.java`;
- exact-identity CLI boundary: `RemoteCanonicalGeographyApplyCli.java`;
- focused tests for those classes;
- this directory, including `REVIEWED_PLAN.json`.

The existing plan is retained as the immutable reviewed candidate. A future
apply must first generate a live read-only plan and prove byte-for-byte JSON
equality and the same plan SHA. Drift does not get silently accepted: it blocks
and requires a new reviewed release commit.

The corrective implementation after owner review narrows the write set to the
four actually changed storage areas and repeats all live release validation on
the same connection and transaction used by apply. It still performs no remote
write during preparation or review.

## Mandatory release lifecycle

`PREPARED -> OWNER_FREEZE_ATTESTED -> APPLYING -> APPLIED_PENDING_POSTFLIGHT -> SUCCESS`

On any apply or postflight failure the path is instead:

`RELEASE_FAILURE -> RECOVERY/ROLLBACK -> SAFE_FAILURE_STATE`

The repository owner establishes the operational freeze before the apply CLI
is accepted. The validated attestation identifies that decision, but does not
cryptographically prove writer absence and does not claim that the JDBC
transaction globally freezes TiDB. The freeze covers every competing
application, importer, sync, migration, script, scheduled process, developer,
and operator capable of modifying `historical_events`.

The freeze remains active through transactional revalidation, the one-row
update, commit, the full canonical/database comparison, and the GET-only API
check. It may end only after every assertion in `POSTFLIGHT_CONTRACT.md` passes
with `RELEASE_STATUS=SUCCESS`, or after guarded recovery/rollback and a complete
rollback postflight establishes `SAFE_FAILURE_STATE`.

Operational files:

- `WRITE_FREEZE_CHECKLIST.md`: source-grounded writer inventory and safe API runtime;
- `WRITE_FREEZE_ATTESTATION.template.json`: intentionally unapproved owner template;
- `POSTFLIGHT_CONTRACT.md`: exact mandatory success/failure classifier.
