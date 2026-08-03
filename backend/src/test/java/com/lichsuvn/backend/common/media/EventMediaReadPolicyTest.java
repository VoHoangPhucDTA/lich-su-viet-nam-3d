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

    @Test
    void legacyPublicIdFallsBackWhenStorageRejectsAndCloudNameKnown() {
        // V42 storage intentionally rejects non-V42 shaped public ids.
        when(storage.deliveryUrl(any())).thenReturn(null);
        EventMediaReadPolicy policyWithCloud =
                new EventMediaReadPolicy(new MediaUrlPolicy(), null, "dlx-legacy");
        String url = policyWithCloud.visibleUrl(descriptor(
                "READY", "active", "https://provider.example.test/original",
                "cloudinary", "historical_events_thumbnail1/event-x",
                4L, true));
        assertEquals(
                "https://res.cloudinary.com/dlx-legacy/image/upload/c_limit,w_1600,h_1600/f_auto,q_auto/v4/historical_events_thumbnail1/event-x",
                url);
    }

    @Test
    void legacyPublicIdIsNullWhenCloudNameNotConfigured() {
        // Constructor without cloud name keeps the legacy no-op behaviour. The policy
        // is constructed by tests or code paths that haven't enabled the legacy
        // fallback; in those cases we must not synthesise a URL.
        when(storage.deliveryUrl(any())).thenReturn(null);
        assertNull(policy.visibleUrl(descriptor(
                "READY", "active", "https://provider.example.test/original",
                "cloudinary", "event-thumbnails/event-x",
                4L, true)));
    }

    @Test
    void legacyNonImageResourceTypeIsStillHonoured() {
        when(storage.deliveryUrl(any())).thenReturn(null);
        EventMediaReadPolicy policyWithCloud =
                new EventMediaReadPolicy(new MediaUrlPolicy(), null, "dlx-legacy");
        assertNull(policyWithCloud.visibleUrl(descriptor(
                "UPLOADING", "active", "https://provider.example.test/original",
                "cloudinary", "historical_events_thumbnail/event-x",
                4L, true)));
    }

    private EventMediaReadPolicy.MediaDescriptor descriptor(
            String state,
            String status,
            String url,
            String provider,
            String publicId,
            Long version,
            boolean thumbnail
    ) {
        return new EventMediaReadPolicy.MediaDescriptor(
                state, status, url, provider, publicId, version, thumbnail);
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
