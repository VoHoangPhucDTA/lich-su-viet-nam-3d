package com.lichsuvn.backend.admin.integration;

import com.lichsuvn.backend.testsupport.LocalMySqlContainer;

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
            mysql = new LocalMySqlContainer("mysql:8.0.36")
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
                    .target("40")
                    .load()
                    .migrate();
            jdbc.update("""
                    INSERT INTO users (id, email, password_hash, full_name, status)
                    VALUES
                        (UUID_TO_BIN('00000000-0000-4000-8000-000000004001'),
                         'v41-backfill-a@example.test', 'hash', 'V41 Admin A', 'active'),
                        (UUID_TO_BIN('00000000-0000-4000-8000-000000004002'),
                         'v41-backfill-b@example.test', 'hash', 'V41 Admin B', 'active')
                    """);
            jdbc.update("""
                    INSERT INTO user_roles (user_id, role_id)
                    SELECT UUID_TO_BIN('00000000-0000-4000-8000-000000004001'), id
                    FROM roles WHERE code='admin'
                    """);
            jdbc.update("""
                    INSERT INTO user_roles (user_id, role_id)
                    SELECT UUID_TO_BIN('00000000-0000-4000-8000-000000004002'), id
                    FROM roles WHERE code='admin'
                    """);
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .target("41")
                    .load()
                    .migrate();
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
    void flywayV41BackfillsTheActiveAdminGuardFromExistingRows() {
        assumeTrue(available, unavailableReason);

        assertEquals(2L, jdbc.queryForObject("""
                SELECT active_admin_count
                FROM admin_mutation_guards
                WHERE guard_key='last_active_admin'
                """, Long.class));
        assertEquals(2L, jdbc.queryForObject("""
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id
                WHERE u.status='active' AND r.code='admin'
                """, Long.class));
    }

    @Test
    void flywayV42AddsBackwardCompatibleManagedImageStorageAndDurableCleanup() {
        assumeTrue(available, unavailableReason);

        assertEquals("unmanaged", jdbc.queryForObject("""
                SELECT LOWER(COLUMN_DEFAULT)
                FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name='event_media'
                  AND column_name='storage_state'
                """, String.class));
        assertEquals("NO", columnNullable("event_media", "storage_state"));
        assertEquals("NO", columnNullable("event_media", "url"));
        assertEquals("char(36)", columnType("event_media", "managed_asset_id"));
        assertEquals("datetime(6)", columnType("event_media", "upload_expires_at"));
        assertEquals("varchar(1000)", columnType("event_media", "storage_original_url"));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema=DATABASE()
                  AND table_name='event_media_storage_cleanup_tasks'
                """, Integer.class));
        assertEquals(0, foreignKeyCount(
                "event_media_storage_cleanup_tasks", "event_media"));
        assertEquals(1, foreignKeyCount("event_media", "users"));
        assertEquals(4, jdbc.queryForObject("""
                SELECT COUNT(DISTINCT index_name)
                FROM information_schema.statistics
                WHERE table_schema=DATABASE() AND table_name='event_media'
                  AND index_name IN (
                    'uk_event_media_managed_asset',
                    'uk_event_media_storage_identity',
                    'idx_event_media_managed_read',
                    'idx_event_media_upload_expiry'
                  )
                """, Integer.class));
        assertEquals(6, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM information_schema.check_constraints
                WHERE constraint_schema=DATABASE()
                  AND constraint_name IN (
                    'chk_event_media_storage_state',
                    'chk_event_media_storage_byte_size',
                    'chk_event_media_storage_dimensions',
                    'chk_event_media_cleanup_operation',
                    'chk_event_media_cleanup_status',
                    'chk_event_media_cleanup_attempts'
                  )
                """, Integer.class));

        String eventId = "phase-b-v42-legacy";
        jdbc.update("""
                INSERT INTO historical_events
                    (id,slug,title,event_level,event_type,geo_type,raw_json,key_facts)
                VALUES(?,?,?,'atomic','political','no_location','{}','[]')
                """, eventId, eventId, "V42 legacy");
        jdbc.update("""
                INSERT INTO event_media(event_id,media_type,url)
                VALUES(?,'image','https://example.test/legacy.jpg')
                """, eventId);
        assertEquals("UNMANAGED", jdbc.queryForObject("""
                SELECT storage_state FROM event_media WHERE event_id=?
                """, String.class, eventId));

        assertThrows(DataAccessException.class, () -> jdbc.update("""
                UPDATE event_media SET storage_state='NOT_A_STATE' WHERE event_id=?
                """, eventId));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                UPDATE event_media SET storage_byte_size=-1 WHERE event_id=?
                """, eventId));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                UPDATE event_media SET storage_byte_size=0 WHERE event_id=?
                """, eventId));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                UPDATE event_media SET storage_width=10,storage_height=NULL WHERE event_id=?
                """, eventId));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                UPDATE event_media SET storage_width=0,storage_height=10 WHERE event_id=?
                """, eventId));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,operation,task_status,attempts,next_attempt_at
                ) VALUES('cloudinary','invalid','PURGE','PENDING',0,CURRENT_TIMESTAMP(6))
                """));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,operation,task_status,attempts,next_attempt_at
                ) VALUES('cloudinary','invalid-status','DELETE','UNKNOWN',0,CURRENT_TIMESTAMP(6))
                """));
        assertThrows(DataAccessException.class, () -> jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,operation,task_status,attempts,next_attempt_at
                ) VALUES('cloudinary','invalid-attempts','DELETE','PENDING',-1,CURRENT_TIMESTAMP(6))
                """));
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
        jdbc.update("""
                UPDATE event_media
                SET url='',status='hidden',storage_type='object_storage',
                    managed_asset_id='00000000-0000-4000-8000-000000004299',
                    storage_provider='cloudinary',
                    storage_public_id='events/phase1-media-cascade/media/'
                        '00000000-0000-4000-8000-000000004299',
                    storage_state='UPLOADING',
                    upload_token='00000000-0000-4000-8000-000000004298',
                    upload_started_at=CURRENT_TIMESTAMP(6),
                    upload_expires_at=CURRENT_TIMESTAMP(6)
                WHERE event_id=?
                """, id);
        jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,operation,task_status,attempts,next_attempt_at
                ) VALUES(
                    'cloudinary',
                    'events/phase1-media-cascade/media/'
                        '00000000-0000-4000-8000-000000004299',
                    'DELETE','PENDING',0,CURRENT_TIMESTAMP(6)
                )
                """);

        jdbc.update("DELETE FROM historical_events WHERE id = ?", id);

        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE event_id = ?", Integer.class, id));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media_storage_cleanup_tasks
                WHERE public_id='events/phase1-media-cascade/media/'
                    '00000000-0000-4000-8000-000000004299'
                """, Integer.class));
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
