package com.lichsuvn.backend.importer.canonicalgeo;

import org.junit.jupiter.api.Test;

import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ControlledGeographyRelease1287PostflightTest {

    @Test
    void exactDatabaseTargetAndApiEvidencePasses() {
        var result = evaluate(counts(), target(), api());
        assertTrue(result.passed());
        assertEquals(ControlledGeographyRelease1287Postflight.ReleaseStatus.SUCCESS, result.status());
    }

    @Test
    void mismatchFailsRelease() {
        var c = new ControlledGeographyRelease1287Postflight.ExactCounts(
                361, 361, 361, 361, 361, 0, 0, 360, 1, 0);
        assertFailure(evaluate(c, target(), api()), "MATCH", "MISMATCH");
    }

    @Test
    void uncomparableFailsRelease() {
        var c = new ControlledGeographyRelease1287Postflight.ExactCounts(
                361, 361, 361, 361, 361, 0, 0, 360, 0, 1);
        assertFailure(evaluate(c, target(), api()), "MATCH", "UNCOMPARABLE");
    }

    @Test
    void databaseCountAndArithmeticDriftFailRelease() {
        var c = new ControlledGeographyRelease1287Postflight.ExactCounts(
                361, 361, 360, 360, 360, 1, 0, 360, 0, 0);
        assertFailure(evaluate(c, target(), api()), "DB_RECORDS", "BOTH_IDS");
    }

    @Test
    void staleApiTargetFailsRelease() {
        var stale = new ControlledGeographyRelease1287Postflight.ApiState(
                200, ControlledGeographyRelease1287Contract.EVENT_ID, "no_location", 0,
                List.of(), false, false);
        assertFailure(evaluate(counts(), target(), stale), "API_GEO_TYPE", "API_MARKER_COUNT");
    }

    @Test
    void wrongTargetMarkerCountFailsRelease() {
        var current = target();
        var wrong = new ControlledGeographyRelease1287Postflight.TargetState(
                current.eventId(), current.geoType(), 3, current.markerLabels(), current.showOnMap(),
                current.regionCount(), current.provinceNamesUnchanged(),
                current.historicalLocationsUnchanged(), current.geographySha256(),
                current.nonGeographySha256());
        assertFailure(evaluate(counts(), wrong, api()), "TARGET_MARKER_COUNT");
    }

    @Test
    void nonGeographyDriftFailsRelease() {
        var current = target();
        var wrong = new ControlledGeographyRelease1287Postflight.TargetState(
                current.eventId(), current.geoType(), current.markerCount(), current.markerLabels(),
                current.showOnMap(), current.regionCount(), current.provinceNamesUnchanged(),
                current.historicalLocationsUnchanged(), current.geographySha256(), "0".repeat(64));
        assertFailure(evaluate(counts(), wrong, api()), "TARGET_NON_GEOGRAPHY");
    }

    @Test
    void missingEvidenceAndJacksonArtifactFailRelease() {
        var badApi = new ControlledGeographyRelease1287Postflight.ApiState(
                200, ControlledGeographyRelease1287Contract.EVENT_ID, "multi_point", 4,
                ControlledGeographyRelease1287Postflight.EXPECTED_MARKER_LABELS, true, true);
        assertFailure(evaluate(counts(), target(), badApi), "API_JACKSON_ARTIFACT");
        assertFailure(ControlledGeographyRelease1287Postflight.evaluate(null, null, null),
                "POSTFLIGHT_COUNTS_MISSING", "POSTFLIGHT_TARGET_MISSING", "POSTFLIGHT_API_MISSING");
    }

    private ControlledGeographyRelease1287Postflight.Result evaluate(
            ControlledGeographyRelease1287Postflight.ExactCounts counts,
            ControlledGeographyRelease1287Postflight.TargetState target,
            ControlledGeographyRelease1287Postflight.ApiState api) {
        return ControlledGeographyRelease1287Postflight.evaluate(counts, target, api);
    }

    private ControlledGeographyRelease1287Postflight.ExactCounts counts() {
        return new ControlledGeographyRelease1287Postflight.ExactCounts(
                361, 361, 361, 361, 361, 0, 0, 361, 0, 0);
    }

    private ControlledGeographyRelease1287Postflight.TargetState target() {
        return new ControlledGeographyRelease1287Postflight.TargetState(
                ControlledGeographyRelease1287Contract.EVENT_ID, "multi_point", 4,
                ControlledGeographyRelease1287Postflight.EXPECTED_MARKER_LABELS, true, 0,
                true, true, ControlledGeographyRelease1287Contract.AFTER_GEOGRAPHY_SHA256,
                ControlledGeographyRelease1287Contract.NON_GEOGRAPHY_SHA256);
    }

    private ControlledGeographyRelease1287Postflight.ApiState api() {
        return new ControlledGeographyRelease1287Postflight.ApiState(
                200, ControlledGeographyRelease1287Contract.EVENT_ID, "multi_point", 4,
                ControlledGeographyRelease1287Postflight.EXPECTED_MARKER_LABELS, true, false);
    }

    private void assertFailure(ControlledGeographyRelease1287Postflight.Result result,
                               String... expectedReasons) {
        assertEquals(ControlledGeographyRelease1287Postflight.ReleaseStatus.RELEASE_FAILURE,
                result.status());
        for (String reason : expectedReasons) assertTrue(result.failures().contains(reason));
    }
}
