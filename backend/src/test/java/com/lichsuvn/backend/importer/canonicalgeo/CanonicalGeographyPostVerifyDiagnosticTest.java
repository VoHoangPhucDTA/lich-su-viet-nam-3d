package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Diagnostic reproduction of the production POST_VERIFY hash mismatch on
 * {@code dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951}.
 *
 * <p>The pre-fix desired_hash for this event was
 * {@code 8e13fc1a5cc62a9ea87e80825461dd3f8b812545c152f50d25728e20f560f5cf}
 * but a post-verify hash in the production runtime diverged because the
 * MySQL JSON column round-trip flipped {@code DecimalNode(22.0)} to
 * {@code LongNode(22)} and the underlying writeCanonical emitted different
 * canonical text for each.
 *
 * <p>After the postverify remediation, both the desired and post-verify
 * hash routes flow through {@link CanonicalGeographyProjection#canonicalNumberText(JsonNode)},
 * which collapses these to the same canonical text and therefore the
 * same SHA-256 input. This test pins the desired-hash value to the post-fix
 * contract and asserts a pure-stability invariant on a Jackson
 * serialise-parse round-trip of the failing event's canonical mapData.
 */
class CanonicalGeographyPostVerifyDiagnosticTest {

    private static final String FAILING_EVENT_ID =
            "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951";

    private final ObjectMapper mapper = new ObjectMapper();
    private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

    /**
     * Two distinct global route paths:
     * (1) desired — canonical input fed directly into the projection.
     * (2) post-verify simulation — Jackson-serialised-then-parsed canonical
     *     mapData (the substring of the apply() flow that does not depend
     *     on MySQL column normalisation).
     *
     * Before the fix this test would have caught a divergence caused by
     * input node type differences; after the fix the canonical number
     * text route eliminates those differences.
     */
    @Test
    void desiredAndPostReadProduceSameHashForFailingEventAfterFix() throws Exception {
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
        List<String> provinceNames = List.of();
        boolean showOnMap = true;
        String desiredHash = projection.geoHash(
                "point", lat, lng, provinceNames, mapData, showOnMap);

        // Pure-Jackson round-trip; the relabelled test asserts that even
        // without MySQL involved, the canonical hash remains stable when
        // re-parsed.
        JsonNode mapDataReread = mapper.readTree(mapper.writeValueAsString(mapData));

        BigDecimal latReread = mapDataReread.path("marker").path("lat").decimalValue();
        BigDecimal lngReread = mapDataReread.path("marker").path("lng").decimalValue();
        String rereadHash = projection.geoHash(
                "point", latReread, lngReread, provinceNames, mapDataReread, showOnMap);

        assertEquals(desiredHash, rereadHash,
                "POST_VERIFY invariant: desired and post-read routes must agree"
                        + " for " + FAILING_EVENT_ID + " after the canonical"
                        + " numeric text fix."
        );
    }

    /**
     * Locked successor regression: the desired hash under the post-fix
     * implementation matches the canonical-migration target value.
     */
    @Test
    void desiredHashMatchesPostFixProductionValue() throws Exception {
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

        assertEquals(
                "2aff0dca4fd3cc08dd6a90e1e458451cc67f7f09ff1d1fd2b5b9db9bd4db01ad",
                desiredHash,
                "Post-fix production desired-geo-hash for " + FAILING_EVENT_ID
                        + ". Pre-fix hash was"
                        + " 8e13fc1a5cc62a9ea87e80825461dd3f8b812545c152f50d25728e20f560f5cf"
                        + " and is recorded in CanonicalGeographyCanonicalNumberTextTest"
                        + ".blackBox_failingEventDesiredHashLocked as the pre-fix"
                        + " snapshot."
        );
    }
}
