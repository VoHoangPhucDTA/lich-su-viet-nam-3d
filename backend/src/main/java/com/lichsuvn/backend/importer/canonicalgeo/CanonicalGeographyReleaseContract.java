package com.lichsuvn.backend.importer.canonicalgeo;

import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;

import java.nio.file.Path;
import java.util.Map;

/** Immutable trust anchor for the currently approved canonical geography release. */
public final class CanonicalGeographyReleaseContract {

    public static final String RELEASE_ID = "geo-owner-approved-2026-08-04+geometry-hotfix-1287";
    public static final String CANONICAL_SHA256 =
            "7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0";
    public static final int RECORD_COUNT = 361;
    public static final Map<String, Long> GEO_TYPE_COUNTS = Map.of(
            "point", 46L,
            "multi_point", 20L,
            "multi_polygon", 24L,
            "mixed", 0L,
            "nationwide", 18L,
            "no_location", 253L);

    private CanonicalGeographyReleaseContract() {
    }

    public static CanonicalRelease validate(
            CanonicalGeographySyncService service, Path eventsPath, String requestedSha) {
        if (requestedSha != null && !requestedSha.isBlank()
                && !CANONICAL_SHA256.equalsIgnoreCase(requestedSha)) {
            throw new IllegalArgumentException("Requested canonical SHA is not the approved release SHA: "
                    + requestedSha);
        }
        CanonicalRelease release = service.validateCanonical(eventsPath, CANONICAL_SHA256, GEO_TYPE_COUNTS);
        requireRecordCount(release);
        return release;
    }

    static void requireRecordCount(CanonicalRelease release) {
        if (release.orderedRecords().size() != RECORD_COUNT) {
            throw new IllegalArgumentException("Canonical record count mismatch: expected "
                    + RECORD_COUNT + ", got " + release.orderedRecords().size());
        }
    }
}
