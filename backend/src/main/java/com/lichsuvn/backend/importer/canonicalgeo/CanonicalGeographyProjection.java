package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.event.domain.EventGeoType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * Pure projection + hashing helpers for the canonical geography sync.
 *
 * <p>Canonical values only: point, multi_point, multi_polygon, mixed,
 * nationwide, no_location. Nothing is ever derived from focusGeometry,
 * polygon centroids, province centroids, or camera centers.
 *
 * <p>Phase C2-T1 made both hashes — {@link #nonGeoHash(JsonNode)} and
 * {@link #geoHash(String, BigDecimal, BigDecimal, List, JsonNode, boolean)}
 * — deterministic over {@link JsonNode} field-iteration order by routing
 * their inputs through a single canonicalization pass
 * ({@link #canonicalize(JsonNode)} + {@link #canonicalJsonString(JsonNode)}).
 * The previous implementation relied on Jackson/MySQL ObjectNode iteration
 * order and only sorted top-level {@code Map<String,Object>} boundaries,
 * which produced non-deterministic {@code expectedCurrentNonGeoHash} values
 * across independent sessions (361/361 row drift in Phase C2-A). The new
 * path sorts every nested object key lexicographically while preserving
 * array order and scalar values exactly.
 */
@Component
public final class CanonicalGeographyProjection {

    private final ObjectMapper objectMapper;

    public CanonicalGeographyProjection(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public record Geography(BigDecimal lat, BigDecimal lng, List<String> provinceNames) {
    }

    /**
     * lat/lng projection per canonical geoType. Only marker data is used.
     */
    public Geography projectLatLng(String geoType, JsonNode mapData, String eventId) {
        return switch (geoType) {
            case EventGeoType.POINT -> fromMarker(mapData.path("marker"), eventId);
            case EventGeoType.MULTI_POINT -> {
                JsonNode markers = mapData.path("markers");
                if (!markers.isArray() || markers.isEmpty()) {
                    throw new IllegalArgumentException(
                            "Event " + eventId + ": multi_point requires a non-empty markers array");
                }
                JsonNode first = markers.get(0);
                JsonNode marker = mapData.path("marker");
                if (marker.isObject() && marker.hasNonNull("lat") && marker.hasNonNull("lng")) {
                    boolean equal = first.hasNonNull("lat") && first.hasNonNull("lng")
                            && marker.path("lat").equals(first.path("lat"))
                            && marker.path("lng").equals(first.path("lng"));
                    if (!equal) {
                        throw new IllegalArgumentException(
                                "Event " + eventId + ": multi_point primary marker must equal markers[0]");
                    }
                }
                yield fromMarker(first, eventId);
            }
            case EventGeoType.MIXED -> fromMarker(mapData.path("marker"), eventId);
            case EventGeoType.MULTI_POLYGON -> new Geography(null, null, stringList(mapData.path("provinceNames")));
            default -> new Geography(null, null, List.of());
        };
    }

    private Geography fromMarker(JsonNode marker, String eventId) {
        if (marker == null || !marker.isObject() || !marker.hasNonNull("lat") || !marker.hasNonNull("lng")) {
            return new Geography(null, null, List.of());
        }
        return new Geography(
                marker.path("lat").decimalValue(),
                marker.path("lng").decimalValue(),
                List.of());
    }

    /** province_names for multi_polygon/mixed come from mapData.provinceNames. */
    public List<String> projectProvinceNames(String geoType, JsonNode mapData) {
        if (EventGeoType.MULTI_POLYGON.equals(geoType) || EventGeoType.MIXED.equals(geoType)) {
            return stringList(mapData.path("provinceNames"));
        }
        return List.of();
    }

    public boolean projectShowOnMap(String geoType, JsonNode record) {
        if (EventGeoType.NATIONWIDE.equals(geoType) || EventGeoType.NO_LOCATION.equals(geoType)) {
            return false;
        }
        return record.path("display").path("showOnMap").asBoolean(true);
    }

    /**
     * Strips {@code mapData} and {@code display.showOnMap} from a record copy,
     * then routes the result through {@link #canonicalize(JsonNode)} so the
     * returned tree is byte-stable regardless of how the input ObjectNode
     * ordered its keys (Jackson parser order, MySQL JSON column reorder, or
     * any other source order). This is the single canonical projection used
     * for the non-geography hash input.
     */
    public ObjectNode geographyStripped(JsonNode record) {
        ObjectNode copy = objectMapper.createObjectNode();
        record.fields().forEachRemaining(entry -> copy.set(entry.getKey(), entry.getValue().deepCopy()));
        copy.remove("mapData");
        JsonNode displayNode = copy.path("display");
        ObjectNode display = displayNode.isObject()
                ? (ObjectNode) displayNode.deepCopy()
                : objectMapper.createObjectNode();
        display.remove("showOnMap");
        copy.set("display", display);
        return (ObjectNode) canonicalize(copy);
    }

    /**
     * Deterministic SHA-256 over the geography projection. The projection
     * tree is canonicalized (sorted object keys, array order preserved) by
     * {@link #canonicalJsonString(JsonNode)} before hashing, which is the
     * same algorithm and route as {@link #nonGeoHash(JsonNode)}.
     */
    public String geoHash(String geoType, BigDecimal lat, BigDecimal lng,
                          List<String> provinceNames, JsonNode mapData, boolean showOnMap) {
        ObjectNode projection = objectMapper.createObjectNode();
        projection.put("geoType", geoType);
        // DECIMAL(10,7) returns scaled values (e.g. 21.0200000) while JSON marker
        // values carry their natural scale (21.02); normalize to a stable text repr.
        projection.put("lat", normalizedDecimal(lat));
        projection.put("lng", normalizedDecimal(lng));
        projection.set("provinceNames", objectMapper.valueToTree(provinceNames));
        // mapData is canonicalized in-place by canonicalJsonString so the
        // stored raw_json field reorder done by MySQL does not affect the hash.
        projection.set("mapData", mapData);
        projection.put("showOnMap", showOnMap);
        return sha256(canonicalJsonString(projection));
    }

    /** Deterministic SHA-256 over the non-geography projection. */
    public String nonGeoHash(JsonNode record) {
        return sha256(canonicalJsonString(geographyStripped(record)));
    }

    /**
     * Canonical logical SHA-256 over the UTF-8 bytes of {@code path} with
     * CRLF → LF normalization (no other byte changes). Independent of Git's
     * internal line-ending conversion, so a CRLF working-tree copy and an LF
     * committed copy produce the same hash. Differing content still produces
     * a different hash. See C2-P §4.
     */
    public static String canonicalFileSha256(Path path) throws IOException {
        String text = Files.readString(path, StandardCharsets.UTF_8);
        String normalized = text.replace("\r\n", "\n");
        return sha256(normalized);
    }

    /** SHA-256 of an arbitrary canonical JSON string. */
    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    // ----------------------------------------------------- canonical projection

    /**
     * Recursively walks a {@link JsonNode} and returns a tree with the SAME
     * values but with every {@code ObjectNode} having its keys sorted
     * lexicographically. Array order is preserved. Scalars are preserved
     * exactly as the source parser exposes them. {@code null} and
     * {@code MissingNode} propagate unchanged.
     *
     * <p>This is the ONLY canonicalization implementation. Both
     * {@link #canonicalJsonString(JsonNode)} and (via that) every hash
     * method route through it.
     */
    public JsonNode canonicalize(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return node;
        }
        if (node.isObject()) {
            ObjectNode sorted = objectMapper.createObjectNode();
            List<String> names = new ArrayList<>();
            Iterator<String> it = node.fieldNames();
            while (it.hasNext()) {
                names.add(it.next());
            }
            Collections.sort(names);
            for (String name : names) {
                sorted.set(name, canonicalize(node.get(name)));
            }
            return sorted;
        }
        if (node.isArray()) {
            ArrayNode sorted = objectMapper.createArrayNode();
            for (JsonNode item : node) {
                sorted.add(canonicalize(item));
            }
            return sorted;
        }
        return node;
    }

    /**
     * Returns a deterministic JSON string for the canonical projection of
     * {@code node}. Object keys are sorted at every level. Array order is
     * preserved. Scalars use their textual form (numbers keep their natural
     * scale, e.g. {@code 21.02}; strings JSON-escape the same Unicode range
     * as RFC 8259 §7).
     *
     * <p>This is the SAME byte sequence regardless of whether {@code node}
     * was parsed from canonical JSONL, MySQL JSON column reordering, or any
     * other Jackson configuration.
     */
    public static String canonicalJsonString(JsonNode node) {
        StringBuilder sb = new StringBuilder();
        writeCanonical(node, sb);
        return sb.toString();
    }

    private static void writeCanonical(JsonNode node, StringBuilder sb) {
        if (node == null || node.isMissingNode()) {
            return;
        }
        if (node.isNull()) {
            sb.append("null");
            return;
        }
        if (node.isObject()) {
            sb.append('{');
            List<String> names = new ArrayList<>();
            Iterator<String> it = node.fieldNames();
            while (it.hasNext()) {
                names.add(it.next());
            }
            // Already canonicalized upstream; a defensive resort keeps the
            // serializer bullet-proof if a caller passes a non-canonicalized
            // tree (e.g. for in-process debugging or test fixtures).
            Collections.sort(names);
            boolean first = true;
            for (String name : names) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                sb.append('"').append(escapeJsonString(name)).append("\":");
                writeCanonical(node.get(name), sb);
            }
            sb.append('}');
            return;
        }
        if (node.isArray()) {
            sb.append('[');
            boolean first = true;
            for (JsonNode item : node) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeCanonical(item, sb);
            }
            sb.append(']');
            return;
        }
        if (node.isTextual()) {
            sb.append('"').append(escapeJsonString(node.asText())).append('"');
            return;
        }
        if (node.isBoolean()) {
            sb.append(node.asBoolean());
            return;
        }
        if (node.isNumber()) {
            // node.asText() preserves the natural textual form (e.g. "21.02"
            // or "21.0200000"), exactly matching the underlying
            // DecimalNode/LongNode. This is the same shape Jackson emits
            // when serializing numbers via toString().
            sb.append(node.asText());
            return;
        }
        // BinaryNode / POJO / other exotic types are JSON-encoded as a string
        // to keep the byte stream reversible and stable.
        sb.append('"').append(escapeJsonString(node.asText())).append('"');
    }

    private static String escapeJsonString(String raw) {
        StringBuilder out = new StringBuilder(raw.length() + 2);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }

    private static String normalizedDecimal(BigDecimal value) {
        if (value == null) {
            return null;
        }
        // JSON numbers may carry double artifacts (21.020000000000001...) while
        // DECIMAL(10,7) stores 21.0200000; round both to the column scale first.
        return value.setScale(7, java.math.RoundingMode.HALF_UP)
                .stripTrailingZeros()
                .toPlainString();
    }

    private static List<String> stringList(JsonNode node) {
        List<String> items = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                if (item.isTextual() || item.isNumber()) {
                    items.add(item.asText());
                }
            });
        }
        return items;
    }
}
