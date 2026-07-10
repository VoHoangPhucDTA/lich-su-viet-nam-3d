package com.lichsuvn.backend.event.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.config.JacksonConfig;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventChronologyJsonSerializationTest {
    private final ObjectMapper objectMapper = new JacksonConfig().objectMapper();

    @Test
    void fullyDatedChronologySerializesAsNumbers() {
        JsonNode json = detailJson(1601, 1833, 1833);

        assertEquals(1601, json.get("startYear").asInt());
        assertEquals(1833, json.get("endYear").asInt());
        assertEquals(1833, json.get("effectiveEndYear").asInt());
    }

    @Test
    void pointEventSerializesNullEndAndEffectiveStartYear() {
        JsonNode json = detailJson(1945, null, 1945);

        assertEquals(1945, json.get("startYear").asInt());
        assertTrue(json.has("endYear"));
        assertTrue(json.get("endYear").isNull());
        assertEquals(1945, json.get("effectiveEndYear").asInt());
    }

    @Test
    void partialEndKnownChronologySerializesExplicitNullStart() {
        JsonNode json = detailJson(null, 1945, 1945);

        assertTrue(json.has("startYear"));
        assertTrue(json.get("startYear").isNull());
        assertEquals(1945, json.get("endYear").asInt());
        assertEquals(1945, json.get("effectiveEndYear").asInt());
    }

    @Test
    void fullyNullChronologySerializesExplicitNullFields() {
        JsonNode json = detailJson(null, null, null);

        assertTrue(json.has("startYear"));
        assertTrue(json.get("startYear").isNull());
        assertTrue(json.has("endYear"));
        assertTrue(json.get("endYear").isNull());
        assertTrue(json.has("effectiveEndYear"));
        assertTrue(json.get("effectiveEndYear").isNull());
    }

    @Test
    void bceChronologySerializesNegativeYearsExactly() {
        JsonNode json = detailJson(-500, -401, -401);

        assertEquals(-500, json.get("startYear").asInt());
        assertEquals(-401, json.get("endYear").asInt());
        assertEquals(-401, json.get("effectiveEndYear").asInt());
    }

    private JsonNode detailJson(Integer startYear, Integer endYear, Integer effectiveEndYear) {
        EventDetailDto dto = new EventDetailDto(
                "event-id",
                "event-slug",
                "Event title",
                "Short title",
                "core",
                "political",
                "subtype",
                startYear,
                endYear,
                effectiveEndYear,
                "display",
                "period",
                "no_location",
                null,
                null,
                List.of(),
                List.of(),
                null,
                "root",
                0,
                0,
                "card",
                "summary",
                "narrative",
                "significance",
                false,
                true,
                false,
                "published",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                Map.of()
        );
        return objectMapper.valueToTree(dto);
    }
}
