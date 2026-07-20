package com.lichsuvn.backend.exam.catalog.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CustomExamPreviewRequest(
        @NotNull @Min(1) @Max(100) Integer questionCount,
        String questionType,
        String difficulty,
        String cognitiveLevel,
        String scopeType,
        String scopeSlug
) {
}
