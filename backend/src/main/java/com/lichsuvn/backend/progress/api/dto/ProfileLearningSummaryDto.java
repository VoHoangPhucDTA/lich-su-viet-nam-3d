package com.lichsuvn.backend.progress.api.dto;

import java.time.Instant;

public record ProfileLearningSummaryDto(
        int schemaVersion,
        Instant generatedAt,
        String timezone,
        long eventsViewed,
        long quizzesCompleted,
        long totalMinutes,
        int streakDays
) {
}
