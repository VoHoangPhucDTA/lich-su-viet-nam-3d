package com.lichsuvn.backend.event.api.dto;

public record EventExternalSourceDto(
        String sourceType,
        String title,
        String canonicalUri,
        String externalId,
        String language,
        Integer sourceOrder,
        String matchType,
        Boolean primary,
        String verificationStatus,
        String notes
) {
}
