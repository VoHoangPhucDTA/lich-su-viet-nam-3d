package com.lichsuvn.backend.progress.api.dto;

import java.time.Instant;

public record EventProgressResponse(
        String eventId,
        Integer progressPercent,
        Instant viewedAt
) {
}
