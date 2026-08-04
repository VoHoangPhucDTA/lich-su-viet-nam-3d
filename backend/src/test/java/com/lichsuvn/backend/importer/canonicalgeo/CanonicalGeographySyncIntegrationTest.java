package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.ApplyResult;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class CanonicalGeographySyncIntegrationTest {

    @TempDir
    private static Path temporaryDirectory;

    private static MySQLContainer<?> mysql;
    private static NamedParameterJdbcTemplate jdbc;
    private static CanonicalGeographySyncService service;
    private static CanonicalGeographyProjection projection;
    private static boolean mysqlAvailable;
    private static String unavailableReason;

    @BeforeAll
    static void setupDisposableDatabase() throws Exception {
        boolean containerStarted = false;
        try {
            mysql = new MySQLContainer<>("mysql:8.0.36")
                    .withDatabaseName("geo_sync_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            containerStarted = true;

            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();

            DriverManagerDataSource dataSource = new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
            jdbc = new NamedParameterJdbcTemplate(dataSource);
            projection = new CanonicalGeographyProjection(new ObjectMapper());
            service = new CanonicalGeographySyncService(
                    new CanonicalGeographySyncRepository(jdbc), projection, new ObjectMapper(),
                    new DataSourceTransactionManager(dataSource));

            seedDatabase();
            mysqlAvailable = true;
        } catch (Exception ex) {
            if (mysql != null) {
                mysql.stop();
            }
            if (containerStarted) {
                throw new IllegalStateException("Canonical geo sync test setup failed", ex);
            }
            unavailableReason = "Testcontainers MySQL unavailable: " + ex.getClass().getSimpleName()
                    + " - " + ex.getMessage();
        }
    }

    @AfterAll
    static void stopContainer() {
        if (mysql != null) {
            mysql.stop();
        }
    }

    private static void seedDatabase() {
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-point")
                .addValue("title", "Point event")
                .addValue("year", 938)
                .addValue("geoType", "single_point")
                .addValue("lat", 20.93)
                .addValue("lng", 106.68)
                .addValue("provinces", "[]")
                .addValue("locations", "[]")
                .addValue("hash", "a")
                .addValue("rawJson", rawJson("point", 20.93, 106.68, "[]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-multipoint")
                .addValue("title", "Multi point event")
                .addValue("year", 200)
                .addValue("geoType", "multi_region")
                .addValue("lat", 21.13)
                .addValue("lng", 105.88)
                .addValue("provinces", "[]")
                .addValue("locations", "[]")
                .addValue("hash", "b")
                .addValue("rawJson", rawJson("multi_point", 21.13, 105.88, "[]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-multipoly")
                .addValue("title", "Multi polygon event")
                .addValue("year", 300)
                .addValue("geoType", "multi_region")
                .addValue("lat", 14.2)
                .addValue("lng", 107.1)
                .addValue("provinces", "[\"Quang Binh\"]")
                .addValue("locations", "[]")
                .addValue("hash", "c")
                .addValue("rawJson", rawJson("multi_polygon", null, null, "[\"Quang Binh\"]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-mixed")
                .addValue("title", "Mixed event")
                .addValue("year", 400)
                .addValue("geoType", "multi_region")
                .addValue("lat", 10.0)
                .addValue("lng", 106.0)
                .addValue("provinces", "[\"TP.HCM\"]")
                .addValue("locations", "[]")
                .addValue("hash", "d")
                .addValue("rawJson", rawJson("mixed", 10.0, 106.0, "[\"TP.HCM\"]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-nationwide")
                .addValue("title", "Nationwide event")
                .addValue("year", 500)
                .addValue("geoType", "nationwide")
                .addValue("lat", 16.0)
                .addValue("lng", 106.0)
                .addValue("provinces", "[\"Viet Nam\"]")
                .addValue("locations", "[\"Viet Nam\"]")
                .addValue("hash", "e")
                .addValue("rawJson", rawJson("nationwide", null, null, "[]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-noloc")
                .addValue("title", "No location event")
                .addValue("year", 600)
                .addValue("geoType", "no_location")
                .addValue("lat", 14.3)
                .addValue("lng", 107.2)
                .addValue("provinces", "[\"mien Trung\"]")
                .addValue("locations", "[\"mien Trung\"]")
                .addValue("hash", "f")
                .addValue("rawJson", rawJson("no_location", null, null, "[]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-unchanged")
                .addValue("title", "Already canonical")
                .addValue("year", 700)
                .addValue("geoType", "point")
                .addValue("lat", 21.02)
                .addValue("lng", 105.85)
                .addValue("provinces", "[]")
                .addValue("locations", "[]")
                .addValue("hash", "g")
                .addValue("rawJson", rawJson("point", 21.02, 105.85, "[]")));
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'military', :year, :year,
                    :geoType, :lat, :lng, CAST(:provinces AS JSON), CAST(:locations AS JSON),
                    '[]', 'published', :hash, CAST(:rawJson AS JSON)
                )
                """, new MapSqlParameterSource()
                .addValue("id", "ev-dbonly")
                .addValue("title", "DB only")
                .addValue("year", 800)
                .addValue("geoType", "single_point")
                .addValue("lat", 10.0)
                .addValue("lng", 106.0)
                .addValue("provinces", "[]")
                .addValue("locations", "[]")
                .addValue("hash", "h")
                .addValue("rawJson", rawJson("point", 10.0, 106.0, "[]")));
    }

    /** Resets the shared disposable DB to the pristine seed state for isolation. */
    private static void resetDatabase() {
        jdbc.getJdbcTemplate().update("DELETE FROM historical_events");
        seedDatabase();
    }

    private static String rawJson(String geoType, Double lat, Double lng, String provinces) throws RuntimeException {
        try {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> marker = lat == null ? null : Map.of("lat", lat, "lng", lng);
            Map<String, Object> mapData = new java.util.LinkedHashMap<>();
            mapData.put("geoType", geoType);
            mapData.put("marker", marker);
            mapData.put("markers", lat == null ? List.of() : List.of(Map.of("lat", lat, "lng", lng)));
            mapData.put("provinceNames", mapper.readValue(provinces, List.class));
            mapData.put("gadmRefs", geoType.equals("multi_polygon") ? List.of("VNM.46_1") : List.of());
            mapData.put("historicalLocations", List.of());
            mapData.put("focusGeometry", Map.of("center", Map.of("lat", 16.0, "lng", 106.0)));
            Map<String, Object> record = new java.util.LinkedHashMap<>();
            record.put("id", "x");
            record.put("display", Map.of("showOnMap", !geoType.equals("nationwide") && !geoType.equals("no_location")));
            record.put("mapData", mapData);
            record.put("textbookContent", Map.of("canonicalSummary", "summary"));
            return mapper.writeValueAsString(record);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private Path writeCanonicalFixture() throws Exception {
        Path path = temporaryDirectory.resolve("canonical-geo-sync-test.jsonl");
        ObjectMapper mapper = new ObjectMapper();
        StringBuilder sb = new StringBuilder();
        for (String id : List.of("ev-point", "ev-multipoint", "ev-multipoly", "ev-mixed",
                "ev-nationwide", "ev-noloc", "ev-unchanged")) {
            Map<String, Object> record = new java.util.LinkedHashMap<>();
            record.put("id", id);
            String geoType = switch (id) {
                case "ev-point" -> "point";
                case "ev-multipoint" -> "multi_point";
                case "ev-multipoly" -> "multi_polygon";
                case "ev-mixed" -> "mixed";
                case "ev-nationwide" -> "nationwide";
                case "ev-noloc" -> "no_location";
                default -> "point";
            };
            boolean showOnMap = !geoType.equals("nationwide") && !geoType.equals("no_location");
            record.put("display", Map.of("showOnMap", showOnMap));
            record.put("mapData", canonicalMapData(mapper, geoType));
            record.put("textbookContent", Map.of("canonicalSummary", "summary"));
            sb.append(mapper.writeValueAsString(record)).append('\n');
        }
        Files.writeString(path, sb.toString());
        return path;
    }

private static Object canonicalMapData(ObjectMapper mapper, String geoType) throws Exception {
        Map<String, Object> mapData = new java.util.LinkedHashMap<>();
        mapData.put("geoType", geoType);
        if (geoType.equals("multi_point")) {
            mapData.put("marker", Map.of("name", "A", "lat", 21.13, "lng", 105.88));
            mapData.put("markers", List.of(
                    Map.of("name", "A", "lat", 21.13, "lng", 105.88),
                    Map.of("name", "B", "lat", 21.11, "lng", 105.87)));
        } else if (geoType.equals("point") || geoType.equals("mixed")) {
            mapData.put("marker", Map.of("lat", 21.02, "lng", 105.85));
            mapData.put("markers", List.of(Map.of("lat", 21.02, "lng", 105.85)));
        } else {
            mapData.put("marker", null);
            mapData.put("markers", List.of());
        }
        mapData.put("provinceNames", geoType.equals("multi_polygon") || geoType.equals("mixed")
                ? List.of("Quang Binh") : List.of());
        mapData.put("gadmRefs", geoType.equals("multi_polygon") ? List.of("VNM.46_1") : List.of());
        mapData.put("historicalLocations", List.of());
        mapData.put("focusGeometry", Map.of("center", Map.of("lat", 16.0, "lng", 106.0)));
        return mapper.valueToTree(mapData);
    }

    private CanonicalRelease release() throws Exception {
        return service.validateCanonical(writeCanonicalFixture(), CanonicalGeographyProjection.sha256(
                Files.readString(writeCanonicalFixture())), null);
    }

    @Test
    void fullApplyConvertsLegacyTypesAndPreservesNonGeography() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        jdbc.getJdbcTemplate().update("DELETE FROM historical_events WHERE id IN ('ev-dbonly','ev-malformed')");
        CanonicalRelease release = release();
        List<PlanRow> plan = service.buildPlan(release);
        long updates = plan.stream().filter(PlanRow::updateRequired).count();
        assertTrue(updates >= 5, "expected at least 5 updates, got " + updates);

        String planSha = CanonicalGeographySyncService.planSha256(plan);
        ApplyResult result = service.apply(plan, planSha, release.sha256(), "fingerprint", "38");
        assertTrue(result.updated() >= 5);
        assertTrue(result.unchanged() >= 1, "ev-unchanged must be unchanged");

        Map<String, Long> dist = distribution();
        // ev-point is converted to point and ev-unchanged is already an
        // unchanged canonical point row, so exactly two point rows exist.
        assertEquals(2L, dist.getOrDefault("point", 0L));
        assertEquals(1L, dist.getOrDefault("multi_point", 0L));
        assertEquals(1L, dist.getOrDefault("multi_polygon", 0L));
        assertEquals(1L, dist.getOrDefault("mixed", 0L));
        assertEquals(1L, dist.getOrDefault("nationwide", 0L));
        assertEquals(1L, dist.getOrDefault("no_location", 0L));

        // nationwide/no_location must have null lat/lng and empty province_names
        assertEquals(null, latOf("ev-nationwide"));
        assertEquals(null, latOf("ev-noloc"));
        assertEquals("[]", provincesOf("ev-nationwide"));
        assertEquals("[]", provincesOf("ev-noloc"));

        // non-geography preserved: canonicalSummary still present in raw_json.
        // MySQL normalizes JSON whitespace on storage (space after colon), so
        // parse and compare structurally instead of matching a raw substring.
        JsonNode preserved = new ObjectMapper().readTree(rawJsonOf("ev-point"));
        assertEquals("summary", preserved.path("textbookContent").path("canonicalSummary").asText());
    }

    @Test
    void secondDryRunAfterApplyReportsZeroUpdates() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        jdbc.getJdbcTemplate().update("DELETE FROM historical_events WHERE id IN ('ev-dbonly','ev-malformed')");
        CanonicalRelease release = release();
        List<PlanRow> plan = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        service.apply(plan, planSha, release.sha256(), "fingerprint", "38");

        var idempotence = service.verifyIdempotence(release());
        assertEquals(0, idempotence.updatesRequired());
        assertEquals(0, idempotence.blockedRows());
    }

    @Test
    void staleUpdatedAtAbortsWholeTransaction() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        CanonicalRelease release = release();
        List<PlanRow> plan = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(plan);

        // Simulate a concurrent write that bumps updated_at.
        jdbc.getJdbcTemplate().update("UPDATE historical_events SET title = title WHERE id = 'ev-point'");

        assertThrows(RuntimeException.class, () -> service.apply(plan, planSha, release.sha256(), "f", "38"));
        // ev-point must be unchanged (still single_point).
        assertEquals("single_point", geoTypeOf("ev-point"));
    }

    @Test
    void planWithCanonicalOnlyIdBlocksApply() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        Path path = temporaryDirectory.resolve("canonical-with-extra.jsonl");
        ObjectMapper mapper = new ObjectMapper();
        String base = Files.readString(writeCanonicalFixture());
        Files.writeString(path, base + mapper.writeValueAsString(Map.of(
                "id", "ev-canonical-only", "display", Map.of("showOnMap", true),
                "mapData", mapper.readTree(rawJson("point", 1.0, 2.0, "[]")).path("mapData"))));
        CanonicalRelease release = service.validateCanonical(path,
                CanonicalGeographyProjection.sha256(Files.readString(path)), null);
        List<PlanRow> plan = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        assertThrows(IllegalStateException.class,
                () -> service.apply(plan, planSha, release.sha256(), "f", "38"));
    }

    @Test
    void dbOnlyRowsBlockApplyWhenNotInPlan() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        CanonicalRelease release = release();
        List<PlanRow> plan = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        assertThrows(IllegalStateException.class,
                () -> service.apply(plan, planSha, release.sha256(), "f", "38"));
    }

    @Test
    void malformedRawJsonRowBlocksPlanRow() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        // A JSON array is valid JSON for MySQL but not an object -> blocked row.
        jdbc.update("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year, effective_end_year,
                    geo_type, lat, lng, province_names, historical_locations, key_facts, status, content_hash, raw_json
                ) VALUES (
                    'ev-malformed', 'ev-malformed', 'Malformed', 'atomic', 'military', 900, 900,
                    'no_location', NULL, NULL, '[]', '[]', '[]', 'published', 'i', CAST('[1,2,3]' AS JSON)
                )
                """, new org.springframework.jdbc.core.namedparam.MapSqlParameterSource());
        Path path = temporaryDirectory.resolve("canonical-with-malformed.jsonl");
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> record = new java.util.LinkedHashMap<>();
        record.put("id", "ev-malformed");
        record.put("display", Map.of("showOnMap", false));
        record.put("mapData", canonicalMapData(mapper, "no_location"));
        String content = Files.readString(writeCanonicalFixture()) + mapper.writeValueAsString(record) + "\n";
        Files.writeString(path, content);
        CanonicalRelease release = service.validateCanonical(path,
                CanonicalGeographyProjection.sha256(content), null);
        List<PlanRow> plan = service.buildPlan(release);
        PlanRow malformed = plan.stream().filter(r -> r.eventId().equals("ev-malformed")).findFirst().orElseThrow();
        assertTrue(malformed.blocked(), "ev-malformed must be blocked: " + malformed.blockedReason());
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        assertThrows(IllegalStateException.class,
                () -> service.apply(plan, planSha, release.sha256(), "f", "38"));
        jdbc.getJdbcTemplate().update("DELETE FROM historical_events WHERE id = 'ev-malformed'");
    }

    @Test
    void rollbackSnapshotRestoresDisposableDatabase() throws Exception {
        assumeTrue(mysqlAvailable, unavailableReason);
        resetDatabase();
        jdbc.getJdbcTemplate().update("DELETE FROM historical_events WHERE id IN ('ev-dbonly','ev-malformed')");
        CanonicalRelease release = release();
        List<PlanRow> plan = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        var snapshot = service.exportRollbackSnapshot();
        assertEquals(7, snapshot.size());

        service.apply(plan, planSha, release.sha256(), "fingerprint", "38");
        assertEquals("point", geoTypeOf("ev-point"));

        int restored = service.restoreFromSnapshot(snapshot);
        assertTrue(restored >= 7);
        assertEquals("single_point", geoTypeOf("ev-point"));
        assertEquals("multi_region", geoTypeOf("ev-multipoint"));
    }

    // ---------------------------------------------------------------- helpers

    private Map<String, Long> distribution() {
        return jdbc.getJdbcTemplate().queryForList(
                        "SELECT geo_type AS t, COUNT(*) AS c FROM historical_events GROUP BY geo_type")
                .stream().collect(java.util.stream.Collectors.toMap(
                        r -> (String) r.get("t"), r -> ((Number) r.get("c")).longValue()));
    }

    private String geoTypeOf(String id) {
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT geo_type FROM historical_events WHERE id = ?", String.class, id);
    }

    private Object latOf(String id) {
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT lat FROM historical_events WHERE id = ?", Object.class, id);
    }

    private String provincesOf(String id) {
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT CAST(province_names AS CHAR) FROM historical_events WHERE id = ?", String.class, id);
    }

    private String rawJsonOf(String id) {
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT CAST(raw_json AS CHAR) FROM historical_events WHERE id = ?", String.class, id);
    }
}
