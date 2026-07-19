package com.lichsuvn.backend.exam.retention;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Explicit, disabled-by-default retention maintenance. Superseded datasets are
 * reported only because browser recovery queues are not visible to the backend.
 */
@Service
public class ExamRetentionService {
    private static final Logger log = LoggerFactory.getLogger(ExamRetentionService.class);
    private static final int MAX_BATCH_LIMIT = 1_000;

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final boolean enabled;
    private final int defaultBatchLimit;
    private final RetentionDays days;

    public ExamRetentionService(
            NamedParameterJdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            @Value("${exam.retention.enabled:false}") boolean enabled,
            @Value("${exam.retention.batch-limit:100}") int defaultBatchLimit,
            @Value("${exam.retention.anonymous-in-progress-days:7}") int anonymousInProgressDays,
            @Value("${exam.retention.anonymous-submitted-days:30}") int anonymousSubmittedDays,
            @Value("${exam.retention.authenticated-in-progress-days:30}") int authenticatedInProgressDays,
            @Value("${exam.retention.completed-practice-days:30}") int completedPracticeDays,
            @Value("${exam.retention.authenticated-submitted-days:365}") int authenticatedSubmittedDays,
            @Value("${exam.retention.failed-receipt-days:30}") int failedReceiptDays,
            @Value("${exam.retention.superseded-dataset-days:365}") int supersededDatasetDays
    ) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.enabled = enabled;
        this.defaultBatchLimit = clamp(defaultBatchLimit);
        this.days = new RetentionDays(
                positive(anonymousInProgressDays), positive(anonymousSubmittedDays),
                positive(authenticatedInProgressDays), positive(completedPracticeDays),
                positive(authenticatedSubmittedDays), positive(failedReceiptDays),
                positive(supersededDatasetDays));
    }

    public RetentionReport preview() {
        return run(false, defaultBatchLimit);
    }

    public RetentionReport run(boolean apply, int requestedBatchLimit) {
        if (apply && !enabled) {
            throw new IllegalStateException("Exam retention apply is disabled");
        }
        int limit = clamp(requestedBatchLimit);
        RetentionReport report = transaction.execute(status -> execute(apply, limit));
        if (report == null) throw new IllegalStateException("Exam retention transaction returned no report");
        log.info("Exam retention apply={} sessionCandidates={} sessionsDeleted={} receiptCandidates={} receiptsDeleted={} datasetsDeferred={}",
                apply, report.sessionCandidates(), report.sessionsDeleted(), report.receiptCandidates(), report.receiptsDeleted(), report.supersededDatasetsDeferred());
        return report;
    }

    private RetentionReport execute(boolean apply, int limit) {
        Instant now = Instant.now();
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("anonymousInProgress", now.minus(days.anonymousInProgress(), ChronoUnit.DAYS))
                .addValue("anonymousSubmitted", now.minus(days.anonymousSubmitted(), ChronoUnit.DAYS))
                .addValue("authenticatedInProgress", now.minus(days.authenticatedInProgress(), ChronoUnit.DAYS))
                .addValue("completedPractice", now.minus(days.completedPractice(), ChronoUnit.DAYS))
                .addValue("authenticatedSubmitted", now.minus(days.authenticatedSubmitted(), ChronoUnit.DAYS))
                .addValue("failedReceipt", now.minus(days.failedReceipt(), ChronoUnit.DAYS))
                .addValue("supersededDataset", now.minus(days.supersededDataset(), ChronoUnit.DAYS))
                .addValue("limit", limit);

        List<byte[]> receiptIds = jdbc.query("""
                SELECT id FROM exam_submission_receipts
                WHERE status IN ('FAILED_PERMANENT','VERSION_MISMATCH','AUTH_MISMATCH','SUPERSEDED')
                  AND COALESCE(completed_at, updated_at) < :failedReceipt
                ORDER BY COALESCE(completed_at, updated_at), id
                LIMIT :limit
                """, parameters, (resultSet, row) -> resultSet.getBytes(1));

        List<byte[]> sessionIds = jdbc.query("""
                SELECT s.id FROM exam_sessions s
                WHERE (
                    (s.status IN ('EXPIRED','CANCELLED') AND s.updated_at < :anonymousInProgress)
                    OR (s.status='IN_PROGRESS' AND s.user_id IS NULL AND s.updated_at < :anonymousInProgress)
                    OR (s.status='IN_PROGRESS' AND s.user_id IS NOT NULL AND s.updated_at < :authenticatedInProgress)
                    OR (s.status='COMPLETED' AND s.mode IN ('FREE_PRACTICE','TOPIC_PRACTICE','RETRY_WRONG','CUSTOM_PRACTICE') AND COALESCE(s.completed_at,s.updated_at) < :completedPractice)
                    OR (s.status='SUBMITTED' AND s.user_id IS NULL AND COALESCE(s.submitted_at_server,s.updated_at) < :anonymousSubmitted)
                    OR (s.status='SUBMITTED' AND s.user_id IS NOT NULL AND COALESCE(s.submitted_at_server,s.updated_at) < :authenticatedSubmitted)
                )
                  AND NOT EXISTS (
                    SELECT 1 FROM exam_submission_receipts r
                    WHERE r.session_id=s.id AND r.status IN ('RECEIVED','PROCESSING','FAILED_RETRYABLE')
                  )
                ORDER BY s.updated_at, s.id
                LIMIT :limit
                """, parameters, (resultSet, row) -> resultSet.getBytes(1));

        Integer deferredDatasets = jdbc.queryForObject("""
                SELECT COUNT(*) FROM exam_datasets d
                WHERE d.status='SUPERSEDED'
                  AND COALESCE(d.promoted_at,d.created_at) < :supersededDataset
                  AND NOT EXISTS (SELECT 1 FROM exam_runtime_state r WHERE r.active_dataset_id=d.id)
                  AND NOT EXISTS (SELECT 1 FROM exam_sessions s WHERE s.source_dataset_id=d.id)
                """, parameters, Integer.class);

        int receiptsDeleted = 0;
        int sessionsDeleted = 0;
        if (apply) {
            for (byte[] id : receiptIds) {
                receiptsDeleted += jdbc.update("""
                        DELETE FROM exam_submission_receipts
                        WHERE id=:id
                          AND status IN ('FAILED_PERMANENT','VERSION_MISMATCH','AUTH_MISMATCH','SUPERSEDED')
                          AND COALESCE(completed_at, updated_at) < :failedReceipt
                        """, new MapSqlParameterSource(parameters.getValues()).addValue("id", id));
            }
            for (byte[] id : sessionIds) {
                sessionsDeleted += jdbc.update("""
                        DELETE FROM exam_sessions s
                        WHERE s.id=:id
                          AND (
                            (s.status IN ('EXPIRED','CANCELLED') AND s.updated_at < :anonymousInProgress)
                            OR (s.status='IN_PROGRESS' AND s.user_id IS NULL AND s.updated_at < :anonymousInProgress)
                            OR (s.status='IN_PROGRESS' AND s.user_id IS NOT NULL AND s.updated_at < :authenticatedInProgress)
                            OR (s.status='COMPLETED' AND s.mode IN ('FREE_PRACTICE','TOPIC_PRACTICE','RETRY_WRONG','CUSTOM_PRACTICE') AND COALESCE(s.completed_at,s.updated_at) < :completedPractice)
                            OR (s.status='SUBMITTED' AND s.user_id IS NULL AND COALESCE(s.submitted_at_server,s.updated_at) < :anonymousSubmitted)
                            OR (s.status='SUBMITTED' AND s.user_id IS NOT NULL AND COALESCE(s.submitted_at_server,s.updated_at) < :authenticatedSubmitted)
                          )
                          AND NOT EXISTS (
                            SELECT 1 FROM exam_submission_receipts r
                            WHERE r.session_id=s.id AND r.status IN ('RECEIVED','PROCESSING','FAILED_RETRYABLE')
                          )
                        """, new MapSqlParameterSource(parameters.getValues()).addValue("id", id));
            }
        }
        return new RetentionReport(apply, limit, sessionIds.size(), sessionsDeleted, receiptIds.size(), receiptsDeleted,
                deferredDatasets == null ? 0 : deferredDatasets);
    }

    private static int positive(int value) {
        if (value < 1) throw new IllegalArgumentException("Retention days must be positive");
        return value;
    }

    private static int clamp(int value) {
        return Math.max(1, Math.min(value, MAX_BATCH_LIMIT));
    }

    private record RetentionDays(int anonymousInProgress, int anonymousSubmitted,
                                 int authenticatedInProgress, int completedPractice,
                                 int authenticatedSubmitted, int failedReceipt,
                                 int supersededDataset) {
    }

    public record RetentionReport(boolean applied, int batchLimit, int sessionCandidates, int sessionsDeleted,
                                  int receiptCandidates, int receiptsDeleted, int supersededDatasetsDeferred) {
    }
}
