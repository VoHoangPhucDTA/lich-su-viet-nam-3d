package com.lichsuvn.backend.event.api.dto;

public record EventRelatedEventDto(
        String id,
        String slug,
        String title,
        String shortTitle,
        String displayDate,
        String cardSummary,
        String eventType,
        String geoType,
        String thumbnailUrl,
        String associationType,
        String relationType,
        String relationLabel,
        Integer sortOrder
) {
}
