package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.IntNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.ApplyResult;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.IdempotenceResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * POST-APPLY IDEMPOTENCE CONVERGENCE — no-database regression suite.
 *
 * <p>Reproduces the C2 crash-recovery defect without touching any database:
 * after a successful canonical apply, the plan builder run again against the
 * committed state must report {@code updateRequired = false} for every row
 * (second-contract idempotence). The failing event
 * {@code dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951} is seeded
 * with its sealed pre-apply state (legacy {@code multi_region} column, legacy
 * {@code mixed} mapData, {@code marker.lat = 22.0} as stored after a JSON
 * column round-trip).
 *
 * <p>An in-memory repository emulates the MySQL/TiDB JSON column round-trip
 * (integral doubles become integers, e.g. {@code 22.0 -> 22}), which is the
 * engine behaviour that exposed the defect: the plan builder previously
 * compared {@code mapData} with Jackson {@code JsonNode.equals()} (numeric
 * node-subtype sensitive) instead of the canonical route used by the hashes.
 */
class CanonicalGeographyIdempotenceConvergenceTest {

    private static final String FAILING = "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951";

    private final ObjectMapper mapper = new ObjectMapper();
    private CanonicalGeographyProjection projection;
    private FakeRepo repo;
    private CanonicalGeographySyncService service;

    @BeforeEach
    void setUp() {
        projection = new CanonicalGeographyProjection(mapper);
        repo = new FakeRepo();
        service = new CanonicalGeographySyncService(repo, projection, mapper, new NoopTransactionManager());
    }

    // ---------------------------------------------------------------- fixtures

    /** Sealed pre-apply state of the failing event (condensed, faithful). */
    private String failingEventLegacyRawJson() {
        return """
                {
                  "id": "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951",
                  "display": {"showOnMap": true, "featured": false},
                  "mapData": {
                    "geoType": "mixed",
                    "marker": {"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                    "markers": [{"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"}],
                    "provinceNames": ["Tuyên Quang"],
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 22.05946, "lng": 105.276796}, "zoom": 7}
                  },
                  "textbookContent": {"canonicalSummary": "Đại hội đại biểu lần thứ II Đảng Cộng sản Đông Dương họp tại Chiêm Hoá (Tuyên Quang) năm 1951."},
                  "titles": {"primary": "Đại hội đại biểu lần thứ II Đảng Cộng sản Đông Dương"}
                }
                """;
    }

    private void seedFailingEvent() {
        repo.seed(FAILING, "multi_region", new BigDecimal("22.0"), new BigDecimal("105.3"),
                "[\"Tuyên Quang\"]", "[]", failingEventLegacyRawJson());
    }

    private JsonNode failingEventCanonicalRecord() throws Exception {
        return mapper.readTree("""
                {
                  "id": "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951",
                  "display": {"showOnMap": true},
                  "mapData": {
                    "geoType": "point",
                    "marker": {"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                    "markers": [],
                    "provinceNames": [],
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 22.05946, "lng": 105.276796}, "zoom": 7}
                  },
                  "textbookContent": {"canonicalSummary": "Đại hội đại biểu lần thứ II Đảng Cộng sản Đông Dương họp tại Chiêm Hoá (Tuyên Quang) năm 1951."}
                }
                """);
    }

    private CanonicalRelease releaseFor(JsonNode... records) {
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        List<JsonNode> ordered = new ArrayList<>();
        for (JsonNode r : records) {
            byId.put(r.path("id").asText(), r);
            ordered.add(r);
        }
        String sha = CanonicalGeographyProjection.sha256(
                "release-" + byId.keySet() + "-" + System.nanoTime());
        return new CanonicalRelease(byId, ordered, sha, Map.of());
    }

    private PlanRow rowFor(List<PlanRow> plan, String id) {
        return plan.stream().filter(r -> r.eventId().equals(id)).findFirst().orElseThrow();
    }

    // ---------------------------------------------------------------- tests

    @Test
    void failingEventFirstPlanIsUpdateAndSecondPlanConverges() throws Exception {
        seedFailingEvent();
        CanonicalRelease release = releaseFor(failingEventCanonicalRecord());

        // First plan: UPDATE with the same changed fields as the sealed plan.
        List<PlanRow> plan = service.buildPlan(release);
        PlanRow first = rowFor(plan, FAILING);
        assertTrue(first.updateRequired(), "first plan must require an UPDATE");
        assertTrue(first.changedFields().contains("geo_type"));
        assertTrue(first.changedFields().contains("province_names"));
        assertTrue(first.changedFields().contains("raw_json.mapData"));

        // Apply must commit (immediate post-write verification passes).
        String planSha = CanonicalGeographySyncService.planSha256(plan);
        ApplyResult result = service.apply(plan, planSha, release.sha256(), "fp", "42");
        assertEquals(1, result.updated());

        // The engine round-trip flipped canonical marker.lat 22.0 to integer 22 in the
        // stored row; Jackson equals sees a difference (the old defect) while the
        // canonical route sees equality (the fix).
        DbEventRow stored = repo.loadForUpdate(FAILING).getFirst();
        JsonNode storedRaw = mapper.readTree(stored.rawJson());
        JsonNode canonicalMapData = release.recordsById().get(FAILING).path("mapData");
        JsonNode storedMapData = storedRaw.path("mapData");
        assertFalse(canonicalMapData.equals(storedMapData),
                "sanity: Jackson JsonNode.equals still distinguishes 22.0 vs 22 (documents the old defect)");
        assertTrue(projection.canonicalEquals(canonicalMapData, storedMapData),
                "canonicalEquals must consider the round-tripped mapData equal");

        // Second dry-run: idempotence must be clean.
        IdempotenceResult idem = service.verifyIdempotence(release);
        assertEquals(0, idem.updatesRequired(), "second dry-run must report zero updates");
        assertEquals(0, idem.blockedRows());

        List<PlanRow> secondPlan = service.buildPlan(release);
        PlanRow second = rowFor(secondPlan, FAILING);
        assertFalse(second.updateRequired(), "second plan action must be UNCHANGED");
        assertTrue(second.changedFields().isEmpty());
    }

    @Test
    void failingEventNonGeographyAndTextualContentPreserved() throws Exception {
        seedFailingEvent();
        CanonicalRelease release = releaseFor(failingEventCanonicalRecord());
        List<PlanRow> plan = service.buildPlan(release);
        PlanRow first = rowFor(plan, FAILING);
        String nonGeoBefore = first.expectedCurrentNonGeoHash();

        String planSha = CanonicalGeographySyncService.planSha256(plan);
        service.apply(plan, planSha, release.sha256(), "fp", "42");

        DbEventRow stored = repo.loadForUpdate(FAILING).getFirst();
        JsonNode storedRaw = mapper.readTree(stored.rawJson());
        // nonGeoHash deterministic and unchanged.
        assertEquals(nonGeoBefore, projection.nonGeoHash(storedRaw));
        // textual non-geography content preserved.
        assertEquals("Đại hội đại biểu lần thứ II Đảng Cộng sản Đông Dương họp tại Chiêm Hoá (Tuyên Quang) năm 1951.",
                storedRaw.path("textbookContent").path("canonicalSummary").asText());
    }

    @Test
    void allGeoTypeRepresentativesConverge() throws Exception {
        // Each representative is seeded with its canonical mapData but a legacy
        // geo_type column, so the first plan is an UPDATE and the second plan
        // must converge to UNCHANGED after apply.
        String[][] reps = {
                {"point", "21.02", "105.85", "point"},
                {"multi_point", "21.13", "105.88", "multi_point"},
                {"multi_polygon", "null", "null", "multi_polygon"},
                {"mixed", "22.0", "105.3", "mixed"},
                {"nationwide", "null", "null", "nationwide"},
                {"no_location", "null", "null", "no_location"},
        };
        List<JsonNode> canonicalRecords = new ArrayList<>();
        for (String[] rep : reps) {
            String id = "rep-" + rep[0];
            repo.seed(id, "single_point",
                    rep[1].equals("null") ? null : new BigDecimal(rep[1]),
                    rep[2].equals("null") ? null : new BigDecimal(rep[2]),
                    "[]", "[]", recordRawJson(id, rep[3]));
            canonicalRecords.add(canonicalRecordFor(id, rep[3]));
        }
        CanonicalRelease release = releaseFor(canonicalRecords.toArray(new JsonNode[0]));

        List<PlanRow> plan = service.buildPlan(release);
        long updates = plan.stream().filter(PlanRow::updateRequired).count();
        assertEquals(reps.length, updates, "every representative must be an UPDATE in the first plan");

        String planSha = CanonicalGeographySyncService.planSha256(plan);
        ApplyResult result = service.apply(plan, planSha, release.sha256(), "fp", "42");
        assertEquals(reps.length, result.updated());

        IdempotenceResult idem = service.verifyIdempotence(release);
        assertEquals(0, idem.updatesRequired(), "second dry-run must be clean for all representatives");
        assertEquals(0, idem.blockedRows());
    }

    @Test
    void edgeCaseMatrixConverges() throws Exception {
        // marker + identical one-element markers[]; provinceNames present;
        // Vietnamese UTF-8 names; 22 vs 22.0; empty vs missing markers;
        // empty vs missing provinceNames; top-level lat/lng mirrors.
        String id = "edge-1";
        String canonical = """
                {
                  "id": "edge-1",
                  "display": {"showOnMap": true},
                  "mapData": {
                    "geoType": "point",
                    "marker": {"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                    "markers": [{"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"}],
                    "provinceNames": [],
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 22.05946, "lng": 105.276796}, "zoom": 7}
                  }
                }
                """;
        // legacy: marker present, markers MISSING key, provinceNames empty array.
        String legacy = """
                {
                  "id": "edge-1",
                  "display": {"showOnMap": true},
                  "mapData": {
                    "geoType": "single_point",
                    "marker": {"name": "Chiêm Hoá (Tuyên Quang)", "lat": 22.0, "lng": 105.3, "confidence": "high"},
                    "provinceNames": [],
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 22.05946, "lng": 105.276796}, "zoom": 7}
                  }
                }
                """;
        repo.seed(id, "single_point", new BigDecimal("22.0"), new BigDecimal("105.3"), "[]", "[]", legacy);
        CanonicalRelease release = releaseFor(mapper.readTree(canonical));

        List<PlanRow> plan = service.buildPlan(release);
        PlanRow first = rowFor(plan, id);
        assertTrue(first.updateRequired(), "edge case must be an UPDATE in the first plan (markers missing vs present)");
        assertTrue(first.changedFields().contains("raw_json.mapData"));

        String planSha = CanonicalGeographySyncService.planSha256(plan);
        service.apply(plan, planSha, release.sha256(), "fp", "42");

        List<PlanRow> secondPlan = service.buildPlan(release);
        PlanRow second = rowFor(secondPlan, id);
        assertFalse(second.updateRequired(), "edge case must converge to UNCHANGED");
        assertTrue(second.changedFields().isEmpty());

        // top-level lat/lng mirrors the canonical marker values.
        DbEventRow stored = repo.loadForUpdate(id).getFirst();
        assertEquals(0, new BigDecimal("22.0").compareTo(stored.lat()));
        assertEquals(0, new BigDecimal("105.3").compareTo(stored.lng()));
    }

    // ---------------------------------------------------------------- helpers

    private String recordRawJson(String id, String geoType) {
        String marker = geoType.equals("multi_point")
                ? "{\"lat\": 21.13, \"lng\": 105.88, \"name\": \"A\"}"
                : (geoType.equals("nationwide") || geoType.equals("no_location")
                || geoType.equals("multi_polygon")
                ? "null" : "{\"lat\": 21.02, \"lng\": 105.85, \"name\": \"A\"}");
        String markers = geoType.equals("multi_point")
                ? "[{\"lat\": 21.13, \"lng\": 105.88, \"name\": \"A\"}, {\"lat\": 21.11, \"lng\": 105.87, \"name\": \"B\"}]"
                : (geoType.equals("point") || geoType.equals("mixed")
                ? "[{\"lat\": 22.0, \"lng\": 105.3, \"name\": \"A\"}]" : "[]");
        String provinces = (geoType.equals("multi_polygon") || geoType.equals("mixed"))
                ? "[\"Quảng Bình\"]" : "[]";
        return """
                {
                  "id": "%s",
                  "display": {"showOnMap": true},
                  "mapData": {
                    "geoType": "%s",
                    "marker": %s,
                    "markers": %s,
                    "provinceNames": %s,
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 16.0, "lng": 106.0}, "zoom": 5}
                  },
                  "textbookContent": {"canonicalSummary": "summary %s"}
                }
                """.formatted(id, geoType, marker, markers, provinces, id);
    }

    private JsonNode canonicalRecordFor(String id, String geoType) throws Exception {
        String marker = geoType.equals("multi_point")
                ? "{\"lat\": 21.13, \"lng\": 105.88, \"name\": \"A\"}"
                : (geoType.equals("nationwide") || geoType.equals("no_location")
                || geoType.equals("multi_polygon")
                ? "null" : "{\"lat\": 21.02, \"lng\": 105.85, \"name\": \"A\"}");
        String markers = geoType.equals("multi_point")
                ? "[{\"lat\": 21.13, \"lng\": 105.88, \"name\": \"A\"}, {\"lat\": 21.11, \"lng\": 105.87, \"name\": \"B\"}]"
                : (geoType.equals("point") || geoType.equals("mixed")
                ? "[{\"lat\": 22.0, \"lng\": 105.3, \"name\": \"A\"}]" : "[]");
        String provinces = (geoType.equals("multi_polygon") || geoType.equals("mixed"))
                ? "[\"Quảng Bình\"]" : "[]";
        boolean showOnMap = !geoType.equals("nationwide") && !geoType.equals("no_location");
        return mapper.readTree("""
                {
                  "id": "%s",
                  "display": {"showOnMap": %s},
                  "mapData": {
                    "geoType": "%s",
                    "marker": %s,
                    "markers": %s,
                    "provinceNames": %s,
                    "gadmRefs": [],
                    "historicalLocations": [],
                    "focusGeometry": {"mode": "bounds", "center": {"lat": 16.0, "lng": 106.0}, "zoom": 5}
                  },
                  "textbookContent": {"canonicalSummary": "summary %s"}
                }
                """.formatted(id, showOnMap, geoType, marker, markers, provinces, id));
    }

    // ------------------------------------------------------- in-memory engine

    /** Minimal no-op Spring transaction manager for the in-memory path. */
    static final class NoopTransactionManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }

    /** In-memory repository emulating the MySQL/TiDB JSON column round-trip. */
    static final class FakeRepo extends CanonicalGeographySyncRepository {

        private final ObjectMapper mapper = new ObjectMapper();
        final Map<String, StoredRow> rows = new LinkedHashMap<>();

        FakeRepo() {
            super(null);
        }

        record StoredRow(String id, String title, String geoType, BigDecimal lat, BigDecimal lng,
                         String provinceNamesJson, String historicalLocationsJson,
                         String rawJson, Timestamp updatedAt) {
            DbEventRow toEventRow() {
                return new DbEventRow(id, title, geoType, lat, lng, provinceNamesJson,
                        historicalLocationsJson, rawJson, updatedAt);
            }
        }

        void seed(String id, String geoType, BigDecimal lat, BigDecimal lng,
                  String provinceNamesJson, String historicalLocationsJson, String rawJson) {
            rows.put(id, new StoredRow(id, "t:" + id, geoType, lat, lng, provinceNamesJson,
                    historicalLocationsJson, mysqlRoundTrip(rawJson),
                    Timestamp.valueOf("2026-08-03 19:03:09")));
        }

        @Override
        public List<DbEventRow> loadAll() {
            List<DbEventRow> out = new ArrayList<>();
            rows.values().forEach(r -> out.add(r.toEventRow()));
            return out;
        }

        @Override
        public List<DbEventRow> loadForUpdate(String id) {
            StoredRow r = rows.get(id);
            return r == null ? List.of() : List.of(r.toEventRow());
        }

        @Override
        public int updateGeography(String id, String geoType, BigDecimal lat, BigDecimal lng,
                                   String provinceNamesJson, String historicalLocationsJson,
                                   String rawJson) {
            StoredRow r = rows.get(id);
            if (r == null) {
                return 0;
            }
            rows.put(id, new StoredRow(r.id(), r.title(), geoType, lat, lng, provinceNamesJson,
                    historicalLocationsJson, mysqlRoundTrip(rawJson),
                    new Timestamp(System.currentTimeMillis())));
            return 1;
        }

        @Override
        public Set<String> loadIds() {
            return new LinkedHashSet<>(rows.keySet());
        }

        @Override
        public long countRows() {
            return rows.size();
        }

        @Override
        public String serverVersion() {
            return "8.0.36-simulated";
        }

        @Override
        public String flywayVersion() {
            return "42";
        }

        @Override
        public String schemaSignature() {
            return "simulated-schema";
        }

        @Override
        public Map<String, Long> geoTypeDistribution() {
            return Map.of();
        }

        @Override
        public List<String> legacyGeoTypes() {
            return List.of();
        }

        /** Emulate the JSON column round-trip: integral doubles become integers. */
        String mysqlRoundTrip(String json) {
            try {
                return mapper.writeValueAsString(normalize(mapper.readTree(json)));
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }

        private JsonNode normalize(JsonNode node) {
            if (node.isObject()) {
                ObjectNode out = mapper.createObjectNode();
                List<String> names = new ArrayList<>();
                node.fieldNames().forEachRemaining(names::add);
                for (String n : names) {
                    out.set(n, normalize(node.get(n)));
                }
                return out;
            }
            if (node.isArray()) {
                ArrayNode out = mapper.createArrayNode();
                node.forEach(item -> out.add(normalize(item)));
                return out;
            }
            if (node.isDouble()) {
                double v = node.doubleValue();
                if (v == Math.rint(v) && !Double.isInfinite(v)) {
                    if (v >= Integer.MIN_VALUE && v <= Integer.MAX_VALUE) {
                        return IntNode.valueOf((int) v);
                    }
                    return com.fasterxml.jackson.databind.node.LongNode.valueOf((long) v);
                }
            }
            return node;
        }
    }
}
