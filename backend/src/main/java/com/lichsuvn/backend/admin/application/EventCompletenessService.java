package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class EventCompletenessService {
    private static final Set<String> LEVELS = Set.of("atomic", "collection");
    private static final Set<String> TYPES = Set.of("military", "political", "economic", "cultural");
    private static final Set<String> CANONICAL_GEO_TYPES =
            Set.of("point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location");
    private static final Set<Integer> GRADES = Set.of(10, 11, 12);

    public Assessment assess(EventCompletenessFacts facts) {
        List<AdminEventDtos.CompletenessIssue> issues = new ArrayList<>();
        List<String> missingContent = new ArrayList<>();
        if (!facts.titlePresent()) missingContent.add("title");
        if (!facts.slugPresent()) missingContent.add("slug");
        if (!facts.cardSummaryPresent()) missingContent.add("cardSummary");
        if (!facts.canonicalSummaryPresent()) missingContent.add("canonicalSummary");
        if (!facts.detailedNarrativePresent()) missingContent.add("detailedNarrative");
        if (!facts.significancePresent()) missingContent.add("significance");

        JsonNode keyFacts = facts.keyFacts();
        boolean keyFactsMissing = keyFacts == null || keyFacts.isNull()
                || (keyFacts.isArray() && keyFacts.isEmpty());
        boolean keyFactsInvalid = !keyFactsMissing && (!keyFacts.isArray()
                || !allNonBlankStrings(keyFacts));
        if (keyFactsMissing) missingContent.add("keyFacts");
        if (!missingContent.isEmpty()) {
            add(issues, "MISSING_CORE_CONTENT", "CONTENT", "ERROR", missingContent);
        } else if (keyFactsInvalid) {
            add(issues, "INVALID_CORE_CONTENT", "CONTENT", "ERROR", List.of("keyFacts"));
        }

        if (facts.activeThumbnailCount() == 0) {
            add(issues, "MISSING_THUMBNAIL", "MEDIA", "WARNING", List.of("thumbnail"));
        } else if (facts.activeThumbnailCount() > 1) {
            add(issues, "INVALID_THUMBNAIL", "MEDIA", "ERROR", List.of("thumbnail"));
        }
        if (facts.activeMediaCount() < 1) {
            add(issues, "MISSING_ACTIVE_MEDIA", "MEDIA", "WARNING", List.of("media"));
        }

        String canonicalGeoType = canonicalGeoType(facts);
        GeographyState geography = geographyState(facts, canonicalGeoType);
        if (geography == GeographyState.MISSING) {
            add(issues, "MISSING_GEOGRAPHY", "GEOGRAPHY", "ERROR",
                    List.of("lat", "lng", "provinceNames", "historicalLocations"));
        } else if (geography == GeographyState.INVALID) {
            add(issues, "INVALID_GEOGRAPHY", "GEOGRAPHY", "ERROR",
                    List.of("geoType", "lat", "lng"));
        }

        if (!"no_location".equals(canonicalGeoType)) {
            if (!facts.mapDataPresent()) {
                add(issues, "MISSING_MAP_DATA", "GEOGRAPHY", "ERROR", List.of("mapData"));
            } else if (!facts.mapDataObject()
                    || !validMapData(facts.sanitizedMapData(), canonicalGeoType)) {
                add(issues, "INVALID_MAP_DATA", "GEOGRAPHY", "ERROR", List.of("mapData"));
            }
        } else if (facts.mapDataPresent()
                && (!facts.mapDataObject()
                || (facts.sanitizedMapData() != null
                && !validMapData(facts.sanitizedMapData(), canonicalGeoType)))) {
            add(issues, "INVALID_MAP_DATA", "GEOGRAPHY", "ERROR", List.of("mapData"));
        }

        if (!validChronology(facts)) {
            add(issues, "INVALID_CHRONOLOGY", "CHRONOLOGY", "ERROR",
                    List.of("startYear", "endYear", "effectiveEndYear"));
        }
        if (!LEVELS.contains(facts.eventLevel()) || !TYPES.contains(facts.eventType())) {
            add(issues, "INVALID_CLASSIFICATION", "CLASSIFICATION", "ERROR",
                    List.of("eventLevel", "eventType"));
        }
        if (facts.grades() == null || facts.grades().isEmpty()) {
            add(issues, "MISSING_GRADES", "CLASSIFICATION", "WARNING", List.of("grades"));
        } else if (facts.grades().stream().anyMatch(value -> !GRADES.contains(value))) {
            add(issues, "INVALID_GRADES", "CLASSIFICATION", "ERROR", List.of("grades"));
        }

        AdminEventDtos.Completeness completeness =
                new AdminEventDtos.Completeness(issues.isEmpty(), issues.size(), List.copyOf(issues));
        return new Assessment(canonicalGeoType, completeness);
    }

    public String canonicalGeoType(EventCompletenessFacts facts) {
        JsonNode value = facts.sanitizedMapData() == null ? null : facts.sanitizedMapData().get("geoType");
        if (value != null && value.isTextual() && CANONICAL_GEO_TYPES.contains(value.asText())) {
            return value.asText();
        }
        return switch (String.valueOf(facts.normalizedGeoType())) {
            case "single_point" -> "point";
            case "multi_region" -> "multi_polygon";
            case "point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location" ->
                    facts.normalizedGeoType();
            default -> null;
        };
    }

    private GeographyState geographyState(EventCompletenessFacts facts, String geoType) {
        if (geoType == null) return GeographyState.INVALID;
        boolean latPresent = facts.lat() != null;
        boolean lngPresent = facts.lng() != null;
        boolean regionsPresent = nonEmpty(facts.provinceNames()) || nonEmpty(facts.historicalLocations());
        if ("no_location".equals(geoType)) {
            return latPresent || lngPresent || regionsPresent ? GeographyState.INVALID : GeographyState.VALID;
        }
        if ("nationwide".equals(geoType)) return GeographyState.VALID;
        if ("point".equals(geoType) || "multi_point".equals(geoType)) {
            if (!latPresent && !lngPresent) return GeographyState.MISSING;
            return validCoordinates(facts.lat(), facts.lng()) ? GeographyState.VALID : GeographyState.INVALID;
        }
        if ("multi_polygon".equals(geoType)) {
            return regionsPresent ? GeographyState.VALID : GeographyState.MISSING;
        }
        if ("mixed".equals(geoType)) {
            if (!latPresent && !lngPresent && !regionsPresent) return GeographyState.MISSING;
            return validCoordinates(facts.lat(), facts.lng()) && regionsPresent
                    ? GeographyState.VALID : GeographyState.INVALID;
        }
        return GeographyState.INVALID;
    }

    private boolean validMapData(JsonNode mapData, String geoType) {
        if (mapData == null || !mapData.isObject() || !StringUtils.hasText(geoType)) return false;
        String declared = text(mapData.get("geoType"));
        if (declared != null && !geoType.equals(declared)) return false;
        int markerCount = markerCount(mapData);
        boolean regions = stringArrayPresent(mapData.get("gadmRefs"))
                || stringArrayPresent(mapData.get("provinceNames"))
                || stringArrayPresent(mapData.at("/displayGeometry/provinceNames"));
        return switch (geoType) {
            case "point" -> markerCount >= 1;
            case "multi_point" -> markerCount >= 2;
            case "multi_polygon" -> regions;
            case "mixed" -> markerCount >= 1 && regions;
            case "nationwide" -> "nationwide".equals(declared);
            case "no_location" -> markerCount == 0 && !regions
                    && (declared == null || "no_location".equals(declared));
            default -> false;
        };
    }

    private int markerCount(JsonNode mapData) {
        int count = validMarker(mapData.get("marker")) ? 1 : 0;
        JsonNode markers = mapData.get("markers");
        if (markers != null && markers.isArray()) {
            for (JsonNode marker : markers) if (validMarker(marker)) count++;
        }
        if (validMarker(mapData.at("/displayGeometry/marker"))) count++;
        return count;
    }

    private boolean validMarker(JsonNode marker) {
        return marker != null && marker.isObject()
                && numericCoordinate(marker.get("lat"), -90, 90)
                && numericCoordinate(marker.get("lng"), -180, 180);
    }

    private boolean validChronology(EventCompletenessFacts facts) {
        Integer start = facts.startYear();
        Integer end = facts.endYear();
        Integer effective = facts.effectiveEndYear();
        if (start == null && end == null && effective == null) return true;
        if (start == null || start == 0 || (end != null && end == 0) || effective == null || effective == 0) {
            return false;
        }
        if (end != null && end < start) return false;
        return effective.equals(end == null ? start : end);
    }

    private static boolean allNonBlankStrings(JsonNode values) {
        for (JsonNode value : values) {
            if (!value.isTextual() || !StringUtils.hasText(value.asText())) return false;
        }
        return true;
    }

    private static boolean validCoordinates(BigDecimal lat, BigDecimal lng) {
        return lat != null && lng != null
                && lat.compareTo(BigDecimal.valueOf(-90)) >= 0
                && lat.compareTo(BigDecimal.valueOf(90)) <= 0
                && lng.compareTo(BigDecimal.valueOf(-180)) >= 0
                && lng.compareTo(BigDecimal.valueOf(180)) <= 0;
    }

    private static boolean numericCoordinate(JsonNode value, int minimum, int maximum) {
        return value != null && value.isNumber()
                && value.decimalValue().compareTo(BigDecimal.valueOf(minimum)) >= 0
                && value.decimalValue().compareTo(BigDecimal.valueOf(maximum)) <= 0;
    }

    private static boolean stringArrayPresent(JsonNode value) {
        if (value == null || !value.isArray()) return false;
        for (JsonNode item : value) if (item.isTextual() && StringUtils.hasText(item.asText())) return true;
        return false;
    }

    private static boolean nonEmpty(List<String> values) {
        return values != null && values.stream().anyMatch(StringUtils::hasText);
    }

    private static String text(JsonNode value) {
        return value != null && value.isTextual() && StringUtils.hasText(value.asText())
                ? value.asText() : null;
    }

    private static void add(
            List<AdminEventDtos.CompletenessIssue> issues,
            String code,
            String section,
            String severity,
            List<String> fields
    ) {
        issues.add(new AdminEventDtos.CompletenessIssue(code, section, severity, List.copyOf(fields)));
    }

    private enum GeographyState { VALID, MISSING, INVALID }

    public record Assessment(String canonicalGeoType, AdminEventDtos.Completeness completeness) {
    }
}
