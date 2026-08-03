package com.lichsuvn.backend.event.api.dto;

import java.util.List;

/**
 * Public projection used exclusively by the homepage event cards.
 */
public record HomepageEventSummaryDto(
        String id,
        String slug,
        String title,
        Integer startYear,
        String eventType,
        List<String> provinceNames,
        String cardSummary
) {
    public HomepageEventSummaryDto {
        provinceNames = List.copyOf(provinceNames == null ? List.of() : provinceNames);
    }
}
