package com.lichsuvn.backend.importer;

import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.mysql.MySQLContainer;

import javax.sql.DataSource;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Verifies the complete Flyway chain on the same MySQL family used by production.
 * This test deliberately uses only a disposable Testcontainers database.
 */
class HistoryRagSchemaMigrationIntegrationTest {
    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static boolean mysqlAvailable;
    private static String unavailableReason;
    private static boolean externalMysql;
    private static String jdbcUrl;
    private static String username;
    private static String password;

    @BeforeAll
    static void migrateDisposableSchema() {
        try {
            configureMysql();
            if (!mysqlAvailable) {
                return;
            }

            DataSource dataSource = new DriverManagerDataSource(
                    jdbcUrl, username, password);
            jdbc = new JdbcTemplate(dataSource);
            Flyway.configure()
                    .dataSource(jdbcUrl, username, password)
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();
        } catch (Exception ex) {
            unavailableReason = "Testcontainers MySQL unavailable: " + ex.getClass().getSimpleName();
            mysqlAvailable = false;
            if (mysql != null) {
                mysql.stop();
            }
        }
    }

    @AfterAll
    static void stopContainer() {
        if (!externalMysql && mysql != null) {
            mysql.stop();
        }
    }

    private static void configureMysql() {
        String externalUrl = propertyOrEnv("history.rag.schema.mysql.url", "HISTORY_RAG_SCHEMA_MYSQL_URL");
        if (externalUrl != null) {
            String externalUser = propertyOrEnv("history.rag.schema.mysql.user", "HISTORY_RAG_SCHEMA_MYSQL_USER");
            String externalPassword = propertyOrEnv(
                    "history.rag.schema.mysql.password", "HISTORY_RAG_SCHEMA_MYSQL_PASSWORD");
            if (externalUser == null || externalPassword == null) {
                mysqlAvailable = false;
                unavailableReason = "History RAG schema test skipped: external MySQL URL was provided without "
                        + "history.rag.schema.mysql.user/password credentials.";
                return;
            }
            externalMysql = true;
            jdbcUrl = externalUrl;
            username = externalUser;
            password = externalPassword;
            mysqlAvailable = true;
            return;
        }

        try {
            mysql = new LocalMySqlContainer("mysql:8.0.36")
                    .withDatabaseName("history_rag_schema_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            jdbcUrl = mysql.getJdbcUrl();
            username = mysql.getUsername();
            password = mysql.getPassword();
            mysqlAvailable = true;
        } catch (RuntimeException ex) {
            mysqlAvailable = false;
            unavailableReason = "History RAG schema test skipped: Testcontainers Docker is unavailable and no "
                    + "-Dhistory.rag.schema.mysql.url was provided. Cause: " + ex.getMessage();
        }
    }

    private static String propertyOrEnv(String propertyName, String envName) {
        String propertyValue = System.getProperty(propertyName);
        if (propertyValue != null && !propertyValue.isBlank()) {
            return propertyValue;
        }
        String environmentValue = System.getenv(envName);
        return environmentValue == null || environmentValue.isBlank() ? null : environmentValue;
    }

    @Test
    void flywayCreatesHistoryRagSchemaAndValidatesUtf8Defaults() {
        assumeTrue(mysqlAvailable, unavailableReason);

        assertEquals(41, jdbc.queryForObject(
                "SELECT MAX(CAST(version AS UNSIGNED)) FROM flyway_schema_history", Integer.class));
        for (String table : List.of(
                "event_textbook_contents",
                "event_textbook_content_refs",
                "source_catalog",
                "event_research_sources",
                "event_external_sources",
                "history_rag_import_changes")) {
            assertEquals(1, jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                    Integer.class, table));
        }

        assertEquals("REFERENCE_RANGE", columnDefault("event_textbook_refs", "page_scope"));
        assertEquals("PRINTED_BOOK_PAGE", columnDefault("event_textbook_refs", "page_number_basis"));
        assertEquals("REFERENCE_RANGE_MAPPED", columnDefault("event_textbook_refs", "page_mapping_status"));
        assertEquals("0", columnDefault("event_textbook_refs", "show_on_detail"));
        assertEquals("NO", columnNullable("event_textbook_refs", "show_on_detail"));
        assertEquals("tinyint", columnType("event_textbook_refs", "show_on_detail").toLowerCase());
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                  AND column_name = 'content'
                """, Integer.class));
        assertEquals("utf8mb4", tableValue("event_textbook_contents", "TABLE_COLLATION").substring(0, 7));

        List<String> manualColumns = jdbc.queryForList(
                "SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) FROM information_schema.columns " +
                        "WHERE table_schema = DATABASE() AND LOWER(COLUMN_NAME) LIKE '%manual%'",
                String.class);
        assertTrue(manualColumns.isEmpty(), "Manual verification columns must not exist: " + manualColumns);

        String content = "Dữ kiện thứ nhất.\nDòng thứ hai với tiếng Việt: Đổi mới.";
        jdbc.update("""
                INSERT INTO event_textbook_contents
                    (event_id, content, content_status, content_source, reference_count)
                VALUES ('utf8-test', ?, 'SOURCE_MAPPED_NEEDS_PAGE_VERIFY', 'SINGLE_EXCERPT', 1)
                """, content);
        assertEquals(content, jdbc.queryForObject(
                "SELECT content FROM event_textbook_contents WHERE event_id = 'utf8-test'", String.class));

        assertNotNull(jdbc.queryForObject(
                "SELECT INDEX_NAME FROM information_schema.statistics " +
                        "WHERE table_schema = DATABASE() AND table_name = 'source_catalog' AND index_name = 'uk_source_catalog_dedupe_key'",
                String.class));
        assertTrue(jdbc.queryForList(
                "SELECT CONSTRAINT_NAME FROM information_schema.check_constraints " +
                        "WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME LIKE '%page_mapping%'",
                String.class).isEmpty());
        assertFalse(jdbc.queryForList(
                "SELECT CONSTRAINT_NAME FROM information_schema.check_constraints " +
                        "WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_event_textbook_contents_reference_count'",
                String.class).isEmpty());
    }

    private String columnDefault(String table, String column) {
        return jdbc.queryForObject("""
                SELECT COLUMN_DEFAULT
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, String.class, table, column);
    }

    private String columnNullable(String table, String column) {
        return jdbc.queryForObject("""
                SELECT IS_NULLABLE
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, String.class, table, column);
    }

    private String columnType(String table, String column) {
        return jdbc.queryForObject("""
                SELECT DATA_TYPE
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, String.class, table, column);
    }

    private String tableValue(String table, String column) {
        return jdbc.queryForObject(
                "SELECT " + column + " FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                String.class, table);
    }
}
