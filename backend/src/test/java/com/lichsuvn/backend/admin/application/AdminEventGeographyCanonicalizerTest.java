package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventGeographyDtos;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminEventGeographyCanonicalizerTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final VietnamGadmRegistry registry = new VietnamGadmRegistry(mapper);
    private final AdminEventGeographyCanonicalizer canonicalizer =
            new AdminEventGeographyCanonicalizer(mapper, registry);

    @Test
    void discriminatorAcceptsOnlyClosedTypedVariantsAndRejectsUnknownProperties() throws Exception {
        var request = mapper.readValue("""
                {
                  "expectedUpdatedAt":"2026-07-24T10:20:30.123456Z",
                  "geography":{
                    "geoType":"point",
                    "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                    "historicalLocations":[],
                    "focus":{"mode":"auto","zoom":8}
                  }
                }
                """, AdminEventGeographyDtos.Patch.class);
        assertTrue(request.geography() instanceof AdminEventGeographyDtos.Point);

        assertThrows(JsonProcessingException.class, () -> mapper.readValue("""
                {"expectedUpdatedAt":"2026-07-24T10:20:30.123456Z",
                 "geography":{"geoType":"point","marker":{"label":"Huế","lat":16,"lng":107},
                 "raw_json":{},"historicalLocations":[]}}
                """, AdminEventGeographyDtos.Patch.class));
        assertThrows(JsonProcessingException.class, () -> mapper.readValue("""
                {"expectedUpdatedAt":"2026-07-24T10:20:30.123456Z",
                 "geography":{"geoType":"polygon","historicalLocations":[]}}
                """, AdminEventGeographyDtos.Patch.class));
    }

    @Test
    void canonicalizationIsDeterministicAndDerivesFocusAndRegionLabels() {
        var point = canonicalizer.canonicalize(new AdminEventGeographyDtos.Point(
                "point", marker("Huế", 16.46, 107.59),
                List.of("Phú Xuân"), new AdminEventGeographyDtos.Focus("auto", 8)));
        assertEquals(point.mapDataJson(), canonicalizer.canonicalize(
                new AdminEventGeographyDtos.Point(
                        "point", marker("Huế", 16.46, 107.59),
                        List.of("Phú Xuân"), new AdminEventGeographyDtos.Focus("auto", 8)))
                .mapDataJson());
        assertEquals(BigDecimal.valueOf(107.59), point.mapData().at("/focusGeometry/center/lng").decimalValue());
        assertEquals("point", point.mapData().at("/displayGeometry/geoType").asText());

        var regions = canonicalizer.canonicalize(new AdminEventGeographyDtos.MultiPolygon(
                "multi_polygon", List.of(
                new AdminEventGeographyDtos.Region("VNM.27_1"),
                new AdminEventGeographyDtos.Region("VNM.54_1")),
                List.of(), new AdminEventGeographyDtos.Focus("bounds", 6)));
        assertEquals(List.of("HàNội", "ThừaThiênHuế"), regions.provinceNames());
        assertEquals(List.of("VNM.27_1", "VNM.54_1"), regions.gadmRefs());
    }

    @Test
    void boundsDuplicatesAndInternalValuesUseStableErrors() {
        assertCode("INVALID_COORDINATE", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.Point(
                        "point", marker("bad", 91, 107), List.of(),
                        new AdminEventGeographyDtos.Focus("auto", null))));
        assertCode("DUPLICATE_MARKER", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.MultiPoint(
                        "multi_point", List.of(marker("a", 10, 107), marker("b", 10.0, 107.0)),
                        List.of(), new AdminEventGeographyDtos.Focus("bounds", null))));
        assertCode("DUPLICATE_REGION_REF", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.MultiPolygon(
                        "multi_polygon", List.of(
                        new AdminEventGeographyDtos.Region("VNM.27_1"),
                        new AdminEventGeographyDtos.Region("VNM.27_1")),
                        List.of(), new AdminEventGeographyDtos.Focus("bounds", null))));
        assertCode("INVALID_REGION_REF", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.MultiPolygon(
                        "multi_polygon", List.of(new AdminEventGeographyDtos.Region("vnm.27_1")),
                        List.of(), new AdminEventGeographyDtos.Focus("bounds", null))));
        assertCode("GEOGRAPHY_FIELD_FORBIDDEN", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.NoLocation(
                        "no_location", List.of("local:private"),
                        new AdminEventGeographyDtos.Focus("auto", null))));
        assertCode("INVALID_FOCUS_GEOMETRY", () -> canonicalizer.canonicalize(
                new AdminEventGeographyDtos.Nationwide(
                        "nationwide", List.of(), new AdminEventGeographyDtos.Focus("bounds", 8))));
    }

    @Test
    void backendRegistryMatchesFrontendProvinceAssetWithoutRuntimeDependency() throws Exception {
        Path frontendAsset = Path.of("../frontend/public/geojson/vietnam-provinces.json");
        assertTrue(Files.isRegularFile(frontendAsset), "Repository parity asset must exist");
        JsonNode root = mapper.readTree(frontendAsset.toFile());
        Map<String, String> frontendRegistry = new LinkedHashMap<>();
        root.path("features").forEach(feature -> {
            String ref = feature.at("/properties/GID_1").asText();
            String label = feature.at("/properties/NAME_1").asText();
            assertFalse(ref.isBlank(), "Frontend GID_1 must be nonblank");
            assertFalse(label.isBlank(), "Frontend NAME_1 must be nonblank");
            assertEquals(null, frontendRegistry.put(ref, label),
                    "Frontend GID_1 must not contain duplicates: " + ref);
        });
        assertEquals(frontendRegistry, registry.labels());
        assertEquals(63, registry.labels().size());
        assertTrue(registry.labels().values().stream().noneMatch(String::isBlank));
        assertFalse(registry.contains("vnm.27_1"));
    }

    private AdminEventGeographyDtos.Marker marker(String label, double lat, double lng) {
        return new AdminEventGeographyDtos.Marker(
                null, label, BigDecimal.valueOf(lat), BigDecimal.valueOf(lng), null);
    }

    private void assertCode(String code, Runnable call) {
        ApiException error = assertThrows(ApiException.class, call::run);
        assertEquals(code, error.getCode());
    }
}
