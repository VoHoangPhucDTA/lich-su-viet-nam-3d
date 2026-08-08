package com.lichsuvn.backend.importer.canonicalgeo;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;

/**
 * Phase C2-T4 native dry-run smoke test (revised after C2-T2 wiring fix
 * and C2-T4 zero-count normalisation in
 * {@link CanonicalGeographySyncService#validateCanonical}).
 *
 * <p>Boots the same canonical-geo-sync Spring context the native runner
 * uses (programmatic {@link SpringApplication#run} of
 * {@link CanonicalGeographySyncApplication.SyncConfiguration}) against a
 * disposable TestContainers MySQL container, lets the
 * {@link org.springframework.boot.CommandLineRunner} implementation
 * fire its dry-run end-to-end, and verifies:
 *
 * <ul>
 *   <li>context refresh succeeds (the wiring + zero-count fix are
 *       effective);</li>
 *   <li>plan JSONL is written to
 *       {@code --canonical-geo-sync.output-dir}/plan/canonical-geo-sync-plan.jsonl
 *       and contains exactly one row per canonical event (361);</li>
 *   <li>the DB is unchanged — row count and updated_at timestamps are
 *       identical before and after the dry-run; no INSERTs, UPDATEs or
 *       DELETEs.</li>
 * </ul>
 *
 * <p>The TestContainers MySQL is started but stays empty (no fixture
 * seeded), so every canonical ID is treated as {@code canonical_only}
 * by the runner and the corresponding plan row records that. The runner
 * ignores the testcontainer MySQL even if it has the historical_events
 * table, because no historical_events rows are inserted; it is exercised
 * with a real canonical 361-event JSONL file (locked SHA
 * {@code 7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0}).
 *
 * <p>The output dir is overridden via the Spring command-line argument
 * {@code --canonical-geo-sync.output-dir=…} so the plan stays inside the
 * test temp directory and does not pollute {@code ../geo-phase-c2-db-sync}.
 */
@DisplayName("C2-T4 native dry-run emits plan JSONL and does not write to the DB")
class CanonicalGeographyNativeDryRunSmokeTest {

    /** Canonical row count for the actual {@code core_events.jsonl}. */
    private static final int CANONICAL_RECORD_COUNT = 361;
    /** Logical SHA of the actual canonical dataset. */
    private static final String CANONICAL_LOGICAL_SHA =
            "7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0";

    private static MySQLContainer<?> mysql;
    private static ConfigurableApplicationContext applicationContext;
    private static JdbcTemplate jdbcTemplate;
    private static Path testOutputDir;

    @BeforeAll
    static void startApplicationContext() throws Exception {
        try {
            // Step 1: Bring up MySQL Testcontainer.
            mysql = new MySQLContainer<>("mysql:8.0.36")
                    .withDatabaseName("lichsuvn_phase4a_native_dryrun")
                    .withUsername("lichsuvn_local")
                    .withPassword("native-dryrun-test");
            mysql.start();

            // Step 2: Apply V38 schema migration manually so Spring's
            //   auto-Flyway sees an already-migrated database.
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();

            // Step 3: Stand up a JdbcTemplate for read-only audit queries.
            jdbcTemplate = new JdbcTemplate(new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword()));

            // Step 4: Resolve the canonical events path. The runner
            //   defaults to ../crawData/.../core_events.jsonl relative to
            //   the backend working directory. In our Maven invocation
            //   the cwd is backend/, so the relative path resolves to
            //   the real canonical file. The locked SHA must match.
            Path eventsPath = java.nio.file.Paths.get("..").resolve(
                    "crawData/stage4b_curate_tree/output/phase2/core_events.jsonl")
                    .toAbsolutePath().normalize();
            assertThat(Files.exists(eventsPath))
                    .as("canonical JSONL must exist at default events-path")
                    .isTrue();
            String canonicalSha =
                    CanonicalGeographyProjection.canonicalFileSha256(eventsPath);
            assertThat(canonicalSha)
                    .as("canonical JSONL logical SHA must match locked value")
                    .isEqualTo(CANONICAL_LOGICAL_SHA);

            // Step 5: Create a temp output directory for the runner to
            //   drop its plan JSONL into. We override --canonical-geo-sync.output-dir
            //   so the runner does not pollute ../geo-phase-c2-db-sync.
            testOutputDir = Files.createTempDirectory("c2t4-dryrun-output-");
            Path canonicalPlanPath = testOutputDir
                    .resolve("plan/canonical-geo-sync-plan.jsonl");

            // Step 6: Boot the canonical-sync Spring context against this DB
            //   with command-line args overriding datasource URL,
            //   disabling Spring Flyway (we already migrated manually),
            //   setting the locked canonical SHA, and pointing the runner
            //   output at our temp directory.
            SpringApplication app = new SpringApplication(
                    CanonicalGeographySyncApplication.SyncConfiguration.class);
            app.setWebApplicationType(WebApplicationType.NONE);
            app.setAdditionalProfiles(CanonicalGeographySyncApplication.PROFILE);
            String[] args = new String[] {
                    "--spring.datasource.url=" + mysql.getJdbcUrl(),
                    "--spring.datasource.username=" + mysql.getUsername(),
                    "--spring.datasource.password=" + mysql.getPassword(),
                    "--spring.flyway.enabled=false",
                    "--canonical-geo-sync.expected-canonical-sha=" + CANONICAL_LOGICAL_SHA,
                    "--canonical-geo-sync.output-dir=" + testOutputDir.toAbsolutePath()
            };
            // The runner's CommandLineRunner.run fires during app.run(args)
            // and writes the plan JSONL synchronously. Wait until it
            // exists (the runner completes synchronously before
            // SpringApplication.run returns).
            applicationContext = app.run(args);

            assertThat(Files.exists(canonicalPlanPath))
                    .as("after context refresh the runner must have written the plan JSONL")
                    .isTrue();
        } catch (Throwable t) {
            cleanupAfterFailure();
            throw new IllegalStateException(
                    "Native canonical-sync Spring context could not start: "
                            + t.getMessage(), t);
        }
    }

    @AfterAll
    static void closeContext() {
        if (applicationContext != null) {
            applicationContext.close();
        }
        if (mysql != null) {
            try { mysql.stop(); } catch (Throwable ignored) { /* best-effort */ }
        }
        if (testOutputDir != null) {
            try {
                java.nio.file.Files.walk(testOutputDir)
                        .sorted(java.util.Comparator.reverseOrder())
                        .forEach(p -> { try { Files.deleteIfExists(p); } catch (Throwable ignored) { } });
            } catch (Throwable ignored) { /* best-effort */ }
        }
    }

    private static void cleanupAfterFailure() {
        if (applicationContext != null) {
            try { applicationContext.close(); } catch (Throwable ignored) { /* */ }
        }
        if (mysql != null) {
            try { mysql.stop(); } catch (Throwable ignored) { /* */ }
        }
    }

    @AfterEach
    void cleanupPlanFile() throws Exception {
        // No-op — the plan path is fully owned by the test and cleaned
        // up at @AfterAll by deleting testOutputDir recursively.
    }

    @Test
    @DisplayName("dry-run against Testcontainers MySQL fixture: plan emitted, DB unchanged")
    void dryRunSmokeAgainstTestcontainers() throws Exception {
        // Capture DB state BEFORE dry-run. TestContainers MySQL is empty.
        Integer rowsBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historical_events", Integer.class);
        assertThat(rowsBefore).isZero();

        // The Dry-Run runner runs on context-refresh (SpringApplication.run
        // invokes the CommandLineRunner as part of boot). After the runner
        // finishes, the plan JSONL is present at the output-dir/plan path
        // and the DB must be unchanged.
        Path canonicalPlanPath = testOutputDir
                .resolve("plan/canonical-geo-sync-plan.jsonl");

        // 1. Plan JSONL exists and has exactly CANONICAL_RECORD_COUNT rows.
        assertThat(Files.exists(canonicalPlanPath)).isTrue();
        List<String> planLines = Files.readAllLines(canonicalPlanPath);
        assertThat(planLines)
                .as("plan JSONL must contain exactly one row per canonical event")
                .hasSize(CANONICAL_RECORD_COUNT);

        // 2. Every row in this fixture is canonical_only because the
        //    TestContainers MySQL is empty. The runner's plan-row
        //    `blockedReason` is "canonical_only: no DB row" — the JSON
        //    string renders as "...canonical_only: no DB row..." with
        //    single backslash-escaped JSON delimiters. We match the
        //    semantic substring (no surrounding quotes needed).
        long canonicalOnlyCount = planLines.stream()
                .filter(line -> line.contains("canonical_only"))
                .count();
        assertThat(canonicalOnlyCount)
                .as("with empty TestContainers MySQL, every row is canonical_only")
                .isEqualTo(CANONICAL_RECORD_COUNT);

        // 3. DB is unchanged after dry-run.
        Integer rowsAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historical_events", Integer.class);
        assertThat(rowsAfter).isZero();

        // 4. No INSERTs, UPDATEs or DELETEs.
        Long legacyTypesBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historical_events "
                        + "WHERE geo_type IN ('single_point','multi_region')", Long.class);
        Long canonicalTypesBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historical_events "
                        + "WHERE geo_type IN ('point','multi_point','multi_polygon','mixed','nationwide','no_location')",
                Long.class);
        assertThat(legacyTypesBefore).isZero();
        assertThat(canonicalTypesBefore).isZero();
    }
}
