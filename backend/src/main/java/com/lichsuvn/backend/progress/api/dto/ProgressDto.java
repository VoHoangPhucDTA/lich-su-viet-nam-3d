package com.lichsuvn.backend.progress.api.dto;

import java.time.Instant;
import java.util.List;

public record ProgressDto(
        Integer eventsViewed,
        Integer totalMinutes,
        Instant lastActivityAt,
        List<RecentEventViewDto> recentEvents
) {
}
