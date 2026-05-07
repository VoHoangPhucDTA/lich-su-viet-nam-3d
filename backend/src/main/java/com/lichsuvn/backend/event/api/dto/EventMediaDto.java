package com.lichsuvn.backend.event.api.dto;

public record EventMediaDto(
        Long id,
        String mediaType,
        String url,
        String caption,
        String altText,
        String sourceName,
        String license,
        String storageType,
        Boolean thumbnail,
        Integer sortOrder
) {
}
