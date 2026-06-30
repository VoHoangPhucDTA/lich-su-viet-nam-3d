package com.lichsuvn.backend.exam.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record ExamAttemptUpsertRequest(
        @NotBlank
        @Size(max = 120)
        String sessionId,

        @NotBlank
        @Size(max = 40)
        String mode,

        @Size(max = 255)
        String examId,

        @Size(max = 500)
        String title,

        Boolean isCustom,
        JsonNode sourceExamIds,
        JsonNode questionRefs,
        JsonNode questionSnapshots,
        JsonNode answers,
        JsonNode config,

        @NotNull
        JsonNode result,

        @NotNull
        @Min(1)
        Integer totalQuestions,

        @NotNull
        @DecimalMin("0.00")
        @DecimalMax("10.00")
        BigDecimal totalScore,

        @DecimalMin("0.00")
        BigDecimal mcqScore,

        @DecimalMin("0.00")
        BigDecimal tfScore,

        @Min(0)
        Integer durationSeconds,

        @NotNull
        @Min(0)
        Long submittedAt
) {
}
