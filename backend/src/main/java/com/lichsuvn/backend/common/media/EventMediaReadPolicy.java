package com.lichsuvn.backend.common.media;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class EventMediaReadPolicy {
    private final MediaUrlPolicy mediaUrlPolicy;
    private final EventImageStorage imageStorage;

    public EventMediaReadPolicy(MediaUrlPolicy mediaUrlPolicy) {
        this(mediaUrlPolicy, null);
    }

    @Autowired
    public EventMediaReadPolicy(MediaUrlPolicy mediaUrlPolicy, EventImageStorage imageStorage) {
        this.mediaUrlPolicy = mediaUrlPolicy;
        this.imageStorage = imageStorage;
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
                || media.publicId() == null
                || imageStorage == null) {
            return null;
        }
        String generated = imageStorage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                media.publicId(),
                media.providerVersion(),
                media.thumbnail()
                        ? EventImageStorage.DeliveryKind.THUMBNAIL
                        : EventImageStorage.DeliveryKind.GALLERY));
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
