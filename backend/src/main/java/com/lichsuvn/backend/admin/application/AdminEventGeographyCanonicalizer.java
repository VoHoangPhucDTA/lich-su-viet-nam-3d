package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.admin.api.dto.AdminEventGeographyDtos;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public final class AdminEventGeographyCanonicalizer {
    private static final int MAX_ITEMS = 100;
    private static final int MAX_LABEL_LENGTH = 160;
    private static final int MAX_MAP_DATA_BYTES = 64 * 1024;
    private static final BigDecimal MIN_ZOOM = BigDecimal.ONE;
    private static final BigDecimal MAX_ZOOM = BigDecimal.valueOf(20);

    private final ObjectMapper mapper;
    private final VietnamGadmRegistry registry;

    public AdminEventGeographyCanonicalizer(ObjectMapper mapper, VietnamGadmRegistry registry) {
        this.mapper = mapper;
        this.registry = registry;
    }

    public CanonicalGeography canonicalize(AdminEventGeographyDtos.Payload payload) {
        if (payload == null) invalid("INVALID_GEOGRAPHY_REQUEST", "geography is required");
        List<String> historical = labels(payload.historicalLocations(), "historicalLocations");
        List<AdminEventGeographyDtos.Marker> markers = markers(payload);
        List<String> regionRefs = regionRefs(payload);
        List<String> provinceNames = regionRefs.stream().map(registry::label).toList();
        validateShape(payload, markers, regionRefs);

        ObjectNode mapData = mapper.createObjectNode();
        mapData.put("geoType", payload.geoType());
        if (payload instanceof AdminEventGeographyDtos.Point) {
            mapData.set("marker", markerNode(markers.getFirst()));
        } else if (payload instanceof AdminEventGeographyDtos.MultiPoint) {
            mapData.set("markers", markerArray(markers));
        } else if (payload instanceof AdminEventGeographyDtos.MultiPolygon) {
            putStrings(mapData, "gadmRefs", regionRefs);
            putStrings(mapData, "provinceNames", provinceNames);
        } else if (payload instanceof AdminEventGeographyDtos.Mixed) {
            mapData.set("marker", markerNode(markers.getFirst()));
            mapData.set("markers", markerArray(markers));
            putStrings(mapData, "gadmRefs", regionRefs);
            putStrings(mapData, "provinceNames", provinceNames);
        }
        putStrings(mapData, "historicalLocations", historical);
        mapData.set("displayGeometry", displayGeometry(payload.geoType(), markers, provinceNames, historical));
        mapData.set("focusGeometry", focusGeometry(payload.geoType(), payload.focus(), markers, provinceNames));

        String json;
        try {
            json = mapper.writeValueAsString(mapData);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize canonical mapData", ex);
        }
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_MAP_DATA_BYTES) {
            invalid("GEOGRAPHY_PAYLOAD_TOO_LARGE", "Canonical mapData must not exceed 64 KiB");
        }
        BigDecimal lat = markers.isEmpty() ? null : markers.getFirst().lat();
        BigDecimal lng = markers.isEmpty() ? null : markers.getFirst().lng();
        return new CanonicalGeography(
                payload.geoType(), lat, lng, provinceNames, historical,
                List.copyOf(markers), regionRefs, mapData, json
        );
    }

    private List<AdminEventGeographyDtos.Marker> markers(AdminEventGeographyDtos.Payload payload) {
        List<AdminEventGeographyDtos.Marker> values = switch (payload) {
            case AdminEventGeographyDtos.Point value -> List.of(value.marker());
            case AdminEventGeographyDtos.MultiPoint value -> safe(value.markers());
            case AdminEventGeographyDtos.Mixed value -> safe(value.markers());
            default -> List.of();
        };
        if (values.size() > MAX_ITEMS) {
            invalid("GEOGRAPHY_PAYLOAD_TOO_LARGE", "At most 100 markers are allowed");
        }
        Set<String> seen = new HashSet<>();
        for (AdminEventGeographyDtos.Marker marker : values) {
            if (marker == null || marker.lat() == null || marker.lng() == null) {
                invalid("GEOMETRY_REQUIRED", "Every marker requires lat and lng");
            }
            coordinate(marker.lat(), -90, 90, "lat");
            coordinate(marker.lng(), -180, 180, "lng");
            boundedOptional(marker.name(), "marker.name");
            boundedOptional(marker.label(), "marker.label");
            if (!StringUtils.hasText(marker.name()) && !StringUtils.hasText(marker.label())) {
                invalid("INVALID_GEOGRAPHY_REQUEST", "Every marker requires a name or label");
            }
            if (marker.confidence() != null
                    && (marker.confidence().compareTo(BigDecimal.ZERO) < 0
                    || marker.confidence().compareTo(BigDecimal.ONE) > 0)) {
                invalid("INVALID_GEOGRAPHY_REQUEST", "marker.confidence must be between 0 and 1");
            }
            String key = marker.lat().stripTrailingZeros().toPlainString()
                    + ":" + marker.lng().stripTrailingZeros().toPlainString();
            if (!seen.add(key)) invalid("DUPLICATE_MARKER", "Marker coordinates must be unique");
        }
        return List.copyOf(values);
    }

    private List<String> regionRefs(AdminEventGeographyDtos.Payload payload) {
        List<AdminEventGeographyDtos.Region> regions = switch (payload) {
            case AdminEventGeographyDtos.MultiPolygon value -> safe(value.regions());
            case AdminEventGeographyDtos.Mixed value -> safe(value.regions());
            default -> List.of();
        };
        if (regions.size() > MAX_ITEMS) {
            invalid("GEOGRAPHY_PAYLOAD_TOO_LARGE", "At most 100 regions are allowed");
        }
        List<String> refs = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (AdminEventGeographyDtos.Region region : regions) {
            String ref = region == null ? null : region.gadmRef();
            if (!StringUtils.hasText(ref) || !registry.contains(ref)) {
                invalid("INVALID_REGION_REF", "Region reference is not approved");
            }
            if (!seen.add(ref)) invalid("DUPLICATE_REGION_REF", "Region references must be unique");
            refs.add(ref);
        }
        return List.copyOf(refs);
    }

    private void validateShape(
            AdminEventGeographyDtos.Payload payload,
            List<AdminEventGeographyDtos.Marker> markers,
            List<String> regionRefs
    ) {
        String expected = switch (payload) {
            case AdminEventGeographyDtos.NoLocation ignored -> "no_location";
            case AdminEventGeographyDtos.Nationwide ignored -> "nationwide";
            case AdminEventGeographyDtos.Point ignored -> "point";
            case AdminEventGeographyDtos.MultiPoint ignored -> "multi_point";
            case AdminEventGeographyDtos.MultiPolygon ignored -> "multi_polygon";
            case AdminEventGeographyDtos.Mixed ignored -> "mixed";
        };
        if (!expected.equals(payload.geoType())) {
            invalid("INVALID_GEO_TYPE", "geoType does not match the selected geography variant");
        }
        if (payload instanceof AdminEventGeographyDtos.MultiPoint && markers.size() < 2) {
            invalid("GEOMETRY_REQUIRED", "multi_point requires at least two markers");
        }
        if (payload instanceof AdminEventGeographyDtos.MultiPolygon && regionRefs.isEmpty()) {
            invalid("GEOMETRY_REQUIRED", "multi_polygon requires at least one region");
        }
        if (payload instanceof AdminEventGeographyDtos.Mixed
                && (markers.isEmpty() || regionRefs.isEmpty())) {
            invalid("GEOMETRY_REQUIRED", "mixed requires at least one marker and one region");
        }
    }

    private List<String> labels(List<String> source, String field) {
        if (source == null) return List.of();
        if (source.size() > MAX_ITEMS) {
            invalid("GEOGRAPHY_PAYLOAD_TOO_LARGE", "At most 100 historical labels are allowed");
        }
        List<String> values = new ArrayList<>();
        for (String raw : source) {
            String value = raw == null ? "" : raw.trim();
            if (!StringUtils.hasText(value) || value.length() > MAX_LABEL_LENGTH) {
                invalid("INVALID_GEOGRAPHY_REQUEST", field + " contains an invalid label");
            }
            forbidden(value, field);
            values.add(value);
        }
        return List.copyOf(values);
    }

    private ObjectNode markerNode(AdminEventGeographyDtos.Marker marker) {
        ObjectNode node = mapper.createObjectNode();
        if (StringUtils.hasText(marker.name())) node.put("name", marker.name().trim());
        if (StringUtils.hasText(marker.label())) node.put("label", marker.label().trim());
        node.put("lat", marker.lat());
        node.put("lng", marker.lng());
        if (marker.confidence() != null) node.put("confidence", marker.confidence());
        return node;
    }

    private ArrayNode markerArray(List<AdminEventGeographyDtos.Marker> markers) {
        ArrayNode values = mapper.createArrayNode();
        markers.forEach(marker -> values.add(markerNode(marker)));
        return values;
    }

    private ObjectNode displayGeometry(
            String geoType,
            List<AdminEventGeographyDtos.Marker> markers,
            List<String> provinceNames,
            List<String> historical
    ) {
        ObjectNode display = mapper.createObjectNode();
        display.put("geoType", geoType);
        if (!markers.isEmpty()) display.set("marker", markerNode(markers.getFirst()));
        putStrings(display, "provinceNames", provinceNames);
        putStrings(display, "historicalLocations", historical);
        return display;
    }

    private ObjectNode focusGeometry(
            String geoType,
            AdminEventGeographyDtos.Focus requested,
            List<AdminEventGeographyDtos.Marker> markers,
            List<String> provinceNames
    ) {
        ObjectNode focus = mapper.createObjectNode();
        String requestedMode = requested == null || !StringUtils.hasText(requested.mode())
                ? "auto" : requested.mode();
        Integer zoom = requested == null ? null : requested.zoom();
        if ("no_location".equals(geoType) || "nationwide".equals(geoType)) {
            if (!"auto".equals(requestedMode) || zoom != null) {
                invalid("INVALID_FOCUS_GEOMETRY", geoType + " supports only automatic focus");
            }
            focus.put("mode", "auto");
            return focus;
        }
        if (zoom != null && (BigDecimal.valueOf(zoom).compareTo(MIN_ZOOM) < 0
                || BigDecimal.valueOf(zoom).compareTo(MAX_ZOOM) > 0)) {
            invalid("INVALID_FOCUS_GEOMETRY", "focus zoom must be between 1 and 20");
        }
        if ("point".equals(geoType)) {
            if (!"auto".equals(requestedMode)) {
                invalid("INVALID_FOCUS_GEOMETRY", "point focus center is derived from its marker");
            }
            focus.put("mode", "point");
            ObjectNode center = mapper.createObjectNode();
            center.put("lat", markers.getFirst().lat());
            center.put("lng", markers.getFirst().lng());
            focus.set("center", center);
        } else {
            if (!Set.of("auto", "bounds").contains(requestedMode)) {
                invalid("INVALID_FOCUS_GEOMETRY", "multi geography supports auto or bounds focus");
            }
            focus.put("mode", requestedMode);
            putStrings(focus, "provinceNames", provinceNames);
        }
        if (zoom != null) focus.put("zoom", zoom);
        return focus;
    }

    private void boundedOptional(String value, String field) {
        if (value == null) return;
        if (value.trim().length() > MAX_LABEL_LENGTH) {
            invalid("INVALID_GEOGRAPHY_REQUEST", field + " is too long");
        }
        forbidden(value, field);
    }

    private static void forbidden(String value, String field) {
        if (value != null && value.trim().toLowerCase().startsWith("local:")) {
            invalid("GEOGRAPHY_FIELD_FORBIDDEN", field + " must not contain internal provenance");
        }
    }

    private static void coordinate(BigDecimal value, int min, int max, String field) {
        if (value.compareTo(BigDecimal.valueOf(min)) < 0
                || value.compareTo(BigDecimal.valueOf(max)) > 0) {
            invalid("INVALID_COORDINATE", field + " is outside its allowed range");
        }
    }

    private static <T> List<T> safe(List<T> values) {
        return values == null ? List.of() : values;
    }

    private static void putStrings(ObjectNode target, String field, List<String> values) {
        if (values == null || values.isEmpty()) return;
        ArrayNode array = target.arrayNode();
        values.forEach(array::add);
        target.set(field, array);
    }

    private static void invalid(String code, String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public record CanonicalGeography(
            String geoType,
            BigDecimal lat,
            BigDecimal lng,
            List<String> provinceNames,
            List<String> historicalLocations,
            List<AdminEventGeographyDtos.Marker> markers,
            List<String> gadmRefs,
            JsonNode mapData,
            String mapDataJson
    ) {
        public int markerCount() {
            return markers.size();
        }

        public int regionCount() {
            return gadmRefs.size();
        }
    }
}
