package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
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
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Pure projection + hashing helpers for the canonical geography sync.
 *
 * <p>Canonical values only: point, multi_point, multi_polygon, mixed,
 * nationwide, no_location. Nothing is ever derived from focusGeometry,
 * polygon centroids, province centroids, or camera centers.
 */
@Component
public final class CanonicalGeographyProjection {

    private final ObjectMapper objectMapper;
    private final ObjectMapper hashMapper;

    public CanonicalGeographyProjection(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.hashMapper = objectMapper.copy()
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
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

    /** Strips mapData + display.showOnMap from a record copy. */
    public ObjectNode geographyStripped(JsonNode record) {
        ObjectNode copy = objectMapper.createObjectNode();
        record.fields().forEachRemaining(entry -> copy.set(entry.getKey(), entry.getValue().deepCopy()));
        copy.remove("mapData");
        ObjectNode display = copy.path("display").isObject()
                ? (ObjectNode) copy.path("display").deepCopy()
                : objectMapper.createObjectNode();
        display.remove("showOnMap");
        copy.set("display", display);
        return copy;
    }

    /** Deterministic SHA-256 over the geography projection (sorted keys). */
    public String geoHash(String geoType, BigDecimal lat, BigDecimal lng,
                          List<String> provinceNames, JsonNode mapData, boolean showOnMap) {
        Map<String, Object> projection = new TreeMap<>();
        projection.put("geoType", geoType);
        // DECIMAL(10,7) returns scaled values (e.g. 21.0200000) while JSON marker
        // values carry their natural scale (21.02); normalize so both hash equal.
        projection.put("lat", normalizedDecimal(lat));
        projection.put("lng", normalizedDecimal(lng));
        projection.put("provinceNames", provinceNames);
        // MySQL may reorder JSON object keys on storage; sort keys recursively
        // so the in-memory record and the stored raw_json hash identically.
        projection.put("mapData", sortedNode(mapData));
        projection.put("showOnMap", showOnMap);
        return sha256(write(projection));
    }

    /** Deterministic SHA-256 over the non-geography projection (sorted keys). */
    public String nonGeoHash(JsonNode record) {
        return sha256(write(geographyStripped(record)));
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

    private static JsonNode sortedNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return node;
        }
        if (node.isObject()) {
            com.fasterxml.jackson.databind.node.ObjectNode sorted = new ObjectMapper().createObjectNode();
            java.util.List<String> names = new java.util.ArrayList<>();
            node.fieldNames().forEachRemaining(names::add);
            java.util.Collections.sort(names);
            for (String name : names) {
                sorted.set(name, sortedNode(node.get(name)));
            }
            return sorted;
        }
        if (node.isArray()) {
            com.fasterxml.jackson.databind.node.ArrayNode sorted = new ObjectMapper().createArrayNode();
            node.forEach(item -> sorted.add(sortedNode(item)));
            return sorted;
        }
        return node;
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

    private String write(Object value) {
        try {
            return hashMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize projection", ex);
        }
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
