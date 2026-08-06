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
import java.math.BigInteger;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Post-verify hash contract test (see HASH_PIPELINE_TRACE.md).
 *
 * <p>Equal-valued numeric scalars from any Jackson JsonNode subtype
 * (IntNode, LongNode, BigIntegerNode, DecimalNode, BigDecimalNode,
 * DoubleNode) must produce the same canonical text and therefore the
 * same canonical hash.
 *
 * <p>The post-fix hash value {@code 2aff0dca4fd3cc08dd6a90e1e458451cc67f7f09f​f1d1fd2b5b9db9bd4db01ad}
 * is the NEW canonical contract; the pre-fix value
 * {@code 8e13fc1a5cc62a9ea87e80825461dd3f8b812545c152f50d25728e20f560f5cf}
 * is recorded in {@link #blackBox_failingEventDesiredHashLocked} as the
 * pre-fix snapshot for migration documentation. Any future regression is
 * detected by both:
 *   (a) hash unchanged from the new contract, AND
 *   (b) DecimalNode(22.0) and LongNode(22) produce the SAME hash regardless
 *       of round-trip surface.
 */
class CanonicalGeographyCanonicalNumberTextTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

    @Test
    void whiteBox_canonicalNumberText_normalisesEqualValuedScalarsToSameText() {
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new LongNode(22)));
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new IntNode(22)));
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new DecimalNode(new BigDecimal("22.0"))));
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new DecimalNode(new BigDecimal(22))));

        DecimalNode bd22 = new DecimalNode(new BigDecimal(new BigInteger("22")));
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(bd22));

        DoubleNode dbl22 = new DoubleNode(22.0);
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(dbl22));
    }

    @Test
    void whiteBox_canonicalNumberText_zeroAcrossAllSubtypes() {
        assertEquals("0", CanonicalGeographyProjection.canonicalNumberText(new LongNode(0)));
        assertEquals("0", CanonicalGeographyProjection.canonicalNumberText(new IntNode(0)));
        assertEquals("0", CanonicalGeographyProjection.canonicalNumberText(new DecimalNode(BigDecimal.ZERO)));
        assertEquals("0", CanonicalGeographyProjection.canonicalNumberText(new DoubleNode(0d)));
        assertEquals("0", CanonicalGeographyProjection.canonicalNumberText(new DoubleNode(-0d)));
    }

    @Test
    void whiteBox_canonicalNumberText_preservesFractionalComponent() {
        assertEquals("22.5", CanonicalGeographyProjection.canonicalNumberText(
                new DecimalNode(new BigDecimal("22.50"))));
        assertEquals("22.5001", CanonicalGeographyProjection.canonicalNumberText(
                new DecimalNode(new BigDecimal("22.5001"))));
        assertEquals("0.5", CanonicalGeographyProjection.canonicalNumberText(
                new DecimalNode(new BigDecimal(".5"))));
    }

    @Test
    void whiteBox_canonicalNumberText_negativePreservesSign() {
        assertEquals("-22", CanonicalGeographyProjection.canonicalNumberText(
                new DecimalNode(new BigDecimal("-22.0"))));
        assertEquals("-22.5", CanonicalGeographyProjection.canonicalNumberText(
                new DecimalNode(new BigDecimal("-22.50"))));
    }

    @Test
    void whiteBox_canonicalNumberText_handlesIntegerDouble() {
        // The canonical input emits "22.0" for a decimal-valued double.
        // After fix: 22.0 -> 22.
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new DoubleNode(22.0)));
        assertEquals("22", CanonicalGeographyProjection.canonicalNumberText(new DoubleNode(22.0d)));
        // Negative integer-valued double.
        assertEquals("-22", CanonicalGeographyProjection.canonicalNumberText(new DoubleNode(-22.0d)));
    }

    @Test
    void blackBox_equalValuedScalarsProduceEqualHash() throws Exception {
        JsonNode markerDecimal = mapper.readTree(
                "{\"name\":\"X\",\"lat\":22.0,\"lng\":105.3,\"confidence\":\"high\"}");
        JsonNode markerInteger = mapper.readTree(
                "{\"name\":\"X\",\"lat\":22,\"lng\":105.3,\"confidence\":\"high\"}");

        ObjectNode mapDataDecimal = mapper.createObjectNode();
        mapDataDecimal.put("geoType", "point");
        mapDataDecimal.set("marker", markerDecimal);
        mapDataDecimal.putArray("markers");
        mapDataDecimal.putArray("provinceNames");
        mapDataDecimal.putArray("gadmRefs");
        mapDataDecimal.putArray("historicalLocations");

        ObjectNode mapDataInteger = mapper.createObjectNode();
        mapDataInteger.put("geoType", "point");
        mapDataInteger.set("marker", markerInteger);
        mapDataInteger.putArray("markers");
        mapDataInteger.putArray("provinceNames");
        mapDataInteger.putArray("gadmRefs");
        mapDataInteger.putArray("historicalLocations");

        BigDecimal lat22 = new BigDecimal("22");
        BigDecimal lng1053 = new BigDecimal("105.3");

        String hashDecimalDecimal = projection.geoHash(
                "point", lat22, lng1053, List.of(), mapDataDecimal, true);
        String hashIntegerDecimal = projection.geoHash(
                "point", lat22, lng1053, List.of(), mapDataInteger, true);

        assertEquals(hashDecimalDecimal, hashIntegerDecimal,
                "Post-verify fix invariant: DecimalNode(22.0) and LongNode(22)"
                        + " must produce the same canonical hash when the"
                        + " surrounding values are unchanged.");
    }

    /**
     * Locked successor regression: the desired hash from the failing-event
     * canonical mapData continues to match the post-fix canonical hash.
     *
     * <p>This is the production-ready version of the previously drifting
     * desired hash {@code 8e13fc1a5cc62a9ea87e80825461dd3f8b812545c152f50d25728e20f560f5cf}.
     * The pre-fix hash is recorded as a comment below for migration audits.
     */
    @Test
    void blackBox_failingEventDesiredHashLocked() throws Exception {
        JsonNode mapData = mapper.readTree("""
                {
                  "focusGeometry": {"center": {"lat": 22.05946, "lng": 105.276796}, "mode": "bounds", "zoom": 7},
                  "gadmRefs": [],
                  "geoType": "point",
                  "historicalLocations": [],
                  "marker": {"name": "Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                  "markers": [],
                  "provinceNames": []
                }
                """);
        BigDecimal lat = mapData.path("marker").path("lat").decimalValue();
        BigDecimal lng = mapData.path("marker").path("lng").decimalValue();
        String desiredHash = projection.geoHash(
                "point", lat, lng, List.of(), mapData, true);

        // POST-FIX canonical desired hash for the failing event.
        // - PRE-FIX hash: 8e13fc1a5cc62a9ea87e80825461dd3f8b812545c152f50d25728e20f560f5cf
        // - POST-FIX hash: 2aff0dca4fd3cc08dd6a90e1e458451cc67f7f09f​f1d1fd2b5b9db9bd4db01ad
        assertEquals(
                "2aff0dca4fd3cc08dd6a90e1e458451cc67f7f09ff1d1fd2b5b9db9bd4db01ad",
                desiredHash);
    }

    /**
     * BlackBox: simulating the MySQL JSON column round-trip by coercing the
     * canonical mapData through a JSON serialize+parse cycle while replacing
     * the marker.lat with its MySQL-canonical integer form must now produce
     * the same hash as the desired hash.
     */
    @Test
    void blackBox_postVerifySimulationAfterRoundTripProducesDesiredHash() throws Exception {
        JsonNode canonicalMapData = mapper.readTree("""
                {
                  "focusGeometry": {"center": {"lat": 22.05946, "lng": 105.276796}, "mode": "bounds", "zoom": 7},
                  "gadmRefs": [],
                  "geoType": "point",
                  "historicalLocations": [],
                  "marker": {"name": "Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                  "markers": [],
                  "provinceNames": []
                }
                """);

        BigDecimal desiredLat = canonicalMapData.path("marker").path("lat").decimalValue();
        BigDecimal desiredLng = canonicalMapData.path("marker").path("lng").decimalValue();
        String desiredHash = projection.geoHash(
                "point", desiredLat, desiredLng, List.of(), canonicalMapData, true);

        SimulatedMysqlJson mysqlSimulated = SimulatedMysqlJson.simulateRoundTripOn(mapper, canonicalMapData);

        BigDecimal postLat = mysqlSimulated.markerLat().decimalValue();
        BigDecimal postLng = mysqlSimulated.markerLng().decimalValue();
        String postVerifyHash = projection.geoHash(
                "point", postLat, postLng, List.of(), mysqlSimulated.rootMapData(), true);

        assertEquals(desiredHash, postVerifyHash,
                "Post-verify fix invariant: simulating the MySQL JSON column"
                        + " round-trip (22.0 -> 22) must NOT diverge the hash"
                        + " from the desired hash.");
    }

    @Test
    void blackBox_nonGeoHashStillDeterministic() throws Exception {
        JsonNode a = mapper.readTree(
                "{\"id\":\"e\",\"display\":{\"showOnMap\":true},\"mapData\":{\"geoType\":\"point\","
                + "\"marker\":{\"lat\":22.0,\"lng\":105.5}},\"textbookContent\":{\"canonicalSummary\":\"x\"}}");
        JsonNode b = mapper.readTree(
                "{\"display\":{\"showOnMap\":true},\"id\":\"e\",\"textbookContent\":{\"canonicalSummary\":\"x\"},"
                + "\"mapData\":{\"geoType\":\"point\",\"marker\":{\"lat\":22,\"lng\":105.5}}}");
        assertEquals(projection.nonGeoHash(a), projection.nonGeoHash(b),
                "nonGeoHash invariant: insertion order irrelevant");
        JsonNode titleChanged = mapper.readTree(
                "{\"id\":\"e\",\"display\":{\"showOnMap\":true},\"mapData\":{\"geoType\":\"point\","
                + "\"marker\":{\"lat\":22.0,\"lng\":105.5}},\"textbookContent\":{\"canonicalSummary\":\"y\"},"
                + "\"titles\":{\"primary\":\"alt\"}}");
        assertTrue(!projection.nonGeoHash(titleChanged).equals(projection.nonGeoHash(a)),
                "nonGeoHash invariant: text changes must change the hash");
    }

    /** Small helper that simulates the MySQL JSON column round-trip step. */
    private record SimulatedMysqlJson(JsonNode markerLat, JsonNode markerLng, JsonNode rootMapData) {
        static SimulatedMysqlJson simulateRoundTripOn(ObjectMapper mapper, JsonNode canonicalMapData)
                throws Exception {
            String serialised = mapper.writeValueAsString(canonicalMapData);
            JsonNode rereadOnce = mapper.readTree(serialised);
            assertEquals("22.0", rereadOnce.path("marker").path("lat").asText());
            ((ObjectNode) rereadOnce.path("marker")).put("lat", 22);
            JsonNode rereadTwice = mapper.readTree(mapper.writeValueAsString(rereadOnce));
            JsonNode marker = rereadTwice.path("marker");
            return new SimulatedMysqlJson(marker.path("lat"), marker.path("lng"), rereadTwice);
        }
    }
}
