package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class CanonicalGeographyReleaseContractTest {

    private static final Path CANONICAL = Path.of("..", "crawData", "stage4b_curate_tree", "output",
            "phase2", "core_events.jsonl").toAbsolutePath().normalize();
    private static final String TARGET = "khang-chien-chong-quan-nguyen-1287-1288";
    private final ObjectMapper mapper = new ObjectMapper();
    private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);
    @TempDir Path tempDir;

    @Test
    void currentHotfixReleasePassesAndLocksEvent1287() {
        var release = CanonicalGeographyReleaseContract.validate(service(new StubRepository(List.of())), CANONICAL, "");
        assertEquals(361, release.orderedRecords().size());
        assertEquals(CanonicalGeographyReleaseContract.CANONICAL_SHA256, release.sha256());
        assertEquals(20L, release.geoTypeCounts().get("multi_point"));
        assertEquals(253L, release.geoTypeCounts().get("no_location"));

        JsonNode event = release.recordsById().get(TARGET);
        JsonNode mapData = event.path("mapData");
        assertEquals("multi_point", mapData.path("geoType").asText());
        assertEquals(List.of("Bạch Đằng", "Cửa Lục", "Thăng Long", "Vân Đồn"),
                streamText(mapData.path("markers"), "name"));
        assertEquals(4, mapData.path("markers").size());
        assertTrue(mapData.path("gadmRefs").isEmpty());
        assertTrue(mapData.path("provinceNames").isEmpty());
        assertTrue(mapData.path("regions").isMissingNode() || mapData.path("regions").isEmpty());
        assertNotEquals("Quảng Ninh", mapData.path("marker").path("name").asText());
        assertTrue(event.path("display").path("showOnMap").asBoolean());
    }

    @Test
    void staleTotalsAndBadShaFailClosed() {
        var service = service(new StubRepository(List.of()));
        Map<String, Long> old = Map.of("point", 46L, "multi_point", 19L, "multi_polygon", 24L,
                "mixed", 0L, "nationwide", 18L, "no_location", 254L);
        assertThrows(IllegalArgumentException.class, () -> service.validateCanonical(
                CANONICAL, CanonicalGeographyReleaseContract.CANONICAL_SHA256, old));
        assertThrows(IllegalArgumentException.class, () -> CanonicalGeographyReleaseContract.validate(
                service, CANONICAL, "0".repeat(64)));
    }

    @Test
    void extraRecordAndUnknownTypeFailClosed() throws Exception {
        List<String> lines = new ArrayList<>(Files.readAllLines(CANONICAL, StandardCharsets.UTF_8));
        ObjectNode extra = (ObjectNode) mapper.readTree(lines.get(0));
        extra.put("id", "unexpected-extra-event");
        Path extraFile = tempDir.resolve("extra.jsonl");
        lines.add(mapper.writeValueAsString(extra));
        Files.write(extraFile, lines, StandardCharsets.UTF_8);
        Map<String, Long> extraCounts = new LinkedHashMap<>(CanonicalGeographyReleaseContract.GEO_TYPE_COUNTS);
        String type = extra.path("mapData").path("geoType").asText();
        extraCounts.put(type, extraCounts.get(type) + 1);
        var extraRelease = service(new StubRepository(List.of())).validateCanonical(extraFile,
                CanonicalGeographyProjection.canonicalFileSha256(extraFile), extraCounts);
        assertThrows(IllegalArgumentException.class,
                () -> CanonicalGeographyReleaseContract.requireRecordCount(extraRelease));

        ObjectNode unknown = (ObjectNode) mapper.readTree(lines.get(1));
        ((ObjectNode) unknown.path("mapData")).put("geoType", "mystery_shape");
        Path unknownFile = tempDir.resolve("unknown.jsonl");
        Files.writeString(unknownFile, mapper.writeValueAsString(unknown) + "\n", StandardCharsets.UTF_8);
        assertThrows(IllegalArgumentException.class, () -> service(new StubRepository(List.of())).validateCanonical(
                unknownFile, CanonicalGeographyProjection.canonicalFileSha256(unknownFile), null));
    }

    @Test
    void safeLocalDryRunPlansOnlyTheOld1287RowAndPreservesNonGeoHash() throws Exception {
        var validator = service(new StubRepository(List.of()));
        var release = CanonicalGeographyReleaseContract.validate(validator, CANONICAL, "");
        List<DbEventRow> dbRows = new ArrayList<>();
        for (JsonNode record : release.orderedRecords()) {
            ObjectNode runtime = (ObjectNode) record.deepCopy();
            String id = record.path("id").asText();
            String geoType = record.path("mapData").path("geoType").asText();
            var latLng = projection.projectLatLng(geoType, record.path("mapData"), id);
            List<String> provinces = projection.projectProvinceNames(geoType, record.path("mapData"));
            boolean show = projection.projectShowOnMap(geoType, record);
            if (TARGET.equals(id)) {
                geoType = "no_location";
                latLng = new CanonicalGeographyProjection.Geography(null, null, List.of());
                provinces = List.of();
                show = false;
                ObjectNode oldMap = mapper.createObjectNode();
                oldMap.put("geoType", "no_location");
                oldMap.putNull("marker");
                oldMap.putArray("markers");
                oldMap.putArray("provinceNames");
                oldMap.putArray("gadmRefs");
                oldMap.putArray("historicalLocations");
                runtime.set("mapData", oldMap);
                ((ObjectNode) runtime.with("display")).put("showOnMap", false);
            }
            dbRows.add(new DbEventRow(id, record.path("titles").path("primary").asText(), geoType,
                    latLng.lat(), latLng.lng(), mapper.writeValueAsString(provinces), "[]",
                    mapper.writeValueAsString(runtime), Timestamp.from(Instant.parse("2026-08-01T00:00:00Z"))));
        }
        List<PlanRow> plan = service(new StubRepository(dbRows)).buildPlan(release);
        List<PlanRow> updates = plan.stream().filter(PlanRow::updateRequired).toList();
        assertEquals(1, updates.size());
        assertEquals(TARGET, updates.getFirst().eventId());
        assertFalse(updates.getFirst().blocked());
        assertEquals(projection.nonGeoHash(release.recordsById().get(TARGET)),
                updates.getFirst().expectedCurrentNonGeoHash());
        CanonicalGeographySyncRunner.validateExpectedUpdateScope(plan, "1", TARGET);
        List<PlanRow> twoUpdates = new ArrayList<>(plan);
        twoUpdates.add(new PlanRow("unexpected", "", "", "", "", "", List.of(),
                mapper.createObjectNode(), mapper.createObjectNode(), mapper.createObjectNode(),
                true, "", List.of()));
        assertThrows(IllegalStateException.class,
                () -> CanonicalGeographySyncRunner.validateExpectedUpdateScope(twoUpdates, "1", TARGET));
    }

    private List<String> streamText(JsonNode array, String field) {
        List<String> values = new ArrayList<>();
        array.forEach(node -> values.add(node.path(field).asText()));
        return values;
    }

    private CanonicalGeographySyncService service(CanonicalGeographySyncRepository repository) {
        return new CanonicalGeographySyncService(repository, projection, mapper, new DirectTransactions());
    }

    private static final class StubRepository extends CanonicalGeographySyncRepository {
        private final List<DbEventRow> rows;
        StubRepository(List<DbEventRow> rows) { super(null); this.rows = rows; }
        @Override public List<DbEventRow> loadAll() { return rows; }
    }

    private static final class DirectTransactions implements PlatformTransactionManager {
        @Override public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus();
        }
        @Override public void commit(TransactionStatus status) { }
        @Override public void rollback(TransactionStatus status) { }
    }
}
