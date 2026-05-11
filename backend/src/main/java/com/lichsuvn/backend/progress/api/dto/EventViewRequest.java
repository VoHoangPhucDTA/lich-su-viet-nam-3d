package com.lichsuvn.backend.progress.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record EventViewRequest(
        @Min(0) Integer durationSeconds,
        @Min(0) @Max(100) Integer progressPercent,
        String source
) {
}
