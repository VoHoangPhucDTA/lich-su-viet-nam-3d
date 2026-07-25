package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.List;

/**
 * Internal projection shared by Admin list/detail and future Dashboard metrics.
 * Repositories produce facts; presentation DTOs never receive raw database JSON.
 */
public record EventCompletenessFacts(
        boolean titlePresent,
        boolean slugPresent,
        boolean cardSummaryPresent,
        boolean canonicalSummaryPresent,
        boolean detailedNarrativePresent,
        boolean significancePresent,
        JsonNode keyFacts,
        int activeThumbnailCount,
        int activeMediaCount,
        String normalizedGeoType,
        BigDecimal lat,
        BigDecimal lng,
        List<String> provinceNames,
        List<String> historicalLocations,
        boolean mapDataPresent,
        boolean mapDataObject,
        JsonNode sanitizedMapData,
        Integer startYear,
        Integer endYear,
        Integer effectiveEndYear,
        String eventLevel,
        String eventType,
        List<Integer> grades
) {
    /** Compatibility constructor for existing Phase 3/4 tests and callers. */
    public EventCompletenessFacts(
            boolean titlePresent, boolean slugPresent, boolean cardSummaryPresent,
            boolean canonicalSummaryPresent, boolean detailedNarrativePresent,
            boolean significancePresent, JsonNode keyFacts, boolean thumbnailPresent,
            int activeMediaCount, String normalizedGeoType, BigDecimal lat, BigDecimal lng,
            List<String> provinceNames, List<String> historicalLocations,
            boolean mapDataPresent, boolean mapDataObject, JsonNode sanitizedMapData,
            Integer startYear, Integer endYear, Integer effectiveEndYear,
            String eventLevel, String eventType, List<Integer> grades
    ) {
        this(titlePresent, slugPresent, cardSummaryPresent, canonicalSummaryPresent,
                detailedNarrativePresent, significancePresent, keyFacts,
                thumbnailPresent ? 1 : 0, activeMediaCount, normalizedGeoType, lat, lng,
                provinceNames, historicalLocations, mapDataPresent, mapDataObject,
                sanitizedMapData, startYear, endYear, effectiveEndYear,
                eventLevel, eventType, grades);
    }

    public EventCompletenessFacts withGrades(List<Integer> values) {
        return new EventCompletenessFacts(
                titlePresent, slugPresent, cardSummaryPresent, canonicalSummaryPresent,
                detailedNarrativePresent, significancePresent, keyFacts, activeThumbnailCount,
                activeMediaCount, normalizedGeoType, lat, lng, provinceNames,
                historicalLocations, mapDataPresent, mapDataObject, sanitizedMapData,
                startYear, endYear, effectiveEndYear, eventLevel, eventType, values
        );
    }
}
