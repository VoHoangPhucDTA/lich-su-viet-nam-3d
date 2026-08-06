package com.lichsuvn.backend.event.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventGeoTypeTest {

    @Test
    void canonicalSetContainsExactlyTheSixCanonicalValues() {
        assertEquals(6, EventGeoType.CANONICAL.size());
        assertTrue(EventGeoType.CANONICAL.contains("point"));
        assertTrue(EventGeoType.CANONICAL.contains("multi_point"));
        assertTrue(EventGeoType.CANONICAL.contains("multi_polygon"));
        assertTrue(EventGeoType.CANONICAL.contains("mixed"));
        assertTrue(EventGeoType.CANONICAL.contains("nationwide"));
        assertTrue(EventGeoType.CANONICAL.contains("no_location"));
    }

    @Test
    void isCanonicalAcceptsOnlyCanonicalValues() {
        assertTrue(EventGeoType.isCanonical("point"));
        assertTrue(EventGeoType.isCanonical("multi_point"));
        assertTrue(EventGeoType.isCanonical("multi_polygon"));
        assertTrue(EventGeoType.isCanonical("mixed"));
        assertTrue(EventGeoType.isCanonical("nationwide"));
        assertTrue(EventGeoType.isCanonical("no_location"));

        assertFalse(EventGeoType.isCanonical("single_point"));
        assertFalse(EventGeoType.isCanonical("multi_region"));
        assertFalse(EventGeoType.isCanonical("polygon"));
        assertFalse(EventGeoType.isCanonical("unknown"));
        assertFalse(EventGeoType.isCanonical(null));
    }

    @Test
    void dualReadKeepsCanonicalValuesUnchanged() {
        for (String value : EventGeoType.CANONICAL) {
            assertEquals(value, EventGeoType.dualRead(value, null));
            assertEquals(value, EventGeoType.dualRead(value, "multi_region"));
        }
    }

    @Test
    void dualReadMapsSinglePointToPoint() {
        assertEquals("point", EventGeoType.dualRead("single_point", null));
        assertEquals("point", EventGeoType.dualRead("single_point", "multi_polygon"));
    }

    @Test
    void dualReadPrefersRawMapDataForMultiRegion() {
        assertEquals("multi_polygon", EventGeoType.dualRead("multi_region", "multi_polygon"));
        assertEquals("multi_point", EventGeoType.dualRead("multi_region", "multi_point"));
        assertEquals("mixed", EventGeoType.dualRead("multi_region", "mixed"));
    }

    @Test
    void dualReadReturnsNullForUnresolvableLegacyMultiRegion() {
        assertNull(EventGeoType.dualRead("multi_region", null));
        assertNull(EventGeoType.dualRead("multi_region", "single_point"));
    }
}
