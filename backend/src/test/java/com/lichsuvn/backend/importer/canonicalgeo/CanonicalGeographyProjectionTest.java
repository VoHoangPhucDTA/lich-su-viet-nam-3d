package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyProjection.Geography;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CanonicalGeographyProjectionTest {

    private CanonicalGeographyProjection projection;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        projection = new CanonicalGeographyProjection(mapper);
    }

    private JsonNode mapData(String geoType, String json) throws Exception {
        JsonNode node = mapper.readTree(json);
        ((com.fasterxml.jackson.databind.node.ObjectNode) node).put("geoType", geoType);
        return node;
    }

    @Test
    void pointProjectsFromMarker() throws Exception {
        JsonNode md = mapData("point", """
                {"marker":{"lat":18.68,"lng":105.55},"markers":[],"provinceNames":[],
                 "gadmRefs":[],"historicalLocations":[],"focusGeometry":{"center":{"lat":18.9,"lng":105.2}}}
                """);
        Geography g = projection.projectLatLng("point", md, "e1");
        assertEquals(new BigDecimal("18.68"), g.lat());
        assertEquals(new BigDecimal("105.55"), g.lng());
        assertTrue(g.provinceNames().isEmpty());
        assertTrue(projection.projectProvinceNames("point", md).isEmpty());
    }

    @Test
    void multiPointUsesPrimaryMarkerAndRequiresMarkersArray() throws Exception {
        JsonNode md = mapData("multi_point", """
                {"marker":{"name":"A","lat":21.13,"lng":105.88},"markers":[
                 {"name":"A","lat":21.13,"lng":105.88},{"name":"B","lat":21.11,"lng":105.87}],
                 "provinceNames":[]}
                """);
        Geography g = projection.projectLatLng("multi_point", md, "e2");
        assertEquals(new BigDecimal("21.13"), g.lat());
        assertEquals(new BigDecimal("105.88"), g.lng());

        JsonNode missing = mapData("multi_point", """
                {"marker":null,"markers":[],"provinceNames":[]}
                """);
        assertThrows(IllegalArgumentException.class, () -> projection.projectLatLng("multi_point", missing, "e3"));

        JsonNode mismatch = mapData("multi_point", """
                {"marker":{"lat":1.0,"lng":2.0},"markers":[{"lat":3.0,"lng":4.0}],"provinceNames":[]}
                """);
        assertThrows(IllegalArgumentException.class, () -> projection.projectLatLng("multi_point", mismatch, "e4"));
    }

    @Test
    void multiPolygonProjectsNullLatLngAndProvinceNames() throws Exception {
        JsonNode md = mapData("multi_polygon", """
                {"marker":null,"markers":[],"provinceNames":["Quang Binh","Binh Thuan"],
                 "gadmRefs":["VNM.46_1","VNM.11_1"],"focusGeometry":{"center":{"lat":14.2,"lng":107.1}}}
                """);
        Geography g = projection.projectLatLng("multi_polygon", md, "e5");
        assertNull(g.lat());
        assertNull(g.lng());
        assertEquals(List.of("Quang Binh", "Binh Thuan"), projection.projectProvinceNames("multi_polygon", md));
    }

    @Test
    void mixedProjectsPrimaryMarkerAndProvinceNames() throws Exception {
        JsonNode md = mapData("mixed", """
                {"marker":{"lat":10.0,"lng":106.0},"markers":[{"lat":10.0,"lng":106.0}],
                 "provinceNames":["TP.HCM"]}
                """);
        Geography g = projection.projectLatLng("mixed", md, "e6");
        assertEquals(new BigDecimal("10.0"), g.lat());
        assertEquals(List.of("TP.HCM"), projection.projectProvinceNames("mixed", md));
    }

    @Test
    void nationwideAndNoLocationProjectNothing() throws Exception {
        JsonNode md = mapData("nationwide", """
                {"marker":null,"markers":[],"provinceNames":[],"gadmRefs":[],
                 "focusGeometry":{"center":{"lat":16,"lng":106}}}
                """);
        Geography g = projection.projectLatLng("nationwide", md, "e7");
        assertNull(g.lat());
        assertNull(g.lng());
        assertTrue(projection.projectProvinceNames("nationwide", md).isEmpty());
        assertEquals(false, projection.projectShowOnMap("nationwide", recordWithShowOnMap(true)));

        JsonNode noLoc = mapData("no_location", """
                {"marker":null,"markers":[],"provinceNames":[],"gadmRefs":[]}
                """);
        Geography n = projection.projectLatLng("no_location", noLoc, "e8");
        assertNull(n.lat());
        assertNull(n.lng());
        assertEquals(false, projection.projectShowOnMap("no_location", recordWithShowOnMap(true)));
    }

    @Test
    void noFocusGeometryOrCentroidProjection() throws Exception {
        JsonNode md = mapData("point", """
                {"marker":null,"markers":[],"provinceNames":[],
                 "focusGeometry":{"center":{"lat":16,"lng":106}}}
                """);
        Geography g = projection.projectLatLng("point", md, "e9");
        assertNull(g.lat());
        assertNull(g.lng());
    }

    @Test
    void hashesAreDeterministicAndDistinguishGeography() throws Exception {
        JsonNode record = mapper.readTree("""
                {"id":"e","display":{"showOnMap":true},"mapData":{"geoType":"point",
                 "marker":{"lat":1.0,"lng":2.0},"markers":[],"provinceNames":[]},
                 "textbookContent":{"canonicalSummary":"x"}}
                """);
        String h1 = projection.nonGeoHash(record);
        String h2 = projection.nonGeoHash(mapper.readTree(record.toString()));
        assertEquals(h1, h2);

        String geo1 = projection.geoHash("point", new BigDecimal("1.0"), new BigDecimal("2.0"),
                List.of(), record.path("mapData"), true);
        String geo2 = projection.geoHash("point", new BigDecimal("1.0"), new BigDecimal("2.0"),
                List.of(), record.path("mapData"), true);
        assertEquals(geo1, geo2);

        String geoChanged = projection.geoHash("no_location", null, null,
                List.of(), record.path("mapData"), false);
        assertTrue(!geo1.equals(geoChanged));
    }

    private JsonNode recordWithShowOnMap(boolean value) {
        try {
            return mapper.readTree("{\"display\":{\"showOnMap\":" + value + "},\"mapData\":{\"geoType\":\"x\"}}");
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
