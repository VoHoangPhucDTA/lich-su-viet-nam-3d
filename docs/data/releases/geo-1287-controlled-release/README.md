# Controlled Release F: geography reconciliation for event 1287

Status: preparation complete only; owner review and a separate write authorization are required.

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
