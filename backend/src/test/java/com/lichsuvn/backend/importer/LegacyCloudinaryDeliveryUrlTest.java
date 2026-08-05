package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class LegacyCloudinaryDeliveryUrlTest {

    @Test
    void computesThumbnailDeliveryUrlWithVersion() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "historical_events_thumbnail1/bach-dang-938",
                1700000000L,
                LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL);
        assertEquals(
                "https://res.cloudinary.com/dlx-demo/image/upload/c_limit,w_1600,h_1600/f_auto,q_auto/v1700000000/historical_events_thumbnail1/bach-dang-938",
                url);
    }

    @Test
    void omitsVersionWhenProviderVersionIsNull() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "event-thumbnails/lang-son-1941",
                null,
                LegacyCloudinaryDeliveryUrl.Kind.GALLERY);
        assertEquals(
                "https://res.cloudinary.com/dlx-demo/image/upload/c_limit,w_2400,h_2400/f_auto,q_auto/event-thumbnails/lang-son-1941",
                url);
    }

    @Test
    void omitsVersionWhenProviderVersionIsZeroOrNegative() {
        String zero = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "historical_events_thumbnail/lang-son-1941",
                0L,
                LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL);
        assertEquals(
                "https://res.cloudinary.com/dlx-demo/image/upload/c_limit,w_1600,h_1600/f_auto,q_auto/historical_events_thumbnail/lang-son-1941",
                zero);
    }

    @Test
    void returnsNullWhenCloudNameIsBlank() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "",
                "historical_events_thumbnail1/bach-dang-938",
                1L,
                LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL);
        assertNull(url);
    }

    @Test
    void returnsNullWhenPublicIdIsBlank() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "",
                1L,
                LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL);
        assertNull(url);
    }

    @Test
    void returnsNullWhenKindIsNull() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "historical_events_thumbnail1/bach-dang-938",
                1L,
                null);
        assertNull(url);
    }

    @Test
    void percentEncodesNonAsciiSegments() {
        String url = LegacyCloudinaryDeliveryUrl.compute(
                "dlx-demo",
                "historical_events_thumbnail1/tr\u1eadng-quy\u1ebft 1945",
                1L,
                LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL);
        assertNotNull(url);
        // Precomposed Vietnamese ấ (U+1EAD) and ế (U+1EBF) are three-byte UTF-8 sequences,
        // matching what a real Cloudinary CDN URL would store.
        assertEquals(
                "https://res.cloudinary.com/dlx-demo/image/upload/c_limit,w_1600,h_1600/f_auto,q_auto/v1/historical_events_thumbnail1/tr%E1%BA%ADng-quy%E1%BA%BFt%201945",
                url);
    }
}
