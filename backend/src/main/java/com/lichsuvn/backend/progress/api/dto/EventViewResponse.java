package com.lichsuvn.backend.progress.api.dto;

public record EventViewResponse(
        String eventId,
        Integer eventsViewed,
        Integer totalMinutes
) {
}
