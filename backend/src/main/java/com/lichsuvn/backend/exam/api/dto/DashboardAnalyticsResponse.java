package com.lichsuvn.backend.exam.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Versioned wire DTO shared semantically with DashboardAnalyticsResponseV1.
 * It intentionally contains aggregate facts only, never persisted result JSON
 * or reviewed-question/answer snapshots.
 */
public record DashboardAnalyticsResponse(
        int schemaVersion,
        Instant generatedAt,
        Scope scope,
        Summary summary,
        List<TrendPoint> trend,
        List<TopicAnalytics> topics,
        List<CognitiveAnalytics> cognitiveLevels,
        List<QuestionTypeAnalytics> questionTypes,
        List<RecentAttempt> recentAttempts,
        Coverage coverage,
        AuthorityBreakdown authorityBreakdown,
        Diagnostics diagnostics
) {
    public record Scope(
            String range,
            String timezone,
            LocalDate fromDate,
            LocalDate toDateExclusive,
            List<String> attemptModes,
            String policyVersion
    ) {}

    public record Summary(
            long totalAttempts,
            long officialAttemptCount,
            long recoveredAttemptCount,
            long legacyAttemptCount,
            Double averageScore,
            Double highestScore,
            Double latestScore,
            long totalDurationSeconds,
            long activeDays,
            Double mcqAccuracy,
            Double tfStatementAccuracy,
            Double blankRate,
            Double tfPartialRate
    ) {}

    public record TrendPoint(
            String attemptId,
            Instant submittedAt,
            double score,
            String mode,
            String title
    ) {}

    public record TopicAnalytics(
            String topicKey,
            String topicLabel,
            double accuracy,
            long correctUnits,
            long totalUnits,
            long attemptCount,
            String confidence,
            String status
    ) {}

    public record CognitiveAnalytics(
            String level,
            Double accuracy,
            long correctUnits,
            long totalUnits,
            long attemptCount,
            String confidence,
            String status
    ) {}

    public record QuestionTypeAnalytics(
            String type,
            Double accuracy,
            long correctUnits,
            long answeredUnits,
            long blankUnits,
            long totalUnits,
            long partialQuestionCount,
            long totalQuestionCount
    ) {}

    public record RecentAttempt(
            String attemptId,
            String title,
            String mode,
            double score,
            int durationSeconds,
            Instant submittedAt,
            int totalQuestions,
            String detailStatus,
            String scoreAuthority,
            String timingAuthority,
            String submissionOrigin
    ) {}

    public record Coverage(
            long totalKnownAttempts,
            long fetchedAttemptCount,
            long summaryAttemptCount,
            long detailedAttemptCount,
            long unsupportedSnapshotCount,
            long malformedDetailCount,
            long legacySummaryCount,
            int fetchLimit,
            boolean isComplete
    ) {}

    public record AuthorityBreakdown(
            long backendOnTime,
            long backendLate,
            long backendFallback,
            long frontendLegacy
    ) {}

    public record Diagnostics(
            Map<String, Long> snapshotVersionCounts,
            long excludedModeCount,
            long excludedInvalidSummaryCount
    ) {}
}
