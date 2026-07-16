package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.TtsCacheKeyBuilder;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetClaimResult;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.time.LocalDateTime;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class TtsAudioAssetRepositoryIntegrationTest {
    static MySQLContainer<?> mysqlContainer;
    static String jdbcUrl;
    static String username;
    static String password;
    static TtsAudioAssetRepository firstRepository;
    static TtsAudioAssetRepository secondRepository;
    static TtsAudioChunkRepository firstChunkRepository;
    static TtsAudioChunkRepository secondChunkRepository;
    static JdbcTemplate jdbc;
    static boolean mysqlAvailable;
    static String mysqlUnavailableReason;

    @BeforeAll
    static void setupSchema() throws Exception {
        configureMysql();
        if (!mysqlAvailable) {
            return;
        }

        DataSource dataSource = new DriverManagerDataSource(jdbcUrl, username, password);
        jdbc = new JdbcTemplate(dataSource);
        NamedParameterJdbcTemplate named = new NamedParameterJdbcTemplate(dataSource);
        firstRepository = new TtsAudioAssetRepository(named);
        secondRepository = new TtsAudioAssetRepository(named);
        firstChunkRepository = new TtsAudioChunkRepository(named);
        secondChunkRepository = new TtsAudioChunkRepository(named);

        jdbc.execute("DROP TABLE IF EXISTS tts_audio_asset_chunks");
        jdbc.execute("DROP TABLE IF EXISTS tts_audio_chunks");
        jdbc.execute("DROP TABLE IF EXISTS tts_audio_assets");
        jdbc.execute("DROP TABLE IF EXISTS historical_events");
        jdbc.execute("""
                CREATE TABLE historical_events (
                    id VARCHAR(160) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    CONSTRAINT pk_historical_events PRIMARY KEY (id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
                """);
        runMigrationFile("src/main/resources/db/migration/V17__create_tts_audio_assets.sql");
        runMigrationFile("src/main/resources/db/migration/V18__extend_tts_audio_assets_for_worker.sql");
        runMigrationFile("src/main/resources/db/migration/V19__create_tts_audio_chunk_cache.sql");
    }

    @BeforeEach
    void resetData() {
        assumeTrue(mysqlAvailable, mysqlUnavailableReason);
        jdbc.update("DELETE FROM tts_audio_asset_chunks");
        jdbc.update("DELETE FROM tts_audio_chunks");
        jdbc.update("DELETE FROM tts_audio_assets");
        jdbc.update("DELETE FROM historical_events");
        jdbc.update("INSERT INTO historical_events (id, status) VALUES ('event-1', 'published')");
    }

    @Test
    void insertNewClaimReturnsOwner() {
        var result = firstRepository.claimPending(command("cache-a"));

        assertEquals(TtsAudioAssetClaimResult.Kind.CLAIMED_NEW, result.kind());
        assertEquals(0, result.asset().attemptCount());
        assertEquals(1, firstRepository.countByCacheKey("cache-a"));
    }

    @Test
    void duplicateClaimReturnsExistingPending() {
        var first = firstRepository.claimPending(command("cache-a"));
        var second = secondRepository.claimPending(command("cache-a"));

        assertEquals(TtsAudioAssetClaimResult.Kind.CLAIMED_NEW, first.kind());
        assertEquals(TtsAudioAssetClaimResult.Kind.EXISTING_PENDING, second.kind());
        assertEquals(first.asset().id(), second.asset().id());
        assertEquals(1, firstRepository.countByCacheKey("cache-a"));
    }

    @Test
    void chunkConcurrentClaimCreatesOneOwnerAndOneRow() throws Exception {
        TtsAudioChunkRepository.NewChunkCommand command = chunkCommand("chunk-key");
        var executor = Executors.newFixedThreadPool(2);
        try {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Callable<TtsAudioChunkRepository.ClaimResult> first = () -> { barrier.await(); return firstChunkRepository.claimOrGet(command); };
            Callable<TtsAudioChunkRepository.ClaimResult> second = () -> { barrier.await(); return secondChunkRepository.claimOrGet(command); };
            Future<TtsAudioChunkRepository.ClaimResult> firstFuture = executor.submit(first);
            Future<TtsAudioChunkRepository.ClaimResult> secondFuture = executor.submit(second);
            var results = List.of(firstFuture.get(), secondFuture.get());
            assertEquals(1, results.stream().filter(r -> r.kind() == TtsAudioChunkRepository.ClaimKind.CLAIMED_NEW).count());
            assertEquals(results.get(0).chunk().id(), results.get(1).chunk().id());
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM tts_audio_chunks", Integer.class));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentClaimCreatesExactlyOneOwnerAndOneRow() throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        try {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Callable<TtsAudioAssetClaimResult> first = () -> {
                barrier.await();
                return firstRepository.claimPending(command("cache-concurrent"));
            };
            Callable<TtsAudioAssetClaimResult> second = () -> {
                barrier.await();
                return secondRepository.claimPending(command("cache-concurrent"));
            };

            Future<TtsAudioAssetClaimResult> firstFuture = executor.submit(first);
            Future<TtsAudioAssetClaimResult> secondFuture = executor.submit(second);
            List<TtsAudioAssetClaimResult> results = List.of(firstFuture.get(), secondFuture.get());

            long ownerCount = results.stream()
                    .filter(TtsAudioAssetClaimResult::owner)
                    .count();
            assertEquals(1, ownerCount);
            assertEquals(1, firstRepository.countByCacheKey("cache-concurrent"));
            assertEquals(results.get(0).asset().id(), results.get(1).asset().id());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void pendingToSynthesizingClaimOnlyHasOneOwnerAndIncrementsAttemptOnce() throws Exception {
        var created = firstRepository.claimPending(command("cache-worker"));
        var executor = Executors.newFixedThreadPool(2);
        try {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Callable<Boolean> first = () -> {
                barrier.await();
                return firstRepository.claimPendingForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };
            Callable<Boolean> second = () -> {
                barrier.await();
                return secondRepository.claimPendingForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };

            Future<Boolean> firstFuture = executor.submit(first);
            Future<Boolean> secondFuture = executor.submit(second);
            List<Boolean> results = List.of(firstFuture.get(), secondFuture.get());

            assertEquals(1, results.stream().filter(Boolean::booleanValue).count());
            var asset = firstRepository.findById(created.asset().id()).orElseThrow();
            assertEquals(TtsAudioAssetStatus.SYNTHESIZING, asset.status());
            assertEquals(1, asset.attemptCount());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void claimedAssetAndChunkCanTransitionToUploading() {
        var created = firstRepository.claimPending(command("cache-uploading")).asset();
        var claimedAsset = firstRepository.claimPendingForSynthesis(
                created.id(),
                LocalDateTime.now().plusMinutes(5),
                3
        ).orElseThrow();

        assertEquals(true, firstRepository.markUploading(
                claimedAsset.id(),
                claimedAsset.claimToken(),
                LocalDateTime.now().plusMinutes(5)
        ));
        assertEquals(TtsAudioAssetStatus.UPLOADING,
                firstRepository.findById(created.id()).orElseThrow().status());
        assertEquals(true, firstRepository.markReady(
                created.id(),
                claimedAsset.claimToken(),
                new TtsAudioAssetRepository.StoredAudioCommand(
                        "cloudinary", "parent-smoke", "https://audio.test/parent",
                        "audio/mpeg", 10L, 1000L
                )
        ));
        assertEquals(TtsAudioAssetStatus.READY,
                firstRepository.findById(created.id()).orElseThrow().status());

        var chunk = firstChunkRepository.claimOrGet(chunkCommand("chunk-uploading")).chunk();
        var claimedChunk = firstChunkRepository.claimPendingForSynthesis(
                chunk.id(),
                LocalDateTime.now().plusMinutes(5),
                3
        ).orElseThrow();

        assertEquals(true, firstChunkRepository.markUploading(
                claimedChunk.id(),
                claimedChunk.claimToken(),
                LocalDateTime.now().plusMinutes(5)
        ));
        assertEquals(TtsAudioAssetStatus.UPLOADING,
                firstChunkRepository.findById(chunk.id()).orElseThrow().status());
        assertEquals(true, firstChunkRepository.markReady(
                chunk.id(),
                claimedChunk.claimToken(),
                new TtsAudioChunkRepository.StoredAudioCommand(
                        "cloudinary", "chunk-smoke", "https://audio.test/chunk",
                        "audio/mpeg", 10L, 500L
                )
        ));
        assertEquals(TtsAudioAssetStatus.READY,
                firstChunkRepository.findById(chunk.id()).orElseThrow().status());
    }

    @Test
    void failedRetryRequiresDelayAndOnlyHasOneOwner() throws Exception {
        var created = firstRepository.claimPending(command("cache-failed"));
        firstRepository.claimPendingForSynthesis(created.asset().id(), LocalDateTime.now().plusMinutes(5), 3);
        var claimed = firstRepository.findById(created.asset().id()).orElseThrow();
        firstRepository.markFailed(claimed.id(), claimed.claimToken(), "PROVIDER_SYNTHESIS_FAILED", "failed");

        assertEquals(0, firstRepository.claimFailedForSynthesis(
                created.asset().id(),
                LocalDateTime.now().minusDays(1),
                LocalDateTime.now().plusMinutes(5),
                3
        ).stream().count());

        jdbc.update("UPDATE tts_audio_assets SET updated_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id = ?",
                created.asset().id());

        var executor = Executors.newFixedThreadPool(2);
        try {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Callable<Boolean> first = () -> {
                barrier.await();
                return firstRepository.claimFailedForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now().plusDays(1),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };
            Callable<Boolean> second = () -> {
                barrier.await();
                return secondRepository.claimFailedForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now().plusDays(1),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };

            Future<Boolean> firstFuture = executor.submit(first);
            Future<Boolean> secondFuture = executor.submit(second);
            List<Boolean> results = List.of(firstFuture.get(), secondFuture.get());

            assertEquals(1, results.stream().filter(Boolean::booleanValue).count());
            assertEquals(2, firstRepository.findById(created.asset().id()).orElseThrow().attemptCount());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void staleLeaseRecoveryOnlyHasOneOwnerAndOldTokenCannotUpdate() throws Exception {
        var created = firstRepository.claimPending(command("cache-stale"));
        var firstClaim = firstRepository.claimPendingForSynthesis(
                created.asset().id(),
                LocalDateTime.now().minusMinutes(1),
                3
        ).orElseThrow();
        String oldToken = firstClaim.claimToken();

        var executor = Executors.newFixedThreadPool(2);
        try {
            CyclicBarrier barrier = new CyclicBarrier(2);
            Callable<Boolean> first = () -> {
                barrier.await();
                return firstRepository.claimStaleForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now(),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };
            Callable<Boolean> second = () -> {
                barrier.await();
                return secondRepository.claimStaleForSynthesis(
                        created.asset().id(),
                        LocalDateTime.now(),
                        LocalDateTime.now().plusMinutes(5),
                        3
                ).isPresent();
            };

            Future<Boolean> firstFuture = executor.submit(first);
            Future<Boolean> secondFuture = executor.submit(second);
            List<Boolean> results = List.of(firstFuture.get(), secondFuture.get());

            assertEquals(1, results.stream().filter(Boolean::booleanValue).count());
            assertEquals(2, firstRepository.findById(created.asset().id()).orElseThrow().attemptCount());
            assertEquals(false, firstRepository.markUploading(
                    created.asset().id(),
                    oldToken,
                    LocalDateTime.now().plusMinutes(5)
            ));
            var recovered = firstRepository.findById(created.asset().id()).orElseThrow();
            assertEquals(true, firstRepository.extendClaimLease(
                    recovered.id(),
                    recovered.claimToken(),
                    LocalDateTime.now().plusMinutes(10)
            ));
            assertEquals(false, firstRepository.extendClaimLease(
                    recovered.id(),
                    oldToken,
                    LocalDateTime.now().plusMinutes(10)
            ));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void flywayMigratesThroughV18AndEnforcesAssetConstraints() {
        assumeTrue(mysqlAvailable, mysqlUnavailableReason);
        String databaseName = "lichsuvn_flyway_test";
        jdbc.execute("DROP DATABASE IF EXISTS " + databaseName);
        jdbc.execute("CREATE DATABASE " + databaseName + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        String flywayUrl = jdbcUrl.replaceFirst("/[^/?]+(\\?.*)?$", "/" + databaseName);

        Flyway flyway = Flyway.configure()
                .dataSource(flywayUrl, username, password)
                .locations("classpath:db/migration")
                .load();

        flyway.migrate();

        JdbcTemplate flywayJdbc = new JdbcTemplate(new DriverManagerDataSource(
                flywayUrl,
                username,
                password
        ));

        assertEquals(1, intValue(flywayJdbc, """
                SELECT COUNT(*)
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                """));
        assertEquals("varchar", stringValue(flywayJdbc, """
                SELECT DATA_TYPE
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                  AND COLUMN_NAME = 'event_id'
                """));
        assertEquals(160, intValue(flywayJdbc, """
                SELECT CHARACTER_MAXIMUM_LENGTH
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                  AND COLUMN_NAME = 'event_id'
                """));
        assertEquals("RESTRICT", stringValue(flywayJdbc, """
                SELECT DELETE_RULE
                FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE()
                  AND CONSTRAINT_NAME = 'fk_tts_audio_assets_event'
                """));
        assertEquals(0, intValue(flywayJdbc, """
                SELECT NON_UNIQUE
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                  AND INDEX_NAME = 'uk_tts_audio_assets_cache_key'
                LIMIT 1
                """));
        assertEquals(2, intValue(flywayJdbc, """
                SELECT COUNT(*)
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                  AND INDEX_NAME = 'idx_tts_audio_assets_status_updated_at'
                  AND COLUMN_NAME IN ('status', 'updated_at')
                """));
        assertEquals(2, intValue(flywayJdbc, """
                SELECT COUNT(*)
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tts_audio_assets'
                  AND INDEX_NAME = 'idx_tts_audio_assets_status_claim_expires_at'
                  AND COLUMN_NAME IN ('status', 'claim_expires_at')
                """));

        insertHistoricalEvent(flywayJdbc, "event-fk");
        flywayJdbc.update("""
                INSERT INTO tts_audio_assets (
                    id, cache_key, event_id, text_hash, provider, voice,
                    synthesis_speed, audio_format, return_option, without_filter,
                    text_processing_version, status, attempt_count
                ) VALUES (
                    'asset-1', ?, 'event-fk', ?, 'viettel-ai', 'hcm-diemmy',
                    1.00, 'mp3', 3, FALSE, 'v1', 'pending', 0
                )
                """, "c".repeat(64), "d".repeat(64));

        assertThrows(DataIntegrityViolationException.class,
                () -> flywayJdbc.update("DELETE FROM historical_events WHERE id = 'event-fk'"));
        assertThrows(DataAccessException.class, () -> flywayJdbc.update("""
                INSERT INTO tts_audio_assets (
                    id, cache_key, event_id, text_hash, provider, voice,
                    synthesis_speed, audio_format, return_option, without_filter,
                    text_processing_version, status, attempt_count
                ) VALUES (
                    'asset-duplicate', ?, 'event-fk', ?, 'viettel-ai', 'hcm-diemmy',
                    1.00, 'mp3', 3, FALSE, 'v1', 'pending', 0
                )
                """, "c".repeat(64), "e".repeat(64)));
        assertThrows(DataAccessException.class, () -> flywayJdbc.update("""
                INSERT INTO tts_audio_assets (
                    id, cache_key, event_id, text_hash, provider, voice,
                    synthesis_speed, audio_format, return_option, without_filter,
                    text_processing_version, status, attempt_count
                ) VALUES (
                    'asset-negative-attempts', ?, 'event-fk', ?, 'viettel-ai', 'hcm-diemmy',
                    1.00, 'mp3', 3, FALSE, 'v1', 'pending', -1
                )
                """, "f".repeat(64), "g".repeat(64)));
    }

    private TtsAudioAssetRepository.NewAssetCommand command(String cacheKey) {
        return new TtsAudioAssetRepository.NewAssetCommand(
                cacheKey,
                "event-1",
                "text-hash",
                TtsCacheKeyBuilder.PROVIDER,
                "hcm-diemmy",
                new BigDecimal("1.00"),
                TtsCacheKeyBuilder.AUDIO_FORMAT,
                TtsCacheKeyBuilder.RETURN_OPTION,
                TtsCacheKeyBuilder.WITHOUT_FILTER,
                TtsCacheKeyBuilder.TEXT_PROCESSING_VERSION
        );
    }

    private TtsAudioChunkRepository.NewChunkCommand chunkCommand(String chunkKey) {
        return new TtsAudioChunkRepository.NewChunkCommand(
                chunkKey, "chunk text", "text-hash", TtsCacheKeyBuilder.PROVIDER, "hcm-diemmy",
                new BigDecimal("1.00"), TtsCacheKeyBuilder.AUDIO_FORMAT, TtsCacheKeyBuilder.RETURN_OPTION,
                TtsCacheKeyBuilder.WITHOUT_FILTER, TtsCacheKeyBuilder.TEXT_PROCESSING_VERSION, "v1");
    }

    private static void runMigrationFile(String path) throws Exception {
        String migration = Files.readString(Path.of(path));
        for (String statement : migration.split(";")) {
            if (!statement.isBlank()) {
                jdbc.execute(statement);
            }
        }
    }

    private void insertHistoricalEvent(JdbcTemplate targetJdbc, String id) {
        targetJdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year,
                    effective_end_year, geo_type, raw_json
                ) VALUES (?, ?, ?, 'atomic', 'political', 1945, 1945, 'no_location', JSON_OBJECT())
                """, id, id, "Test event");
    }

    private int intValue(JdbcTemplate targetJdbc, String sql) {
        Integer value = targetJdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }

    private String stringValue(JdbcTemplate targetJdbc, String sql) {
        String value = targetJdbc.queryForObject(sql, String.class);
        return value == null ? "" : value;
    }

    private static void configureMysql() {
        String externalUrl = propertyOrEnv("tts.integration.mysql.url", "TTS_INTEGRATION_MYSQL_URL");
        if (externalUrl != null && !externalUrl.isBlank()) {
            String externalUser = propertyOrEnv("tts.integration.mysql.user", "TTS_INTEGRATION_MYSQL_USER");
            String externalPassword = propertyOrEnv("tts.integration.mysql.password", "TTS_INTEGRATION_MYSQL_PASSWORD");
            if (externalUser == null || externalUser.isBlank()
                    || externalPassword == null || externalPassword.isBlank()) {
                mysqlAvailable = false;
                mysqlUnavailableReason = "MySQL integration skipped: external MySQL URL was provided, but credentials "
                        + "were not provided through -Dtts.integration.mysql.user/-Dtts.integration.mysql.password "
                        + "or TTS_INTEGRATION_MYSQL_USER/TTS_INTEGRATION_MYSQL_PASSWORD.";
                return;
            }
            jdbcUrl = externalUrl;
            username = externalUser;
            password = externalPassword;
            mysqlAvailable = true;
            return;
        }

        try {
            mysqlContainer = new MySQLContainer<>("mysql:8.0.36")
                    .withDatabaseName("lichsuvn_test");
            mysqlContainer.start();
            jdbcUrl = mysqlContainer.getJdbcUrl();
            username = mysqlContainer.getUsername();
            password = mysqlContainer.getPassword();
            mysqlAvailable = true;
        } catch (RuntimeException ex) {
            mysqlAvailable = false;
            mysqlUnavailableReason = "MySQL integration skipped: Testcontainers Docker is unavailable and no "
                    + "-Dtts.integration.mysql.url was provided. Cause: " + ex.getMessage();
        }
    }

    private static String propertyOrEnv(String propertyName, String envName) {
        String propertyValue = System.getProperty(propertyName);
        if (propertyValue != null && !propertyValue.isBlank()) {
            return propertyValue;
        }
        String envValue = System.getenv(envName);
        return envValue == null || envValue.isBlank() ? null : envValue;
    }
}
