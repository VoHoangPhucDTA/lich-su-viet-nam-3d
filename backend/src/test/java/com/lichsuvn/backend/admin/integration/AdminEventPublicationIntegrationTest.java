package com.lichsuvn.backend.admin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventPublicationDtos;
import com.lichsuvn.backend.admin.application.AdminEventPublicationService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.EventCompletenessService;
import com.lichsuvn.backend.admin.application.EventPublishBlockedException;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventPublicationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.mysql.MySQLContainer;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminEventPublicationIntegrationTest {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();
    private static final UserPrincipal ADMIN =
            new UserPrincipal("admin", null, "admin@test", List.of("admin"));

    private static MySQLContainer mysql;
    private static HikariDataSource dataSource;
    private static JdbcTemplate jdbc;
    private static TransactionTemplate tx;
    private static AdminEventPublicationService service;
    private static AdminEventReadService readService;
    private static boolean available;
    private static String unavailableReason;

    @BeforeAll
    static void startDatabase() {
        try {
            mysql = new MySQLContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase8_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load().migrate();

            HikariConfig config = new HikariConfig();
            config.setJdbcUrl(mysql.getJdbcUrl()
                    + "?connectionTimeZone=Asia/Ho_Chi_Minh"
                    + "&forceConnectionTimeZoneToSession=true");
            config.setUsername(mysql.getUsername());
            config.setPassword(mysql.getPassword());
            config.setMaximumPoolSize(6);
            config.setConnectionInitSql("SET time_zone = '+07:00'");
            dataSource = new HikariDataSource(config);
            jdbc = new JdbcTemplate(dataSource);
            var named = new NamedParameterJdbcTemplate(dataSource);
            var mapper = new ObjectMapper();
            var readRepository = new AdminEventReadRepository(named, mapper);
            var completeness = new EventCompletenessService();
            readService = new AdminEventReadService(readRepository, completeness);
            service = new AdminEventPublicationService(
                    new AdminEventPublicationRepository(named),
                    readRepository,
                    new AdminEventMutationRepository(named, mapper),
                    completeness,
                    readService,
                    mapper);
            tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
            available = true;
        } catch (Exception exception) {
            unavailableReason = exception.getClass().getSimpleName() + ": " + exception.getMessage();
            if (dataSource != null) dataSource.close();
            if (mysql != null) mysql.stop();
        }
    }

    @AfterAll
    static void stopDatabase() {
        if (dataSource != null) dataSource.close();
        if (mysql != null) mysql.stop();
    }

    @Test
    void supportsOnlyAllowedTransitionsWithFirstPublicationTimestampSemantics() {
        assumeTrue(available, unavailableReason);
        seedValid("p8-draft-publish", "draft", null);
        seedValid("p8-draft-archive", "draft", null);
        seedValid("p8-published-draft", "published", "2026-07-20 10:00:00");
        seedValid("p8-published-archive", "published", "2026-07-20 11:00:00");
        seedValid("p8-archived-restore", "archived", "2026-07-20 12:00:00");

        var published = mutate("p8-draft-publish", "publish", ADMIN);
        assertEquals("published", published.publication().status());
        assertNotNull(published.publication().publishedAt());
        assertAudit("p8-draft-publish", "event.published", "initialized");

        assertEquals("archived",
                mutate("p8-draft-archive", "archive", ADMIN).publication().status());
        assertAudit("p8-draft-archive", "event.archived", "preserved");
        assertEquals("draft",
                mutate("p8-published-draft", "unpublish", ADMIN).publication().status());
        assertAudit("p8-published-draft", "event.unpublished", "preserved");
        assertEquals("archived",
                mutate("p8-published-archive", "archive", ADMIN).publication().status());
        assertAudit("p8-published-archive", "event.archived", "preserved");
        assertEquals("draft",
                mutate("p8-archived-restore", "restore", ADMIN).publication().status());
        assertAudit("p8-archived-restore", "event.restored", "preserved");
    }

    @Test
    void publishedAtRoundTripsAsHoChiMinhLocalTimeAndSurvivesRepublishArchiveRestore() {
        assumeTrue(available, unavailableReason);
        seedValid("p8-timezone", "draft", null);
        jdbc.update("""
                UPDATE historical_events
                SET updated_at='2026-07-26 10:20:30.123456'
                WHERE id='p8-timezone'
                """);
        String exact = version(readService.findEvent("p8-timezone"));
        assertEquals("2026-07-26T03:20:30.123456Z", exact);

        var first = tx.execute(status -> service.update(
                "p8-timezone", request(exact, "publish"), ADMIN));
        LocalDateTime firstLocal = jdbc.queryForObject("""
                SELECT published_at FROM historical_events WHERE id='p8-timezone'
                """, Timestamp.class).toLocalDateTime();
        assertEquals(firstLocal.atZone(DATABASE_ZONE).toInstant(),
                first.publication().publishedAt());

        var draft = tx.execute(status -> service.update(
                "p8-timezone", request(version(first), "unpublish"), ADMIN));
        var republished = tx.execute(status -> service.update(
                "p8-timezone", request(version(draft), "publish"), ADMIN));
        var archived = tx.execute(status -> service.update(
                "p8-timezone", request(version(republished), "archive"), ADMIN));
        var restored = tx.execute(status -> service.update(
                "p8-timezone", request(version(archived), "restore"), ADMIN));
        for (var detail : List.of(draft, republished, archived, restored)) {
            assertEquals(first.publication().publishedAt(), detail.publication().publishedAt());
        }
        assertNotEquals(version(first), version(draft));
        assertNotEquals(version(draft), version(republished));
        assertNotEquals(version(republished), version(archived));
        assertNotEquals(version(archived), version(restored));
    }

    @Test
    void staleInvalidNoOpAndBlockedRequestsChangeNothingAndWarningsCanPublish() {
        assumeTrue(available, unavailableReason);
        seedValid("p8-rejections", "draft", null);
        Map<String, Object> initial = publicationSnapshot("p8-rejections");
        int initialAudits = auditCount("p8-rejections");

        ApiException invalid = assertThrows(ApiException.class, () -> tx.execute(status ->
                service.update("p8-rejections",
                        request(version(readService.findEvent("p8-rejections")), "unpublish"),
                        ADMIN)));
        assertEquals("EVENT_ALREADY_IN_STATUS", invalid.getCode());
        assertEquals(initial, publicationSnapshot("p8-rejections"));

        ApiException stale = assertThrows(ApiException.class, () -> tx.execute(status ->
                service.update("p8-rejections",
                        request("2020-01-01T00:00:00.000001Z", "archive"), ADMIN)));
        assertEquals("EVENT_UPDATE_CONFLICT", stale.getCode());
        assertEquals(initial, publicationSnapshot("p8-rejections"));

        jdbc.update("""
                UPDATE historical_events SET canonical_summary=NULL
                WHERE id='p8-rejections'
                """);
        Map<String, Object> incomplete = publicationSnapshot("p8-rejections");
        EventPublishBlockedException blocked = assertThrows(
                EventPublishBlockedException.class,
                () -> tx.execute(status -> service.update(
                        "p8-rejections",
                        request(version(readService.findEvent("p8-rejections")), "publish"),
                        ADMIN)));
        assertTrue(blocked.getIssues().stream().allMatch(issue -> "ERROR".equals(issue.severity())));
        assertTrue(blocked.getIssues().stream()
                .anyMatch(issue -> "MISSING_CORE_CONTENT".equals(issue.code())));
        assertEquals(incomplete, publicationSnapshot("p8-rejections"));
        assertEquals(initialAudits, auditCount("p8-rejections"));

        jdbc.update("""
                UPDATE historical_events SET canonical_summary='Canonical'
                WHERE id='p8-rejections'
                """);
        var warningOnly = readService.findEvent("p8-rejections");
        assertTrue(warningOnly.completeness().issues().stream()
                .anyMatch(issue -> "WARNING".equals(issue.severity())));
        assertFalse(warningOnly.completeness().issues().stream()
                .anyMatch(issue -> "ERROR".equals(issue.severity())));
        assertEquals("published", tx.execute(status -> service.update(
                "p8-rejections", request(version(warningOnly), "publish"), ADMIN))
                .publication().status());
    }

    @Test
    void concurrentSameVersionHasOneWinnerAndAuditFailureRollsBackEverything() throws Exception {
        assumeTrue(available, unavailableReason);
        seedValid("p8-concurrent", "draft", null);
        String sharedVersion = version(readService.findEvent("p8-concurrent"));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var publish = executor.submit(() ->
                    transitionAfterLatch(ready, start, "p8-concurrent", sharedVersion, "publish", ADMIN));
            var archive = executor.submit(() ->
                    transitionAfterLatch(ready, start, "p8-concurrent", sharedVersion, "archive", ADMIN));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<Object> outcomes = List.of(
                    publish.get(30, TimeUnit.SECONDS),
                    archive.get(30, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream()
                    .filter(value -> value instanceof com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail)
                    .count());
            assertEquals(1, outcomes.stream()
                    .filter("EVENT_UPDATE_CONFLICT"::equals).count());
        }
        assertEquals(1, auditCount("p8-concurrent"));

        seedValid("p8-rollback", "draft", null);
        Map<String, Object> before = publicationSnapshot("p8-rollback");
        byte[] missingUser = new byte[16];
        missingUser[0] = 8;
        UserPrincipal invalidActor =
                new UserPrincipal("missing", missingUser, "missing@test", List.of("admin"));
        assertThrows(RuntimeException.class, () -> tx.execute(status -> service.update(
                "p8-rollback",
                request(version(readService.findEvent("p8-rollback")), "archive"),
                invalidActor)));
        assertEquals(before, publicationSnapshot("p8-rollback"));
        assertEquals(0, auditCount("p8-rollback"));
    }

    @Test
    void publicationPreservesEveryOtherAggregateResourceAndRawJsonLogicalTypes() throws Exception {
        assumeTrue(available, unavailableReason);
        seedValid("p8-parent", "published", "2026-07-20 10:00:00");
        seedValid("p8-preserve", "draft", null);
        jdbc.update("""
                UPDATE historical_events
                SET parent_id='p8-parent', root_id='p8-parent',
                    raw_json=CAST('{
                      "mapData":null,
                      "objectValue":{"nested":"kept"},
                      "arrayValue":[true,7,null],
                      "stringValue":"kept",
                      "numberValue":12.50,
                      "booleanValue":true,
                      "nullValue":null,
                      "provenance":{"source":"local:private"}
                    }' AS JSON)
                WHERE id='p8-preserve'
                """);
        jdbc.update("""
                INSERT INTO event_media(event_id,media_type,url,is_thumbnail,status)
                VALUES('p8-preserve','image','https://example.test/image.jpg',TRUE,'active')
                """);
        jdbc.update("""
                INSERT INTO event_relations(
                    source_event_id,target_event_id,association_type,relation_type,sort_order)
                VALUES('p8-preserve','p8-parent','related','related',0)
                """);
        jdbc.update("""
                INSERT INTO source_catalog(
                    dedupe_key,source_type,title,canonical_uri,is_internal)
                VALUES(REPEAT('8',64),'WEB','Source','https://example.test/source',FALSE)
                """);
        Long sourceId = jdbc.queryForObject(
                "SELECT id FROM source_catalog WHERE dedupe_key=REPEAT('8',64)", Long.class);
        jdbc.update("""
                INSERT INTO event_external_sources(
                    event_id,source_id,source_order,match_type,is_primary,verification_status)
                VALUES('p8-preserve',?,0,'DIRECT',TRUE,'VERIFIED')
                """, sourceId);
        jdbc.update("""
                INSERT INTO users(id,email,password_hash,full_name,status)
                VALUES(UUID_TO_BIN('00000000-0000-0000-0000-000000000008'),
                       'phase8@example.test','hash','Phase 8','active')
                """);
        jdbc.update("""
                INSERT INTO event_view_logs(user_id,event_id,viewed_at,source,created_date)
                VALUES(UUID_TO_BIN('00000000-0000-0000-0000-000000000008'),
                       'p8-preserve',CURRENT_TIMESTAMP,'detail',CURRENT_DATE)
                """);
        Map<String, Object> before = aggregateSnapshot("p8-preserve");

        mutate("p8-preserve", "publish", ADMIN);

        assertEquals(before, aggregateSnapshot("p8-preserve"));
        var raw = new ObjectMapper().readTree(jdbc.queryForObject("""
                SELECT CAST(raw_json AS CHAR) FROM historical_events WHERE id='p8-preserve'
                """, String.class));
        assertTrue(raw.path("objectValue").isObject());
        assertTrue(raw.path("arrayValue").isArray());
        assertTrue(raw.path("stringValue").isTextual());
        assertTrue(raw.path("numberValue").isNumber());
        assertTrue(raw.path("booleanValue").isBoolean());
        assertTrue(raw.path("nullValue").isNull());
        assertEquals("local:private", raw.at("/provenance/source").asText());
    }

    private static Object transitionAfterLatch(
            CountDownLatch ready,
            CountDownLatch start,
            String id,
            String version,
            String action,
            UserPrincipal principal
    ) {
        try {
            ready.countDown();
            start.await(10, TimeUnit.SECONDS);
            return tx.execute(status -> service.update(
                    id, request(version, action), principal));
        } catch (ApiException exception) {
            return exception.getCode();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return "INTERRUPTED";
        }
    }

    private static com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail mutate(
            String id,
            String action,
            UserPrincipal principal
    ) {
        var before = readService.findEvent(id);
        return tx.execute(status -> service.update(
                id, request(version(before), action), principal));
    }

    private static AdminEventPublicationDtos.Patch request(String version, String action) {
        return new AdminEventPublicationDtos.Patch(version, action);
    }

    private static String version(
            com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail detail
    ) {
        return VERSION_FORMATTER.format(detail.publication().updatedAt());
    }

    private static void seedValid(String id, String status, String publishedAt) {
        jdbc.update("""
                INSERT INTO historical_events(
                    id,slug,title,event_level,event_type,
                    start_year,end_year,effective_end_year,
                    geo_type,province_names,historical_locations,
                    card_summary,canonical_summary,detailed_narrative,significance,
                    key_facts,raw_json,status,published_at)
                VALUES(?,?,?,'atomic','political',
                       NULL,NULL,NULL,
                       'no_location',JSON_ARRAY(),JSON_ARRAY(),
                       'Card','Canonical','Narrative','Significance',
                       JSON_ARRAY('Fact'),JSON_OBJECT(),?,?)
                """, id, id, "Event " + id, status, publishedAt);
    }

    private static void assertAudit(String id, String action, String behavior) {
        Map<String, Object> audit = jdbc.queryForMap("""
                SELECT action, CAST(before_json AS CHAR) before_json,
                       CAST(after_json AS CHAR) after_json
                FROM admin_audit_logs
                WHERE entity_id=?
                ORDER BY id DESC LIMIT 1
                """, id);
        assertEquals(action, audit.get("action"));
        String bounded = audit.get("before_json") + " " + audit.get("after_json");
        assertTrue(bounded.contains("\"publishedTimestampBehavior\": \"" + behavior + "\"")
                || bounded.contains("\"publishedTimestampBehavior\":\"" + behavior + "\""));
        for (String forbidden : List.of(
                "raw_json", "rawJson", "mapData", "keyFacts", "media", "provenance", "local:")) {
            assertFalse(bounded.contains(forbidden), forbidden);
        }
    }

    private static int auditCount(String id) {
        return jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id=?",
                Integer.class, id);
    }

    private static Map<String, Object> publicationSnapshot(String id) {
        return new LinkedHashMap<>(jdbc.queryForMap("""
                SELECT status, CAST(published_at AS CHAR) published_at,
                       CAST(updated_at AS CHAR) updated_at
                FROM historical_events WHERE id=?
                """, id));
    }

    private static Map<String, Object> aggregateSnapshot(String id) {
        return new LinkedHashMap<>(jdbc.queryForMap("""
                SELECT title, slug, event_level, event_type,
                       CAST(raw_json AS CHAR) raw_json,
                       geo_type, CAST(lat AS CHAR) lat, CAST(lng AS CHAR) lng,
                       CAST(province_names AS CHAR) province_names,
                       CAST(historical_locations AS CHAR) historical_locations,
                       parent_id, root_id, level, order_in_parent,
                       (SELECT COUNT(*) FROM event_grades WHERE event_id=e.id) grade_count,
                       (SELECT COUNT(*) FROM event_media WHERE event_id=e.id) media_count,
                       (SELECT COUNT(*) FROM event_relations WHERE source_event_id=e.id) relation_count,
                       (SELECT COUNT(*) FROM event_external_sources WHERE event_id=e.id) source_count,
                       (SELECT COUNT(*) FROM event_view_logs WHERE event_id=e.id) progress_count
                FROM historical_events e WHERE id=?
                """, id));
    }
}
