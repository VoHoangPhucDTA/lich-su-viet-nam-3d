package com.lichsuvn.backend.admin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.application.AdminDashboardReadService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.EventCompletenessService;
import com.lichsuvn.backend.admin.infrastructure.AdminDashboardReadRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.mysql.MySQLContainer;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminEventReadRepositoryIntegrationTest {
    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static AdminEventReadService service;
    private static AdminDashboardReadService dashboardService;
    private static boolean available;
    private static String unavailableReason;

    @BeforeAll
    static void startDatabase() {
        try {
            mysql = new MySQLContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase3_test")
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
            var namedJdbc = new NamedParameterJdbcTemplate(dataSource);
            var repository = new AdminEventReadRepository(namedJdbc, new ObjectMapper());
            var completeness = new EventCompletenessService();
            service = new AdminEventReadService(repository, completeness);
            dashboardService = new AdminDashboardReadService(
                    repository, new AdminDashboardReadRepository(namedJdbc), completeness);
            seed();
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
    void listUsesServerPaginationFiltersNullLastAndStableTieBreaker() {
        assumeTrue(available, unavailableReason);
        var known = find(null, "known", null, "chronology", "asc", 1, 0);
        assertEquals(1, known.items().size());
        assertEquals(2, known.total());
        assertEquals("complete-point", known.items().getFirst().id());
        assertEquals("point", known.items().getFirst().canonicalGeoType());
        assertEquals(10, known.items().getFirst().grades().getFirst());

        var secondPage = find(null, "known", null, "chronology", "asc", 1, 1);
        assertEquals("tied-nationwide", secondPage.items().getFirst().id());

        var nullLast = find(null, null, null, "chronology", "asc", 20, 0);
        assertEquals(
                java.util.List.of("complete-point", "tied-nationwide", "unknown-event"),
                nullLast.items().stream().map(item -> item.id()).toList());

        var unknown = find(null, "unknown", null, "chronology", "asc", 20, 0);
        assertEquals(1, unknown.total());
        assertEquals("unknown-event", unknown.items().getFirst().id());
        assertNull(unknown.items().getFirst().chronology().startYear());

        var missingMedia = find(null, null, true, "updatedAt", "desc", 20, 0);
        assertEquals(1, missingMedia.total());
        assertEquals("unknown-event", missingMedia.items().getFirst().id());
    }

    @Test
    void allowlistedFiltersShareTheSameCountAndPagePredicates() {
        assumeTrue(available, unavailableReason);
        assertSingle("tied-nationwide", service.findEvents(
                null, "archived", null, null, null, null, null,
                null, null, null, null, null, null, null, 20, 0));
        assertSingle("tied-nationwide", service.findEvents(
                null, null, null, "economic", null, null, null,
                null, null, null, null, null, null, null, 20, 0));
        assertSingle("tied-nationwide", service.findEvents(
                null, null, null, null, 11, null, null,
                null, null, null, null, null, null, null, 20, 0));
        assertSingle("tied-nationwide", service.findEvents(
                null, null, null, null, null, "nationwide", null,
                null, null, null, null, null, null, null, 20, 0));
        assertSingle("unknown-event", service.findEvents(
                null, null, null, null, null, null, null,
                null, null, true, null, null, null, null, 20, 0));
        assertEquals(0, service.findEvents(
                null, null, null, null, null, null, null,
                null, null, null, null, true, null, null, 20, 0).total());
    }

    @Test
    void missingMapDataDistinguishesAbsentInvalidTypeAndNoLocation() {
        assumeTrue(available, unavailableReason);
        jdbc.update("""
                INSERT INTO historical_events
                  (id,slug,title,event_level,event_type,start_year,effective_end_year,
                   geo_type,lat,lng,province_names,historical_locations,card_summary,
                   canonical_summary,detailed_narrative,significance,key_facts,raw_json,status)
                VALUES
                  ('missing-map-point','missing-map-point','Missing map point','atomic','political',
                   1000,1000,'point',21,105,JSON_ARRAY(),JSON_ARRAY(),'Card','Canonical',
                   'Narrative','Significance',JSON_ARRAY('Fact'),JSON_OBJECT(),'draft'),
                  ('invalid-map-point','invalid-map-point','Invalid map point','atomic','political',
                   1001,1001,'point',21,105,JSON_ARRAY(),JSON_ARRAY(),'Card','Canonical',
                   'Narrative','Significance',JSON_ARRAY('Fact'),
                   JSON_OBJECT('mapData','legacy-string'),'draft')
                """);
        try {
            assertSingle("missing-map-point", service.findEvents(
                    null, null, null, null, null, null, null,
                    null, null, null, null, true, null, null, 20, 0));

            var invalid = service.findEvents(
                    "Invalid map point", null, null, null, null, null, null,
                    null, null, null, null, null, null, null, 20, 0);
            List<String> codes = invalid.items().getFirst().completeness().issues().stream()
                    .map(issue -> issue.code()).toList();
            assertTrue(codes.contains("INVALID_MAP_DATA"));
            assertFalse(codes.contains("MISSING_MAP_DATA"));

            List<String> noLocationCodes = service.findEvent("unknown-event")
                    .completeness().issues().stream().map(issue -> issue.code()).toList();
            assertFalse(noLocationCodes.contains("MISSING_MAP_DATA"));
            assertFalse(noLocationCodes.contains("INVALID_MAP_DATA"));
        } finally {
            jdbc.update("DELETE FROM historical_events WHERE id IN (?,?)",
                    "missing-map-point", "invalid-map-point");
        }
    }

    @Test
    void searchEscapesWildcardsAndInvalidRecordsExposeDiagnostics() {
        assumeTrue(available, unavailableReason);
        assertEquals(0, find("%", null, null, "title", "asc", 20, 0).total());
        var unknown = service.findEvents(
                "Unknown", null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, 20, 0);
        assertTrue(unknown.items().getFirst().completeness().issues().stream()
                .anyMatch(issue -> issue.code().equals("MISSING_ACTIVE_MEDIA")));
    }

    @Test
    void detailIsAggregateSafeAndDoesNotReturnPackageTextbookContent() throws Exception {
        assumeTrue(available, unavailableReason);
        var detail = service.findEvent("complete-point");
        assertEquals("Complete point", detail.core().title());
        assertEquals(1, detail.media().activeCount());
        assertEquals(1, detail.media().items().size());
        assertEquals(1, detail.classification().grades().size());
        assertTrue(detail.textbook().hasTextbookContent());
        assertEquals(1, detail.textbook().totalReferenceCount());
        assertEquals(1, detail.textbook().visibleReferenceCount());
        assertEquals(1, detail.externalSources().size());
        assertFalse(detail.externalSources().getFirst().canonicalUri().startsWith("local:"));
        assertEquals("point", detail.geography().mapData().geoType());
        assertEquals(java.util.List.of("Bạch Đằng"), detail.geography().mapData().historicalLocations());
        assertNull(detail.geography().mapData().markers().getFirst().name());
        assertEquals(20.9, detail.geography().mapData().markers().getFirst().lat().doubleValue(), 0.001);

        String serialized = detail.toString();
        assertFalse(serialized.contains("raw_json"));
        assertFalse(serialized.contains("rawJson"));
        assertFalse(serialized.contains("sourceJson"));
        assertFalse(serialized.contains("provenance"));
        assertFalse(serialized.contains("unknown"));
        assertFalse(serialized.contains("local:"));
        assertFalse(serialized.contains("Private full textbook content"));

        var listItem = service.findEvents(
                "Complete point", null, null, null, null, null, null,
                null, null, null, null, null, null, null, 20, 0).items().getFirst();
        assertEquals(
                listItem.completeness().issues().stream().map(issue -> issue.code()).toList(),
                detail.completeness().issues().stream().map(issue -> issue.code()).toList());
    }

    @Test
    void dashboardCountsAndCompletenessMatchListAndDetailWithoutPrivateAuditPayloads() {
        assumeTrue(available, unavailableReason);

        var dashboard = dashboardService.findDashboard();

        assertEquals(3, dashboard.metrics().events().total());
        assertEquals(1, dashboard.metrics().events().published());
        assertEquals(1, dashboard.metrics().events().draft());
        assertEquals(1, dashboard.metrics().events().archived());
        assertEquals(1, dashboard.metrics().events().missingThumbnail());
        assertEquals(1, dashboard.metrics().events().missingActiveMedia());
        assertEquals(0, dashboard.metrics().events().missingOrInvalidMapData());
        assertEquals(1, dashboard.metrics().events().withCompletenessIssues());
        assertEquals(1, dashboard.metrics().users().activeTotal());
        assertEquals(1, dashboard.metrics().users().createdLast7Days());
        assertEquals(1, dashboard.attention().size());
        assertEquals("unknown-event", dashboard.attention().getFirst().id());

        List<String> dashboardCodes = dashboard.attention().getFirst().completeness().issues()
                .stream().map(issue -> issue.code()).toList();
        List<String> listCodes = service.findEvents(
                "Unknown", null, null, null, null, null, null,
                null, null, null, null, null, null, null, 20, 0)
                .items().getFirst().completeness().issues().stream()
                .map(issue -> issue.code()).toList();
        List<String> detailCodes = service.findEvent("unknown-event").completeness().issues()
                .stream().map(issue -> issue.code()).toList();
        assertEquals(listCodes, dashboardCodes);
        assertEquals(detailCodes, dashboardCodes);

        assertEquals(1, dashboard.recentAudit().size());
        assertEquals("Admin User", dashboard.recentAudit().getFirst().actor().displayName());
        String serialized = dashboard.toString();
        assertFalse(serialized.contains("before_json"));
        assertFalse(serialized.contains("after_json"));
        assertFalse(serialized.contains("local:"));
        assertFalse(serialized.contains("secret"));
    }

    private static void assertSingle(
            String id, com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Page page
    ) {
        assertEquals(1, page.total());
        assertEquals(1, page.count());
        assertEquals(id, page.items().getFirst().id());
    }

    private static com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Page find(
            String query, String chronology, Boolean missingMedia,
            String sortBy, String sortDir, int limit, int offset
    ) {
        return service.findEvents(
                query, null, null, null, null, null, chronology,
                null, null, null, missingMedia, null,
                sortBy, sortDir, limit, offset);
    }

    private static void seed() {
        jdbc.update("""
                INSERT INTO users(id,email,password_hash,full_name,status,created_at)
                VALUES
                  (UUID_TO_BIN('00000000-0000-0000-0000-000000000001'),
                   'admin@example.test','hash','Admin User','active',CURRENT_TIMESTAMP),
                  (UUID_TO_BIN('00000000-0000-0000-0000-000000000002'),
                   'old@example.test','hash','Old User','disabled',
                   DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 8 DAY))
                """);
        jdbc.update("""
                INSERT INTO historical_events
                  (id,slug,title,event_level,event_type,start_year,end_year,effective_end_year,
                   geo_type,lat,lng,province_names,historical_locations,card_summary,
                   canonical_summary,detailed_narrative,significance,key_facts,raw_json,status)
                VALUES
                  ('complete-point','complete-point','Complete point','atomic','military',938,NULL,938,
                   'point',21.1,105.8,JSON_ARRAY('Hà Nội'),JSON_ARRAY('Thăng Long'),'Card',
                   'Canonical','Narrative','Significance',JSON_ARRAY('Fact'),
                   JSON_OBJECT('mapData',JSON_OBJECT('geoType','point','marker',
                     JSON_OBJECT('label','Thăng Long','lat',21.1,'lng',105.8))),'published'),
                  ('unknown-event','unknown-event','Unknown event','collection','political',NULL,NULL,NULL,
                   'no_location',NULL,NULL,JSON_ARRAY(),JSON_ARRAY(),NULL,NULL,NULL,NULL,JSON_ARRAY(),
                   JSON_OBJECT(),'draft'),
                  ('tied-nationwide','tied-nationwide','Tied nationwide','atomic','economic',938,NULL,938,
                   'nationwide',NULL,NULL,JSON_ARRAY('Việt Nam'),JSON_ARRAY(),'Card',
                   'Canonical','Narrative','Significance',JSON_ARRAY('Fact'),
                   JSON_OBJECT('mapData',JSON_OBJECT('geoType','nationwide')),'archived')
                """);
        jdbc.update("INSERT INTO event_grades(event_id,grade) VALUES ('complete-point',10)");
        jdbc.update("INSERT INTO event_grades(event_id,grade) VALUES ('tied-nationwide',11)");
        jdbc.update("""
                INSERT INTO event_media(event_id,media_type,url,alt_text,is_thumbnail,status)
                VALUES
                  ('complete-point','image','https://example.test/image.jpg','Image',TRUE,'active'),
                  ('complete-point','image','local:private-image','Private',FALSE,'active'),
                  ('tied-nationwide','image','https://example.test/nationwide.jpg','Image',TRUE,'active')
                """);
        jdbc.update("""
                UPDATE historical_events
                SET raw_json=CAST(? AS JSON)
                WHERE id='complete-point'
                """, """
                {"mapData":{
                  "geoType":"point",
                  "marker":{"label":"Thăng Long","lat":21.1,"lng":105.8},
                  "markers":[{"name":"local:private-marker","lat":20.9,"lng":106.7,
                    "unknown":{"source":"local:hidden"}}],
                  "historicalLocations":["Bạch Đằng","local:private-history"],
                  "provenance":{"source":"local:history-rag"}
                }}
                """);
        jdbc.update("""
                INSERT INTO event_textbook_refs
                  (event_id,grade,book,theme,lesson,page_start,page_end,excerpt,url,show_on_detail)
                VALUES ('complete-point',10,'Book','Theme','Lesson',1,2,'Excerpt',
                        'https://example.test/book',1)
                """);
        jdbc.update("""
                INSERT INTO event_textbook_contents
                  (event_id,content,content_status,content_source,reference_count)
                VALUES ('complete-point','Private full textbook content','READY','PACKAGE',1)
                """);
        jdbc.update("""
                INSERT INTO source_catalog
                  (id,dedupe_key,source_type,title,canonical_uri,is_internal)
                VALUES
                  (9001,REPEAT('a',64),'WEB','Public source','https://example.test/source',FALSE),
                  (9002,REPEAT('b',64),'LOCAL','local:hidden','local:history-rag',FALSE)
                """);
        jdbc.update("""
                INSERT INTO event_external_sources
                  (event_id,source_id,source_order,match_type,is_primary,verification_status)
                VALUES
                  ('complete-point',9001,0,'DIRECT',TRUE,'VERIFIED'),
                  ('complete-point',9002,1,'DIRECT',FALSE,'VERIFIED')
                """);
        jdbc.update("""
                INSERT INTO admin_audit_logs
                  (user_id,action,entity_type,entity_id,before_json,after_json)
                VALUES
                  (UUID_TO_BIN('00000000-0000-0000-0000-000000000001'),
                   'event.status_updated','historical_event','unknown-event',
                   JSON_OBJECT('secret','local:before'),JSON_OBJECT('secret','local:after'))
                """);
    }
}
