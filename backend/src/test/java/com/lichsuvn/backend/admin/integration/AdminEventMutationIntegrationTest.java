package com.lichsuvn.backend.admin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventMutationDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventMediaMutationDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventGeographyDtos;
import com.lichsuvn.backend.admin.application.AdminEventGeographyCanonicalizer;
import com.lichsuvn.backend.admin.application.AdminEventGeographyMutationService;
import com.lichsuvn.backend.admin.application.AdminEventMediaMutationService;
import com.lichsuvn.backend.admin.application.AdminEventImageUploadService;
import com.lichsuvn.backend.admin.application.AdminEventImageCleanupService;
import com.lichsuvn.backend.admin.application.AdminEventMutationService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.EventCompletenessService;
import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.admin.application.EventImageValidator;
import com.lichsuvn.backend.admin.application.VietnamGadmRegistry;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMediaMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventGeographyMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import com.lichsuvn.backend.common.media.EventMediaReadPolicy;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.event.infrastructure.EventReadRepository;
import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.testcontainers.mysql.MySQLContainer;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminEventMutationIntegrationTest {
    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static boolean remoteRehearsal;
    private static ObjectMapper mapper;
    private static AdminEventMutationService service;
    private static AdminEventMediaMutationService mediaService;
    private static AdminEventGeographyMutationService geographyService;
    private static AdminEventImageUploadService imageService;
    private static AdminEventImageCleanupService imageCleanupService;
    private static FakeEventImageStorage fakeImageStorage;
    private static TransactionTemplate tx;
    private static boolean available;
    private static String unavailableReason;
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();
    private static final UserPrincipal ADMIN = new UserPrincipal("admin", null, "admin@test", List.of("admin"));
    private static final UUID IMAGE_ADMIN_ID =
            UUID.fromString("00000000-0000-4000-8000-000000004201");
    private static final UserPrincipal IMAGE_ADMIN = new UserPrincipal(
            IMAGE_ADMIN_ID.toString(), UuidBytes.fromUuid(IMAGE_ADMIN_ID),
            "phase-b-admin@example.test", List.of("admin"));

    @BeforeAll
    static void startDatabase() {
        try {
            remoteRehearsal = Boolean.getBoolean("phaseb.tidb.rehearsal");
            DataSource dataSource;
            if (remoteRehearsal) {
                String host = requiredEnvironment("TIDB_REHEARSAL_HOST");
                String database = requiredEnvironment("TIDB_REHEARSAL_DATABASE");
                String user = requiredEnvironment("TIDB_PHASEB_BRANCH_OPERATOR_USER");
                String password = requiredEnvironment("TIDB_PHASEB_BRANCH_OPERATOR_PASSWORD");
                String branchId = requiredEnvironment("TIDB_PHASEB_BRANCH_ID");
                if (!"lichsuvn".equals(database)
                        || !branchId.matches("bran-[a-z0-9]+")
                        || !Boolean.getBoolean("phaseb.tidb.writes-approved")) {
                    throw new IllegalStateException(
                            "Explicit isolated TiDB rehearsal identity and write approval are required");
                }
                dataSource = new DriverManagerDataSource(
                        "jdbc:mysql://" + host + ":4000/" + database
                                + "?sslMode=VERIFY_IDENTITY"
                                + "&tlsVersions=TLSv1.2,TLSv1.3"
                                + "&allowPublicKeyRetrieval=false"
                                + "&connectTimeout=15000&socketTimeout=120000",
                        user,
                        password);
            } else {
                mysql = new LocalMySqlContainer("mysql:8.0.36")
                        .withDatabaseName("admin_phase5_test")
                        .withUsername("test")
                        .withPassword("test");
                mysql.start();
                dataSource = new DriverManagerDataSource(
                        mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
                Flyway.configure()
                        .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                        .locations("filesystem:src/main/resources/db/migration")
                        .load().migrate();
            }
            jdbc = new JdbcTemplate(dataSource);
            if (remoteRehearsal) {
                verifyRemoteRehearsal();
                cleanupRemoteFixtures();
            }
            var named = new NamedParameterJdbcTemplate(dataSource);
            mapper = new ObjectMapper();
            jdbc.update("""
                    INSERT INTO users(id,email,password_hash,full_name,status)
                    VALUES(UUID_TO_BIN(?),?,'hash','Phase B Admin','active')
                    """, IMAGE_ADMIN_ID.toString(), IMAGE_ADMIN.email());
            fakeImageStorage = new FakeEventImageStorage();
            var mediaUrlPolicy = new MediaUrlPolicy();
            var read = new AdminEventReadService(
                    new AdminEventReadRepository(
                            named, mapper, mediaUrlPolicy,
                            new EventMediaReadPolicy(mediaUrlPolicy, fakeImageStorage)),
                    new EventCompletenessService());
            var mutations = new AdminEventMutationRepository(named, mapper);
            service = new AdminEventMutationService(mutations, read, mapper);
            mediaService = new AdminEventMediaMutationService(
                    new AdminEventMediaMutationRepository(named), mutations, read,
                    mediaUrlPolicy, mapper);
            geographyService = new AdminEventGeographyMutationService(
                    new AdminEventGeographyMutationRepository(named, mapper),
                    mutations,
                    new AdminEventGeographyCanonicalizer(
                            mapper, new VietnamGadmRegistry(mapper)),
                    read,
                    mapper);
            var transactionManager = new DataSourceTransactionManager(dataSource);
            tx = new TransactionTemplate(transactionManager);
            imageService = new AdminEventImageUploadService(
                    new AdminEventImageRepository(named), mutations, read,
                    new EventImageValidator(), fakeImageStorage, mapper,
                    transactionManager, 10);
            imageCleanupService = new AdminEventImageCleanupService(
                    new AdminEventImageRepository(named), fakeImageStorage,
                    transactionManager, true, 120, 3);
            available = true;
        } catch (Exception ex) {
            if (remoteRehearsal) {
                throw new IllegalStateException(
                        "TiDB Phase B rehearsal setup failed", ex);
            }
            unavailableReason = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            if (mysql != null) mysql.stop();
        }
    }

    @AfterAll
    static void stopDatabase() {
        if (remoteRehearsal && jdbc != null) {
            cleanupRemoteFixtures();
        }
        if (mysql != null) mysql.stop();
    }

    private static void verifyRemoteRehearsal() {
        String version = jdbc.queryForObject("SELECT VERSION()", String.class);
        assertTrue(version != null && version.contains("TiDB-v8.5.3"));
        assertEquals("lichsuvn", jdbc.queryForObject("SELECT DATABASE()", String.class));
        assertEquals(1, jdbc.queryForObject(
                "SELECT @@global.tidb_enable_check_constraint", Integer.class));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version='42' AND success=1
                """, Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success=0",
                Integer.class));
    }

    private static void cleanupRemoteFixtures() {
        jdbc.update("DELETE FROM admin_audit_logs WHERE entity_id LIKE 'phase-b-%'");
        jdbc.update("DELETE FROM historical_events WHERE id LIKE 'phase-b-%'");
        jdbc.update("""
                DELETE FROM event_media_storage_cleanup_tasks
                WHERE public_id LIKE 'events/phase-b-%'
                """);
        jdbc.update("""
                DELETE FROM users
                WHERE id IN (
                    UUID_TO_BIN('00000000-0000-4000-8000-000000004201'),
                    UUID_TO_BIN('00000000-0000-4000-8000-000000004202')
                )
                """);
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required for TiDB rehearsal");
        }
        return value;
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
    void v42ManagedStorageChecksExistAndRejectInvalidValues() {
        assumeTrue(available, unavailableReason);
        String eventId = "phase-b-v42-enforcement";
        String cleanupId = "events/phase-b-v42-enforcement/media/check";
        try {
            tx.executeWithoutResult(status -> service.create(create(eventId), IMAGE_ADMIN));
            jdbc.update("""
                    INSERT INTO event_media(event_id,media_type,url)
                    VALUES(?,'image','https://example.test/rehearsal.jpg')
                    """, eventId);
            jdbc.update("""
                    INSERT INTO event_media_storage_cleanup_tasks(
                        provider,public_id,operation,task_status,attempts,next_attempt_at
                    ) VALUES('cloudinary',?,'DELETE','PENDING',0,CURRENT_TIMESTAMP(6))
                    """, cleanupId);

            assertEquals(6, jdbc.queryForObject("""
                    SELECT COUNT(*) FROM information_schema.check_constraints
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
            if (remoteRehearsal) {
                assertEquals(6, jdbc.queryForObject("""
                        SELECT COUNT(*) FROM information_schema.tidb_check_constraints
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
            }

            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media SET storage_state='UNKNOWN' WHERE event_id=?
                    """, eventId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media SET storage_byte_size=0 WHERE event_id=?
                    """, eventId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media SET storage_byte_size=-1 WHERE event_id=?
                    """, eventId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media SET storage_width=0,storage_height=1 WHERE event_id=?
                    """, eventId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media SET storage_width=1,storage_height=-1 WHERE event_id=?
                    """, eventId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media_storage_cleanup_tasks
                    SET operation='PURGE' WHERE public_id=?
                    """, cleanupId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media_storage_cleanup_tasks
                    SET task_status='UNKNOWN' WHERE public_id=?
                    """, cleanupId));
            assertThrows(DataAccessException.class, () -> jdbc.update("""
                    UPDATE event_media_storage_cleanup_tasks
                    SET attempts=-1 WHERE public_id=?
                    """, cleanupId));
        } finally {
            jdbc.update("""
                    DELETE FROM event_media_storage_cleanup_tasks WHERE public_id=?
                    """, cleanupId);
            jdbc.update("DELETE FROM historical_events WHERE id=?", eventId);
        }
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

    @Test
    void mediaMetadataUsesOpaqueVersionExternalStorageAndSinglePinnedThumbnail() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-media"), ADMIN));
        jdbc.update("""
                UPDATE historical_events
                SET updated_at='2026-07-24 10:20:30.123456'
                WHERE id='phase6-media'
                """);
        var before = serviceRead("phase6-media");
        assertTrue(version(before).endsWith(".123456Z"), version(before));
        var first = tx.execute(status -> mediaService.add("phase6-media",
                new AdminEventMediaMutationDtos.Create(
                        version(before), "image", "https://cdn.example.org/one.jpg",
                        "One", "One", "Museum", "CC BY", "active"), ADMIN));
        assertNotEquals(version(before), version(first.detail()));
        assertEquals("external", jdbc.queryForObject(
                "SELECT storage_type FROM event_media WHERE id=?", String.class, first.mediaId()));

        var second = tx.execute(status -> mediaService.add("phase6-media",
                new AdminEventMediaMutationDtos.Create(
                        version(first.detail()), "image", "https://cdn.example.org/two.jpg",
                        "Two", "Two", null, null, "active"), ADMIN));
        var selected = tx.execute(status -> mediaService.selectThumbnail(
                "phase6-media", second.mediaId(),
                new AdminEventMediaMutationDtos.Version(version(second.detail())), ADMIN));

        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id='phase6-media' AND is_thumbnail=TRUE
                """, Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT sort_order FROM event_media WHERE id=?", Integer.class, second.mediaId()));
        assertEquals(second.mediaId(), selected.media().thumbnail().id());
    }

    @Test
    void staleOrUnsafeMediaMutationLeavesRowsAndVersionUntouched() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-safe"), ADMIN));
        var before = serviceRead("phase6-safe");
        ApiException unsafe = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.add("phase6-safe", new AdminEventMediaMutationDtos.Create(
                        version(before), "image", "http://127.0.0.1/private.jpg",
                        null, null, null, null, "active"), ADMIN)));
        assertEquals("INVALID_MEDIA_URL", unsafe.getCode());
        assertEquals(version(before), version(serviceRead("phase6-safe")));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE event_id='phase6-safe'", Integer.class));

        var unsupported = media(version(before), "image", "safe.jpg", "active");
        unsupported.unsupported("storageType", "local");
        ApiException forbiddenField = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.add("phase6-safe", unsupported, ADMIN)));
        assertEquals("UNSUPPORTED_FIELD", forbiddenField.getCode());
        assertEquals(version(before), version(serviceRead("phase6-safe")));
    }

    @Test
    void mediaPatchReorderRemoveAndOwnershipUseOneVersionedAggregate() {
        assumeTrue(available, unavailableReason);
        int storageUploadsBefore = fakeImageStorage.uploads.get();
        int storageDeletesBefore = fakeImageStorage.deletes.get();
        tx.executeWithoutResult(status -> service.create(create("phase6-flow"), ADMIN));
        tx.executeWithoutResult(status -> service.create(create("phase6-foreign"), ADMIN));

        var first = tx.execute(status -> mediaService.add("phase6-flow",
                media(version(serviceRead("phase6-flow")), "image", "one.jpg", "active"), ADMIN));
        var second = tx.execute(status -> mediaService.add("phase6-flow",
                media(version(first.detail()), "video", "two.mp4", "hidden"), ADMIN));
        var third = tx.execute(status -> mediaService.add("phase6-flow",
                media(version(second.detail()), "document", "three.pdf", "missing"), ADMIN));
        var foreign = tx.execute(status -> mediaService.add("phase6-foreign",
                media(version(serviceRead("phase6-foreign")), "image", "foreign.jpg", "active"), ADMIN));

        var patch = new AdminEventMediaMutationDtos.Patch();
        patch.setExpectedUpdatedAt(version(third.detail()));
        patch.setCaption("Updated caption");
        patch.setStatus("active");
        var patched = tx.execute(status -> mediaService.patch(
                "phase6-flow", second.mediaId(), patch, ADMIN));
        assertEquals("Updated caption", jdbc.queryForObject(
                "SELECT caption FROM event_media WHERE id=?", String.class, second.mediaId()));

        var selected = tx.execute(status -> mediaService.selectThumbnail(
                "phase6-flow", first.mediaId(),
                new AdminEventMediaMutationDtos.Version(version(patched)), ADMIN));
        var reordered = tx.execute(status -> mediaService.reorder(
                "phase6-flow",
                new AdminEventMediaMutationDtos.Order(
                        version(selected), List.of(third.mediaId(), second.mediaId(), first.mediaId())),
                ADMIN));
        assertEquals(List.of(first.mediaId(), third.mediaId(), second.mediaId()),
                jdbc.queryForList("""
                        SELECT id FROM event_media WHERE event_id='phase6-flow'
                        ORDER BY sort_order,id
                        """, Long.class));
        assertEquals(List.of(0, 1, 2), jdbc.queryForList("""
                SELECT sort_order FROM event_media WHERE event_id='phase6-flow'
                ORDER BY sort_order,id
                """, Integer.class));

        String beforeOwnershipFailure = version(reordered);
        var foreignPatch = new AdminEventMediaMutationDtos.Patch();
        foreignPatch.setExpectedUpdatedAt(beforeOwnershipFailure);
        foreignPatch.setCaption("Must not cross event");
        ApiException ownership = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.patch("phase6-flow", foreign.mediaId(), foreignPatch, ADMIN)));
        assertEquals("EVENT_MEDIA_OWNERSHIP_MISMATCH", ownership.getCode());
        assertEquals(beforeOwnershipFailure, version(serviceRead("phase6-flow")));
        assertNull(jdbc.queryForObject(
                "SELECT caption FROM event_media WHERE id=?", String.class, foreign.mediaId()));

        var removed = tx.execute(status -> mediaService.remove(
                "phase6-flow", second.mediaId(), beforeOwnershipFailure, ADMIN));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE id=?", Integer.class, second.mediaId()));
        assertEquals(List.of(0, 1), jdbc.queryForList("""
                SELECT sort_order FROM event_media WHERE event_id='phase6-flow'
                ORDER BY sort_order,id
                """, Integer.class));
        assertNotEquals(beforeOwnershipFailure, version(removed));
        assertEquals(storageUploadsBefore, fakeImageStorage.uploads.get());
        assertEquals(storageDeletesBefore, fakeImageStorage.deletes.get());
    }

    @Test
    void reorderRejectsDuplicatesIncompleteAndNoOpWithoutChangingVersion() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-order"), ADMIN));
        var first = tx.execute(status -> mediaService.add("phase6-order",
                media(version(serviceRead("phase6-order")), "image", "one.jpg", "active"), ADMIN));
        var second = tx.execute(status -> mediaService.add("phase6-order",
                media(version(first.detail()), "image", "two.jpg", "hidden"), ADMIN));
        String current = version(second.detail());

        ApiException duplicate = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.reorder("phase6-order",
                        new AdminEventMediaMutationDtos.Order(
                                current, List.of(first.mediaId(), first.mediaId())), ADMIN)));
        assertEquals("DUPLICATE_MEDIA_ID", duplicate.getCode());
        assertEquals(current, version(serviceRead("phase6-order")));

        ApiException incomplete = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.reorder("phase6-order",
                        new AdminEventMediaMutationDtos.Order(current, List.of(first.mediaId())), ADMIN)));
        assertEquals("INVALID_MEDIA_ORDER", incomplete.getCode());
        assertEquals(current, version(serviceRead("phase6-order")));

        ApiException noChanges = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.reorder("phase6-order",
                        new AdminEventMediaMutationDtos.Order(
                                current, List.of(first.mediaId(), second.mediaId())), ADMIN)));
        assertEquals("NO_CHANGES", noChanges.getCode());
        assertEquals(current, version(serviceRead("phase6-order")));
    }

    @Test
    void mediaLimitAndAuditFailureRollBackVersionRowsFlagsAndOrder() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-limit"), ADMIN));
        jdbc.batchUpdate("""
                INSERT INTO event_media(
                    event_id,media_type,url,storage_type,is_thumbnail,sort_order,status)
                VALUES('phase6-limit','image',?,'external',FALSE,?,'active')
                """, java.util.stream.IntStream.range(0, 200)
                .mapToObj(index -> new Object[]{"https://cdn.example.org/" + index + ".jpg", index})
                .toList());
        String limitVersion = version(serviceRead("phase6-limit"));
        ApiException limit = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.add("phase6-limit",
                        media(limitVersion, "image", "overflow.jpg", "active"), ADMIN)));
        assertEquals("EVENT_MEDIA_LIMIT_REACHED", limit.getCode());
        assertEquals(200, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE event_id='phase6-limit'", Integer.class));
        assertEquals(limitVersion, version(serviceRead("phase6-limit")));

        tx.executeWithoutResult(status -> service.create(create("phase6-audit-rollback"), ADMIN));
        var added = tx.execute(status -> mediaService.add("phase6-audit-rollback",
                media(version(serviceRead("phase6-audit-rollback")), "image", "one.jpg", "active"), ADMIN));
        byte[] missingUser = new byte[16];
        missingUser[0] = 9;
        var invalidActor = new UserPrincipal("missing", missingUser, "missing@test", List.of("admin"));
        String before = version(added.detail());
        assertThrows(RuntimeException.class, () -> tx.execute(status ->
                mediaService.selectThumbnail("phase6-audit-rollback", added.mediaId(),
                        new AdminEventMediaMutationDtos.Version(before), invalidActor)));
        assertEquals(before, version(serviceRead("phase6-audit-rollback")));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE event_id='phase6-audit-rollback' AND is_thumbnail",
                Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "SELECT sort_order FROM event_media WHERE id=?", Integer.class, added.mediaId()));
    }

    @Test
    void thumbnailSelectionHealsDuplicatesAndConcurrentSameVersionHasOneWinner() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-thumbnail"), ADMIN));
        var first = tx.execute(status -> mediaService.add("phase6-thumbnail",
                media(version(serviceRead("phase6-thumbnail")), "image", "one.jpg", "active"), ADMIN));
        var second = tx.execute(status -> mediaService.add("phase6-thumbnail",
                media(version(first.detail()), "image", "two.jpg", "active"), ADMIN));
        var third = tx.execute(status -> mediaService.add("phase6-thumbnail",
                media(version(second.detail()), "image", "three.jpg", "active"), ADMIN));
        jdbc.update("""
                UPDATE event_media SET is_thumbnail=TRUE
                WHERE id IN (?,?)
                """, first.mediaId(), second.mediaId());

        var healed = tx.execute(status -> mediaService.selectThumbnail(
                "phase6-thumbnail", third.mediaId(),
                new AdminEventMediaMutationDtos.Version(version(third.detail())), ADMIN));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id='phase6-thumbnail' AND is_thumbnail
                """, Integer.class));
        assertEquals(third.mediaId(), healed.media().thumbnail().id());
        assertEquals(List.of(0, 1, 2), jdbc.queryForList("""
                SELECT sort_order FROM event_media WHERE event_id='phase6-thumbnail'
                ORDER BY sort_order,id
                """, Integer.class));

        String sharedVersion = version(healed);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var left = executor.submit(() -> selectAfterLatch(
                    ready, start, first.mediaId(), sharedVersion));
            var right = executor.submit(() -> selectAfterLatch(
                    ready, start, second.mediaId(), sharedVersion));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<Object> outcomes = List.of(left.get(30, TimeUnit.SECONDS), right.get(30, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream()
                    .filter(value -> value instanceof com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail)
                    .count());
            assertEquals(1, outcomes.stream()
                    .filter(value -> "EVENT_UPDATE_CONFLICT".equals(value)).count());
        }
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id='phase6-thumbnail' AND is_thumbnail
                """, Integer.class));
    }

    @Test
    void patchingSelectedThumbnailToHiddenClearsItAndStalePatchChangesNothing() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase6-patch"), ADMIN));
        var added = tx.execute(status -> mediaService.add("phase6-patch",
                media(version(serviceRead("phase6-patch")), "image", "one.jpg", "active"), ADMIN));
        var selected = tx.execute(status -> mediaService.selectThumbnail(
                "phase6-patch", added.mediaId(),
                new AdminEventMediaMutationDtos.Version(version(added.detail())), ADMIN));
        String stale = version(added.detail());

        var hide = new AdminEventMediaMutationDtos.Patch();
        hide.setExpectedUpdatedAt(version(selected));
        hide.setStatus("hidden");
        var hidden = tx.execute(status -> mediaService.patch(
                "phase6-patch", added.mediaId(), hide, ADMIN));
        assertNull(hidden.media().thumbnail());
        assertEquals(0, jdbc.queryForObject(
                "SELECT is_thumbnail FROM event_media WHERE id=?", Integer.class, added.mediaId()));

        var stalePatch = new AdminEventMediaMutationDtos.Patch();
        stalePatch.setExpectedUpdatedAt(stale);
        stalePatch.setCaption("stale");
        ApiException conflict = assertThrows(ApiException.class, () -> tx.execute(status ->
                mediaService.patch("phase6-patch", added.mediaId(), stalePatch, ADMIN)));
        assertEquals("EVENT_UPDATE_CONFLICT", conflict.getCode());
        assertNull(jdbc.queryForObject(
                "SELECT caption FROM event_media WHERE id=?", String.class, added.mediaId()));
        assertEquals(version(hidden), version(serviceRead("phase6-patch")));
    }

    @Test
    void geographyMutationStoresAllCanonicalTypesAndKeepsCompletenessConsistent() {
        assumeTrue(available, unavailableReason);
        List<AdminEventGeographyDtos.Payload> payloads = List.of(
                new AdminEventGeographyDtos.NoLocation(
                        "no_location", List.of("Không xác định"), new AdminEventGeographyDtos.Focus("auto", null)),
                new AdminEventGeographyDtos.Nationwide(
                        "nationwide", List.of("Việt Nam"), new AdminEventGeographyDtos.Focus("auto", null)),
                new AdminEventGeographyDtos.Point(
                        "point", marker("Hà Nội", 21.028511, 105.804817),
                        List.of("Thăng Long"), new AdminEventGeographyDtos.Focus("auto", 8)),
                new AdminEventGeographyDtos.MultiPoint(
                        "multi_point", List.of(
                        marker("Hà Nội", 21.028511, 105.804817),
                        marker("Huế", 16.463713, 107.590866)),
                        List.of(), new AdminEventGeographyDtos.Focus("bounds", 6)),
                new AdminEventGeographyDtos.MultiPolygon(
                        "multi_polygon",
                        List.of(new AdminEventGeographyDtos.Region("VNM.27_1")),
                        List.of("Bắc Bộ"), new AdminEventGeographyDtos.Focus("bounds", 6)),
                new AdminEventGeographyDtos.Mixed(
                        "mixed", List.of(marker("Hà Nội", 21.028511, 105.804817)),
                        List.of(new AdminEventGeographyDtos.Region("VNM.27_1")),
                        List.of("Thăng Long"), new AdminEventGeographyDtos.Focus("bounds", 7))
        );
        for (int index = 0; index < payloads.size(); index++) {
            String id = "phase7-type-" + index;
            AdminEventGeographyDtos.Payload payload = payloads.get(index);
            tx.executeWithoutResult(status -> service.create(create(id), ADMIN));
            var updated = tx.execute(status -> geographyService.update(id,
                    new AdminEventGeographyDtos.Patch(version(serviceRead(id)), payload), ADMIN));
            assertEquals(payload.geoType(), updated.geography().canonicalGeoType());
            assertEquals(payload.geoType(), jdbc.queryForObject(
                    "SELECT geo_type FROM historical_events WHERE id=?", String.class, id));
            assertEquals(payload.geoType(), jdbc.queryForObject(
                    "SELECT JSON_UNQUOTE(JSON_EXTRACT(raw_json,'$.mapData.geoType')) "
                            + "FROM historical_events WHERE id=?", String.class, id));
            List<String> codes = updated.completeness().issues().stream()
                    .map(issue -> issue.code()).toList();
            assertTrue(codes.stream().noneMatch(code ->
                    code.equals("MISSING_GEOGRAPHY") || code.equals("INVALID_GEOGRAPHY")
                            || code.equals("MISSING_MAP_DATA") || code.equals("INVALID_MAP_DATA")), codes.toString());
        }
    }

    @Test
    void geographyMutationPreservesUnrelatedJsonIsVersionedAndNoOpSafe() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase7-preserve"), ADMIN));
        jdbc.update("""
                UPDATE historical_events
                SET raw_json=CAST('{
                  "mapData":{"geoType":"nationwide"},
                  "objectValue":{"nested":{"value":"kept"}},
                  "arrayValue":[true,false,null,{"nested":"kept"}],
                  "stringValue":"kept",
                  "numberValue":12.50,
                  "booleanValue":true,
                  "nullValue":null,
                  "importer":{"source":"local:private","rank":2},
                  "provenance":{"package":"history-rag","verified":false},
                  "unknownFutureProperty":{"schema":99,"enabled":true}
                }' AS JSON),
                geo_type='nationwide',
                updated_at='2026-07-24 10:20:30.123456'
                WHERE id='phase7-preserve'
                """);
        String outsideBeforeJson = jdbc.queryForObject("""
                SELECT CAST(JSON_REMOVE(raw_json,'$.mapData') AS CHAR)
                FROM historical_events WHERE id='phase7-preserve'
                """, String.class);
        var outsideBefore = mapper.readTree(outsideBeforeJson);
        String exact = version(serviceRead("phase7-preserve"));
        assertTrue(exact.endsWith(".123456Z"), exact);
        AdminEventGeographyDtos.Point point = new AdminEventGeographyDtos.Point(
                "point", marker("Bạch Đằng", 20.91, 106.75),
                List.of("Sông Bạch Đằng"), new AdminEventGeographyDtos.Focus("auto", 9));
        var updated = tx.execute(status -> geographyService.update(
                "phase7-preserve", new AdminEventGeographyDtos.Patch(exact, point), ADMIN));
        assertNotEquals(exact, version(updated));
        String outsideAfterJson = jdbc.queryForObject("""
                SELECT CAST(JSON_REMOVE(raw_json,'$.mapData') AS CHAR)
                FROM historical_events WHERE id='phase7-preserve'
                """, String.class);
        var outsideAfter = mapper.readTree(outsideAfterJson);
        assertEquals(outsideBefore, outsideAfter,
                "JSON outside $.mapData must retain logical values and node types");
        assertTrue(outsideAfter.path("objectValue").isObject());
        assertTrue(outsideAfter.path("arrayValue").isArray());
        assertTrue(outsideAfter.path("stringValue").isTextual());
        assertTrue(outsideAfter.path("numberValue").isNumber());
        assertTrue(outsideAfter.path("booleanValue").isBoolean());
        assertTrue(outsideAfter.path("nullValue").isNull());
        assertTrue(outsideAfter.path("importer").isObject());
        assertEquals("local:private", outsideAfter.at("/importer/source").asText());
        assertTrue(outsideAfter.path("provenance").isObject());
        assertTrue(outsideAfter.path("unknownFutureProperty").isObject());
        assertEquals(106.75, jdbc.queryForObject(
                "SELECT lng FROM historical_events WHERE id='phase7-preserve'",
                BigDecimal.class).doubleValue());
        assertEquals("point", updated.geography().mapData().displayGeometry().geoType());
        assertEquals(BigDecimal.valueOf(106.75),
                updated.geography().mapData().focusGeometry().center().lng());

        int audits = jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs
                WHERE entity_id='phase7-preserve' AND action='event.geography_updated'
                """, Integer.class);
        ApiException noChanges = assertThrows(ApiException.class, () -> tx.execute(status ->
                geographyService.update("phase7-preserve",
                        new AdminEventGeographyDtos.Patch(version(updated), point), ADMIN)));
        assertEquals("NO_CHANGES", noChanges.getCode());
        assertEquals(version(updated), version(serviceRead("phase7-preserve")));
        assertEquals(audits, jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs
                WHERE entity_id='phase7-preserve' AND action='event.geography_updated'
                """, Integer.class));
    }

    @Test
    void staleAndAuditFailureRollBackEveryGeographyField() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase7-rollback"), ADMIN));
        var first = tx.execute(status -> geographyService.update("phase7-rollback",
                new AdminEventGeographyDtos.Patch(
                        version(serviceRead("phase7-rollback")),
                        new AdminEventGeographyDtos.Nationwide(
                                "nationwide", List.of(), new AdminEventGeographyDtos.Focus("auto", null))),
                ADMIN));
        Map<String, Object> before = geographySnapshot("phase7-rollback");
        ApiException stale = assertThrows(ApiException.class, () -> tx.execute(status ->
                geographyService.update("phase7-rollback",
                        new AdminEventGeographyDtos.Patch(
                                "2020-01-01T00:00:00.000001Z",
                                new AdminEventGeographyDtos.NoLocation(
                                        "no_location", List.of(), new AdminEventGeographyDtos.Focus("auto", null))),
                        ADMIN)));
        assertEquals("EVENT_UPDATE_CONFLICT", stale.getCode());
        assertEquals(before, geographySnapshot("phase7-rollback"));

        byte[] missingUser = new byte[16];
        missingUser[0] = 7;
        UserPrincipal invalidActor = new UserPrincipal(
                "missing", missingUser, "missing@test", List.of("admin"));
        assertThrows(RuntimeException.class, () -> tx.execute(status ->
                geographyService.update("phase7-rollback",
                        new AdminEventGeographyDtos.Patch(
                                version(first),
                                new AdminEventGeographyDtos.Point(
                                        "point", marker("Huế", 16.46, 107.59),
                                        List.of(), new AdminEventGeographyDtos.Focus("auto", 8))),
                        invalidActor)));
        assertEquals(before, geographySnapshot("phase7-rollback"));
    }

    @Test
    void publishedCoreMutationIntroducingErrorRollsBackTheWholeAggregate() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase8-published-core"), ADMIN));
        publishFixture("phase8-published-core");
        Map<String, Object> before = fullAggregateSnapshot("phase8-published-core");
        String exactVersion = version(serviceRead("phase8-published-core"));

        var patch = new AdminEventMutationDtos.CorePatch();
        patch.setExpectedUpdatedAt(exactVersion);
        patch.setCanonicalSummary(null);
        ApiException rejected = assertThrows(ApiException.class, () -> tx.execute(status ->
                service.updateCore("phase8-published-core", patch, ADMIN)));

        assertEquals("PUBLISHED_EVENT_WOULD_BECOME_INVALID", rejected.getCode());
        assertEquals(before, fullAggregateSnapshot("phase8-published-core"));
        assertEquals(exactVersion, version(serviceRead("phase8-published-core")));
    }

    @Test
    void publishedGeographyMutationCannotCommitWhenResultingAggregateHasError() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase8-published-geography"), ADMIN));
        publishFixture("phase8-published-geography");
        jdbc.update("""
                UPDATE historical_events
                SET canonical_summary=NULL
                WHERE id='phase8-published-geography'
                """);
        Map<String, Object> before = fullAggregateSnapshot("phase8-published-geography");
        String exactVersion = version(serviceRead("phase8-published-geography"));
        var point = new AdminEventGeographyDtos.Point(
                "point", marker("Huế", 16.46, 107.59),
                List.of("Thuận Hóa"), new AdminEventGeographyDtos.Focus("auto", 8));

        ApiException rejected = assertThrows(ApiException.class, () -> tx.execute(status ->
                geographyService.update(
                        "phase8-published-geography",
                        new AdminEventGeographyDtos.Patch(exactVersion, point),
                        ADMIN)));

        assertEquals("PUBLISHED_EVENT_WOULD_BECOME_INVALID", rejected.getCode());
        assertEquals(before, fullAggregateSnapshot("phase8-published-geography"));
        assertEquals(exactVersion, version(serviceRead("phase8-published-geography")));
    }

    @Test
    void warningOnlyPublishedMediaAndInvalidDraftCoreMutationsRemainAllowed() {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase8-published-warning"), ADMIN));
        publishFixture("phase8-published-warning");
        var beforeMedia = serviceRead("phase8-published-warning");

        var added = tx.execute(status -> mediaService.add(
                "phase8-published-warning",
                media(version(beforeMedia), "image", "hidden.jpg", "hidden"),
                ADMIN));

        assertEquals("published", added.detail().publication().status());
        assertNotEquals(version(beforeMedia), version(added.detail()));
        assertTrue(added.detail().completeness().issues().stream()
                .allMatch(issue -> !"ERROR".equals(issue.severity())));
        assertTrue(added.detail().completeness().issues().stream()
                .anyMatch(issue -> "WARNING".equals(issue.severity())));

        tx.executeWithoutResult(status -> service.create(create("phase8-draft-error"), ADMIN));
        var draft = serviceRead("phase8-draft-error");
        var patch = new AdminEventMutationDtos.CorePatch();
        patch.setExpectedUpdatedAt(version(draft));
        patch.setCanonicalSummary(null);
        var updatedDraft = tx.execute(status ->
                service.updateCore("phase8-draft-error", patch, ADMIN));

        assertEquals("draft", updatedDraft.publication().status());
        assertTrue(updatedDraft.completeness().issues().stream()
                .anyMatch(issue -> "ERROR".equals(issue.severity())));
    }

    @Test
    void readyManagedMediaCanBecomeThumbnailWithASafeRootRelativeDeliveryUrl() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status -> service.create(create("phase-c-relative-thumbnail"), IMAGE_ADMIN));
        var thumbnail = imageService.upload(
                "phase-c-relative-thumbnail", pngFile(),
                version(serviceRead("phase-c-relative-thumbnail")), "thumbnail", "Thumbnail", null, null, null, IMAGE_ADMIN);
        var gallery = imageService.upload(
                "phase-c-relative-thumbnail", pngFile(), version(thumbnail.event()),
                "gallery", "Gallery", null, null, null, IMAGE_ADMIN);
        jdbc.update("UPDATE event_media SET url=? WHERE id=?",
                "/api/admin-e2e/event-images/" + "a".repeat(64), gallery.mediaId());

        var selected = tx.execute(status -> mediaService.selectThumbnail(
                "phase-c-relative-thumbnail", gallery.mediaId(),
                new AdminEventMediaMutationDtos.Version(version(gallery.event())), IMAGE_ADMIN));

        assertEquals(gallery.mediaId(), selected.media().thumbnail().id());
    }

    @Test
    void managedImageReservationIsInvisibleAndFinalizeBumpsVersionOnce() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status ->
                service.create(create("phase-b-managed-thumbnail"), IMAGE_ADMIN));
        String expected = version(serviceRead("phase-b-managed-thumbnail"));
        int uploadsBefore = fakeImageStorage.uploads.get();
        fakeImageStorage.onUpload = () -> {
            assertEquals(expected, version(serviceRead("phase-b-managed-thumbnail")));
            assertTrue(serviceRead("phase-b-managed-thumbnail").media().items().isEmpty());
            assertTrue(!imageCleanupService.runOnce());
            Map<String, Object> reservation = jdbc.queryForMap("""
                    SELECT storage_state,status,url,is_thumbnail
                    FROM event_media
                    WHERE event_id='phase-b-managed-thumbnail'
                    """);
            assertEquals("UPLOADING", reservation.get("storage_state"));
            assertEquals("hidden", reservation.get("status"));
            assertEquals("", reservation.get("url"));
            assertEquals(false, reservation.get("is_thumbnail"));
        };

        MockMultipartFile uploadFile = pngFile();
        var response = imageService.upload(
                "phase-b-managed-thumbnail",
                uploadFile,
                expected,
                "thumbnail",
                "Minh họa sự kiện",
                "Chú thích",
                "Nguồn kiểm thử",
                "CC BY 4.0",
                IMAGE_ADMIN);

        assertEquals(uploadsBefore + 1, fakeImageStorage.uploads.get());
        assertNotEquals(expected, response.updatedAt());
        assertEquals(response.updatedAt(), version(response.event()));
        assertTrue(response.event().media().items().getFirst().managed());
        assertTrue(response.event().media().thumbnail().url()
                .startsWith("https://cdn.example.test/thumbnail/"));
        assertTrue(!response.event().media().thumbnail().url()
                .contains("provider-original"));
        Map<String, Object> stored = jdbc.queryForMap("""
                SELECT storage_state,status,is_thumbnail,storage_provider,
                       storage_original_url,storage_sha256,storage_byte_size,
                       storage_width,storage_height,
                       upload_token,upload_expires_at
                FROM event_media WHERE id=?
                """, response.mediaId());
        assertEquals("READY", stored.get("storage_state"));
        assertEquals("active", stored.get("status"));
        assertEquals(true, stored.get("is_thumbnail"));
        assertEquals("cloudinary", stored.get("storage_provider"));
        assertTrue(String.valueOf(stored.get("storage_original_url"))
                .contains("provider-original"));
        assertTrue(String.valueOf(stored.get("storage_sha256")).matches("[0-9a-f]{64}"));
        assertEquals(uploadFile.getSize(),
                ((Number) stored.get("storage_byte_size")).longValue());
        assertEquals(20, ((Number) stored.get("storage_width")).intValue());
        assertEquals(10, ((Number) stored.get("storage_height")).intValue());
        assertNull(stored.get("upload_token"));
        assertNull(stored.get("upload_expires_at"));
        assertEquals("COMPLETED", jdbc.queryForObject("""
                SELECT task_status FROM event_media_storage_cleanup_tasks
                WHERE public_id=(SELECT storage_public_id FROM event_media WHERE id=?)
                """, String.class, response.mediaId()));

        Map<String, Object> audit = jdbc.queryForMap("""
                SELECT action,CAST(before_json AS CHAR) before_json,
                       CAST(after_json AS CHAR) after_json
                FROM admin_audit_logs
                WHERE entity_id='phase-b-managed-thumbnail'
                  AND action='event.thumbnail_uploaded'
                """);
        String auditText = audit.toString();
        assertTrue(auditText.contains("storageIdentityDigest"));
        assertTrue(!auditText.contains("provider-original"));
        assertTrue(!auditText.contains("events/phase-b-managed-thumbnail"));
        assertTrue(!auditText.contains("http"));

        jdbc.update("""
                UPDATE historical_events
                SET status='published',published_at=CURRENT_TIMESTAMP(6)
                WHERE id='phase-b-managed-thumbnail'
                """);
        var publicDetail = new EventReadRepository(
                new NamedParameterJdbcTemplate(jdbc.getDataSource()),
                mapper,
                new MediaUrlPolicy(),
                new EventMediaReadPolicy(new MediaUrlPolicy(), fakeImageStorage))
                .findDetailByIdOrSlug("phase-b-managed-thumbnail")
                .orElseThrow();
        assertEquals(1, publicDetail.media().size());
        assertEquals(response.event().media().thumbnail().url(),
                publicDetail.media().getFirst().url());
        assertTrue(!publicDetail.media().getFirst().url().contains("provider-original"));
    }

    @Test
    void finalizeConflictLeavesInvisibleReservationForDurableCleanup() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status ->
                service.create(create("phase-b-finalize-conflict"), IMAGE_ADMIN));
        String expected = version(serviceRead("phase-b-finalize-conflict"));
        int deletesBefore = fakeImageStorage.deletes.get();
        fakeImageStorage.onUpload = () -> jdbc.update("""
                UPDATE historical_events
                SET updated_at=updated_at+INTERVAL 1 MICROSECOND
                WHERE id='phase-b-finalize-conflict'
                """);

        ApiException conflict = assertThrows(ApiException.class, () -> imageService.upload(
                "phase-b-finalize-conflict",
                pngFile(),
                expected,
                "gallery",
                "Ảnh minh họa",
                null,
                null,
                null,
                IMAGE_ADMIN));

        assertEquals("EVENT_UPDATE_CONFLICT", conflict.getCode());
        Map<String, Object> reservation = jdbc.queryForMap("""
                SELECT id,storage_state,status,url,storage_public_id
                FROM event_media WHERE event_id='phase-b-finalize-conflict'
                """);
        assertEquals("UPLOADING", reservation.get("storage_state"));
        assertEquals("hidden", reservation.get("status"));
        assertEquals("", reservation.get("url"));
        assertTrue(serviceRead("phase-b-finalize-conflict").media().items().isEmpty());
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs
                WHERE entity_id='phase-b-finalize-conflict'
                  AND action='event.media_image_uploaded'
                """, Integer.class));

        jdbc.update("""
                UPDATE event_media
                SET upload_expires_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                WHERE id=?
                """, reservation.get("id"));
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET next_attempt_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                WHERE public_id=?
                """, reservation.get("storage_public_id"));
        var cleanupPool = Executors.newFixedThreadPool(2);
        try {
            var first = cleanupPool.submit(imageCleanupService::runOnce);
            var second = cleanupPool.submit(imageCleanupService::runOnce);
            assertEquals(1, List.of(
                            first.get(20, TimeUnit.SECONDS),
                            second.get(20, TimeUnit.SECONDS))
                    .stream().filter(Boolean.TRUE::equals).count());
        } finally {
            cleanupPool.shutdownNow();
        }
        assertEquals(deletesBefore + 1, fakeImageStorage.deletes.get());
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE id=?",
                Integer.class, reservation.get("id")));
        assertEquals("COMPLETED", jdbc.queryForObject("""
                SELECT task_status FROM event_media_storage_cleanup_tasks
                WHERE public_id=?
                """, String.class, reservation.get("storage_public_id")));
    }

    @Test
    void finalizeAuditFailureRollsBackVersionAndReadyMetadata() throws Exception {
        assumeTrue(available, unavailableReason);
        UUID actorId = UUID.fromString("00000000-0000-4000-8000-000000004202");
        UserPrincipal actor = new UserPrincipal(
                actorId.toString(),
                UuidBytes.fromUuid(actorId),
                "phase-b-rollback@example.test",
                List.of("admin"));
        jdbc.update("""
                INSERT INTO users(id,email,password_hash,full_name,status)
                VALUES(UUID_TO_BIN(?),?,'hash','Rollback Admin','active')
                """, actorId.toString(), actor.email());
        tx.executeWithoutResult(status ->
                service.create(create("phase-b-finalize-rollback"), actor));
        String expected = version(serviceRead("phase-b-finalize-rollback"));
        fakeImageStorage.onUpload = () -> jdbc.update(
                "DELETE FROM users WHERE id=UUID_TO_BIN(?)", actorId.toString());

        ApiException failure = assertThrows(ApiException.class, () -> imageService.upload(
                "phase-b-finalize-rollback",
                pngFile(),
                expected,
                "gallery",
                "Ảnh rollback",
                null,
                null,
                null,
                actor));

        assertEquals("EVENT_IMAGE_FINALIZE_FAILED", failure.getCode());
        assertEquals(expected, version(serviceRead("phase-b-finalize-rollback")));
        Map<String, Object> reservation = jdbc.queryForMap("""
                SELECT id,storage_public_id,storage_state,status,url,
                       storage_asset_id,storage_original_url,uploaded_at
                FROM event_media WHERE event_id='phase-b-finalize-rollback'
                """);
        assertEquals("UPLOADING", reservation.get("storage_state"));
        assertEquals("hidden", reservation.get("status"));
        assertEquals("", reservation.get("url"));
        assertNull(reservation.get("storage_asset_id"));
        assertNull(reservation.get("storage_original_url"));
        assertNull(reservation.get("uploaded_at"));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs
                WHERE entity_id='phase-b-finalize-rollback'
                  AND action='event.media_image_uploaded'
                """, Integer.class));

        jdbc.update("""
                UPDATE event_media
                SET upload_expires_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                WHERE id=?
                """, reservation.get("id"));
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET next_attempt_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                WHERE public_id=?
                """, reservation.get("storage_public_id"));
        assertTrue(imageCleanupService.runOnce());
    }

    @Test
    void concurrentManagedThumbnailFinalizeAllowsOneWinnerAndCleansLoser() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status ->
                service.create(create("phase-b-thumbnail-race"), IMAGE_ADMIN));
        String expected = version(serviceRead("phase-b-thumbnail-race"));
        CountDownLatch uploadsReady = new CountDownLatch(2);
        CountDownLatch releaseUploads = new CountDownLatch(1);
        fakeImageStorage.uploadsReady = uploadsReady;
        fakeImageStorage.releaseUploads = releaseUploads;
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> managedUploadAfterLatch(
                    "phase-b-thumbnail-race", expected));
            var second = pool.submit(() -> managedUploadAfterLatch(
                    "phase-b-thumbnail-race", expected));
            assertTrue(uploadsReady.await(20, TimeUnit.SECONDS));
            releaseUploads.countDown();
            Object firstResult = first.get(30, TimeUnit.SECONDS);
            Object secondResult = second.get(30, TimeUnit.SECONDS);

            long successCount = List.of(firstResult, secondResult).stream()
                    .filter(AdminEventImageDtos.UploadResponse.class::isInstance)
                    .count();
            long conflictCount = List.of(firstResult, secondResult).stream()
                    .filter("EVENT_UPDATE_CONFLICT"::equals)
                    .count();
            assertEquals(1, successCount);
            assertEquals(1, conflictCount);
            assertEquals(1, jdbc.queryForObject("""
                    SELECT COUNT(*) FROM event_media
                    WHERE event_id='phase-b-thumbnail-race'
                      AND storage_state='READY' AND status='active'
                      AND is_thumbnail=TRUE
                    """, Integer.class));
            assertEquals(1, jdbc.queryForObject("""
                    SELECT COUNT(*) FROM event_media
                    WHERE event_id='phase-b-thumbnail-race'
                      AND storage_state='UPLOADING' AND status='hidden'
                    """, Integer.class));

            jdbc.update("""
                    UPDATE event_media
                    SET upload_expires_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                    WHERE event_id='phase-b-thumbnail-race'
                      AND storage_state='UPLOADING'
                    """);
            jdbc.update("""
                    UPDATE event_media_storage_cleanup_tasks t
                    JOIN event_media m ON m.storage_public_id=t.public_id
                    SET t.next_attempt_at=CURRENT_TIMESTAMP(6)-INTERVAL 1 SECOND
                    WHERE m.event_id='phase-b-thumbnail-race'
                      AND m.storage_state='UPLOADING'
                    """);
            assertTrue(imageCleanupService.runOnce());
            assertEquals(1, jdbc.queryForObject("""
                    SELECT COUNT(*) FROM event_media
                    WHERE event_id='phase-b-thumbnail-race'
                    """, Integer.class));
        } finally {
            releaseUploads.countDown();
            fakeImageStorage.uploadsReady = null;
            fakeImageStorage.releaseUploads = null;
            pool.shutdownNow();
        }
    }

    @Test
    void managedDeleteHidesBeforeCleanupAndExternalDeleteNeverCallsStorage() throws Exception {
        assumeTrue(available, unavailableReason);
        tx.executeWithoutResult(status ->
                service.create(create("phase-b-managed-delete"), IMAGE_ADMIN));
        String expected = version(serviceRead("phase-b-managed-delete"));
        var uploaded = imageService.upload(
                "phase-b-managed-delete",
                pngFile(),
                expected,
                "gallery",
                "Ảnh thư viện",
                null,
                null,
                null,
                IMAGE_ADMIN);
        int deletesBefore = fakeImageStorage.deletes.get();

        Optional<com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail> hidden =
                imageService.removeManagedIfPresent(
                        "phase-b-managed-delete",
                        uploaded.mediaId(),
                        uploaded.updatedAt(),
                        IMAGE_ADMIN);
        assertTrue(hidden.isPresent());
        assertTrue(hidden.orElseThrow().media().items().isEmpty());
        assertEquals("DELETE_PENDING", jdbc.queryForObject(
                "SELECT storage_state FROM event_media WHERE id=?",
                String.class, uploaded.mediaId()));
        assertEquals(deletesBefore, fakeImageStorage.deletes.get());

        fakeImageStorage.deleteOutcome = EventImageStorage.DeleteOutcome.NOT_FOUND;
        assertTrue(imageCleanupService.runOnce());
        fakeImageStorage.deleteOutcome = EventImageStorage.DeleteOutcome.DELETED;
        assertEquals(deletesBefore + 1, fakeImageStorage.deletes.get());
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media WHERE id=?",
                Integer.class, uploaded.mediaId()));
        assertTrue(!imageCleanupService.runOnce());

        var external = tx.execute(status -> mediaService.add(
                "phase-b-managed-delete",
                media(version(serviceRead("phase-b-managed-delete")),
                        "image", "external.jpg", "active"),
                IMAGE_ADMIN));
        assertTrue(imageService.removeManagedIfPresent(
                "phase-b-managed-delete",
                external.mediaId(),
                version(external.detail()),
                IMAGE_ADMIN).isEmpty());
        assertEquals(deletesBefore + 1, fakeImageStorage.deletes.get());
        tx.execute(status -> mediaService.remove(
                "phase-b-managed-delete",
                external.mediaId(),
                version(external.detail()),
                IMAGE_ADMIN));
        assertEquals(deletesBefore + 1, fakeImageStorage.deletes.get());
    }

    private static Object selectAfterLatch(
            CountDownLatch ready, CountDownLatch start, long mediaId, String expectedVersion
    ) {
        try {
            ready.countDown();
            start.await(10, TimeUnit.SECONDS);
            return tx.execute(status -> mediaService.selectThumbnail(
                    "phase6-thumbnail", mediaId,
                    new AdminEventMediaMutationDtos.Version(expectedVersion), ADMIN));
        } catch (ApiException ex) {
            return ex.getCode();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return "INTERRUPTED";
        }
    }

    private static Object managedUploadAfterLatch(String eventId, String expectedVersion) {
        try {
            return imageService.upload(
                    eventId,
                    pngFile(),
                    expectedVersion,
                    "thumbnail",
                    "Ảnh cạnh tranh",
                    null,
                    null,
                    null,
                    IMAGE_ADMIN);
        } catch (ApiException exception) {
            return exception.getCode();
        } catch (Exception exception) {
            return exception.getClass().getSimpleName();
        }
    }

    private static AdminEventMediaMutationDtos.Create media(
            String version, String type, String fileName, String status
    ) {
        return new AdminEventMediaMutationDtos.Create(
                version, type, "https://cdn.example.org/" + fileName,
                null, null, null, null, status);
    }

    private static AdminEventGeographyDtos.Marker marker(
            String label, double lat, double lng
    ) {
        return new AdminEventGeographyDtos.Marker(
                null, label, BigDecimal.valueOf(lat), BigDecimal.valueOf(lng), null);
    }

    private static Map<String, Object> geographySnapshot(String id) {
        return new java.util.LinkedHashMap<>(jdbc.queryForMap("""
                SELECT geo_type, CAST(lat AS CHAR) lat, CAST(lng AS CHAR) lng,
                       CAST(province_names AS CHAR) province_names,
                       CAST(historical_locations AS CHAR) historical_locations,
                       CAST(raw_json AS CHAR) raw_json, CAST(updated_at AS CHAR) updated_at
                FROM historical_events WHERE id=?
                """, id));
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

    private static Map<String, Object> fullAggregateSnapshot(String id) {
        Map<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("event", new java.util.LinkedHashMap<>(
                jdbc.queryForMap("SELECT * FROM historical_events WHERE id=?", id)));
        snapshot.put("grades", jdbc.queryForList(
                "SELECT grade FROM event_grades WHERE event_id=? ORDER BY grade", Integer.class, id));
        snapshot.put("media", jdbc.queryForList(
                "SELECT * FROM event_media WHERE event_id=? ORDER BY id", id));
        snapshot.put("provinces", jdbc.queryForList(
                "SELECT * FROM event_provinces WHERE event_id=? "
                        + "ORDER BY province_name, role, sort_order", id));
        snapshot.put("relations", jdbc.queryForList("""
                SELECT * FROM event_relations
                WHERE source_event_id=? OR target_event_id=?
                ORDER BY source_event_id, target_event_id, relation_type
                """, id, id));
        snapshot.put("textbookRefs", jdbc.queryForList(
                "SELECT * FROM event_textbook_refs WHERE event_id=? ORDER BY id", id));
        snapshot.put("externalSources", jdbc.queryForList(
                "SELECT * FROM event_external_sources WHERE event_id=? "
                        + "ORDER BY source_id, match_type", id));
        snapshot.put("auditCount", jdbc.queryForObject(
                "SELECT COUNT(*) FROM admin_audit_logs WHERE entity_id=?", Integer.class, id));
        return snapshot;
    }

    private static void publishFixture(String id) {
        jdbc.update("""
                UPDATE historical_events
                SET status='published', published_at='2026-07-24 10:00:00.000000'
                WHERE id=?
                """, id);
    }

    private static com.lichsuvn.backend.admin.api.dto.AdminEventDtos.Detail serviceRead(String id) {
        var mapper = new ObjectMapper();
        var named = new NamedParameterJdbcTemplate(jdbc.getDataSource());
        var mediaUrlPolicy = new MediaUrlPolicy();
        return new AdminEventReadService(
                new AdminEventReadRepository(
                        named,
                        mapper,
                        mediaUrlPolicy,
                        new EventMediaReadPolicy(mediaUrlPolicy, fakeImageStorage)),
                new EventCompletenessService()).findEvent(id);
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

    private static MockMultipartFile pngFile() throws Exception {
        BufferedImage image = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return new MockMultipartFile(
                "file", "ignored-client-name.png", "image/png", output.toByteArray());
    }

    private static final class FakeEventImageStorage implements EventImageStorage {
        private final AtomicInteger uploads = new AtomicInteger();
        private final AtomicInteger deletes = new AtomicInteger();
        private volatile Runnable onUpload;
        private volatile CountDownLatch uploadsReady;
        private volatile CountDownLatch releaseUploads;
        private volatile DeleteOutcome deleteOutcome = DeleteOutcome.DELETED;

        @Override
        public boolean available() {
            return true;
        }

        @Override
        public StoredImage upload(UploadCommand command) {
            uploads.incrementAndGet();
            Runnable callback = onUpload;
            onUpload = null;
            if (callback != null) {
                callback.run();
            }
            CountDownLatch ready = uploadsReady;
            CountDownLatch release = releaseUploads;
            if (ready != null && release != null) {
                ready.countDown();
                try {
                    if (!release.await(20, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Timed out waiting to release fake upload");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Fake upload interrupted", exception);
                }
            }
            return new StoredImage(
                    command.publicId(),
                    "provider-asset-" + uploads.get(),
                    42L + uploads.get(),
                    "https://provider-original.example.test/" + command.publicId(),
                    command.mimeType(),
                    "png",
                    command.bytes().length,
                    20,
                    10);
        }

        @Override
        public DeleteResult delete(DeleteCommand command) {
            deletes.incrementAndGet();
            return new DeleteResult(deleteOutcome);
        }

        @Override
        public String deliveryUrl(DeliveryCommand command) {
            String variant = command.kind() == DeliveryKind.THUMBNAIL
                    ? "thumbnail" : "gallery";
            return "https://cdn.example.test/" + variant + "/"
                    + command.publicId().substring(command.publicId().lastIndexOf('/') + 1);
        }
    }
}
