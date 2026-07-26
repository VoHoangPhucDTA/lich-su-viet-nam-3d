package com.lichsuvn.backend.admin.integration;

import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.application.AdminUserReadService;
import com.lichsuvn.backend.admin.infrastructure.AdminUserReadRepository;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminUserReadRepositoryIntegrationTest {
    private static final String STUDENT = "00000000-0000-0000-0000-000000000001";
    private static final String TEACHER = "00000000-0000-0000-0000-000000000002";
    private static final String ADMIN = "00000000-0000-0000-0000-000000000003";
    private static final String MULTI = "00000000-0000-0000-0000-000000000004";
    private static final String NO_ROLE = "00000000-0000-0000-0000-000000000005";
    private static final String DELETED = "00000000-0000-0000-0000-000000000006";
    private static MySQLContainer mysql;
    private static JdbcTemplate jdbc;
    private static AdminUserReadService service;
    private static boolean available;
    private static String unavailableReason;

    @BeforeAll
    static void startDatabase() {
        try {
            mysql = new MySQLContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase9_test")
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
            var repository = new AdminUserReadRepository(
                    new NamedParameterJdbcTemplate(dataSource), new MediaUrlPolicy());
            service = new AdminUserReadService(repository);
            seed();
            available = true;
        } catch (Exception exception) {
            unavailableReason = exception.getClass().getSimpleName() + ": " + exception.getMessage();
            if (mysql != null) mysql.stop();
        }
    }

    @AfterAll
    static void stopDatabase() {
        if (mysql != null) mysql.stop();
    }

    @Test
    void listPreservesSingleMultiAndNoRoleMappingsWithoutTeacherCollapse() {
        assumeTrue(available, unavailableReason);
        var all = users(null, null, null, null, "createdAt", "asc", 100, 0);
        assertEquals(6, all.total());
        assertRole(all, STUDENT, AdminUserDtos.Role.STUDENT, List.of(AdminUserDtos.Role.STUDENT));
        assertRole(all, TEACHER, AdminUserDtos.Role.TEACHER, List.of(AdminUserDtos.Role.TEACHER));
        assertRole(all, ADMIN, AdminUserDtos.Role.ADMIN, List.of(AdminUserDtos.Role.ADMIN));
        assertRole(all, MULTI, AdminUserDtos.Role.ADMIN,
                List.of(AdminUserDtos.Role.ADMIN, AdminUserDtos.Role.TEACHER, AdminUserDtos.Role.STUDENT));
        assertRole(all, NO_ROLE, null, List.of());

        var teacher = users(null, "teacher", null, null, null, null, 20, 0);
        assertEquals(List.of(TEACHER), teacher.items().stream().map(AdminUserDtos.ListItem::id).toList());
        var admin = users(null, "admin", null, null, null, null, 20, 0);
        assertEquals(List.of(ADMIN, MULTI),
                admin.items().stream().map(AdminUserDtos.ListItem::id).sorted().toList());
    }

    @Test
    void countAndPageShareSearchStatusVerificationAndStableSortPredicates() {
        assumeTrue(available, unavailableReason);
        var deleted = users(null, null, "deleted", "false", null, null, 20, 0);
        assertEquals(1, deleted.total());
        assertEquals(1, deleted.count());
        assertEquals(DELETED, deleted.items().getFirst().id());
        assertEquals(AdminUserDtos.Status.DELETED, deleted.items().getFirst().status());
        assertFalse(deleted.items().getFirst().emailVerified());

        var escaped = users("%", null, null, null, null, null, 20, 0);
        assertEquals(1, escaped.total());
        assertEquals(STUDENT, escaped.items().getFirst().id());
        var escapedBackslash = users("\\", null, null, null, null, null, 20, 0);
        assertEquals(1, escapedBackslash.total());
        assertEquals(NO_ROLE, escapedBackslash.items().getFirst().id());

        var first = users(null, null, null, null, "updatedAt", "asc", 1, 0);
        var second = users(null, null, null, null, "updatedAt", "asc", 1, 1);
        assertEquals(STUDENT, first.items().getFirst().id());
        assertEquals(TEACHER, second.items().getFirst().id());
    }

    @Test
    void detailUsesStoredProgressCurrentAttemptsSafeAvatarBoundedActivityAndAuditRelations() throws Exception {
        assumeTrue(available, unavailableReason);
        AdminUserDtos.Detail detail = service.findUser(MULTI);

        assertEquals("other", detail.account().grade());
        assertNull(detail.account().avatarUrl());
        assertEquals(3, detail.learning().progress().eventsViewed());
        assertEquals(1, detail.learning().progress().distinctEventsViewed());
        assertEquals(7, detail.learning().progress().totalMinutes());
        assertEquals(2, detail.learning().quizzes().submittedCount());
        assertEquals(new BigDecimal("8.13"), detail.learning().quizzes().averageScore10());
        assertEquals(2, detail.learning().exams().submittedCount());
        assertEquals(new BigDecimal("10.00"), detail.learning().exams().averageScore10());
        assertFalse(detail.sessions().trackingAvailable());
        assertNull(detail.sessions().activeRefreshSessionCount());
        assertTrue(detail.activity().recent().size() <= 10);
        assertEquals(AdminUserDtos.ActivityKind.EXAM_SUBMITTED,
                detail.activity().recent().getFirst().kind());
        assertEquals(List.of(
                        AdminUserDtos.AuditRelation.BOTH,
                        AdminUserDtos.AuditRelation.ACTOR,
                        AdminUserDtos.AuditRelation.TARGET),
                detail.recentAdminAudit().stream().map(AdminUserDtos.AuditEntry::relation).toList());

        String safeProjection = JsonMapper.builder().build().writeValueAsString(detail);
        for (String secret : List.of(
                "PASSWORD_SENTINEL_PHASE9", "EMAIL_TOKEN_SENTINEL_PHASE9",
                "PROVIDER_ID_SENTINEL_PHASE9", "PROVIDER_EMAIL_SENTINEL_PHASE9",
                "BEFORE_SENTINEL_PHASE9", "AFTER_SENTINEL_PHASE9",
                "QUIZ_CONFIG_SENTINEL_PHASE9", "QUIZ_QUESTIONS_SENTINEL_PHASE9",
                "EXAM_ANSWERS_SENTINEL_PHASE9", "EXAM_CONFIG_SENTINEL_PHASE9",
                "EXAM_RESULT_SENTINEL_PHASE9", "198.51.100.77", "local:private-avatar")) {
            assertFalse(safeProjection.contains(secret), secret);
        }
        for (String forbiddenField : List.of(
                "passwordHash", "tokenHash", "providerId", "failedLoginCount",
                "lockedUntil", "beforeJson", "afterJson", "ipAddress",
                "questionsJson", "answersJson", "configJson", "resultJson")) {
            assertFalse(safeProjection.contains(forbiddenField), forbiddenField);
        }
    }

    @Test
    void safeAbsoluteAvatarIsRetainedAndMissingUserReturnsStableCode() {
        assumeTrue(available, unavailableReason);
        var teacher = service.findUser(TEACHER);
        assertEquals("https://cdn.example.test/teacher.png", teacher.account().avatarUrl());
        assertNull(teacher.learning().quizzes().averageScore10());
        assertNull(teacher.learning().exams().averageScore10());
        var error = org.junit.jupiter.api.Assertions.assertThrows(
                com.lichsuvn.backend.common.exception.ApiException.class,
                () -> service.findUser("00000000-0000-0000-0000-000000000099"));
        assertEquals("ADMIN_USER_NOT_FOUND", error.getCode());
        assertEquals(404, error.getStatus().value());
    }

    private static AdminUserDtos.Page users(
            String query, String role, String status, String verified,
            String sortBy, String sortDir, int limit, int offset
    ) {
        return service.findUsers(query, role, status, verified, sortBy, sortDir, limit, offset);
    }

    private static void assertRole(
            AdminUserDtos.Page page,
            String id,
            AdminUserDtos.Role primary,
            List<AdminUserDtos.Role> roles
    ) {
        AdminUserDtos.ListItem item = page.items().stream()
                .filter(candidate -> candidate.id().equals(id)).findFirst().orElseThrow();
        assertEquals(primary, item.primaryRole());
        assertEquals(roles, item.roles());
    }

    private static void seed() {
        jdbc.update("""
                INSERT INTO users(
                  id,email,password_hash,full_name,grade,school,avatar_url,status,
                  email_verified_at,failed_login_count,locked_until,created_at,updated_at)
                VALUES
                  (UUID_TO_BIN(?),'student@example.test','hash','Percent%Name','10',NULL,NULL,
                   'active','2026-01-01 08:00:00',0,NULL,'2026-01-01 08:00:00','2026-01-01 08:00:00'),
                  (UUID_TO_BIN(?),'teacher@example.test','hash','Teacher',NULL,NULL,
                   'https://cdn.example.test/teacher.png','active','2026-01-01 08:00:00',0,NULL,
                   '2026-01-01 08:00:00','2026-01-01 08:00:00'),
                  (UUID_TO_BIN(?),'admin@example.test','hash','Admin',NULL,NULL,NULL,'active',
                   '2026-01-01 08:00:00',0,NULL,'2026-01-01 08:00:00','2026-01-01 08:00:00'),
                  (UUID_TO_BIN(?),'multi@example.test','PASSWORD_SENTINEL_PHASE9','Multi Role','other',
                   'Phase 9 School','local:private-avatar','active','2026-01-02 08:00:00',7,
                   '2026-12-31 08:00:00','2026-01-01 08:00:00','2026-01-01 08:00:00'),
                  (UUID_TO_BIN(?),'norole@example.test','hash','No Role',NULL,NULL,NULL,'pending',NULL,
                   0,NULL,'2026-01-01 08:00:00','2026-01-01 08:00:00'),
                  (UUID_TO_BIN(?),'deleted@example.test','hash','Deleted',NULL,NULL,NULL,'deleted',NULL,
                   0,NULL,'2026-01-01 08:00:00','2026-01-01 08:00:00')
                """, STUDENT, TEACHER, ADMIN, MULTI, NO_ROLE, DELETED);
        jdbc.update("""
                INSERT INTO user_roles(user_id,role_id)
                SELECT UUID_TO_BIN(?),id FROM roles WHERE code='student'
                """, STUDENT);
        jdbc.update("""
                INSERT INTO user_roles(user_id,role_id)
                SELECT UUID_TO_BIN(?),id FROM roles WHERE code='teacher'
                """, TEACHER);
        jdbc.update("""
                INSERT INTO user_roles(user_id,role_id)
                SELECT UUID_TO_BIN(?),id FROM roles WHERE code='admin'
                """, ADMIN);
        for (String role : List.of("student", "teacher", "admin")) {
            jdbc.update("""
                    INSERT INTO user_roles(user_id,role_id)
                    SELECT UUID_TO_BIN(?),id FROM roles WHERE code=?
                    """, MULTI, role);
        }
        jdbc.update("""
                INSERT INTO user_roles(user_id,role_id)
                SELECT UUID_TO_BIN(?),id FROM roles WHERE code='student'
                """, DELETED);
        jdbc.update("UPDATE users SET full_name=? WHERE id=UUID_TO_BIN(?)", "Slash\\Name", NO_ROLE);

        jdbc.update("""
                INSERT INTO historical_events(
                  id,slug,title,event_level,event_type,start_year,effective_end_year,geo_type,
                  province_names,historical_locations,card_summary,canonical_summary,
                  detailed_narrative,significance,key_facts,raw_json,status)
                VALUES('phase9-event','phase9-event','Phase 9 Event','atomic','political',1945,1945,
                  'no_location',JSON_ARRAY(),JSON_ARRAY(),'Card','Canonical','Narrative',
                  'Significance',JSON_ARRAY('Fact'),JSON_OBJECT(),'published')
                """);
        jdbc.update("""
                INSERT INTO event_view_logs(user_id,event_id,viewed_at,duration_seconds,created_date)
                VALUES(UUID_TO_BIN(?),'phase9-event','2026-07-20 10:00:00',420,'2026-07-20')
                """, MULTI);
        jdbc.update("""
                INSERT INTO learning_progress(
                  user_id,scope_type,scope_id,events_viewed,total_minutes,last_activity_at)
                VALUES(UUID_TO_BIN(?),'overall','',3,7,'2026-07-20 10:00:00')
                """, MULTI);
        insertQuiz("10000000-0000-0000-0000-000000000001", "8.12", "2026-07-21 10:00:00");
        insertQuiz("10000000-0000-0000-0000-000000000002", "8.13", "2026-07-22 10:00:00");
        insertExam("20000000-0000-0000-0000-000000000001", "session-1", "9.99",
                "2026-07-23 10:00:00");
        insertExam("20000000-0000-0000-0000-000000000002", "session-2", "10.00",
                "2026-07-24 10:00:00");

        jdbc.update("""
                INSERT INTO auth_email_tokens(user_id,token_hash,token_type,expires_at)
                VALUES(UUID_TO_BIN(?),'EMAIL_TOKEN_SENTINEL_PHASE9','password_reset','2027-01-01')
                """, MULTI);
        jdbc.update("""
                INSERT INTO user_social_providers(
                  user_id,provider,provider_id,email,display_name,avatar_url)
                VALUES(UUID_TO_BIN(?),'google','PROVIDER_ID_SENTINEL_PHASE9',
                  'PROVIDER_EMAIL_SENTINEL_PHASE9','Provider Snapshot','https://provider.test/avatar')
                """, MULTI);
        jdbc.update("""
                INSERT INTO admin_audit_logs(
                  user_id,action,entity_type,entity_id,before_json,after_json,ip_address,created_at)
                VALUES
                  (UUID_TO_BIN(?),'user.status_updated','user',?,
                   JSON_OBJECT('secret','BEFORE_SENTINEL_PHASE9'),
                   JSON_OBJECT('secret','AFTER_SENTINEL_PHASE9'),'198.51.100.77','2026-07-21 10:00:00'),
                  (UUID_TO_BIN(?),'event.updated','historical_event','phase9-event',
                   JSON_OBJECT(),JSON_OBJECT(),NULL,'2026-07-22 10:00:00'),
                  (UUID_TO_BIN(?),'user.role_updated','user',?,
                   JSON_OBJECT(),JSON_OBJECT(),NULL,'2026-07-23 10:00:00')
                """, ADMIN, MULTI, MULTI, MULTI, MULTI);
    }

    private static void insertQuiz(String id, String score, String submittedAt) {
        jdbc.update("""
                INSERT INTO quiz_attempts(
                  id,user_id,source,status,config_json,questions_json,total_questions,
                  score10,started_at,submitted_at)
                VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),'mock','submitted',
                  JSON_OBJECT('secret','QUIZ_CONFIG_SENTINEL_PHASE9'),
                  JSON_ARRAY(JSON_OBJECT('secret','QUIZ_QUESTIONS_SENTINEL_PHASE9')),
                  10,?,DATE_SUB(?,INTERVAL 5 MINUTE),?)
                """, id, MULTI, new BigDecimal(score), submittedAt, submittedAt);
    }

    private static void insertExam(String id, String session, String score, String submittedAt) {
        jdbc.update("""
                INSERT INTO exam_v2_attempts(
                  id,user_id,session_id,mode,title,is_custom,result_json,total_questions,
                  total_score,submitted_at,answers_json,config_json)
                VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),?,'practice','Phase 9 Exam',FALSE,
                  '{"secret":"EXAM_RESULT_SENTINEL_PHASE9"}',40,?,?,
                  '{"secret":"EXAM_ANSWERS_SENTINEL_PHASE9"}',
                  '{"secret":"EXAM_CONFIG_SENTINEL_PHASE9"}')
                """, id, MULTI, session, new BigDecimal(score), submittedAt);
    }
}
