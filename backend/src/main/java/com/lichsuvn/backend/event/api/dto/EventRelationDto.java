package com.lichsuvn.backend.event.api.dto;

public record EventRelationDto(
        String associationType,
        String relationType,
        String relationLabel,
        Integer sortOrder,
        EventSummaryDto event
) {
    public EventRelationDto(String relationType, EventSummaryDto event) {
        this(associationTypeFromRelationType(relationType), relationType, relationLabel(relationType), 0, event);
    }

    public static String associationTypeFromRelationType(String relationType) {
        return switch (relationType) {
            case "predecessor" -> "predecessor";
            case "successor" -> "successor";
            default -> "related";
        };
    }

    public static String relationLabel(String relationType) {
        return switch (relationType) {
            case "predecessor" -> "Sự kiện trước đó";
            case "successor" -> "Diễn biến tiếp theo";
            case "same_topic" -> "Cùng chủ đề";
            case "same_location" -> "Cùng địa điểm";
            case "related" -> "Liên quan";
            default -> "Liên quan";
        };
    }
}
