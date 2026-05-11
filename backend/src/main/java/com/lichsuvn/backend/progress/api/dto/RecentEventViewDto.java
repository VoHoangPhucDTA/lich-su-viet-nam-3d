package com.lichsuvn.backend.progress.api.dto;

import java.time.Instant;

public record RecentEventViewDto(
        String eventId,
        String slug,
        String title,
        String displayDate,
        Instant viewedAt
) {
}
