package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Final write-boundary for Admin audit metadata. Audit payloads are deliberately
 * small operational summaries, never snapshots of application resources.
 */
public final class AdminAuditMetadataPolicy {
    static final int MAX_UTF8_BYTES = 2_048;

    private static final Set<String> FORBIDDEN_KEYS = Set.of(
            "password", "passwordhash", "hash", "token", "accesstoken", "refreshtoken",
            "csrf", "jwt", "claims", "authver", "authversion", "email", "rawjson",
            "sourcejson", "mapdata", "narrative", "detailednarrative", "keyfacts",
            "mediaurl", "providerid", "ip", "ipaddress", "snapshot");
    private static final Pattern EMAIL = Pattern.compile(
            "(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b");

    private AdminAuditMetadataPolicy() {
    }

    public static String requireBoundedObject(ObjectMapper objectMapper, Object value) {
        try {
            String json = value instanceof String text
                    ? text
                    : objectMapper.writeValueAsString(value);
            if (json.getBytes(StandardCharsets.UTF_8).length > MAX_UTF8_BYTES) {
                throw rejected();
            }
            JsonNode root = objectMapper.readTree(json);
            if (root == null || !root.isObject()) {
                throw rejected();
            }
            validate(root);
            return objectMapper.writeValueAsString(root);
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw rejected();
        }
    }

    private static void validate(JsonNode node) {
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String key = field.getKey()
                        .replaceAll("[^A-Za-z0-9]", "")
                        .toLowerCase(Locale.ROOT);
                if (FORBIDDEN_KEYS.contains(key)) {
                    throw rejected();
                }
                validate(field.getValue());
            }
            return;
        }
        if (node.isArray()) {
            if (node.size() > 64) {
                throw rejected();
            }
            node.forEach(AdminAuditMetadataPolicy::validate);
            return;
        }
        if (node.isTextual()) {
            String value = node.textValue();
            if (value.length() > 512
                    || value.regionMatches(true, 0, "local:", 0, "local:".length())
                    || EMAIL.matcher(value).find()) {
                throw rejected();
            }
        }
    }

    private static ApiException rejected() {
        return new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "AUDIT_METADATA_REJECTED",
                "Audit metadata violates the bounded privacy contract");
    }
}
