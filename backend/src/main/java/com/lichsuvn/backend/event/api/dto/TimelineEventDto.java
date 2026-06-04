package com.lichsuvn.backend.event.api.dto;

public record TimelineEventDto(
        String id,
        String slug,
        String title,
        String shortTitle,
        String eventType,
        Integer startYear,
        Integer endYear,
        String displayDate,
        String parentId,
        Integer level,
        Boolean featured
) {
}
