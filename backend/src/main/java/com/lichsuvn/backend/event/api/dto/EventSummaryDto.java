package com.lichsuvn.backend.event.api.dto;

import java.math.BigDecimal;
import java.util.List;

public record EventSummaryDto(
        String id,
        String slug,
        String title,
        String shortTitle,
        String eventLevel,
        String eventType,
        String eventSubtype,
        Integer startYear,
        Integer endYear,
        String displayDate,
        String geoType,
        BigDecimal lat,
        BigDecimal lng,
        List<String> provinceNames,
        String parentId,
        String rootId,
        Integer level,
        Integer orderInParent,
        String cardSummary,
        Boolean featured,
        Integer childCount
) {
}
