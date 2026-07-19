package com.lichsuvn.backend.importer;

import org.flywaydb.core.Flyway;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time, deliberately narrow Release B runner. It can only apply V29 after
 * all explicit authorization and rollback-evidence gates are present.
 */
@Component
@Profile("remote-release-b")
@ConditionalOnProperty(name = "history-rag.release-b.apply-v29", havingValue = "true")
public class HistoryRagReleaseBRunner implements CommandLineRunner {

    private final HistoryRagDatasourceGuard datasourceGuard;
    private final Environment environment;
    private final JdbcTemplate jdbc;

    public HistoryRagReleaseBRunner(
            HistoryRagDatasourceGuard datasourceGuard,
            Environment environment,
            JdbcTemplate jdbc
    ) {
        this.datasourceGuard = datasourceGuard;
        this.environment = environment;
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        var target = datasourceGuard.validateReleaseB(
                environment.getProperty("spring.datasource.url"),
                environment.getActiveProfiles(),
                new HistoryRagDatasourceGuard.ReleaseBAuthorization(
                        propertyAsBoolean("history-rag.release-b.enabled"),
                        propertyAsBoolean("history-rag.release-b.approved"),
                        environment.getProperty("history-rag.release-b.expected-host", ""),
                        environment.getProperty("history-rag.release-b.expected-database", ""),
                        environment.getProperty("history-rag.release-b.backup-sha256", ""),
                        propertyAsBoolean("history-rag.release-b.restore-verified")
                )
        );
        System.out.printf("Release B target verified: host=%s database=%s profiles=%s%n",
                target.hostname(), target.database(), target.activeProfiles());

        verifyPreflight();
        Flyway flyway = Flyway.configure()
                .dataSource(jdbc.getDataSource())
                .locations("classpath:db/migration")
                .target("29")
                .load();
        flyway.migrate();
        verifyPostMigration();
        System.out.println("Release B completed: V29 removed event_textbook_refs.content.");
    }

    private void verifyPreflight() {
        int failedMigrations = requiredInt("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0");
        if (failedMigrations != 0) {
            throw new IllegalStateException("Release B blocked: Flyway history contains failed migrations");
        }
        int releaseAComplete = requiredInt("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version = '28' AND success = 1
                """);
        if (releaseAComplete != 1) {
            throw new IllegalStateException("Release B blocked: successful V28 is required");
        }
        int legacyColumn = requiredInt("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                  AND column_name = 'content'
                """);
        if (legacyColumn != 1) {
            throw new IllegalStateException("Release B blocked: expected legacy content column is not present exactly once");
        }
        int canonicalContent = requiredInt("SELECT COUNT(*) FROM event_textbook_contents");
        if (canonicalContent <= 0) {
            throw new IllegalStateException("Release B blocked: canonical textbook content is empty");
        }
        Flyway.configure()
                .dataSource(jdbc.getDataSource())
                .locations("classpath:db/migration")
                .ignoreMigrationPatterns("*:pending")
                .load()
                .validate();
    }

    private void verifyPostMigration() {
        int successfulV29 = requiredInt("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version = '29' AND success = 1
                """);
        if (successfulV29 != 1) {
            throw new IllegalStateException("Release B failed: V29 is not recorded as successful");
        }
        int legacyColumn = requiredInt("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                  AND column_name = 'content'
                """);
        if (legacyColumn != 0) {
            throw new IllegalStateException("Release B failed: legacy content column still exists");
        }
        int canonicalContent = requiredInt("SELECT COUNT(*) FROM event_textbook_contents");
        if (canonicalContent <= 0) {
            throw new IllegalStateException("Release B failed: canonical textbook content is unexpectedly empty");
        }
        Flyway.configure()
                .dataSource(jdbc.getDataSource())
                .locations("classpath:db/migration")
                .load()
                .validate();
    }

    private int requiredInt(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        if (value == null) {
            throw new IllegalStateException("Release B query returned no result");
        }
        return value;
    }

    private boolean propertyAsBoolean(String name) {
        return Boolean.parseBoolean(environment.getProperty(name, "false"));
    }
}
