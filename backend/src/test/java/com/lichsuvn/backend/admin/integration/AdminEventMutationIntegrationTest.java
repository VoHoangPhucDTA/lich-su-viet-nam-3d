package com.lichsuvn.backend.admin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventMutationDtos;
import com.lichsuvn.backend.admin.application.AdminEventMutationService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.EventCompletenessService;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.mysql.MySQLContainer;

import java.util.List;
import java.util.Map;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminEventMutationIntegrationTest {
    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static AdminEventMutationService service;
    private static TransactionTemplate tx;
    private static boolean available;
    private static String unavailableReason;
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();
    private static final UserPrincipal ADMIN = new UserPrincipal("admin", null, "admin@test", List.of("admin"));

    @BeforeAll
    static void startDatabase() {
        try {
            mysql = new MySQLContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase5_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            var dataSource = new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load().migrate();
            jdbc = new JdbcTemplate(dataSource);
            var named = new NamedParameterJdbcTemplate(dataSource);
            var mapper = new ObjectMapper();
            var read = new AdminEventReadService(
                    new AdminEventReadRepository(named, mapper), new EventCompletenessService());
            service = new AdminEventMutationService(
                    new AdminEventMutationRepository(named, mapper), read, mapper);
            tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
            available = true;
        } catch (Exception ex) {
            unavailableReason = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            if (mysql != null) mysql.stop();
        }
    }

    @AfterAll
    static void stopDatabase() {
        if (mysql != null) mysql.stop();
    }

    @Test
    void flywayV38AndCreateUseDraftValidJsonAndNullableChronology() {
        assumeTrue(available, unavailableReason);
        assertEquals("datetime(6)", jdbc.queryForObject("""
                SELECT COLUMN_TYPE FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name='historical_events'
                  AND column_name='updated_at'
                """, String.class));

        var detail = tx.execute(status -> service.create(create("phase5-create"), ADMIN));
        var row = jdbc.queryForMap("""
                SELECT status, start_year, effective_end_year,
                       JSON_TYPE(raw_json) raw_type, JSON_TYPE(key_facts) facts_type
                FROM historical_events WHERE id='phase5-create'
                """);
        assertEquals("draft", row.get("status"));
        assertEquals("OBJECT", row.get("raw_type"));
        assertEquals("ARRAY", row.get("facts_type"));
        assertEquals(List.of(10, 12), detail.classification().grades());
        assertTrue(version(detail).matches(".*\\.\\d{6}Z"));
    }

    @Test
    void sixDigitVersionRoundTripsAndConcurrentCoreUpdatePreservesAggregateResources() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase5-parent"), ADMIN));
        tx.executeWithoutResult(status -> service.create(create("phase5-preserve"), ADMIN));
        jdbc.update("""
                UPDATE historical_events
                SET raw_json=CAST('{
                      "mapData":{"geoType":"point","marker":{"lat":10.123456,"lng":106.123456}},
                      "provenance":{"source":"local:phase5-private"},
                      "importMetadata":{"package":"history-rag"}
                    }' AS JSON),
                    geo_type='point', lat=10.123456, lng=106.123456,
                    province_names=JSON_ARRAY('Hà Nội'),
                    historical_locations=JSON_ARRAY('Thăng Long'),
                    parent_id='phase5-parent', root_id='phase5-parent',
                    level=1, order_in_parent=2,
                    updated_at='2026-07-24 10:20:30.123456'
                WHERE id='phase5-preserve'
                """);
        jdbc.update("""
                INSERT INTO event_media(event_id,media_type,url,caption)
                VALUES('phase5-preserve','image','https://example.test/image.jpg','preserve')
                """);
        jdbc.update("""
                INSERT INTO event_provinces(event_id,province_name,role,sort_order)
                VALUES('phase5-preserve','Hà Nội','primary',0)
                """);
        jdbc.update("""
                INSERT INTO event_relations(
                    source_event_id,target_event_id,association_type,relation_type,sort_order)
                VALUES('phase5-preserve','phase5-parent','related','related',0)
                """);
        jdbc.update("""
                INSERT INTO event_textbook_refs(
                    event_id,grade,book,lesson,page_start,page_end,source_key,show_on_detail)
                VALUES('phase5-preserve',10,'Sách thử nghiệm','Bài 1',1,2,'local:phase5-ref',0)
                """);
        jdbc.update("""
                INSERT INTO source_catalog(
                    dedupe_key,source_type,title,canonical_uri,is_internal)
                VALUES(REPEAT('a',64),'external','Phase 5 source',
                       'https://example.test/source',FALSE)
                """);
        Long sourceId = jdbc.queryForObject(
                "SELECT id FROM source_catalog WHERE dedupe_key=REPEAT('a',64)", Long.class);
        jdbc.update("""
                INSERT INTO event_external_sources(
                    event_id,source_id,source_order,match_type,is_primary,verification_status)
                VALUES(?,?,0,'manual',TRUE,'verified')
                """, "phase5-preserve", sourceId);

        var before = serviceRead("phase5-preserve");
        String exactVersion = version(before);
        assertTrue(exactVersion.endsWith(".123456Z"), exactVersion);
        Map<String, Object> aggregateBefore = aggregateSnapshot("phase5-preserve");

        var patch = new AdminEventMutationDtos.CorePatch();
        patch.setExpectedUpdatedAt(exactVersion);
        patch.setTitle("Updated safely");
        var updated = tx.execute(status -> service.updateCore("phase5-preserve", patch, ADMIN));
        assertEquals("Updated safely", updated.core().title());
        assertNotEquals(exactVersion, version(updated));
        assertEquals(aggregateBefore, aggregateSnapshot("phase5-preserve"));

        var grades = new AdminEventMutationDtos.Grades(
                version(updated), List.of(11));
        var afterGrades = tx.execute(status -> service.replaceGrades(
                "phase5-preserve", grades, ADMIN));
        assertEquals(List.of(11), afterGrades.classification().grades());
        assertNotEquals(version(updated), version(afterGrades));
        assertEquals(aggregateBefore, aggregateSnapshot("phase5-preserve"));

        var stale = new AdminEventMutationDtos.CorePatch();
        stale.setExpectedUpdatedAt(exactVersion);
        stale.setTitle("Stale overwrite");
        ApiException conflict = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.updateCore("phase5-preserve", stale, ADMIN)));
        assertEquals("EVENT_UPDATE_CONFLICT", conflict.getCode());
        assertEquals("Updated safely", serviceRead("phase5-preserve").core().title());
    }

    @Test
    void noOpPatchHasNoAuditAndGradeClaimRollsBackDeleteOnAuditFailure() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase5-grades"), ADMIN));
        var detail = serviceRead("phase5-grades");
        int audits = jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id='phase5-grades'", Integer.class);

        var noOp = new AdminEventMutationDtos.CorePatch();
        String noOpVersion = version(detail);
        noOp.setExpectedUpdatedAt(noOpVersion);
        noOp.setTitle(detail.core().title());
        ApiException noChanges = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.updateCore("phase5-grades", noOp, ADMIN)));
        assertEquals("NO_CHANGES", noChanges.getCode());
        assertEquals(audits, jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id='phase5-grades'", Integer.class));
        assertEquals(noOpVersion, version(serviceRead("phase5-grades")));

        byte[] missingUser = new byte[16];
        missingUser[0] = 1;
        var invalidActor = new UserPrincipal("missing", missingUser, "missing@test", List.of("admin"));
        var request = new AdminEventMutationDtos.Grades(
                version(detail), List.of(11));
        assertThrows(RuntimeException.class,
                () -> tx.execute(status -> service.replaceGrades("phase5-grades", request, invalidActor)));
        assertEquals(List.of(10, 12), jdbc.queryForList(
                "SELECT grade FROM event_grades WHERE event_id='phase5-grades' ORDER BY grade",
                Integer.class));
        assertEquals(version(detail), version(serviceRead("phase5-grades")));

        String versionBeforeEmpty = version(serviceRead("phase5-grades"));
        var empty = new AdminEventMutationDtos.Grades(
                versionBeforeEmpty, List.of());
        var afterEmpty = tx.execute(status -> service.replaceGrades("phase5-grades", empty, ADMIN));
        assertNotEquals(versionBeforeEmpty, version(afterEmpty));
        assertEquals(List.of(), jdbc.queryForList(
                "SELECT grade FROM event_grades WHERE event_id='phase5-grades' ORDER BY grade",
                Integer.class));

        var staleGrades = new AdminEventMutationDtos.Grades(versionBeforeEmpty, List.of(12));
        ApiException staleGradeConflict = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.replaceGrades(
                        "phase5-grades", staleGrades, ADMIN)));
        assertEquals("EVENT_UPDATE_CONFLICT", staleGradeConflict.getCode());
        assertEquals(List.of(), jdbc.queryForList(
                "SELECT grade FROM event_grades WHERE event_id='phase5-grades' ORDER BY grade",
                Integer.class));

        String versionBeforeDuplicate = version(serviceRead("phase5-grades"));
        var duplicate = new AdminEventMutationDtos.Grades(versionBeforeDuplicate, List.of(10, 10));
        ApiException duplicateGrade = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.replaceGrades("phase5-grades", duplicate, ADMIN)));
        assertEquals("DUPLICATE_GRADE", duplicateGrade.getCode());
        assertEquals(versionBeforeDuplicate, version(serviceRead("phase5-grades")));
    }

    @Test
    void patchDistinguishesAbsentFromExplicitNullAndRejectsUnsupportedFields() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase5-presence"), ADMIN));
        var initial = serviceRead("phase5-presence");

        var absent = new AdminEventMutationDtos.CorePatch();
        absent.setExpectedUpdatedAt(version(initial));
        absent.setTitle("Only title");
        var afterAbsent = tx.execute(status -> service.updateCore("phase5-presence", absent, ADMIN));
        assertEquals(null, afterAbsent.core().shortTitle());

        var setShort = new AdminEventMutationDtos.CorePatch();
        setShort.setExpectedUpdatedAt(version(afterAbsent));
        setShort.setShortTitle("Short");
        var withShort = tx.execute(status -> service.updateCore("phase5-presence", setShort, ADMIN));
        assertEquals("Short", withShort.core().shortTitle());

        var clearShort = new AdminEventMutationDtos.CorePatch();
        clearShort.setExpectedUpdatedAt(version(withShort));
        clearShort.setShortTitle(null);
        var cleared = tx.execute(status -> service.updateCore("phase5-presence", clearShort, ADMIN));
        assertEquals(null, cleared.core().shortTitle());

        var forbidden = new AdminEventMutationDtos.CorePatch();
        forbidden.setExpectedUpdatedAt(version(cleared));
        forbidden.unsupported("rawJson", "{}");
        ApiException unsupported = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.updateCore("phase5-presence", forbidden, ADMIN)));
        assertEquals("UNSUPPORTED_FIELD", unsupported.getCode());
    }

    @Test
    void databaseUniquenessIsAuthoritativeForCreateAndCoreSlugConflicts() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase5-slug-a"), ADMIN));
        tx.executeWithoutResult(status -> service.create(create("phase5-slug-b"), ADMIN));

        ApiException createConflict = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.create(create("phase5-slug-a"), ADMIN)));
        assertEquals("EVENT_SLUG_EXISTS", createConflict.getCode());

        var eventB = serviceRead("phase5-slug-b");
        var duplicateSlug = new AdminEventMutationDtos.CorePatch();
        duplicateSlug.setExpectedUpdatedAt(version(eventB));
        duplicateSlug.setSlug("phase5-slug-a");
        ApiException updateConflict = assertThrows(ApiException.class,
                () -> tx.execute(status -> service.updateCore(
                        "phase5-slug-b", duplicateSlug, ADMIN)));
        assertEquals("EVENT_SLUG_EXISTS", updateConflict.getCode());
        assertEquals("phase5-slug-b", jdbc.queryForObject(
                "SELECT slug FROM historical_events WHERE id='phase5-slug-b'", String.class));
    }

    @Test
    void createAndCoreAuditFailuresRollBackEventGradesVersionAndAuditTogether() {
        assumeTrue(available, unavailableReason);
        byte[] missingUser = new byte[16];
        missingUser[0] = 2;
        var invalidActor = new UserPrincipal("missing", missingUser, "missing@test", List.of("admin"));

        assertThrows(RuntimeException.class,
                () -> tx.execute(status -> service.create(
                        create("phase5-create-rollback"), invalidActor)));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM historical_events WHERE id='phase5-create-rollback'
                """, Integer.class));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_grades WHERE event_id='phase5-create-rollback'
                """, Integer.class));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id='phase5-create-rollback'
                """, Integer.class));

        tx.executeWithoutResult(status -> service.create(create("phase5-core-rollback"), ADMIN));
        var before = serviceRead("phase5-core-rollback");
        int auditCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id='phase5-core-rollback'
                """, Integer.class);
        var patch = new AdminEventMutationDtos.CorePatch();
        patch.setExpectedUpdatedAt(version(before));
        patch.setTitle("Must roll back");

        assertThrows(RuntimeException.class,
                () -> tx.execute(status -> service.updateCore(
                        "phase5-core-rollback", patch, invalidActor)));
        var after = serviceRead("phase5-core-rollback");
        assertEquals(before.core().title(), after.core().title());
        assertEquals(version(before), version(after));
        assertEquals(auditCount, jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id='phase5-core-rollback'
                """, Integer.class));
    }

    private static Map<String, Object> aggregateSnapshot(String id) {
        Map<String, Object> snapshot = jdbc.queryForMap("""
                SELECT CAST(raw_json AS CHAR) raw_json,
                       geo_type, CAST(lat AS CHAR) lat, CAST(lng AS CHAR) lng,
                       CAST(province_names AS CHAR) province_names,
                       CAST(historical_locations AS CHAR) historical_locations,
                       parent_id, root_id, level, order_in_parent,
                       (SELECT COUNT(*) FROM event_media WHERE event_id=e.id) media_count,
                       (SELECT COUNT(*) FROM event_provinces WHERE event_id=e.id) province_count,
                       (SELECT COUNT(*) FROM event_relations WHERE source_event_id=e.id) relation_count,
                       (SELECT COUNT(*) FROM event_textbook_refs WHERE event_id=e.id) textbook_count,
                       (SELECT COUNT(*) FROM event_external_sources WHERE event_id=e.id) source_count
                FROM historical_events e WHERE id=?
                """, id);
        return Map.copyOf(snapshot);
    }

    private static com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail serviceRead(String id) {
        var mapper = new ObjectMapper();
        var named = new NamedParameterJdbcTemplate(jdbc.getDataSource());
        return new AdminEventReadService(
                new AdminEventReadRepository(named, mapper), new EventCompletenessService()).findEvent(id);
    }

    private static String version(
            com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail detail
    ) {
        return VERSION_FORMATTER.format(detail.publication().updatedAt());
    }

    private static AdminEventMutationDtos.Create create(String slug) {
        return new AdminEventMutationDtos.Create(
                "Phase 5 event", slug, null, "atomic", "political", null,
                null, null, null, null, null, "Summary", "Canonical",
                "Narrative", "Significance", List.of("Fact"), List.of(12, 10),
                false, false, false);
    }
}
