package com.lichsuvn.backend.event.api.dto;

public record EventRelationDto(
        String relationType,
        EventSummaryDto event
) {
}
