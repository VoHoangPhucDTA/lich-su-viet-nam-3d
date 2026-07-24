package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventCompletenessServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final EventCompletenessService service = new EventCompletenessService();

    @Test
    void completeNoLocationEventHasNoIssuesAndUnknownChronologyIsValid() throws Exception {
        var result = service.assess(facts("no_location", false, null, null, null));
        assertTrue(result.completeness().complete());
        assertEquals("no_location", result.canonicalGeoType());
    }

    @Test
    void absentAndInvalidMapDataAreMutuallyExclusive() throws Exception {
        var missing = service.assess(facts("point", false, null, 21.0, 105.0));
        assertEquals(List.of("MISSING_MAP_DATA"), geographyCodes(missing));

        var invalid = service.assess(facts("point", true,
                mapper.readTree("{\"geoType\":\"point\",\"marker\":{\"lat\":\"bad\",\"lng\":105}}"),
                21.0, 105.0));
        assertEquals(List.of("INVALID_MAP_DATA"), geographyCodes(invalid));

        var invalidType = service.assess(new EventCompletenessFacts(
                true, true, true, true, true, true, mapper.readTree("[\"Fact\"]"),
                true, 1, "point", BigDecimal.valueOf(21), BigDecimal.valueOf(105),
                List.of(), List.of(), true, false, null,
                1945, null, 1945, "atomic", "political", List.of(10)
        ));
        assertEquals(List.of("INVALID_MAP_DATA"), geographyCodes(invalidType));
    }

    @Test
    void invalidChronologyAndMissingGradesUseStableCodes() throws Exception {
        EventCompletenessFacts base = facts("no_location", false, null, null, null);
        EventCompletenessFacts invalid = new EventCompletenessFacts(
                true, true, true, true, true, true, mapper.readTree("[\"Fact\"]"),
                true, 1, "no_location", null, null, List.of(), List.of(),
                false, false, null, 1945, 1944, 1944, "atomic", "political", List.of()
        );
        var result = service.assess(invalid);
        assertTrue(codes(result).contains("INVALID_CHRONOLOGY"));
        assertTrue(codes(result).contains("MISSING_GRADES"));
        assertFalse(result.completeness().complete());
    }

    private EventCompletenessFacts facts(
            String geoType, boolean mapPresent, JsonNode mapData, Double lat, Double lng
    ) throws Exception {
        return new EventCompletenessFacts(
                true, true, true, true, true, true, mapper.readTree("[\"Fact\"]"),
                true, 1, geoType,
                lat == null ? null : BigDecimal.valueOf(lat),
                lng == null ? null : BigDecimal.valueOf(lng),
                List.of(), List.of(), mapPresent, mapPresent, mapData,
                null, null, null, "atomic", "political", List.of(10)
        );
    }

    private List<String> geographyCodes(EventCompletenessService.Assessment result) {
        return result.completeness().issues().stream()
                .filter(issue -> issue.code().contains("MAP_DATA"))
                .map(issue -> issue.code()).toList();
    }

    private List<String> codes(EventCompletenessService.Assessment result) {
        return result.completeness().issues().stream().map(issue -> issue.code()).toList();
    }
}
