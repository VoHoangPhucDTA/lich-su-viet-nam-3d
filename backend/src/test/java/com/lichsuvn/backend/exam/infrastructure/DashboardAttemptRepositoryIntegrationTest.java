package com.lichsuvn.backend.exam.infrastructure;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:dashboard-analytics-repository;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.hikari.connection-init-sql=",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret=test-only-secret-that-is-long-enough-for-hmac-signing"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DashboardAttemptRepositoryIntegrationTest {
    private static final List<String> MODES = List.of("TIMED_ORIGINAL", "CUSTOM_MOCK");

    @Autowired DataSource dataSource;
    @Autowired ExamAttemptRepository repository;
    @Autowired jakarta.persistence.EntityManagerFactory entityManagerFactory;

    private JdbcTemplate jdbc;
    private byte[] owner;
    private byte[] other;

    @BeforeAll
    void createSchema() throws Exception {
        ExamH2TestDatabase.applyGoal2Schema(dataSource);
        jdbc = new JdbcTemplate(dataSource);
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM exam_v2_attempts");
        jdbc.update("DELETE FROM users");
        owner = UuidBytes.fromUuid(UUID.randomUUID());
        other = UuidBytes.fromUuid(UUID.randomUUID());
        jdbc.update("INSERT INTO users(id,status) VALUES (?,'active'),(?,'active')", owner, other);

        insert(owner, "newer", "TIMED_ORIGINAL", "2026-07-20T03:00:00Z", "2026-07-20T03:01:00Z");
        insert(owner, "tie-older", "CUSTOM_MOCK", "2026-07-20T03:00:00Z", "2026-07-20T03:00:00Z");
        insert(owner, "lower-bound", "TIMED_ORIGINAL", "2026-07-01T17:00:00Z", "2026-07-01T17:00:00Z");
        insert(owner, "upper-bound", "TIMED_ORIGINAL", "2026-07-21T17:00:00Z", "2026-07-21T17:00:00Z");
        insert(owner, "practice", "FREE_PRACTICE", "2026-07-19T03:00:00Z", "2026-07-19T03:00:00Z");
        insert(other, "other-user", "TIMED_ORIGINAL", "2026-07-19T03:00:00Z", "2026-07-19T03:00:00Z");
    }

    @Test
    void scopesOwnerModesRangeOrderingCountsAndProjectionLimitInThreeQueries() {
        Instant from = Instant.parse("2026-07-01T17:00:00Z");
        Instant to = Instant.parse("2026-07-21T17:00:00Z");
        SessionFactory sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        sessionFactory.getStatistics().clear();

        long included = repository.countDashboardAttempts(owner, MODES, from, to);
        long excluded = repository.countDashboardExcludedModes(owner, MODES, from, to);
        var rows = repository.findDashboardAttempts(owner, MODES, from, to, PageRequest.of(0, 2));

        assertEquals(3, included, "inclusive lower and exclusive upper boundary");
        assertEquals(1, excluded);
        assertEquals(2, rows.size(), "projection is bounded by pageable");
        assertEquals("newer", rows.get(0).getSessionId());
        assertEquals("tie-older", rows.get(1).getSessionId(), "createdAt is deterministic tie-break");
        assertEquals(3, sessionFactory.getStatistics().getPrepareStatementCount(), "no per-attempt N+1 query");
    }

    @Test
    void allRangeUsesNullLowerBoundWithoutLeakingAnotherOwner() {
        assertEquals(
                4,
                repository.countDashboardAttempts(
                        owner,
                        MODES,
                        null,
                        Instant.parse("2026-07-22T17:00:00Z")
                )
        );
        var rows = repository.findDashboardAttempts(
                owner,
                MODES,
                null,
                Instant.parse("2026-07-22T17:00:00Z"),
                PageRequest.of(0, 10)
        );
        assertEquals(4, rows.size());
        assertEquals("upper-bound", rows.getFirst().getSessionId());
    }

    @Test
    void dashboardVersionTracksOwnerIncludedModesAndLatestMutation() {
        var version = repository.findDashboardVersion(owner, MODES);
        assertEquals(4, version.getTotal());
        assertEquals(Instant.parse("2026-07-21T17:00:00Z"), version.getLastSubmittedAt());
        assertEquals(Instant.parse("2026-07-21T17:00:00Z"), version.getLastUpdatedAt());
    }

    private void insert(byte[] userId, String sessionId, String mode, String submitted, String created) {
        jdbc.update("""
                INSERT INTO exam_v2_attempts (
                    id,user_id,session_id,mode,title,is_custom,result_json,
                    snapshot_schema_version,score_authority,timing_authority,submission_origin,
                    scoring_version,dataset_version,exam_content_hash,total_questions,total_score,
                    duration_seconds,submitted_at,created_at,updated_at
                ) VALUES (?,?,?,?,?,false,'{}',2,'BACKEND','SERVER','SERVER_ON_TIME',
                          'v1','dataset','hash',1,5,60,?,?,?)
                """,
                UuidBytes.fromUuid(UUID.randomUUID()),
                userId,
                sessionId,
                mode,
                sessionId,
                Timestamp.from(Instant.parse(submitted)),
                Timestamp.from(Instant.parse(created)),
                Timestamp.from(Instant.parse(created))
        );
    }
}
