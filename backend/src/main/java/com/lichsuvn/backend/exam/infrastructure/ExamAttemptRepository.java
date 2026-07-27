package com.lichsuvn.backend.exam.infrastructure;

import com.lichsuvn.backend.exam.domain.ExamAttemptEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ExamAttemptRepository extends JpaRepository<ExamAttemptEntity, byte[]> {
    Optional<ExamAttemptEntity> findByUserIdAndSessionId(byte[] userId, String sessionId);

    @Query("""
            SELECT a.sessionId AS sessionId, a.mode AS mode, a.examId AS examId, a.title AS title,
                   a.custom AS custom, a.totalQuestions AS totalQuestions, a.totalScore AS totalScore,
                   a.mcqScore AS mcqScore, a.tfScore AS tfScore, a.durationSeconds AS durationSeconds,
                   a.submittedAt AS submittedAt, a.scoreAuthority AS scoreAuthority,
                   a.timingAuthority AS timingAuthority, a.submissionOrigin AS submissionOrigin,
                   a.createdAt AS createdAt, a.updatedAt AS updatedAt
            FROM ExamAttemptEntity a
            WHERE a.userId = :userId
            ORDER BY a.submittedAt DESC, a.createdAt DESC
            """)
    List<ExamAttemptSummaryView> findSummariesByUserId(@Param("userId") byte[] userId, Pageable pageable);

    @Query("""
            SELECT COUNT(a)
            FROM ExamAttemptEntity a
            WHERE a.userId = :userId
              AND a.mode IN :modes
              AND (:fromInclusive IS NULL OR a.submittedAt >= :fromInclusive)
              AND a.submittedAt < :toExclusive
            """)
    long countDashboardAttempts(
            @Param("userId") byte[] userId,
            @Param("modes") List<String> modes,
            @Param("fromInclusive") Instant fromInclusive,
            @Param("toExclusive") Instant toExclusive
    );

    @Query("""
            SELECT COUNT(a)
            FROM ExamAttemptEntity a
            WHERE a.userId = :userId
              AND a.mode NOT IN :modes
              AND (:fromInclusive IS NULL OR a.submittedAt >= :fromInclusive)
              AND a.submittedAt < :toExclusive
            """)
    long countDashboardExcludedModes(
            @Param("userId") byte[] userId,
            @Param("modes") List<String> modes,
            @Param("fromInclusive") Instant fromInclusive,
            @Param("toExclusive") Instant toExclusive
    );

    @Query("""
            SELECT COUNT(a) AS total,
                   MAX(a.submittedAt) AS lastSubmittedAt,
                   MAX(a.updatedAt) AS lastUpdatedAt
            FROM ExamAttemptEntity a
            WHERE a.userId = :userId
              AND a.mode IN :modes
            """)
    DashboardVersionView findDashboardVersion(
            @Param("userId") byte[] userId,
            @Param("modes") List<String> modes
    );

    @Query("""
            SELECT a.sessionId AS sessionId, a.mode AS mode, a.title AS title,
                   a.totalScore AS totalScore, a.mcqScore AS mcqScore, a.tfScore AS tfScore,
                   a.totalQuestions AS totalQuestions, a.durationSeconds AS durationSeconds,
                   a.submittedAt AS submittedAt, a.createdAt AS createdAt,
                   a.snapshotSchemaVersion AS snapshotSchemaVersion,
                   a.scoreAuthority AS scoreAuthority, a.timingAuthority AS timingAuthority,
                   a.submissionOrigin AS submissionOrigin, a.scoringVersion AS scoringVersion,
                   a.datasetVersion AS datasetVersion, a.examContentHash AS examContentHash,
                   a.resultJson AS resultJson
            FROM ExamAttemptEntity a
            WHERE a.userId = :userId
              AND a.mode IN :modes
              AND (:fromInclusive IS NULL OR a.submittedAt >= :fromInclusive)
              AND a.submittedAt < :toExclusive
            ORDER BY a.submittedAt DESC, a.createdAt DESC
            """)
    List<DashboardAttemptView> findDashboardAttempts(
            @Param("userId") byte[] userId,
            @Param("modes") List<String> modes,
            @Param("fromInclusive") Instant fromInclusive,
            @Param("toExclusive") Instant toExclusive,
            Pageable pageable
    );

    interface ExamAttemptSummaryView {
        String getSessionId();
        String getMode();
        String getExamId();
        String getTitle();
        boolean getCustom();
        int getTotalQuestions();
        BigDecimal getTotalScore();
        BigDecimal getMcqScore();
        BigDecimal getTfScore();
        Integer getDurationSeconds();
        Instant getSubmittedAt();
        String getScoreAuthority();
        String getTimingAuthority();
        String getSubmissionOrigin();
        Instant getCreatedAt();
        Instant getUpdatedAt();
    }

    interface DashboardAttemptView {
        String getSessionId();
        String getMode();
        String getTitle();
        BigDecimal getTotalScore();
        BigDecimal getMcqScore();
        BigDecimal getTfScore();
        int getTotalQuestions();
        Integer getDurationSeconds();
        Instant getSubmittedAt();
        Instant getCreatedAt();
        Integer getSnapshotSchemaVersion();
        String getScoreAuthority();
        String getTimingAuthority();
        String getSubmissionOrigin();
        String getScoringVersion();
        String getDatasetVersion();
        String getExamContentHash();
        String getResultJson();
    }

    interface DashboardVersionView {
        long getTotal();
        Instant getLastSubmittedAt();
        Instant getLastUpdatedAt();
    }
}
