package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class EventReadRepositoryPublicMapDataTest {

    private final EventReadRepository repository = new EventReadRepository(
            mock(NamedParameterJdbcTemplate.class),
            new ObjectMapper()
    );

    @Test
    void exposesOnlyTheAllowlistedMapDataSubtree() {
        JsonNode mapData = repository.parsePublicMapData("""
                {
                  "mapData": {
                    "geoType": "mixed",
                    "markers": [
                      {"name":"Bạch Đằng","lat":20.9,"lng":106.6,"internalId":"secret"}
                    ],
                    "provinceNames": ["Quảng Ninh", "local:private-source"],
                    "gadmRefs": ["VNM.13_1"],
                    "focusGeometry": {
                      "center":{"lat":20.9,"lng":106.6,"internal":"secret"},
                      "zoom":8,
                      "packageId":"history-rag-v1"
                    },
                    "provenance": {"source":"local:history-rag"},
                    "importRunId": "private"
                  },
                  "importer": {"runId":"private"},
                  "textbookContent": {"internal":"private"}
                }
                """);

        assertEquals("mixed", mapData.get("geoType").asText());
        assertEquals(1, mapData.get("markers").size());
        assertEquals("VNM.13_1", mapData.get("gadmRefs").get(0).asText());
        assertFalse(mapData.toString().contains("local:"));
        assertFalse(mapData.has("provenance"));
        assertFalse(mapData.has("importRunId"));
        assertFalse(mapData.get("markers").get(0).has("internalId"));
        assertFalse(mapData.get("focusGeometry").has("packageId"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location"
    })
    void preservesCanonicalGeoTypes(String geoType) {
        JsonNode mapData = repository.parsePublicMapData(
                "{\"mapData\":{\"geoType\":\"" + geoType + "\"}}");

        assertEquals(geoType, mapData.get("geoType").asText());
    }

    @Test
    void returnsNullWhenMapDataIsAbsentOrMalformed() {
        assertNull(repository.parsePublicMapData("{}"));
        assertNull(repository.parsePublicMapData("{\"mapData\":\"invalid\"}"));
        assertNull(repository.parsePublicMapData(null));
    }

    @Test
    void preservesLegacyDisplayGeometryNeededByExistingEventViews() {
        JsonNode mapData = repository.parsePublicMapData("""
                {"mapData":{
                  "displayGeometry":{
                    "geoType":"single_point",
                    "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                    "provinceNames":["Thừa Thiên Huế"],
                    "historicalLocations":["Phú Xuân"]
                  }
                }}
                """);

        assertTrue(mapData.has("displayGeometry"));
        assertEquals("single_point", mapData.at("/displayGeometry/geoType").asText());
        assertEquals(16.46, mapData.at("/displayGeometry/marker/lat").asDouble());
    }

    @Test
    void rejectsWrongTypesAndNestedLocalOrUnknownMetadata() {
        JsonNode mapData = repository.parsePublicMapData("""
                {"mapData":{
                  "geoType":{"unexpected":"object"},
                  "historicalLocations":["local:private-history","Cổ Loa",{"source":"local:hidden"}],
                  "markers":[{
                    "name":"local:private-marker",
                    "label":"Cổ Loa",
                    "lat":"21.1",
                    "lng":105.8,
                    "provenance":{"source":"local:hidden"}
                  }],
                  "displayGeometry":{
                    "marker":{
                      "label":"local:private-label",
                      "lat":21.1,
                      "lng":105.8,
                      "raw":{"source":"local:hidden"}
                    },
                    "historicalLocations":["local:private-geometry","Thăng Long"],
                    "unknown":{"source":"local:hidden"}
                  },
                  "focusGeometry":{
                    "zoom":true,
                    "center":{"lat":{"value":21.1},"lng":105.8,"source":"local:hidden"}
                  }
                }}
                """);

        assertFalse(mapData.has("geoType"));
        assertEquals(1, mapData.get("historicalLocations").size());
        assertEquals("Cổ Loa", mapData.get("historicalLocations").get(0).asText());
        assertFalse(mapData.at("/markers/0").has("name"));
        assertFalse(mapData.at("/markers/0").has("lat"));
        assertFalse(mapData.at("/markers/0").has("provenance"));
        assertFalse(mapData.at("/displayGeometry/marker").has("label"));
        assertFalse(mapData.at("/displayGeometry/marker").has("raw"));
        assertFalse(mapData.at("/displayGeometry").has("unknown"));
        assertFalse(mapData.at("/focusGeometry").has("zoom"));
        assertFalse(mapData.at("/focusGeometry/center").has("lat"));
        assertFalse(mapData.at("/focusGeometry/center").has("source"));
        assertFalse(mapData.toString().contains("local:"));
    }
}
