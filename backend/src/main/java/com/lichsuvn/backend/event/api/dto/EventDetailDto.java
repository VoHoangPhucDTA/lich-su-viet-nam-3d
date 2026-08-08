package com.lichsuvn.backend.event.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record EventDetailDto(
        String id,
        String slug,
        String title,
        String shortTitle,
        String eventLevel,
        String eventType,
        String eventSubtype,
        Integer startYear,
        Integer endYear,
        Integer effectiveEndYear,
        String displayDate,
        String datePrecision,
        String geoType,
        BigDecimal lat,
        BigDecimal lng,
        List<String> provinceNames,
        List<String> historicalLocations,
        String parentId,
        String rootId,
        Integer level,
        Integer orderInParent,
        String cardSummary,
        String canonicalSummary,
        String detailedNarrative,
        String significance,
        List<String> keyFacts,
        Boolean showOnHomepage,
        Boolean showOnTimeline,
        Boolean featured,
        Integer childCount,
        String status,
        List<Integer> grades,
        List<EventTextbookRefDto> textbookRefs,
        List<EventExternalSourceDto> externalSources,
        List<EventMediaDto> media,
        List<EventRelationDto> relations,
        EventRelatedEventsDto relatedEvents,
        String textbookContent,
        Map<String, Object> mapData,
        @JsonIgnore Object sourceJson
) {
}
