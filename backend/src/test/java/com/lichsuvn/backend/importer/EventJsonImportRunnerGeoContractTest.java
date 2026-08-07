package com.lichsuvn.backend.importer;

import com.lichsuvn.backend.event.domain.EventGeoType;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the importer-side canonical geoType rules. The importer's private
 * normalization is covered by the shared EventGeoType contract; this test pins
 * the exact accepted/rejected value sets the importer relies on.
 */
class EventJsonImportRunnerGeoContractTest {

    @Test
    void allSixCanonicalValuesAreAcceptedByTheContract() {
        Set<String> accepted = Set.of(
                "point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location"
        );
        for (String value : accepted) {
            assertTrue(EventGeoType.isCanonical(value), value + " must be canonical");
        }
        assertTrue(accepted.equals(EventGeoType.CANONICAL));
    }

    @Test
    void legacyValuesAreRejectedByTheContract() {
        assertFalse(EventGeoType.isCanonical("single_point"));
        assertFalse(EventGeoType.isCanonical("multi_region"));
        assertFalse(EventGeoType.isCanonical("polygon"));
        assertFalse(EventGeoType.isCanonical("unknown"));
        assertFalse(EventGeoType.isCanonical(null));
    }

    @Test
    void multiRegionRequiresRawCanonicalValueToDualRead() {
        assertEquals("multi_polygon", EventGeoType.dualRead("multi_region", "multi_polygon"));
    }
}
