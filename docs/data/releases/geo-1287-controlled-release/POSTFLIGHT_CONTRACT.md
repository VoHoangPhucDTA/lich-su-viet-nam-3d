# Mandatory Release F postflight contract

Commit produces `APPLIED_PENDING_POSTFLIGHT`, not success. While the owner
write freeze remains active, capture sanitized database comparison, direct-row,
and API evidence and submit it to the fail-closed Release F classifier. Missing
evidence or any failed assertion means `RELEASE_STATUS=RELEASE_FAILURE`.

## Full canonical versus TiDB assertions

Every value must be exact:

```text
CANONICAL_RECORDS=361
CANONICAL_UNIQUE_IDS=361
DB_RECORDS=361
DB_UNIQUE_IDS=361
BOTH_IDS=361
CANONICAL_ONLY=0
DB_ONLY=0
MATCH=361
MISMATCH=0
UNCOMPARABLE=0
```

Arithmetic gates must also pass:

- `BOTH_IDS + CANONICAL_ONLY = CANONICAL_UNIQUE_IDS`;
- `BOTH_IDS + DB_ONLY = DB_UNIQUE_IDS`;
- `MATCH + MISMATCH + UNCOMPARABLE = BOTH_IDS`.

## Direct target assertion

Read the target from TiDB with the read account and require:

- ID `khang-chien-chong-quan-nguyen-1287-1288`;
- `geoType=multi_point`, four markers in exact order: `Bạch Đằng`, `Cửa Lục`,
  `Thăng Long`, `Vân Đồn`;
- `showOnMap=true`, zero regions;
- after-geography SHA-256
  `0cf9cc171394041638bfcf74a2770d1b0cae1fd70cd700c6046139bf406f01b2`;
- `province_names` and `historical_locations` unchanged;
- non-geography SHA-256
  `f810420890ad63b1c91b765a4c5fb9ca5df410a1be0929d4ecd87ad055745547`.

## Read-only API assertion

Using the runtime in `WRITE_FREEZE_CHECKLIST.md`, call only:

`GET /api/events/khang-chien-chong-quan-nguyen-1287-1288`

Require HTTP 200, the exact event ID, `multi_point`, four exact ordered labels,
and `showOnMap=true` when that property is exposed. No Jackson introspection
artifact may appear, and API geography must faithfully reflect the direct DB
state.

## Classification and recovery

`RELEASE_STATUS=SUCCESS` is permitted only when the transaction committed and
all assertions above pass. Examples such as `MATCH=360`, `MISMATCH=1`,
`UNCOMPARABLE=1`, DB count 360, stale API output, three markers, or any
non-geography drift are release failures, never warnings or partial success.

If failure occurs after commit, keep the write freeze active and preserve the
failure evidence. The repository owner decides whether the already-reviewed,
guarded one-event rollback applies. Never run an unsafe automatic rollback.
After guarded recovery, repeat the complete comparison, target, preservation,
arithmetic, and API checks for the recovered state. Only a verified
`SAFE_FAILURE_STATE` allows the owner to end the freeze.
