package com.lichsuvn.backend.exam.session.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Client supplies mode and filters only; the server fixes the question set. */
public record CreateExamSessionRequest(
        String mode,
        String examId,
        String expectedDatasetVersion,
        @Min(1) @Max(100) Integer questionCount,
        String questionType,
        String difficulty,
        String cognitiveLevel,
        String scopeType,
        String scopeSlug,
        String sourceAttemptId
) {
}
