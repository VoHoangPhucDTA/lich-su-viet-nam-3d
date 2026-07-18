# Backend Testing

Run the regular backend test suite from the backend directory:

```bash
mvn test
```

## History RAG schema migration test

`HistoryRagSchemaMigrationIntegrationTest` starts a disposable MySQL 8.0
container, applies the complete Flyway chain, and validates the schema through
`V30`. It never connects to the application's local or remote datasource.

The expected result is `Tests run: 1, Failures: 0, Errors: 0, Skipped: 0`.
Testcontainers/Ryuk removes the disposable containers after the JVM exits.

Docker Engine 29 requires API 1.44 or newer. With Docker Desktop 4.63 / Engine
29, add `-Dapi.version=1.44` to Maven Testcontainers commands; otherwise the
older docker-java default is rejected before a container starts.

When Testcontainers cannot discover Docker Desktop, pass all three properties
for a separately created disposable MySQL database: `history.rag.schema.mysql.url`,
`history.rag.schema.mysql.user`, and `history.rag.schema.mysql.password`.
The schema test never creates or stops that external database, so it must not
point to a database containing data that must be retained.

## History RAG package and importer

Generate the deterministic package from the audited workbook at repository
root:

```powershell
python scripts/history-rag/export_workbook.py `
  --workbook "C:\path\to\history_rag_migration_import_package_semantic_active_refs.xlsx" `
  --output-dir data/history-rag/v1
```

The semantic-active workbook is an external read-only input. Its expected
baseline is 386 active textbook refs, 359 visible refs, 27 hidden supporting
refs, 6 removed wrong mappings and 3 quarantined refs. The generated package
stores the nine removal before-images in
`textbook-reference-removals.ndjson`; they are not active RAG rows.

Run the package and dry-run unit tests from `backend`:

```powershell
mvn '-Dtest=HistoryRagPackageReaderTest,HistoryRagDatasourceGuardTest,HistoryRagTextbookRefPreflightTest,HistoryRagImportRunnerTest' test
mvn '-Dapi.version=1.44' '-Dtest=HistoryRagSchemaMigrationIntegrationTest,HistoryRagDryRunIntegrationTest,HistoryRagImportServiceIntegrationTest' test
```

Run the read-only preflight against a local MySQL database only:

```powershell
mvn spring-boot:run `
  '-Dspring-boot.run.profiles=history-rag-import' `
  '-Dspring-boot.run.arguments=--history-rag.import.dry-run=true --history-rag.import.allow-write=false --history-rag.import.expected-database=lichsuvn --history-rag.import.package-dir=../data/history-rag/v1 --history-rag.import.section=all --spring.main.web-application-type=none --spring.flyway.enabled=false'
```

Apply is blocked whenever preflight reports missing or conflicting baseline
records. Apply and rollback are allowed only against `localhost`, `127.0.0.1`
or a Testcontainers-managed host, and require both the importer properties and
the independent environment gates below. Never set these values for TiDB Cloud
or another remote datasource.

```powershell
$env:HISTORY_RAG_IMPORT_ALLOW_WRITE='true'
$env:HISTORY_RAG_IMPORT_EXPECTED_DATABASE='lichsuvn'
mvn spring-boot:run `
  '-Dspring-boot.run.profiles=history-rag-import' `
  '-Dspring-boot.run.arguments=--history-rag.import.dry-run=false --history-rag.import.allow-write=true --history-rag.import.expected-database=lichsuvn --history-rag.import.package-dir=../data/history-rag/v1 --history-rag.import.section=all --spring.main.web-application-type=none --spring.flyway.enabled=false'
```

Rollback uses the audit run ID and restores a row only while its current value
still matches the recorded after-image. Later manual changes are reported as
`ROLLBACK_CONFLICT` and are not overwritten.

```powershell
mvn spring-boot:run `
  '-Dspring-boot.run.profiles=history-rag-import' `
  '-Dspring-boot.run.arguments=--history-rag.import.dry-run=false --history-rag.import.allow-write=true --history-rag.import.expected-database=lichsuvn --history-rag.import.rollback-run-id=123 --spring.main.web-application-type=none --spring.flyway.enabled=false'
Remove-Item Env:HISTORY_RAG_IMPORT_ALLOW_WRITE
Remove-Item Env:HISTORY_RAG_IMPORT_EXPECTED_DATABASE
```

## TTS Audio Asset MySQL Integration Test

`TtsAudioAssetRepositoryIntegrationTest` verifies the production Spring JDBC repository against MySQL, including the `UNIQUE(cache_key)` atomic claim behavior and the Flyway migration through `V17__create_tts_audio_assets.sql`.

By default the test tries Testcontainers MySQL:

```bash
mvn test -Dtest=TtsAudioAssetRepositoryIntegrationTest
```

If Testcontainers cannot reach Docker on the machine, provide an external disposable MySQL database through system properties:

```bash
mvn test \
  -Dtest=TtsAudioAssetRepositoryIntegrationTest \
  -Dtts.integration.mysql.url=$TTS_INTEGRATION_MYSQL_URL \
  -Dtts.integration.mysql.user=$TTS_INTEGRATION_MYSQL_USER \
  -Dtts.integration.mysql.password=$TTS_INTEGRATION_MYSQL_PASSWORD
```

The same values can also be provided through environment variables:

```text
TTS_INTEGRATION_MYSQL_URL
TTS_INTEGRATION_MYSQL_USER
TTS_INTEGRATION_MYSQL_PASSWORD

## Phase 3 TTS chunk/assembly checks

Phase 3 uses migration `V19__create_tts_audio_chunk_cache.sql`. Run the backend
tests from this directory with:

```bash
./mvnw test
```

The MySQL integration test first tries Testcontainers. If Docker is unavailable,
provide `-Dtts.integration.mysql.url`, `-Dtts.integration.mysql.user`, and
`-Dtts.integration.mysql.password` (or the matching environment variables).
Without either option, the integration tests are skipped with an explicit reason.

Long narration assembly requires both `ffmpeg` and `ffprobe` on `PATH`, or the
paths configured by `APP_TTS_FFMPEG_EXECUTABLE` and `APP_TTS_FFPROBE_EXECUTABLE`.
Automated tests never call Viettel AI or Cloudinary.
```

If neither Testcontainers nor a complete external MySQL config is available, the integration test is skipped with a blocker message. Do not use a database that contains data you need to keep: the test creates and drops test tables/databases.

## Repair normalized event data from `raw_json`

`historical_events.raw_json` is the source document for the event support tables. The one-shot `sync-source-json` profile checks and, when explicitly enabled, inserts missing rows into `event_grades`, `event_textbook_refs`, `event_media`, and `event_relations`. For an existing textbook reference it only fills missing page fields, `url`, and the SGK-only `content`; it does not overwrite curated values. The four narrative fields on `historical_events` remain the aggregate event content that may later combine textbook and external sources. The sync does not delete existing enrichment or TTS data.

Run a read-only report first:

```bash
java -Dspring.profiles.active=remote-production,sync-source-json \
  -jar target/backend-0.0.1-SNAPSHOT.jar --server.port=18080 \
  --app.import.source-json-sync.scope=textbook-refs
```

Apply only after reviewing the report:

```bash
java -Dspring.profiles.active=remote-production,sync-source-json \
  -jar target/backend-0.0.1-SNAPSHOT.jar \
  --server.port=18080 --app.import.source-json-sync.scope=textbook-refs \
  --app.import.source-json-sync.apply=true
```

The example apply command is intentionally scoped to textbook references. Use `scope=all` only when you explicitly intend to sync all support tables. Stop the one-shot process after the `Source JSON sync ...` summary is printed, then run the read-only command again to verify all missing counts are zero. Do not run the apply command against a database unless the intended datasource is configured in the environment or backend `.env` file.

## Flyway V16 Checksum Note

`V16__import_event_associations.sql` was hardened so clean database migration can skip association rows whose source or target event is absent. If your local database is disposable, recreate it before running the app after pulling migration changes.

If your database must preserve data and has already applied the old V16, do not run `flyway repair` blindly. First back up the database and inspect `flyway_schema_history` for version `16`. After confirming the edited V16 is semantically safe for that database, run a controlled Flyway repair and then migrate. Remote/shared databases should use the team's gated migration process.
