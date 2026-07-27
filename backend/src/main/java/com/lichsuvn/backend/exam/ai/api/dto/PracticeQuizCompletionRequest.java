package com.lichsuvn.backend.exam.ai.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PracticeQuizCompletionRequest(
        @NotBlank
        @Size(max = 80)
        @Pattern(regexp = "[A-Za-z0-9._:-]+")
        String clientSessionId,

        @NotBlank
        @Size(max = 255)
        String topic,

        @NotBlank
        @Pattern(regexp = "(?i)easy|medium|hard|mixed")
        String difficulty,

        @Min(1)
        @Max(10)
        int totalQuestions,

        @Min(0)
        @Max(86_400_000)
        int durationMs
) {
}
