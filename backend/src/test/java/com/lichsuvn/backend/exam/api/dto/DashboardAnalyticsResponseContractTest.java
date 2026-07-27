package com.lichsuvn.backend.exam.api.dto;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class DashboardAnalyticsResponseContractTest {
    private static final List<String> FIXTURES = List.of(
            "response-v1-default.json",
            "response-v1-empty.json",
            "response-v1-partial-coverage.json",
            "response-v1-authority-mix.json"
    );
    private static final Set<String> FORBIDDEN_KEYS = Set.of(
            "userAnswer",
            "correctAnswer",
            "explanation",
            "resultJson",
            "answers",
            "questionSnapshots",
            "rawSnapshot"
    );
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();

    @Test
    void goldenFixturesDeserializeAndSerializeWithExactSemanticParity() throws Exception {
        for (String fixture : FIXTURES) {
            String json = Files.readString(Path.of("..", "data", "dashboard-analytics-fixtures", fixture));
            JsonNode expected = mapper.readTree(json);
            DashboardAnalyticsResponse dto = mapper.readValue(json, DashboardAnalyticsResponse.class);
            JsonNode serialized = mapper.valueToTree(dto);
            assertEquals(normalize(expected), normalize(serialized), fixture);
        }
    }

    @Test
    void serializedContractContainsNoRawAnswerOrSnapshotKeys() throws Exception {
        for (String fixture : FIXTURES) {
            String json = Files.readString(Path.of("..", "data", "dashboard-analytics-fixtures", fixture));
            DashboardAnalyticsResponse dto = mapper.readValue(json, DashboardAnalyticsResponse.class);
            JsonNode serialized = mapper.valueToTree(dto);
            List<String> keys = new ArrayList<>();
            collectKeys(serialized, keys);
            for (String forbidden : FORBIDDEN_KEYS) {
                assertFalse(keys.contains(forbidden), fixture + " leaked " + forbidden);
            }
        }
    }

    private Object normalize(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isObject()) {
            Map<String, Object> normalized = new TreeMap<>();
            for (Map.Entry<String, JsonNode> property : value.properties()) {
                normalized.put(property.getKey(), normalize(property.getValue()));
            }
            return normalized;
        }
        if (value.isArray()) {
            List<Object> normalized = new ArrayList<>();
            for (JsonNode item : value) normalized.add(normalize(item));
            return normalized;
        }
        if (value.isNumber()) {
            return new BigDecimal(value.asText()).stripTrailingZeros();
        }
        if (value.isBoolean()) return value.asBoolean();
        return value.asText();
    }

    private void collectKeys(JsonNode value, List<String> keys) {
        if (value.isObject()) {
            for (Map.Entry<String, JsonNode> property : value.properties()) {
                keys.add(property.getKey());
                collectKeys(property.getValue(), keys);
            }
        } else if (value.isArray()) {
            for (JsonNode item : value) collectKeys(item, keys);
        }
    }
}
