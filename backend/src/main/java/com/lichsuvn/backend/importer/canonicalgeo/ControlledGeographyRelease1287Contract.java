package com.lichsuvn.backend.importer.canonicalgeo;

import java.util.Set;

/**
 * Immutable governance identity for Controlled Release F.
 *
 * <p>This class grants no authority by itself. A future remote apply also requires the exact
 * operator authorization value and every live precondition enforced by the read-only and apply
 * planners.</p>
 */
public final class ControlledGeographyRelease1287Contract {

    public static final String RELEASE_ID = "CONTROLLED_RELEASE_F_GEO_1287";
    public static final String APPLY_AUTHORIZATION = "APPLY_EXACTLY_ONE_REVIEWED_ROW";
    public static final String EVENT_ID = "khang-chien-chong-quan-nguyen-1287-1288";
    public static final String CANONICAL_SHA256 =
            "7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0";
    public static final String REVIEWED_PLAN_SHA256 =
            "4f406ab21890544fa1b351551e000f408f6c484308fa1c5f16f6da0c6a0ad98e";
    public static final String DATABASE_FINGERPRINT =
            "TIDB_REMOTE|host-sha256=38e1cda56d13f28b8375393fb984ba4b8d172d8fdcc5f4fdfac8dbf7be5f4273"
                    + "|port=4000|db=lichsuvn|server=8.0.11-TiDB-v8.5.3-serverless|flyway=42|rows=361"
                    + "|schema=9b39c49416a65092b13c77e8541aafe79f53063320b49b666fe0b33a3baad785"
                    + "|ids=3e9bb8c11dc42b707f22bd392e90239ce84bf94af12c6acd1764476cc9ab70ab";
    public static final String EXPECTED_UPDATED_AT = "2026-08-06T18:43:22.767893";
    public static final String BEFORE_GEOGRAPHY_SHA256 =
            "f2dfc7e64e070fd89c82f7f321518d1c66901f19899302a7a9a6784596b1f2f2";
    public static final String AFTER_GEOGRAPHY_SHA256 =
            "0cf9cc171394041638bfcf74a2770d1b0cae1fd70cd700c6046139bf406f01b2";
    public static final String NON_GEOGRAPHY_SHA256 =
            "f810420890ad63b1c91b765a4c5fb9ca5df410a1be0929d4ecd87ad055745547";
    public static final int CANONICAL_RECORD_COUNT = 361;
    public static final int CANONICAL_UNIQUE_ID_COUNT = 361;
    public static final int DATABASE_EVENT_COUNT = 361;
    public static final int MAX_AFFECTED_ROWS = 1;

    public static final Set<String> AUTHORIZED_STORAGE_FIELDS = Set.of(
            "geo_type",
            "lat",
            "lng",
            "province_names",
            "historical_locations",
            "raw_json.mapData",
            "raw_json.display.showOnMap"
    );

    private ControlledGeographyRelease1287Contract() { }

    public static void requireApplyAuthorization(
            String releaseId,
            String authorizationValue,
            String planSha256,
            String canonicalSha256,
            String eventId
    ) {
        if (!RELEASE_ID.equals(releaseId)
                || !APPLY_AUTHORIZATION.equals(authorizationValue)
                || !REVIEWED_PLAN_SHA256.equals(planSha256)
                || !CANONICAL_SHA256.equals(canonicalSha256)
                || !EVENT_ID.equals(eventId)) {
            throw new IllegalStateException("BLOCKED_CONTROLLED_RELEASE_IDENTITY_MISMATCH");
        }
    }
}
