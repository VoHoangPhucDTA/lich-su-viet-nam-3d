package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.mysql.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers(disabledWithoutDocker = true)
class AiMySqlMigrationIntegrationTest {
    private static final String TEST_PASSWORD = UUID.randomUUID().toString();

    @Container
    private static final MySQLContainer MYSQL = new LocalMySqlContainer("mysql:8.4.6")
            .withDatabaseName("lichsuvn_ai_e2e")
            .withUsername("ai_e2e")
            .withPassword(TEST_PASSWORD);

    @Test
    void appliesAllFlywayMigrationsAndVerifiesGoal13ConstraintsOnRealMySql() throws Exception {
        long started = System.nanoTime();
        Flyway flyway = Flyway.configure()
                .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
        int applied = flyway.migrate().migrationsExecuted;
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;

        try (Connection connection = MYSQL.createConnection(""); Statement statement = connection.createStatement()) {
            assertTrue(version(statement).startsWith("8.4."));
            assertEquals(applied, scalar(statement, "SELECT COUNT(*) FROM flyway_schema_history WHERE success=1"));
            for (int version : Set.of(35, 36, 37)) {
                assertEquals(1, scalar(statement, "SELECT COUNT(*) FROM flyway_schema_history WHERE version='" + version + "' AND success=1"));
            }
            for (String table : Set.of("ai_generation_receipts", "ai_question_candidates", "ai_question_candidate_options",
                    "ai_question_candidate_sources", "ai_question_candidate_audit_events", "ai_candidate_provenance_validations",
                    "ai_question_revision_heads", "ai_question_official_revisions")) {
                assertEquals(1, metadataCount(statement, "tables", "table_name", table));
            }
            for (String index : Set.of("uq_ai_generation_receipts_request", "uq_ai_question_candidates_receipt_item",
                    "uq_ai_candidate_root_revision", "uq_ai_official_revision_number", "uq_ai_revision_open_candidate")) {
                assertTrue(metadataCount(statement, "statistics", "index_name", index) >= 1, "Missing index " + index);
            }
            for (String foreignKey : Set.of("fk_ai_candidate_options_candidate", "fk_ai_candidate_sources_candidate",
                    "fk_ai_candidate_audit_candidate", "fk_ai_provenance_candidate", "fk_ai_revision_head_open",
                    "fk_ai_official_revision_candidate")) {
                assertEquals(1, constraintCount(statement, foreignKey));
            }
            assertEquals(1, columnCount(statement, "ai_question_candidates", "version"));
            assertEquals(1, columnCount(statement, "ai_question_candidates", "revision_number"));
            assertEquals(1, columnCount(statement, "ai_question_revision_heads", "next_revision_number"));
        }
        System.out.printf("AI_E2E_MYSQL_REPORT mysql=%s flyway=%s applied=%d elapsedMs=%d schema=%s%n",
                MYSQL.getDockerImageName(), Flyway.class.getPackage().getImplementationVersion(), applied, elapsedMs,
                MYSQL.getDatabaseName());
    }

    private int metadataCount(Statement statement, String table, String field, String value) throws Exception {
        return scalar(statement, "SELECT COUNT(*) FROM information_schema." + table + " WHERE table_schema='"
                + MYSQL.getDatabaseName() + "' AND " + field + "='" + value + "'");
    }

    private int constraintCount(Statement statement, String name) throws Exception {
        return scalar(statement, "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema='"
                + MYSQL.getDatabaseName() + "' AND constraint_name='" + name + "' AND constraint_type='FOREIGN KEY'");
    }

    private int columnCount(Statement statement, String table, String column) throws Exception {
        return scalar(statement, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='"
                + MYSQL.getDatabaseName() + "' AND table_name='" + table + "' AND column_name='" + column + "'");
    }

    private int scalar(Statement statement, String sql) throws Exception {
        try (ResultSet result = statement.executeQuery(sql)) { result.next(); return result.getInt(1); }
    }

    private String version(Statement statement) throws Exception {
        try (ResultSet result = statement.executeQuery("SELECT VERSION()")) { result.next(); return result.getString(1); }
    }
}
