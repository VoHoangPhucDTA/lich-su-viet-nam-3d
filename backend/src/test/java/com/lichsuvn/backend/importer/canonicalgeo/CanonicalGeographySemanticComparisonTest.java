package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.DecimalNode;
import com.fasterxml.jackson.databind.node.DoubleNode;
import com.fasterxml.jackson.databind.node.IntNode;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * IDEMPOTENCE-FIX semantic comparison contract (phase §8).
 *
 * <p>The plan's geography change detection must compare numerically
 * equivalent JSON values as equal ({@code 22 == 22.0 == 22.000 == 1E+3})
 * while still distinguishing genuinely different values, null vs 0,
 * missing vs present, array order, and exact string content. The production
 * comparator is {@link CanonicalGeographyProjection#canonicalEquals(JsonNode, JsonNode)}
 * — the same canonical route used by {@code geoHash}, {@code nonGeoHash}
 * and the second dry-run idempotence contract. These tests exercise that
 * real production method (not a test-only duplicate).
 */
class CanonicalGeographySemanticComparisonTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

    @Test
    void equalNumericValuesAcrossNodeSubtypes() {
        assertTrue(projection.canonicalEquals(new IntNode(22), new DoubleNode(22.0)),
                "IntNode(22) == DoubleNode(22.0)");
        assertTrue(projection.canonicalEquals(new LongNode(22), new DecimalNode(new BigDecimal("22.000"))),
                "LongNode(22) == DecimalNode(22.000)");
        assertTrue(projection.canonicalEquals(new DecimalNode(BigDecimal.ZERO), new IntNode(0)),
                "DecimalNode(0.0) == IntNode(0)");
        assertTrue(projection.canonicalEquals(new DecimalNode(new BigDecimal("1E+3")), new IntNode(1000)),
                "DecimalNode(1E+3) == IntNode(1000)");
        assertTrue(projection.canonicalEquals(new DoubleNode(-0.0d), new IntNode(0)),
                "DoubleNode(-0.0) == IntNode(0)");
    }

    @Test
    void numericallyDifferentValuesStayDifferent() {
        assertFalse(projection.canonicalEquals(
                        new IntNode(22), new DecimalNode(new BigDecimal("22.0000001"))),
                "22 != 22.0000001");
        assertFalse(projection.canonicalEquals(
                        new DecimalNode(new BigDecimal("22")), new DecimalNode(new BigDecimal("22.0000001"))),
                "22 != 22.0000001 (decimal vs decimal)");
        assertFalse(projection.canonicalEquals(new IntNode(1), new DoubleNode(1.1)),
                "1 != 1.1");
    }

    @Test
    void nullVsZeroAndMissingVsNumericAreDifferent() {
        assertFalse(projection.canonicalEquals(mapper.getNodeFactory().nullNode(), new IntNode(0)),
                "null != 0");
        assertFalse(projection.canonicalEquals(mapper.getNodeFactory().missingNode(), new IntNode(0)),
                "missing != numeric value");

        ObjectNode noLat = mapper.createObjectNode();
        ObjectNode latZero = mapper.createObjectNode();
        latZero.put("lat", 0);
        assertFalse(projection.canonicalEquals(noLat, latZero),
                "absent field != explicit numeric field");

        ObjectNode latNull = mapper.createObjectNode();
        latNull.set("lat", mapper.getNodeFactory().nullNode());
        assertFalse(projection.canonicalEquals(noLat, latNull),
                "absent field != explicit null");
        assertFalse(projection.canonicalEquals(latNull, latZero),
                "explicit null != numeric value");
    }

    @Test
    void reorderedObjectKeysAreSemanticallyEqual() throws Exception {
        JsonNode a = mapper.readTree("{\"a\":1,\"b\":{\"x\":1,\"y\":2},\"c\":3}");
        JsonNode b = mapper.readTree("{\"c\":3,\"b\":{\"y\":2,\"x\":1},\"a\":1}");
        assertTrue(projection.canonicalEquals(a, b),
                "object key order must not affect equality (MySQL JSON column reorder)");
    }

    @Test
    void arrayElementOrderRemainsSignificant() throws Exception {
        JsonNode a = mapper.readTree(
                "{\"markers\":[{\"lat\":22,\"name\":\"A\"},{\"lat\":21,\"name\":\"B\"}]}");
        JsonNode b = mapper.readTree(
                "{\"markers\":[{\"lat\":21,\"name\":\"B\"},{\"lat\":22,\"name\":\"A\"}]}");
        assertFalse(projection.canonicalEquals(a, b),
                "array element order must remain significant when order is operationally meaningful");
    }

    @Test
    void vietnameseUtf8StringsRemainExact() throws Exception {
        JsonNode a = mapper.readTree("{\"name\":\"Chiêm Hoá (Tuyên Quang)\"}");
        JsonNode b = mapper.readTree("{\"name\":\"Chiêm Hoá (Tuyên Quang)\"}");
        assertTrue(projection.canonicalEquals(a, b));
        JsonNode withoutDiacritics = mapper.readTree("{\"name\":\"Chiêm Hoa (Tuyen Quang)\"}");
        assertFalse(projection.canonicalEquals(a, withoutDiacritics),
                "diacritic change must differ");
    }

    @Test
    void stringsBooleansAndNullPreserved() throws Exception {
        assertTrue(projection.canonicalEquals(
                mapper.readTree("{\"confidence\":\"high\"}"),
                mapper.readTree("{\"confidence\":\"high\"}")));
        assertFalse(projection.canonicalEquals(
                mapper.readTree("{\"confidence\":\"high\"}"),
                mapper.readTree("{\"confidence\":\"medium\"}")));
        assertFalse(projection.canonicalEquals(
                mapper.readTree("{\"showOnMap\":true}"),
                mapper.readTree("{\"showOnMap\":false}")));
        assertFalse(projection.canonicalEquals(
                mapper.readTree("{\"a\":null}"),
                mapper.readTree("{\"a\":0}")));
    }
}
