package com.lichsuvn.backend.admin.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

public final class AdminEventImageNaming {
    private static final Pattern SAFE_EVENT_KEY =
            Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?");

    private AdminEventImageNaming() {
    }

    public enum Kind {
        THUMBNAIL("thumbnail"),
        GALLERY("media");

        private final String path;

        Kind(String path) {
            this.path = path;
        }
    }

    public static String publicId(String eventId, Kind kind, UUID assetId) {
        if (eventId == null || kind == null || assetId == null) {
            throw new IllegalArgumentException("Event, kind and asset ID are required");
        }
        return "events/" + eventKey(eventId) + "/" + kind.path + "/" + assetId;
    }

    static String eventKey(String eventId) {
        if (SAFE_EVENT_KEY.matcher(eventId).matches()) {
            return eventId;
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(eventId.getBytes(StandardCharsets.UTF_8));
            return "legacy-" + HexFormat.of().formatHex(digest, 0, 12);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
