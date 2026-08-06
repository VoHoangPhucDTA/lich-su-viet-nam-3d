package com.lichsuvn.backend.importer;

import java.util.List;
import java.util.Locale;

/**
 * Mirrors the V42 Cloudinary upload adapter deliveryUrl scheme but accepts any public
 * id, so backfilled legacy Cloudinary assets can produce the same delivery URL contract
 * the rest of the application already relies on.
 *
 * <p>The V42 adapter restricts delivery URLs to a strict namespace. Legacy event
 * thumbnails uploaded before V42 sit under folders such as
 * historical_events_thumbnail1, event-thumbnails, historical_events_thumbnail; this
 * helper intentionally does not enforce the V42 namespace check so we can backfill
 * them.
 *
 * <p>Do not modify the V42 production code from this class.
 */
public final class LegacyCloudinaryDeliveryUrl {

    public enum Kind {
        THUMBNAIL(1600),
        GALLERY(2400);

        private final int limit;

        Kind(int limit) {
            this.limit = limit;
        }

        public int limit() {
            return limit;
        }
    }

    private LegacyCloudinaryDeliveryUrl() {
    }

    /** Legacy prefix order kept identical to the frontend URL-guess precedence so
     *  backfilled URLs resolve to the same delivery URL the browser already shows. */
    public static final List<String> FOLDER_PRECEDENCE = List.of(
            "historical_events_thumbnail1",
            "event-thumbnails",
            "historical_events_thumbnail");

    /**
     * @param cloudName       Cloudinary cloud name. Required.
     * @param publicId        Cloudinary public id. Required.
     * @param providerVersion Cloudinary asset version integer; may be null for legacy
     *                        assets but supplying it is preferred when the Admin API
     *                        returns one.
     * @param kind            thumbnail or gallery. Drives the c_limit transformation.
     * @return deterministic delivery URL, or null when required inputs are missing.
     */
    public static String compute(
            String cloudName,
            String publicId,
            Long providerVersion,
            Kind kind
    ) {
        if (cloudName == null || cloudName.isBlank()) {
            return null;
        }
        if (publicId == null || publicId.isBlank()) {
            return null;
        }
        if (kind == null) {
            return null;
        }
        String safeCloud = cloudName.trim().toLowerCase(Locale.ROOT);
        String safePublicId = encodePublicId(publicId.trim());
        String versionSegment = providerVersion == null || providerVersion <= 0
                ? ""
                : "v" + providerVersion + "/";
        int limit = kind.limit();
        return "https://res.cloudinary.com/" + safeCloud
                + "/image/upload/c_limit,w_" + limit + ",h_" + limit
                + "/f_auto,q_auto/" + versionSegment + safePublicId;
    }

    /**
     * Returns true when the public id lives under one of the three legacy prefixes the
     * frontend currently guesses. Used by the read policy to fall back to the legacy
     * URL scheme for backfilled thumbnail rows.
     */
    public static boolean isLegacyPublicId(String publicId) {
        if (publicId == null) {
            return false;
        }
        for (String prefix : FOLDER_PRECEDENCE) {
            if (publicId.startsWith(prefix + "/")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Encode each path segment of a Cloudinary public id while preserving forward slashes.
     * Mirrors the frontend encodePublicId helper so the persisted url column matches
     * what the previously-deployed frontend already cached.
     */
    static String encodePublicId(String publicId) {
        StringBuilder out = new StringBuilder(publicId.length());
        int start = 0;
        for (int i = 0; i < publicId.length(); i++) {
            if (publicId.charAt(i) == '/') {
                if (start < i) {
                    if (out.length() > 0) {
                        out.append('/');
                    }
                    out.append(encodeSegment(publicId.substring(start, i)));
                }
                start = i + 1;
            }
        }
        if (start < publicId.length()) {
            if (out.length() > 0) {
                out.append('/');
            }
            out.append(encodeSegment(publicId.substring(start)));
        }
        return out.toString();
    }

    private static String encodeSegment(String segment) {
        byte[] bytes = segment.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        StringBuilder out = new StringBuilder(segment.length() * 3);
        for (byte value : bytes) {
            int unsigned = value & 0xff;
            if ((unsigned >= 'a' && unsigned <= 'z')
                    || (unsigned >= 'A' && unsigned <= 'Z')
                    || (unsigned >= '0' && unsigned <= '9')
                    || unsigned == '-' || unsigned == '_' || unsigned == '.') {
                out.append((char) unsigned);
            } else {
                out.append('%');
                out.append(String.format("%02X", unsigned));
            }
        }
        return out.toString();
    }
}
