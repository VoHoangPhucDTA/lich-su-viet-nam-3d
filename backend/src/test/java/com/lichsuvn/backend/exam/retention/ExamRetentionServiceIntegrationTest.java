package com.lichsuvn.backend.exam.retention;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ExamRetentionServiceIntegrationTest {
    private JdbcDataSource dataSource;
    private NamedParameterJdbcTemplate jdbc;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = ExamH2TestDatabase.create();
        jdbc = new NamedParameterJdbcTemplate(dataSource);
        jdbc.getJdbcTemplate().update("""
                INSERT INTO exam_datasets
                (id,aggregate_hash,build_id,status,hash_schema_version,build_algorithm_version,source_count,build_metadata_json)
                VALUES (?,?,?,'ACTIVE',1,1,0,'{}')
                """, bytes(), "1".repeat(64), "retention-fixture");
    }

    @Test
    void dryRunDoesNotDeleteAndApplyRequiresExplicitEnablement() {
        insertOldAnonymousSession("old-anonymous", "IN_PROGRESS");
        ExamRetentionService disabled = service(false);
        var preview = disabled.preview();
        assertEquals(1, preview.sessionCandidates());
        assertEquals(0, preview.sessionsDeleted());
        assertEquals(1, count("exam_sessions"));
        assertThrows(IllegalStateException.class, () -> disabled.run(true, 100));

        var applied = service(true).run(true, 100);
        assertEquals(1, applied.sessionsDeleted());
        assertEquals(0, count("exam_sessions"));
    }

    @Test
    void retryableReceiptProtectsSessionAndAttemptsAreNeverRetentionTargets() {
        insertOldAnonymousSession("protected-session", "IN_PROGRESS");
        byte[] sessionId = jdbc.getJdbcTemplate().queryForObject(
                "SELECT id FROM exam_sessions WHERE public_session_id='protected-session'", (resultSet, row) -> resultSet.getBytes(1));
        jdbc.getJdbcTemplate().update("""
                INSERT INTO exam_submission_receipts
                (id,session_id,client_submission_id,submission_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'FAILED_RETRYABLE',?,?)
                """, bytes(), sessionId, "retention-retryable", "a".repeat(64), old(), old());

        var report = service(true).run(true, 100);
        assertEquals(0, report.sessionsDeleted());
        assertEquals(1, count("exam_sessions"));
        assertEquals(1, count("exam_submission_receipts"));
    }

    @Test
    void submittedSessionCleanupKeepsImmutableAttemptSnapshot() {
        byte[] userId = bytes();
        byte[] sessionId = bytes();
        byte[] datasetId = jdbc.getJdbcTemplate().queryForObject(
                "SELECT id FROM exam_datasets LIMIT 1", (resultSet, row) -> resultSet.getBytes(1));
        String datasetVersion = jdbc.getJdbcTemplate().queryForObject(
                "SELECT aggregate_hash FROM exam_datasets LIMIT 1", String.class);
        jdbc.getJdbcTemplate().update("INSERT INTO users(id) VALUES (?)", userId);
        jdbc.getJdbcTemplate().update("""
                INSERT INTO exam_sessions
                (id,public_session_id,user_id,source_dataset_id,dataset_version,mode,title,scoring_version,
                 started_at_server,submitted_at_server,submit_grace_seconds,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,10,'SUBMITTED',?,?)
                """, sessionId, "submitted-with-attempt", userId, datasetId, datasetVersion,
                "TIMED_ORIGINAL", "Old submitted", "test-v1", old(), old(), old(), old());
        jdbc.getJdbcTemplate().update("""
                INSERT INTO exam_v2_attempts
                (id,user_id,session_id,mode,title,is_custom,result_json,total_questions,total_score,
                 submitted_at,created_at,updated_at,snapshot_schema_version,score_authority,
                 timing_authority,submission_origin,scoring_version,dataset_version,exam_content_hash)
                VALUES (?,?,?,'TIMED_ORIGINAL','Immutable result',FALSE,'{}',28,5.00,?,?,?,2,
                        'BACKEND','SERVER','SERVER_ON_TIME','test-v1',?,?)
                """, bytes(), userId, "submitted-with-attempt", old(), old(), old(),
                datasetVersion, "b".repeat(64));

        var report = service(true).run(true, 100);

        assertEquals(1, report.sessionsDeleted());
        assertEquals(0, count("exam_sessions"));
        assertEquals(1, count("exam_v2_attempts"));
        assertEquals("{}", jdbc.getJdbcTemplate().queryForObject(
                "SELECT result_json FROM exam_v2_attempts", String.class));
    }

    private ExamRetentionService service(boolean enabled) {
        return new ExamRetentionService(jdbc, new DataSourceTransactionManager(dataSource), enabled, 100,
                7, 30, 30, 30, 365, 30, 365);
    }

    private void insertOldAnonymousSession(String publicId, String status) {
        byte[] datasetId = jdbc.getJdbcTemplate().queryForObject("SELECT id FROM exam_datasets LIMIT 1", (resultSet, row) -> resultSet.getBytes(1));
        String datasetVersion = jdbc.getJdbcTemplate().queryForObject("SELECT aggregate_hash FROM exam_datasets LIMIT 1", String.class);
        jdbc.getJdbcTemplate().update("""
                INSERT INTO exam_sessions
                (id,public_session_id,source_dataset_id,dataset_version,mode,title,scoring_version,started_at_server,
                 submit_grace_seconds,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,10,?,?,?)
                """, bytes(), publicId, datasetId, datasetVersion, "TIMED_ORIGINAL", "Old session", "test-v1", old(), status, old(), old());
    }

    private Instant old() {
        return Instant.now().minus(400, ChronoUnit.DAYS);
    }

    private int count(String table) {
        return jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private byte[] bytes() {
        return UuidBytes.fromUuid(UUID.randomUUID());
    }
}
