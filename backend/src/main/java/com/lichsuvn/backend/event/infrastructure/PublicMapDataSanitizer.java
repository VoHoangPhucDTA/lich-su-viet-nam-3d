package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.util.StringUtils;

/**
 * One allowlist for every API that exposes event map data.
 */
public final class PublicMapDataSanitizer {
    private PublicMapDataSanitizer() {
    }

    public static JsonNode fromDocument(ObjectMapper mapper, String rawJson) {
        if (!StringUtils.hasText(rawJson)) return null;
        try {
            JsonNode root = mapper.readTree(rawJson);
            return sanitize(mapper, root == null ? null : root.get("mapData"));
        } catch (Exception ignored) {
            return null;
        }
    }

    public static JsonNode fromMapDataJson(ObjectMapper mapper, String mapDataJson) {
        if (!StringUtils.hasText(mapDataJson)) return null;
        try {
            return sanitize(mapper, mapper.readTree(mapDataJson));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static JsonNode sanitize(ObjectMapper mapper, JsonNode value) {
        if (!(value instanceof ObjectNode source)) return null;
        ObjectNode safe = mapper.createObjectNode();
        copyText(source, safe, "geoType");
        copyMarker(mapper, source, safe, "marker");
        copyMarkers(mapper, source, safe);
        copyStringArray(mapper, source, safe, "provinceNames");
        copyStringArray(mapper, source, safe, "historicalLocations");
        copyStringArray(mapper, source, safe, "gadmRefs");
        copyDisplayGeometry(mapper, source, safe);
        copyFocusGeometry(mapper, source, safe);
        return safe.isEmpty() ? null : safe;
    }

    private static void copyDisplayGeometry(ObjectMapper mapper, ObjectNode source, ObjectNode target) {
        if (!(source.get("displayGeometry") instanceof ObjectNode display)) return;
        ObjectNode safe = mapper.createObjectNode();
        copyText(display, safe, "geoType");
        copyMarker(mapper, display, safe, "marker");
        copyStringArray(mapper, display, safe, "provinceNames");
        copyStringArray(mapper, display, safe, "historicalLocations");
        if (!safe.isEmpty()) target.set("displayGeometry", safe);
    }

    private static void copyFocusGeometry(ObjectMapper mapper, ObjectNode source, ObjectNode target) {
        if (!(source.get("focusGeometry") instanceof ObjectNode focus)) return;
        ObjectNode safe = mapper.createObjectNode();
        copyText(focus, safe, "mode");
        copyNumber(focus, safe, "zoom");
        copyStringArray(mapper, focus, safe, "provinceNames");
        if (focus.get("center") instanceof ObjectNode center) {
            ObjectNode safeCenter = mapper.createObjectNode();
            copyNumber(center, safeCenter, "lat");
            copyNumber(center, safeCenter, "lng");
            if (!safeCenter.isEmpty()) safe.set("center", safeCenter);
        }
        if (!safe.isEmpty()) target.set("focusGeometry", safe);
    }

    private static void copyMarkers(ObjectMapper mapper, ObjectNode source, ObjectNode target) {
        if (!(source.get("markers") instanceof ArrayNode markers)) return;
        ArrayNode safeMarkers = mapper.createArrayNode();
        for (JsonNode item : markers) {
            if (item instanceof ObjectNode marker) {
                ObjectNode safe = sanitizeMarker(mapper, marker);
                if (!safe.isEmpty()) safeMarkers.add(safe);
            }
        }
        if (!safeMarkers.isEmpty()) target.set("markers", safeMarkers);
    }

    private static void copyMarker(
            ObjectMapper mapper, ObjectNode source, ObjectNode target, String key
    ) {
        if (source.get(key) instanceof ObjectNode marker) {
            ObjectNode safe = sanitizeMarker(mapper, marker);
            if (!safe.isEmpty()) target.set(key, safe);
        }
    }

    private static ObjectNode sanitizeMarker(ObjectMapper mapper, ObjectNode marker) {
        ObjectNode safe = mapper.createObjectNode();
        copyText(marker, safe, "name");
        copyText(marker, safe, "label");
        copyNumber(marker, safe, "lat");
        copyNumber(marker, safe, "lng");
        copyNumber(marker, safe, "confidence");
        return safe;
    }

    private static void copyStringArray(
            ObjectMapper mapper, ObjectNode source, ObjectNode target, String key
    ) {
        if (!(source.get(key) instanceof ArrayNode values)) return;
        ArrayNode safe = mapper.createArrayNode();
        for (JsonNode value : values) {
            if (value.isTextual() && !isLocal(value.asText())) safe.add(value.asText());
        }
        if (!safe.isEmpty()) target.set(key, safe);
    }

    private static void copyText(ObjectNode source, ObjectNode target, String key) {
        JsonNode value = source.get(key);
        if (value != null && value.isTextual() && !isLocal(value.asText())) {
            target.put(key, value.asText());
        }
    }

    private static void copyNumber(ObjectNode source, ObjectNode target, String key) {
        JsonNode value = source.get(key);
        if (value != null && value.isNumber()) target.set(key, value.deepCopy());
    }

    public static boolean isLocal(String value) {
        return value != null && value.trim().toLowerCase().startsWith("local:");
    }
}
