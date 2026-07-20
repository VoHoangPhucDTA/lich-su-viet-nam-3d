package com.lichsuvn.backend.exam.ai.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record AiQuizGenerateRequest(
        @NotBlank @Size(max = 1000) String query,
        @NotNull Integer grade,
        @Positive Integer lessonNumber,
        @Pattern(regexp = ".*\\S.*", message = "documentId must not be blank")
        @Size(max = 255) String documentId,
        @NotNull AiQuizDifficulty difficulty,
        @Min(1) @Max(10) Integer count,
        @Min(1) @Max(10) Integer topK
) {
    @AssertTrue(message = "grade must be 10, 11, or 12")
    @JsonIgnore
    public boolean isGradeSupported() {
        return grade == null || grade == 10 || grade == 11 || grade == 12;
    }
}
