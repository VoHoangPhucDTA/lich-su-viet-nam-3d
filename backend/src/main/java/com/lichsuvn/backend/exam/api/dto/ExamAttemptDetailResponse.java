package com.lichsuvn.backend.exam.api.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;

public record ExamAttemptDetailResponse(
        String sessionId,
        String mode,
        String examId,
        String title,
        boolean isCustom,
        JsonNode sourceExamIds,
        JsonNode questionRefs,
        JsonNode questionSnapshots,
        JsonNode answers,
        JsonNode config,
        JsonNode result,
        int totalQuestions,
        BigDecimal totalScore,
        BigDecimal mcqScore,
        BigDecimal tfScore,
        Integer durationSeconds,
        long submittedAt,
        Instant createdAt,
        Instant updatedAt
) {
}
