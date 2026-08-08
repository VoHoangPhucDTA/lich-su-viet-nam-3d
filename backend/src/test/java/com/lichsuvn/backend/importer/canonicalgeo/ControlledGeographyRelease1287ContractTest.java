package com.lichsuvn.backend.importer.canonicalgeo;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ControlledGeographyRelease1287ContractTest {

    @Test
    void exactReviewedIdentityIsAccepted() {
        assertDoesNotThrow(() -> ControlledGeographyRelease1287Contract.requireApplyAuthorization(
                ControlledGeographyRelease1287Contract.RELEASE_ID,
                ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                ControlledGeographyRelease1287Contract.EVENT_ID));
        assertEquals(1, ControlledGeographyRelease1287Contract.MAX_AFFECTED_ROWS);
        assertEquals(361, ControlledGeographyRelease1287Contract.CANONICAL_RECORD_COUNT);
        assertEquals(361, ControlledGeographyRelease1287Contract.CANONICAL_UNIQUE_ID_COUNT);
        assertEquals(361, ControlledGeographyRelease1287Contract.DATABASE_EVENT_COUNT);
    }

    @Test
    void storageScopeContainsOnlyReviewedGeographyFields() {
        assertEquals(Set.of("geo_type", "lat", "lng", "raw_json.mapData",
                        "raw_json.display.showOnMap"),
                ControlledGeographyRelease1287Contract.AUTHORIZED_STORAGE_FIELDS);
    }

    @Test
    void anyChangedIdentityIsRejected() {
        assertRejected("wrong", ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                ControlledGeographyRelease1287Contract.EVENT_ID);
        assertRejected(ControlledGeographyRelease1287Contract.RELEASE_ID, "wrong",
                ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                ControlledGeographyRelease1287Contract.EVENT_ID);
        assertRejected(ControlledGeographyRelease1287Contract.RELEASE_ID,
                ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION, "0".repeat(64),
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                ControlledGeographyRelease1287Contract.EVENT_ID);
        assertRejected(ControlledGeographyRelease1287Contract.RELEASE_ID,
                ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256, "0".repeat(64),
                ControlledGeographyRelease1287Contract.EVENT_ID);
        assertRejected(ControlledGeographyRelease1287Contract.RELEASE_ID,
                ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256, "another-event");
    }

    private void assertRejected(String releaseId, String authorization, String planSha,
                                String canonicalSha, String eventId) {
        assertThrows(IllegalStateException.class,
                () -> ControlledGeographyRelease1287Contract.requireApplyAuthorization(
                        releaseId, authorization, planSha, canonicalSha, eventId));
    }
}
