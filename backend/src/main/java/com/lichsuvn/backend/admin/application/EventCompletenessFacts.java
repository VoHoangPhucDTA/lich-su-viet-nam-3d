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
        boolean thumbnailPresent,
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
    public EventCompletenessFacts withGrades(List<Integer> values) {
        return new EventCompletenessFacts(
                titlePresent, slugPresent, cardSummaryPresent, canonicalSummaryPresent,
                detailedNarrativePresent, significancePresent, keyFacts, thumbnailPresent,
                activeMediaCount, normalizedGeoType, lat, lng, provinceNames,
                historicalLocations, mapDataPresent, mapDataObject, sanitizedMapData,
                startYear, endYear, effectiveEndYear, eventLevel, eventType, values
        );
    }
}
