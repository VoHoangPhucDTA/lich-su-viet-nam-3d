package com.lichsuvn.backend.exam.application.model;

import java.math.BigDecimal;
import java.time.Instant;

/** Bounded, owner-scoped database projection used by dashboard analytics. */
public record DashboardAttemptRecord(
        String sessionId,
        String mode,
        String title,
        BigDecimal totalScore,
        BigDecimal mcqScore,
        BigDecimal tfScore,
        int totalQuestions,
        Integer durationSeconds,
        Instant submittedAt,
        Instant createdAt,
        Integer snapshotSchemaVersion,
        String scoreAuthority,
        String timingAuthority,
        String submissionOrigin,
        String scoringVersion,
        String datasetVersion,
        String examContentHash,
        String resultJson
) {}
