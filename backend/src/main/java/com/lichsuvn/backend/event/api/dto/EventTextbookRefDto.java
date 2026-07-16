package com.lichsuvn.backend.event.api.dto;

public record EventTextbookRefDto(
        Long id,
        Integer grade,
        String book,
        String theme,
        String lesson,
        Integer pageStart,
        Integer pageEnd,
        String excerpt,
        String url,
        String content,
        String sourceKey
) {
}
