package com.lichsuvn.backend.common.media;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EventMediaReadPolicyTest {
    private final EventImageStorage storage = mock(EventImageStorage.class);
    private final EventMediaReadPolicy policy =
            new EventMediaReadPolicy(new MediaUrlPolicy(), storage);

    @Test
    void unmanagedRowsRequireActiveStatusAndSafeExistingUrl() {
        assertEquals(
                "https://cdn.example.test/image.jpg",
                policy.visibleUrl(descriptor(
                        "UNMANAGED", "active", "https://cdn.example.test/image.jpg",
                        null, null)));
        assertNull(policy.visibleUrl(descriptor(
                "UNMANAGED", "active", "local:private/image.jpg", null, null)));
        assertNull(policy.visibleUrl(descriptor(
                "UNMANAGED", "hidden", "https://cdn.example.test/image.jpg",
                null, null)));
    }

    @Test
    void readyRowsRequireManagedIdentityAndUseOnlyDerivedSafeUrl() {
        when(storage.deliveryUrl(any())).thenReturn(
                "https://cdn.example.test/transformed.jpg");

        assertEquals(
                "https://cdn.example.test/transformed.jpg",
                policy.visibleUrl(descriptor(
                        "READY", "active", "https://provider.example.test/original",
                        "cloudinary", "events/event/media/asset")));
        assertNull(policy.visibleUrl(descriptor(
                "READY", "active", "https://provider.example.test/original",
                "other", "events/event/media/asset")));

        when(storage.deliveryUrl(any())).thenReturn("local:private/generated");
        assertNull(policy.visibleUrl(descriptor(
                "READY", "active", "https://provider.example.test/original",
                "cloudinary", "events/event/media/asset")));
    }

    @Test
    void lifecycleRowsAreAlwaysInvisible() {
        for (String state : new String[]{"UPLOADING", "DELETE_PENDING", "DELETE_FAILED"}) {
            assertNull(policy.visibleUrl(descriptor(
                    state, "active", "https://cdn.example.test/image.jpg",
                    "cloudinary", "events/event/media/asset")));
        }
    }

    private EventMediaReadPolicy.MediaDescriptor descriptor(
            String state,
            String status,
            String url,
            String provider,
            String publicId
    ) {
        return new EventMediaReadPolicy.MediaDescriptor(
                state, status, url, provider, publicId, 1L, false);
    }
}
