package com.lichsuvn.backend.importer.canonicalgeo;

import java.util.ArrayList;
import java.util.List;

/** Pure fail-closed classifier for mandatory Release F database and API postflight evidence. */
public final class ControlledGeographyRelease1287Postflight {

    public static final List<String> EXPECTED_MARKER_LABELS = List.of(
            "B\u1ea1ch \u0110\u1eb1ng",
            "C\u1eeda L\u1ee5c",
            "Th\u0103ng Long",
            "V\u00e2n \u0110\u1ed3n"
    );

    private ControlledGeographyRelease1287Postflight() { }

    public enum ReleaseStatus { SUCCESS, RELEASE_FAILURE }

    public record ExactCounts(
            int canonicalRecords,
            int canonicalUniqueIds,
            int dbRecords,
            int dbUniqueIds,
            int bothIds,
            int canonicalOnly,
            int dbOnly,
            int match,
            int mismatch,
            int uncomparable
    ) { }

    public record TargetState(
            String eventId,
            String geoType,
            int markerCount,
            List<String> markerLabels,
            boolean showOnMap,
            int regionCount,
            boolean provinceNamesUnchanged,
            boolean historicalLocationsUnchanged,
            String geographySha256,
            String nonGeographySha256
    ) { }

    public record ApiState(
            int httpStatus,
            String eventId,
            String geoType,
            int markerCount,
            List<String> markerLabels,
            Boolean showOnMap,
            boolean jacksonIntrospectionArtifactPresent
    ) { }

    public record Result(ReleaseStatus status, List<String> failures) {
        public boolean passed() { return status == ReleaseStatus.SUCCESS; }
    }

    public static Result evaluate(ExactCounts counts, TargetState target, ApiState api) {
        List<String> failures = new ArrayList<>();
        require(counts != null, "POSTFLIGHT_COUNTS_MISSING", failures);
        require(target != null, "POSTFLIGHT_TARGET_MISSING", failures);
        require(api != null, "POSTFLIGHT_API_MISSING", failures);
        if (counts != null) validateCounts(counts, failures);
        if (target != null) validateTarget(target, failures);
        if (api != null) validateApi(api, failures);
        return new Result(failures.isEmpty() ? ReleaseStatus.SUCCESS : ReleaseStatus.RELEASE_FAILURE,
                List.copyOf(failures));
    }

    private static void validateCounts(ExactCounts c, List<String> failures) {
        require(c.canonicalRecords() == 361, "CANONICAL_RECORDS", failures);
        require(c.canonicalUniqueIds() == 361, "CANONICAL_UNIQUE_IDS", failures);
        require(c.dbRecords() == 361, "DB_RECORDS", failures);
        require(c.dbUniqueIds() == 361, "DB_UNIQUE_IDS", failures);
        require(c.bothIds() == 361, "BOTH_IDS", failures);
        require(c.canonicalOnly() == 0, "CANONICAL_ONLY", failures);
        require(c.dbOnly() == 0, "DB_ONLY", failures);
        require(c.match() == 361, "MATCH", failures);
        require(c.mismatch() == 0, "MISMATCH", failures);
        require(c.uncomparable() == 0, "UNCOMPARABLE", failures);
        require(c.bothIds() + c.canonicalOnly() == c.canonicalUniqueIds(),
                "CANONICAL_ID_ARITHMETIC", failures);
        require(c.bothIds() + c.dbOnly() == c.dbUniqueIds(), "DB_ID_ARITHMETIC", failures);
        require(c.match() + c.mismatch() + c.uncomparable() == c.bothIds(),
                "COMPARISON_ARITHMETIC", failures);
    }

    private static void validateTarget(TargetState target, List<String> failures) {
        require(ControlledGeographyRelease1287Contract.EVENT_ID.equals(target.eventId()),
                "TARGET_EVENT", failures);
        require("multi_point".equals(target.geoType()), "TARGET_GEO_TYPE", failures);
        require(target.markerCount() == 4, "TARGET_MARKER_COUNT", failures);
        require(EXPECTED_MARKER_LABELS.equals(target.markerLabels()), "TARGET_MARKER_LABELS", failures);
        require(target.showOnMap(), "TARGET_SHOW_ON_MAP", failures);
        require(target.regionCount() == 0, "TARGET_REGIONS", failures);
        require(target.provinceNamesUnchanged(), "TARGET_PROVINCE_NAMES_DRIFT", failures);
        require(target.historicalLocationsUnchanged(), "TARGET_HISTORICAL_LOCATIONS_DRIFT", failures);
        require(ControlledGeographyRelease1287Contract.AFTER_GEOGRAPHY_SHA256.equals(
                target.geographySha256()), "TARGET_GEOGRAPHY", failures);
        require(ControlledGeographyRelease1287Contract.NON_GEOGRAPHY_SHA256.equals(
                target.nonGeographySha256()), "TARGET_NON_GEOGRAPHY", failures);
    }

    private static void validateApi(ApiState api, List<String> failures) {
        require(api.httpStatus() == 200, "API_HTTP_STATUS", failures);
        require(ControlledGeographyRelease1287Contract.EVENT_ID.equals(api.eventId()),
                "API_EVENT", failures);
        require("multi_point".equals(api.geoType()), "API_GEO_TYPE", failures);
        require(api.markerCount() == 4, "API_MARKER_COUNT", failures);
        require(EXPECTED_MARKER_LABELS.equals(api.markerLabels()), "API_MARKER_LABELS", failures);
        require(api.showOnMap() == null || api.showOnMap(), "API_SHOW_ON_MAP", failures);
        require(!api.jacksonIntrospectionArtifactPresent(), "API_JACKSON_ARTIFACT", failures);
    }

    private static void require(boolean condition, String failure, List<String> failures) {
        if (!condition) failures.add(failure);
    }
}
