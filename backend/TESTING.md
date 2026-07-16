# Backend Testing

Run the regular backend test suite from the backend directory:

```bash
mvn test
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
