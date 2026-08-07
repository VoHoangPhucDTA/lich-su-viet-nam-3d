package com.lichsuvn.backend.admin.application;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminEventImageNamingTest {
    private static final UUID ASSET_ID =
            UUID.fromString("4f99256a-a991-4f58-b97e-2ab1810fdb11");

    @Test
    void safeEventIdAndKindProduceExactServerOwnedPublicId() {
        assertEquals(
                "events/chien-thang-bach-dang-938/thumbnail/4f99256a-a991-4f58-b97e-2ab1810fdb11",
                AdminEventImageNaming.publicId(
                        "chien-thang-bach-dang-938",
                        AdminEventImageNaming.Kind.THUMBNAIL,
                        ASSET_ID));
        assertEquals(
                "events/chien-thang-bach-dang-938/media/4f99256a-a991-4f58-b97e-2ab1810fdb11",
                AdminEventImageNaming.publicId(
                        "chien-thang-bach-dang-938",
                        AdminEventImageNaming.Kind.GALLERY,
                        ASSET_ID));
    }

    @Test
    void unsafeLegacyEventIdUsesStableHashWithoutLeakingInputOrExtension() {
        String first = AdminEventImageNaming.publicId(
                "../Lịch sử/legacy?.jpg",
                AdminEventImageNaming.Kind.GALLERY,
                ASSET_ID);
        String second = AdminEventImageNaming.publicId(
                "../Lịch sử/legacy?.jpg",
                AdminEventImageNaming.Kind.GALLERY,
                ASSET_ID);

        assertEquals(first, second);
        assertTrue(first.matches(
                "events/legacy-[0-9a-f]{24}/media/4f99256a-a991-4f58-b97e-2ab1810fdb11"));
        assertFalse(first.contains("Lịch"));
        assertFalse(first.endsWith(".jpg"));
    }
}
