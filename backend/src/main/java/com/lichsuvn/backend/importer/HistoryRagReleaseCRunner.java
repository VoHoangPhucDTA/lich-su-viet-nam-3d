package com.lichsuvn.backend.importer;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/** Applies only V30 after the controlled Release C backup and restore gates pass. */
@Component
@Profile("remote-release-c")
@ConditionalOnProperty(name = "history-rag.release-c.apply-v30", havingValue = "true")
public class HistoryRagReleaseCRunner implements CommandLineRunner {

    private static final String APPROVED_PACKAGE_SHA256 =
            "25fea8369332b6585cab9d81ca60e9dbae6b6ffcd7cc350600a6e4878246a529";

    private final HistoryRagDatasourceGuard datasourceGuard;
    private final HistoryRagPackageReader packageReader;
    private final Environment environment;
    private final JdbcTemplate jdbc;

    public HistoryRagReleaseCRunner(
            HistoryRagDatasourceGuard datasourceGuard,
            HistoryRagPackageReader packageReader,
            Environment environment,
            JdbcTemplate jdbc
    ) {
        this.datasourceGuard = datasourceGuard;
        this.packageReader = packageReader;
        this.environment = environment;
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        String expectedDatabase = environment.getProperty(
                "history-rag.release-c.expected-database", "");
        String expectedPackageSha256 = environment.getProperty(
                "history-rag.release-c.package-sha256", "");
        var target = datasourceGuard.validateReleaseC(
                environment.getProperty("spring.datasource.url"),
                expectedDatabase,
                environment.getActiveProfiles(),
                false,
                true,
                "",
                new HistoryRagDatasourceGuard.ReleaseCAuthorization(
                        propertyAsBoolean("history-rag.release-c.enabled"),
                        propertyAsBoolean("history-rag.release-c.approved"),
                        environment.getProperty("history-rag.release-c.expected-host", ""),
                        expectedDatabase,
                        expectedPackageSha256,
                        environment.getProperty("history-rag.release-c.backup-sha256", ""),
                        propertyAsBoolean("history-rag.release-c.restore-verified")
                )
        );
        if (!APPROVED_PACKAGE_SHA256.equalsIgnoreCase(expectedPackageSha256)) {
            throw new IllegalStateException("Release C package SHA-256 is not the repository-approved artifact");
        }
        var packageData = packageReader.read(Path.of(environment.getProperty(
                "history-rag.release-c.package-dir", "../data/history-rag/v1")));
        if (!expectedPackageSha256.equalsIgnoreCase(packageData.packageSha256())) {
            throw new IllegalStateException("Release C package contents do not match the approved SHA-256");
        }
        System.out.printf("Release C target verified: host=%s database=%s profiles=%s packageSha256=%s%n",
                target.hostname(), target.database(), target.activeProfiles(), packageData.packageSha256());

        verifyPreflight();
        Flyway.configure()
                .dataSource(jdbc.getDataSource())
                .locations("classpath:db/migration")
                .target("30")
                .ignoreMigrationPatterns("*:missing")
                .load()
                .migrate();
        verifyPostMigration();
        System.out.println("Release C migration completed: V30 added event_textbook_refs.show_on_detail.");
    }

    private void verifyPreflight() {
        requireCount("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0", 0,
                "Flyway history contains failed migrations");
        requireCount("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '29' AND success = 1", 1,
                "successful V29 is required");
        requireCount("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version = '13'
                  AND checksum = -195055576
                  AND success = 1
                """, 2, "the known duplicate V13 history baseline is required");
        requireCount("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '30'", 0,
                "V30 must be pending exactly once before Release C");
        requireCount("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                  AND column_name = 'show_on_detail'
                """, 0, "show_on_detail already exists without V30 history");
        requireCount("SELECT COUNT(*) FROM historical_events", 361, "historical event baseline mismatch");
        requireCount("SELECT COUNT(*) FROM event_textbook_refs", 395, "textbook reference baseline mismatch");
        requireCount("SELECT COUNT(*) FROM event_textbook_contents", 361, "textbook content baseline mismatch");
        requireCount("SELECT COUNT(*) FROM event_textbook_content_refs", 395,
                "textbook content relation baseline mismatch");
        validatedFlyway().validate();
    }

    private void verifyPostMigration() {
        requireCount("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0", 0,
                "Flyway history contains failed migrations");
        requireCount("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '30' AND success = 1", 1,
                "V30 is not recorded as successful");
        requireCount("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                  AND column_name = 'show_on_detail'
                  AND IS_NULLABLE = 'NO'
                  AND COLUMN_DEFAULT = '0'
                """, 1, "show_on_detail metadata is invalid");
        requireCount("SELECT COUNT(*) FROM event_textbook_refs", 395,
                "V30 unexpectedly changed textbook reference rows");
        validatedFlyway().validate();
    }

    private Flyway validatedFlyway() {
        Flyway flyway = Flyway.configure()
                .dataSource(jdbc.getDataSource())
                .locations("classpath:db/migration")
                .ignoreMigrationPatterns("*:pending", "*:missing")
                .load();
        List<MigrationInfo> missing = Arrays.stream(flyway.info().all())
                .filter(info -> info.getState() == MigrationState.MISSING_SUCCESS
                        || info.getState() == MigrationState.MISSING_FAILED)
                .toList();
        if (missing.stream().anyMatch(info ->
                info.getVersion() == null
                        || !"13".equals(info.getVersion().getVersion())
                        || info.getState() != MigrationState.MISSING_SUCCESS
                        || !Integer.valueOf(-195055576).equals(info.getAppliedChecksum()))) {
            throw new IllegalStateException(
                    "Release C blocked: unexpected Flyway missing migration history: " + missing);
        }
        List<MigrationInfo> checksumMismatches = Arrays.stream(flyway.info().all())
                .filter(MigrationInfo::isApplied)
                .filter(info -> info.getState() != MigrationState.MISSING_SUCCESS
                        && info.getState() != MigrationState.MISSING_FAILED)
                .filter(info -> !info.isChecksumMatching())
                .toList();
        if (!checksumMismatches.isEmpty()) {
            throw new IllegalStateException(
                    "Release C blocked: Flyway checksum mismatch: " + checksumMismatches);
        }
        return flyway;
    }

    private void requireCount(String sql, int expected, String message) {
        Integer actual = jdbc.queryForObject(sql, Integer.class);
        if (actual == null || actual != expected) {
            throw new IllegalStateException(
                    "Release C blocked: " + message + " (expected=" + expected + ", actual=" + actual + ")");
        }
    }

    private boolean propertyAsBoolean(String name) {
        return Boolean.parseBoolean(environment.getProperty(name, "false"));
    }
}
