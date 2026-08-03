package com.lichsuvn.backend.common.media;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.importer.LegacyCloudinaryDeliveryUrl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class EventMediaReadPolicy {
    private final MediaUrlPolicy mediaUrlPolicy;
    private final EventImageStorage imageStorage;
    private final String cloudinaryCloudName;

    public EventMediaReadPolicy(MediaUrlPolicy mediaUrlPolicy) {
        this(mediaUrlPolicy, null, null);
    }

    @Autowired
    public EventMediaReadPolicy(
            MediaUrlPolicy mediaUrlPolicy,
            EventImageStorage imageStorage,
            @Value("${app.cloudinary.cloud-name:#{null}}") String cloudinaryCloudName
    ) {
        this.mediaUrlPolicy = mediaUrlPolicy;
        this.imageStorage = imageStorage;
        this.cloudinaryCloudName = cloudinaryCloudName;
    }

    /**
     * Legacy fallback constructor preserved for tests that construct the policy by
     * hand. The cloud name is null, which means the legacy public-id fallback below
     * is a no-op — existing tests continue to assert on V42-shaped ids only.
     */
    public EventMediaReadPolicy(MediaUrlPolicy mediaUrlPolicy, EventImageStorage imageStorage) {
        this(mediaUrlPolicy, imageStorage, null);
    }

    public String visibleUrl(MediaDescriptor media) {
        if (media == null || !"active".equals(media.status())) {
            return null;
        }
        if ("UNMANAGED".equals(media.storageState())) {
            return mediaUrlPolicy.redactDisplayUrl(media.originalUrl());
        }
        if (!"READY".equals(media.storageState())
                || !"cloudinary".equals(media.provider())
                || media.publicId() == null) {
            return null;
        }
        String generated = null;
        if (imageStorage != null) {
            generated = imageStorage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                    media.publicId(),
                    media.providerVersion(),
                    media.thumbnail()
                            ? EventImageStorage.DeliveryKind.THUMBNAIL
                            : EventImageStorage.DeliveryKind.GALLERY));
        }
        if (generated == null && LegacyCloudinaryDeliveryUrl.isLegacyPublicId(media.publicId())) {
            generated = LegacyCloudinaryDeliveryUrl.compute(
                    cloudinaryCloudName,
                    media.publicId(),
                    media.providerVersion(),
                    media.thumbnail()
                            ? LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL
                            : LegacyCloudinaryDeliveryUrl.Kind.GALLERY);
        }
        return mediaUrlPolicy.redactDisplayUrl(generated);
    }

    public boolean visible(MediaDescriptor media) {
        return visibleUrl(media) != null;
    }

    public record MediaDescriptor(
            String storageState,
            String status,
            String originalUrl,
            String provider,
            String publicId,
            Long providerVersion,
            boolean thumbnail
    ) {
    }
}
