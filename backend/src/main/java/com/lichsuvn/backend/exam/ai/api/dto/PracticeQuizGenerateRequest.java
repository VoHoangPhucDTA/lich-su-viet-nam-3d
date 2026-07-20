package com.lichsuvn.backend.exam.ai.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PracticeQuizGenerateRequest(
        @NotBlank @Size(max = 1000) String query,
        @NotNull AiQuizDifficulty difficulty,
        @NotNull @Min(1) @Max(10) Integer count
) {
}
