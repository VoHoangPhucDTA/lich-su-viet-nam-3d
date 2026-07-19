package com.lichsuvn.backend.exam.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record ExamAttemptSummaryResponse(
        String sessionId,
        String mode,
        String examId,
        String title,
        boolean isCustom,
        int totalQuestions,
        BigDecimal totalScore,
        Integer durationSeconds,
        long submittedAt,
        String scoreAuthority,
        String timingAuthority,
        String submissionOrigin,
        Instant createdAt,
        Instant updatedAt
) {
}
