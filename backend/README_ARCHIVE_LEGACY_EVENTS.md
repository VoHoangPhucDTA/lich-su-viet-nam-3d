# Legacy Event Archive Runner

## Purpose

Archives historical events that were imported from the old **SGK Cánh Diều** dataset
(`history_events_export_2026-04-24T14-28-46-607Z/`). This runner reads every JSON file
in the legacy dataset, collects the event IDs, and sets `status = 'archived'` for
those events in the `historical_events` table.

No other columns are modified. Events imported from the new crawler pipeline
(`crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`) are left untouched.

---

## Data Source

The legacy dataset is located at:

```
history_events_export_2026-04-24T14-28-46-607Z/
├── json10/        # 65 files (grade 10)
├── json11/        # 85 files (grade 11)
└── json12/        # 101 files (grade 12)
```

Each file is a single JSON object with an `id` field at the root.

---

## Configuration

| Property | Default | Environment variable |
|---|---|---|
| `app.archive.legacy-events-path` | `../history_events_export_2026-04-24T14-28-46-607Z` | `APP_ARCHIVE_LEGACY_EVENTS_PATH` |

### Example `application.properties`

```properties
app.archive.legacy-events-path=../history_events_export_2026-04-24T14-28-46-607Z
```

### Example `application.yml`

```yaml
app:
  archive:
    legacy-events-path: ../history_events_export_2026-04-24T14-28-46-607Z
```

---

## Spring Profile

The runner is activated by the Spring profile:

```
archive-legacy-events
```

---

## How to Execute

```bash
cd backend

./mvnw spring-boot:run \
  -Dspring-boot.run.profiles=archive-legacy-events
```

To use a custom path:

```bash
cd backend

./mvnw spring-boot:run \
  -Dspring-boot.run.profiles=archive-legacy-events \
  -Dspring-boot.run.arguments="--app.archive.legacy-events-path=/custom/path/to/legacy-dataset"
```

---

## Output

When the runner completes, it prints a summary like:

```
========================================
Legacy Event Archive Summary
========================================
JSON files scanned:    251
Unique event IDs:      240
Database rows updated: 235
IDs not found:         5
Warnings:              0
========================================
Finished successfully.
========================================
```

---

## Important Notes

1. **Only `status` is updated.** All other columns (`title`, `slug`, `summary`,
   `detailed_narrative`, `raw_json`, etc.) remain unchanged.

2. **Events from the new crawler pipeline are NOT affected.** Only events whose IDs
   exist in the legacy dataset are archived.

3. **The existing `EventJsonImportRunner` is NOT modified.** This runner is a completely
   separate component.

4. **Database schema:** The `historical_events.status` column must include `'archived'`
   in its ENUM (already present from `V2__events_core.sql`).

5. **Idempotent:** Running the archive multiple times is safe — the second run will
   simply set `status = 'archived'` on already-archived rows (a no-op for the ENUM).
