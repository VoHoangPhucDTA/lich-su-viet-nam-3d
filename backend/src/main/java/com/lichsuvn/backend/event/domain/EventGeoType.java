package com.lichsuvn.backend.event.domain;

import java.util.Set;

/**
 * Canonical event geography contract shared by the importer, API and admin layers.
 *
 * Only these six values exist in the canonical runtime. Legacy values
 * (single_point, multi_region, polygon) are never produced by canonical code.
 */
public final class EventGeoType {

    public static final String POINT = "point";
    public static final String MULTI_POINT = "multi_point";
    public static final String MULTI_POLYGON = "multi_polygon";
    public static final String MIXED = "mixed";
    public static final String NATIONWIDE = "nationwide";
    public static final String NO_LOCATION = "no_location";

    public static final Set<String> CANONICAL = Set.of(
            POINT, MULTI_POINT, MULTI_POLYGON, MIXED, NATIONWIDE, NO_LOCATION
    );

    /** Legacy values still present in pre-sync databases. */
    public static final String LEGACY_SINGLE_POINT = "single_point";
    public static final String LEGACY_MULTI_REGION = "multi_region";

    private EventGeoType() {
    }

    public static boolean isCanonical(String value) {
        return value != null && CANONICAL.contains(value);
    }

    /** Canonical passthrough for values already canonical; null otherwise. */
    public static String canonicalOrNull(String value) {
        return isCanonical(value) ? value : null;
    }

    /**
     * Dual-read projection for a DB geo_type plus the raw mapData geoType.
     *
     * - canonical DB value: returned unchanged;
     * - legacy single_point: -> point (unambiguous);
     * - legacy multi_region / polygon: prefer the raw mapData canonical value;
     *   when the raw value is not canonical the value is incompatible and null
     *   is returned so callers never guess multi_point/multi_polygon/mixed.
     */
    public static String dualRead(String dbValue, String rawMapDataGeoType) {
        if (isCanonical(dbValue)) {
            return dbValue;
        }
        if (LEGACY_SINGLE_POINT.equals(dbValue)) {
            return POINT;
        }
        if (LEGACY_MULTI_REGION.equals(dbValue) || "polygon".equals(dbValue)) {
            return canonicalOrNull(rawMapDataGeoType);
        }
        return null;
    }
}
