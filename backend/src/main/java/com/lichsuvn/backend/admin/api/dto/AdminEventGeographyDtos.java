package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.ObjectCodec;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.common.exception.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/**
 * Closed, discriminator-based geography mutation contract.
 *
 * The payload deliberately does not contain a generic JSON/map field.  The
 * service derives the canonical mapData document from these values.
 */
public final class AdminEventGeographyDtos {
    private AdminEventGeographyDtos() {
    }

    @JsonDeserialize(using = PatchDeserializer.class)
    @tools.jackson.databind.annotation.JsonDeserialize(using = ToolsPatchDeserializer.class)
    public record Patch(
            @NotBlank String expectedUpdatedAt,
            @NotNull @Valid Payload geography
    ) {
    }

    /** Spring Boot 4 MVC uses Jackson 3 (tools.jackson); keep this parser closed too. */
    public static final class ToolsPatchDeserializer
            extends tools.jackson.databind.ValueDeserializer<Patch> {
        private static final Set<String> ROOT_FIELDS = Set.of("expectedUpdatedAt", "geography");
        private static final Set<String> COMMON_FIELDS = Set.of("geoType", "historicalLocations", "focus");
        private static final Set<String> MARKER_FIELDS = Set.of("name", "label", "lat", "lng", "confidence");
        private static final Set<String> REGION_FIELDS = Set.of("gadmRef");
        private static final Set<String> FOCUS_FIELDS = Set.of("mode", "zoom");

        @Override
        public Patch deserialize(tools.jackson.core.JsonParser parser,
                                  tools.jackson.databind.DeserializationContext context)
                throws tools.jackson.core.JacksonException {
            tools.jackson.databind.JsonNode root =
                    tools.jackson.databind.json.JsonMapper.shared().readTree(parser);
            if (root == null || !root.isObject()) reject("Invalid geography request");
            rejectUnknown(root, ROOT_FIELDS);
            String expected = text(root.get("expectedUpdatedAt"));
            tools.jackson.databind.JsonNode geography = root.get("geography");
            if (expected == null || geography == null || !geography.isObject()) {
                reject("Invalid geography request");
            }
            rejectGeography(geography);
            return new Patch(expected, payload(geography));
        }

        private Payload payload(tools.jackson.databind.JsonNode value) {
            String type = text(value.get("geoType"));
            List<String> historical = strings(value.get("historicalLocations"));
            Focus focus = focus(value.get("focus"));
            return switch (type == null ? "" : type) {
                case "no_location" -> new NoLocation(type, historical, focus);
                case "nationwide" -> new Nationwide(type, historical, focus);
                case "point" -> new Point(type, marker(value.get("marker")), historical, focus);
                case "multi_point" -> new MultiPoint(type, markers(value.get("markers")), historical, focus);
                case "multi_polygon" -> new MultiPolygon(type, regions(value.get("regions")), historical, focus);
                case "mixed" -> new Mixed(type, markers(value.get("markers")),
                        regions(value.get("regions")), historical, focus);
                default -> {
                    reject("Invalid geoType");
                    yield new NoLocation(type, historical, focus);
                }
            };
        }

        private void rejectGeography(tools.jackson.databind.JsonNode geography) {
            String type = text(geography.get("geoType"));
            Set<String> allowed = switch (type == null ? "" : type) {
                case "no_location", "nationwide" -> COMMON_FIELDS;
                case "point" -> union(COMMON_FIELDS, Set.of("marker"));
                case "multi_point" -> union(COMMON_FIELDS, Set.of("markers"));
                case "multi_polygon" -> union(COMMON_FIELDS, Set.of("regions"));
                case "mixed" -> union(COMMON_FIELDS, Set.of("markers", "regions"));
                default -> COMMON_FIELDS;
            };
            rejectUnknown(geography, allowed);
            validateStringArray(geography.get("historicalLocations"));
            validateFocus(geography.get("focus"));
            validateMarker(geography.get("marker"));
            validateObjectArray(geography.get("markers"), MARKER_FIELDS, true);
            validateObjectArray(geography.get("regions"), REGION_FIELDS, false);
        }

        private void validateStringArray(tools.jackson.databind.JsonNode value) {
            if (value == null || value.isNull()) return;
            if (!value.isArray()) reject("Invalid geography request");
            for (tools.jackson.databind.JsonNode item : value) {
                if (!item.isString()) reject("Invalid geography request");
            }
        }

        private void validateFocus(tools.jackson.databind.JsonNode value) {
            if (value == null || value.isNull()) return;
            if (!value.isObject()) reject("Invalid geography request");
            rejectUnknown(value, FOCUS_FIELDS);
            requireOptionalString(value.get("mode"));
            tools.jackson.databind.JsonNode zoom = value.get("zoom");
            if (zoom != null && !zoom.isNull() && !zoom.isIntegralNumber()) {
                reject("Invalid geography request");
            }
        }

        private void validateMarker(tools.jackson.databind.JsonNode value) {
            if (value == null || value.isNull()) return;
            if (!value.isObject()) reject("Invalid geography request");
            rejectUnknown(value, MARKER_FIELDS);
            requireOptionalString(value.get("name"));
            requireOptionalString(value.get("label"));
            requireOptionalNumber(value.get("lat"));
            requireOptionalNumber(value.get("lng"));
            requireOptionalNumber(value.get("confidence"));
        }

        private void validateObjectArray(
                tools.jackson.databind.JsonNode value,
                Set<String> allowed,
                boolean markerItems
        ) {
            if (value == null || value.isNull()) return;
            if (!value.isArray()) reject("Invalid geography request");
            for (tools.jackson.databind.JsonNode item : value) {
                if (!item.isObject()) reject("Invalid geography request");
                rejectUnknown(item, allowed);
                if (markerItems) {
                    validateMarker(item);
                } else {
                    requireOptionalString(item.get("gadmRef"));
                }
            }
        }

        private void requireOptionalString(tools.jackson.databind.JsonNode value) {
            if (value != null && !value.isNull() && !value.isString()) {
                reject("Invalid geography request");
            }
        }

        private void requireOptionalNumber(tools.jackson.databind.JsonNode value) {
            if (value != null && !value.isNull() && !value.isNumber()) {
                reject("Invalid geography request");
            }
        }

        private void rejectUnknown(tools.jackson.databind.JsonNode value, Set<String> allowed) {
            if (value == null || !value.isObject()) return;
            for (String name : value.propertyNames()) {
                if (!allowed.contains(name)) reject("Unsupported JSON property: " + name);
            }
        }

        private Marker marker(tools.jackson.databind.JsonNode value) {
            if (value == null || value.isNull()) return null;
            return new Marker(text(value.get("name")), text(value.get("label")),
                    decimal(value.get("lat")), decimal(value.get("lng")),
                    decimal(value.get("confidence")));
        }

        private List<Marker> markers(tools.jackson.databind.JsonNode value) {
            if (value == null || !value.isArray()) return null;
            List<Marker> result = new java.util.ArrayList<>();
            for (tools.jackson.databind.JsonNode item : value) result.add(marker(item));
            return result;
        }

        private List<Region> regions(tools.jackson.databind.JsonNode value) {
            if (value == null || !value.isArray()) return null;
            List<Region> result = new java.util.ArrayList<>();
            for (tools.jackson.databind.JsonNode item : value) result.add(new Region(text(item.get("gadmRef"))));
            return result;
        }

        private Focus focus(tools.jackson.databind.JsonNode value) {
            return value == null || value.isNull() ? null
                    : new Focus(text(value.get("mode")),
                    value.get("zoom") == null || value.get("zoom").isNull()
                            ? null : value.get("zoom").asInt());
        }

        private List<String> strings(tools.jackson.databind.JsonNode value) {
            if (value == null || !value.isArray()) return null;
            List<String> result = new java.util.ArrayList<>();
            for (tools.jackson.databind.JsonNode item : value) result.add(text(item));
            return result;
        }

        private String text(tools.jackson.databind.JsonNode value) {
            return value == null || value.isNull() || !value.isString() ? null : value.asText();
        }

        private BigDecimal decimal(tools.jackson.databind.JsonNode value) {
            return value == null || value.isNull() || !value.isNumber() ? null : value.decimalValue();
        }

        private static Set<String> union(Set<String> left, Set<String> right) {
            java.util.HashSet<String> result = new java.util.HashSet<>(left);
            result.addAll(right);
            return Set.copyOf(result);
        }

        private static void reject(String message) {
            String code = message.startsWith("Unsupported JSON property:")
                    ? "UNSUPPORTED_JSON_PROPERTY"
                    : "Invalid geoType".equals(message)
                    ? "INVALID_GEO_TYPE"
                    : "INVALID_GEOGRAPHY_REQUEST";
            String publicMessage = "INVALID_GEO_TYPE".equals(code)
                    ? "geoType is missing or unsupported" : message;
            throw new ApiException(HttpStatus.BAD_REQUEST, code, publicMessage);
        }
    }

    public static final class PatchDeserializer extends JsonDeserializer<Patch> {
        private static final Set<String> ROOT_FIELDS = Set.of("expectedUpdatedAt", "geography");
        private static final Set<String> COMMON_FIELDS = Set.of("geoType", "historicalLocations", "focus");
        private static final Set<String> MARKER_FIELDS = Set.of("name", "label", "lat", "lng", "confidence");
        private static final Set<String> REGION_FIELDS = Set.of("gadmRef");
        private static final Set<String> FOCUS_FIELDS = Set.of("mode", "zoom");

        @Override
        public Patch deserialize(JsonParser parser, DeserializationContext context)
                throws java.io.IOException {
            ObjectCodec codec = parser.getCodec();
            JsonNode root = codec.readTree(parser);
            requireObject(root, "Request must be an object");
            rejectUnknown((ObjectNode) root, ROOT_FIELDS, parser);
            JsonNode expected = root.get("expectedUpdatedAt");
            JsonNode geography = root.get("geography");
            if (expected == null || !expected.isTextual() || geography == null || !geography.isObject()) {
                throw JsonMappingException.from(parser, "Invalid geography request");
            }
            rejectGeographyUnknown((ObjectNode) geography, parser);
            com.fasterxml.jackson.databind.ObjectMapper mapper =
                    (com.fasterxml.jackson.databind.ObjectMapper) codec;
            Payload payload = mapper.treeToValue(geography, Payload.class);
            return new Patch(expected.asText(), payload);
        }

        private void rejectGeographyUnknown(ObjectNode geography, JsonParser parser)
                throws JsonMappingException {
            String geoType = geography.path("geoType").asText(null);
            Set<String> allowed = switch (geoType == null ? "" : geoType) {
                case "no_location", "nationwide" -> COMMON_FIELDS;
                case "point" -> union(COMMON_FIELDS, Set.of("marker"));
                case "multi_point" -> union(COMMON_FIELDS, Set.of("markers"));
                case "multi_polygon" -> union(COMMON_FIELDS, Set.of("regions"));
                case "mixed" -> union(COMMON_FIELDS, Set.of("markers", "regions"));
                default -> COMMON_FIELDS;
            };
            rejectUnknown(geography, allowed, parser);
            if (geography.has("focus")) rejectUnknownObject(geography.get("focus"), FOCUS_FIELDS, parser);
            if (geography.has("marker")) rejectUnknownObject(geography.get("marker"), MARKER_FIELDS, parser);
            if (geography.has("markers")) rejectArrayObjects(geography.get("markers"), MARKER_FIELDS, parser);
            if (geography.has("regions")) rejectArrayObjects(geography.get("regions"), REGION_FIELDS, parser);
        }

        private void rejectArrayObjects(JsonNode value, Set<String> allowed, JsonParser parser)
                throws JsonMappingException {
            if (!value.isArray()) return;
            for (JsonNode item : value) rejectUnknownObject(item, allowed, parser);
        }

        private void rejectUnknownObject(JsonNode value, Set<String> allowed, JsonParser parser)
                throws JsonMappingException {
            if (!value.isObject()) return;
            rejectUnknown((ObjectNode) value, allowed, parser);
        }

        private void rejectUnknown(ObjectNode value, Set<String> allowed, JsonParser parser)
                throws JsonMappingException {
            var fields = value.fieldNames();
            while (fields.hasNext()) {
                String field = fields.next();
                if (!allowed.contains(field)) {
                    throw JsonMappingException.from(parser, "Unsupported JSON property: " + field);
                }
            }
        }

        private static Set<String> union(Set<String> first, Set<String> second) {
            java.util.HashSet<String> values = new java.util.HashSet<>(first);
            values.addAll(second);
            return Set.copyOf(values);
        }

        private static void requireObject(JsonNode node, String message) {
            if (node == null || !node.isObject()) throw new IllegalArgumentException(message);
        }
    }

    @JsonTypeInfo(
            use = JsonTypeInfo.Id.NAME,
            include = JsonTypeInfo.As.PROPERTY,
            property = "geoType",
            visible = true
    )
    @JsonSubTypes({
            @JsonSubTypes.Type(value = NoLocation.class, name = "no_location"),
            @JsonSubTypes.Type(value = Nationwide.class, name = "nationwide"),
            @JsonSubTypes.Type(value = Point.class, name = "point"),
            @JsonSubTypes.Type(value = MultiPoint.class, name = "multi_point"),
            @JsonSubTypes.Type(value = MultiPolygon.class, name = "multi_polygon"),
            @JsonSubTypes.Type(value = Mixed.class, name = "mixed")
    })
    public sealed interface Payload
            permits NoLocation, Nationwide, Point, MultiPoint, MultiPolygon, Mixed {
        String geoType();

        List<String> historicalLocations();

        Focus focus();

        @JsonAnySetter
        default void rejectUnknown(String property, JsonNode value) {
            throw new IllegalArgumentException("Unsupported JSON property: " + property);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record NoLocation(
            String geoType,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Nationwide(
            String geoType,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Point(
            String geoType,
            @NotNull @Valid Marker marker,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record MultiPoint(
            String geoType,
            @NotNull @Valid List<@NotNull @Valid Marker> markers,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record MultiPolygon(
            String geoType,
            @NotNull @Valid List<@NotNull @Valid Region> regions,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Mixed(
            String geoType,
            @NotNull @Valid List<@NotNull @Valid Marker> markers,
            @NotNull @Valid List<@NotNull @Valid Region> regions,
            List<String> historicalLocations,
            Focus focus
    ) implements Payload {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Marker(
            String name,
            String label,
            @NotNull BigDecimal lat,
            @NotNull BigDecimal lng,
            BigDecimal confidence
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Region(
            @NotBlank String gadmRef
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record Focus(
            String mode,
            Integer zoom
    ) {
    }
}
