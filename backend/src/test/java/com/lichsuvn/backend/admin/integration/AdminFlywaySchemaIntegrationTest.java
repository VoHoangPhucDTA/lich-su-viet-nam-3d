package com.lichsuvn.backend.admin.integration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataAccessException;
import org.testcontainers.mysql.MySQLContainer;

import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Phase 1 schema contract. It only uses a disposable Testcontainers database.
 * It deliberately has no fallback to a developer or remote datasource.
 */
class AdminFlywaySchemaIntegrationTest {

    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static boolean available;
    private static String unavailableReason;

    @BeforeAll
    static void migrateDisposableSchema() {
        try {
            mysql = new MySQLContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase1_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();

            DataSource dataSource = new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
            jdbc = new JdbcTemplate(dataSource);
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();
            available = true;
        } catch (Exception ex) {
            unavailableReason = "Disposable MySQL unavailable: "
                    + ex.getClass().getSimpleName() + ": " + ex.getMessage();
            if (mysql != null) {
                mysql.stop();
            }
        }
    }

    @AfterAll
    static void stopContainer() {
        if (mysql != null) {
            mysql.stop();
        }
    }

    @Test
    void flywaySchemaPreservesAdminEventContracts() {
        assumeTrue(available, unavailableReason);

        assertEquals("NO", columnNullable("historical_events", "key_facts"));
        assertEquals("YES", columnNullable("historical_events", "start_year"));
        assertEquals("YES", columnNullable("historical_events", "end_year"));

        String geoType = columnType("historical_events", "geo_type");
        assertTrue(geoType.contains("single_point"));
        assertTrue(geoType.contains("multi_region"));
        assertTrue(geoType.contains("multi_point"));
        assertTrue(geoType.contains("multi_polygon"));
        assertTrue(geoType.contains("mixed"));

        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'event_media'
                """, Integer.class));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'event_textbook_contents'
                """, Integer.class));
    }

    @Test
    void dependencySchemaMakesDeleteSafetyObservable() {
        assumeTrue(available, unavailableReason);

        assertTrue(foreignKeyCount("event_view_logs", "historical_events") > 0);
        assertTrue(foreignKeyCount("event_media", "historical_events") > 0);
        assertEquals(0, foreignKeyCount("event_textbook_contents", "historical_events"));
        assertEquals(0, foreignKeyCount("event_external_sources", "historical_events"));
    }

    @Test
    void eventMutationRequiresKeyFactsAgainstTheMigratedMySqlSchema() {
        assumeTrue(available, unavailableReason);

        assertThrows(DataAccessException.class, () -> jdbc.update("""
                INSERT INTO historical_events
                    (id, slug, title, event_level, event_type, geo_type, raw_json)
                VALUES (?, ?, ?, 'atomic', 'political', 'no_location', ?)
                """,
                "phase1-missing-key-facts",
                "phase1-missing-key-facts",
                "Phase 1 missing key facts",
                "{}"));
    }

    @Test
    void mysqlJsonEnumAndNullableChronologyAcceptTheCurrentCanonicalContract() {
        assumeTrue(available, unavailableReason);
        String id = "phase1-null-chronology";

        jdbc.update("""
                INSERT INTO historical_events
                    (id, slug, title, event_level, event_type, start_year, end_year,
                     effective_end_year, geo_type, raw_json, key_facts)
                VALUES (?, ?, ?, 'atomic', 'political', NULL, NULL, NULL, 'mixed', ?, ?)
                """, id, id, "Phase 1 nullable chronology", "{\"mapData\":{\"type\":\"mixed\"}}", "[]");

        var row = jdbc.queryForMap("""
                SELECT start_year, end_year, effective_end_year, geo_type,
                       JSON_TYPE(raw_json) AS raw_json_type,
                       JSON_TYPE(key_facts) AS key_facts_type
                FROM historical_events WHERE id = ?
                """, id);

        assertNull(row.get("start_year"));
        assertNull(row.get("end_year"));
        assertNull(row.get("effective_end_year"));
        assertEquals("mixed", row.get("geo_type"));
        assertEquals("OBJECT", row.get("raw_json_type"));
        assertEquals("ARRAY", row.get("key_facts_type"));
    }

    @Test
    void deletingAnEventCascadesToMediaInTheMigratedSchema() {
        assumeTrue(available, unavailableReason);
        String id = "phase1-media-cascade";
        jdbc.update("""
                INSERT INTO historical_events
                    (id, slug, title, event_level, event_type, geo_type, raw_json, key_facts)
                VALUES (?, ?, ?, 'atomic', 'political', 'no_location', ?, ?)
                """, id, id, "Phase 1 media cascade", "{}", "[]");
        jdbc.update("""
                INSERT INTO event_media (event_id, media_type, url)
                VALUES (?, 'image', 'https://example.test/phase1.jpg')
                """, id);

        jdbc.update("DELETE FROM historical_events WHERE id = ?", id);

        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE event_id = ?", Integer.class, id));
    }

    private String columnNullable(String table, String column) {
        return jdbc.queryForObject("""
                SELECT IS_NULLABLE FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, String.class, table, column);
    }

    private String columnType(String table, String column) {
        return jdbc.queryForObject("""
                SELECT COLUMN_TYPE FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                """, String.class, table, column);
    }

    private int foreignKeyCount(String table, String referencedTable) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND REFERENCED_TABLE_NAME = ?
                """, Integer.class, table, referencedTable);
    }
}
