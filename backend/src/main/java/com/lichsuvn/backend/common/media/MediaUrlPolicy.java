package com.lichsuvn.backend.common.media;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.Locale;

/**
 * One source of truth for media URL validation and display redaction.
 *
 * <p>This policy deliberately does not resolve DNS or fetch remote URLs. It
 * rejects obvious private/loopback host literals only; a hostname that later
 * resolves to a private address cannot be detected without network access.</p>
 */
@Component
public class MediaUrlPolicy {
    private static final int MAX_URL_LENGTH = 1000;

    public String requireAdminUrl(String raw) {
        if (!isSafeAbsoluteUrl(raw)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MEDIA_URL",
                    "Media URL must be a public HTTP(S) URL");
        }
        return raw.trim();
    }

    public boolean isSafeAdminUrl(String raw) {
        return isSafeAbsoluteUrl(raw);
    }

    public boolean isSafeDisplayUrl(String raw) {
        if (!StringUtils.hasText(raw)) return false;
        String value = raw.trim();
        if (value.length() > MAX_URL_LENGTH || hasControlCharacters(value)
                || hasEncodedControlCharacters(value) || isInternalMarker(value)) return false;
        if (isSafeAbsoluteUrl(value)) return true;
        return isSafeRelativePath(value);
    }

    public String redactDisplayUrl(String raw) {
        return isSafeDisplayUrl(raw) ? raw.trim() : null;
    }

    public String redactMetadata(String raw) {
        if (!StringUtils.hasText(raw) || isInternalMarker(raw)
                || hasControlCharacters(raw)) return null;
        return raw.trim();
    }

    private boolean isSafeAbsoluteUrl(String raw) {
        if (!StringUtils.hasText(raw)) return false;
        String value = raw.trim();
        if (value.length() > MAX_URL_LENGTH || hasControlCharacters(value)
                || hasEncodedControlCharacters(value) || isInternalMarker(value)) return false;
        final URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException ex) {
            return false;
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || host.isBlank()
                || uri.getUserInfo() != null
                || !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            return false;
        }
        return !isBlockedHost(host);
    }

    private boolean isSafeRelativePath(String value) {
        return (value.startsWith("/") && !value.startsWith("//"))
                || value.startsWith("./");
    }

    private boolean isInternalMarker(String value) {
        return value.trim().toLowerCase(Locale.ROOT).startsWith("local:");
    }

    private boolean isBlockedHost(String rawHost) {
        String host = rawHost.toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        if ("localhost".equals(host) || host.endsWith(".local")
                || "::1".equals(host) || host.startsWith("fc")
                || host.startsWith("fd") || host.startsWith("fe80:")
                || host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.")
                || host.startsWith("::ffff:192.168.")) {
            return true;
        }
        String[] octets = host.split("\\.", -1);
        if (octets.length != 4) return false;
        int[] values = new int[4];
        try {
            for (int i = 0; i < octets.length; i++) {
                if (octets[i].isBlank()) return false;
                values[i] = Integer.parseInt(octets[i]);
                if (values[i] < 0 || values[i] > 255) return false;
            }
        } catch (NumberFormatException ex) {
            return false;
        }
        int first = values[0];
        int second = values[1];
        return first == 0 || first == 10 || first == 127
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 168);
    }

    private boolean hasControlCharacters(String value) {
        return value.chars().anyMatch(Character::isISOControl);
    }

    private boolean hasEncodedControlCharacters(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.contains("%00") || lower.contains("%0a") || lower.contains("%0d");
    }
}
