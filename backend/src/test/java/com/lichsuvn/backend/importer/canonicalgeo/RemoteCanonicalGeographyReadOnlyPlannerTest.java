package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class RemoteCanonicalGeographyReadOnlyPlannerTest {

    private static final String TARGET = RemoteCanonicalGeographyReadOnlyPlanner.ALLOWED_EVENT_ID;
    private final ObjectMapper mapper = new ObjectMapper();
    private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);
    private final RemoteCanonicalGeographyReadOnlyPlanner planner =
            new RemoteCanonicalGeographyReadOnlyPlanner(mapper);

    @Test
    void validRemoteReadOnlyPlanIsDeterministicAndApplyDoesNotExist() {
        var first = planner.build(release(), metadata(), List.of(change(TARGET)));
        var second = planner.build(release(), metadata(), List.of(change(TARGET)));
        assertEquals(first.planSha256(), second.planSha256());
        assertEquals(1, first.json().path("expectedAffectedRows").asInt());
        assertEquals(TARGET, first.json().path("allowedEventIds").get(0).asText());
        assertDoesNotThrow(() -> planner.verifyPlanSha(first.json()));
        var summary = planner.verifyArtifactConsistency(first.json(), List.of(change(TARGET)));
        assertEquals(1, summary.changedRows());
        assertEquals(List.of(TARGET), summary.eventIds());
        assertEquals(0, summary.nonGeographyDiffs());
        assertEquals(first.planSha256(), summary.planSha256());
        assertDoesNotThrow(() -> planner.verifyBeforeState(first.json(), change(TARGET)));
        PlanRow stale = new PlanRow(TARGET, "1287", "2026-08-02T00:00:00Z", "changed-geo",
                change(TARGET).expectedCurrentNonGeoHash(), "after-geo", List.of("geo_type"),
                mapper.createObjectNode(), mapper.createObjectNode(), mapper.createObjectNode(),
                true, "", List.of());
        assertThrows(IllegalStateException.class, () -> planner.verifyBeforeState(first.json(), stale));
        assertThrows(IllegalStateException.class, RemoteCanonicalGeographyReadOnlyPlanner::rejectRemoteApply);
    }

    @Test
    void eventIdFingerprintIsOrderIndependentButIdentitySensitive() {
        Set<String> abc = new LinkedHashSet<>(List.of("a", "b", "c"));
        Set<String> cba = new LinkedHashSet<>(List.of("c", "b", "a"));
        Set<String> abd = new LinkedHashSet<>(List.of("a", "b", "d"));
        assertEquals(planner.databaseFingerprint(metadataWithIds(abc)),
                planner.databaseFingerprint(metadataWithIds(cba)));
        assertNotEquals(planner.databaseFingerprint(metadataWithIds(abc)),
                planner.databaseFingerprint(metadataWithIds(abd)));
    }

    @Test
    void wrongDatabaseOrCanonicalFingerprintIsBlocked() {
        var wrongDb = new RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata(
                "gateway.tidbcloud.com", 4000, "wrong", "8.0.11-TiDB-v8.5.3-serverless",
                "42", 361, "schema", Set.of(TARGET));
        assertThrows(IllegalStateException.class,
                () -> planner.build(release(), wrongDb, List.of(change(TARGET))));
        var release = new CanonicalRelease(release().recordsById(), release().orderedRecords(),
                "0".repeat(64), Map.of());
        assertThrows(IllegalStateException.class,
                () -> planner.build(release, metadata(), List.of(change(TARGET))));
    }

    @Test
    void exactOneEventScopeAndNonGeographyAreFailClosed() {
        assertThrows(IllegalStateException.class,
                () -> planner.build(release(), metadata(), List.of(change(TARGET), change("unexpected"))));
        assertThrows(IllegalStateException.class,
                () -> planner.build(release(), metadata(), List.of(change("unexpected"))));
        PlanRow base = change(TARGET);
        PlanRow drift = new PlanRow(base.eventId(), base.title(), base.expectedUpdatedAt(),
                base.expectedCurrentGeoHash(), base.expectedCurrentNonGeoHash(), base.desiredGeoHash(),
                List.of("summary"), base.beforeGeography(), base.afterGeography(), base.rawJsonGeoPatch(),
                true, "", List.of());
        assertThrows(IllegalStateException.class,
                () -> planner.build(release(), metadata(), List.of(drift)));
        PlanRow stalePrecondition = copy(change(TARGET), change(TARGET).expectedCurrentNonGeoHash(), "");
        assertThrows(IllegalStateException.class,
                () -> planner.build(release(), metadata(), List.of(stalePrecondition)));
    }

    @Test
    void releasePlanRejectsChangesToPreservedStandaloneColumns() {
        PlanRow base = change(TARGET);
        for (String field : List.of("province_names", "historical_locations")) {
            PlanRow forbidden = new PlanRow(base.eventId(), base.title(), base.expectedUpdatedAt(),
                    base.expectedCurrentGeoHash(), base.expectedCurrentNonGeoHash(),
                    base.desiredGeoHash(), List.of(field), base.beforeGeography(),
                    base.afterGeography(), base.rawJsonGeoPatch(), true, "", List.of());
            assertThrows(IllegalStateException.class,
                    () -> planner.build(release(), metadata(), List.of(forbidden)));
        }
    }

    @Test
    void modifyingPlanBreaksShaAndSqlGateRejectsEveryWriteShape() {
        ObjectNode artifact = planner.build(release(), metadata(), List.of(change(TARGET))).json().deepCopy();
        artifact.put("expectedAffectedRows", 2);
        assertThrows(IllegalStateException.class, () -> planner.verifyPlanSha(artifact));
        assertDoesNotThrow(() -> RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(
                "SELECT id FROM historical_events ORDER BY id"));
        for (String sql : List.of("UPDATE historical_events SET geo_type='point'", "INSERT INTO x VALUES(1)",
                "DELETE FROM historical_events", "CREATE TABLE x(id INT)",
                "SELECT * FROM historical_events FOR UPDATE", "SELECT 1; DELETE FROM x")) {
            assertThrows(IllegalArgumentException.class,
                    () -> RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(sql));
        }
    }

    @Test
    void internallyResealedButInconsistentEvidenceIsBlockedBeforeOutput() {
        List<PlanRow> rows = List.of(change(TARGET));
        ObjectNode wrongCount = planner.build(release(), metadata(), rows).json().deepCopy();
        wrongCount.put("expectedAffectedRows", 2);
        reseal(wrongCount);
        assertThrows(IllegalStateException.class,
                () -> planner.verifyArtifactConsistency(wrongCount, rows));

        ObjectNode wrongIds = planner.build(release(), metadata(), rows).json().deepCopy();
        wrongIds.putArray("allowedEventIds").add("unexpected");
        reseal(wrongIds);
        assertThrows(IllegalStateException.class,
                () -> planner.verifyArtifactConsistency(wrongIds, rows));

        ObjectNode nonGeo = planner.build(release(), metadata(), rows).json().deepCopy();
        ((ObjectNode) nonGeo.path("changes").path(0)).put("nonGeographyChanged", true);
        reseal(nonGeo);
        assertThrows(IllegalStateException.class,
                () -> planner.verifyArtifactConsistency(nonGeo, rows));
    }

    private CanonicalRelease release() {
        ObjectNode record = mapper.createObjectNode();
        record.put("id", TARGET);
        record.putObject("titles").put("primary", "1287");
        ObjectNode map = record.putObject("mapData");
        map.put("geoType", "multi_point");
        map.putArray("markers");
        record.putObject("display").put("showOnMap", true);
        Map<String, com.fasterxml.jackson.databind.JsonNode> records = new LinkedHashMap<>();
        records.put(TARGET, record);
        return new CanonicalRelease(records, List.of(record),
                CanonicalGeographyReleaseContract.CANONICAL_SHA256, Map.of());
    }

    private RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata metadata() {
        return new RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata(
                "gateway.tidbcloud.com", 4000, "lichsuvn", "8.0.11-TiDB-v8.5.3-serverless",
                "42", 361, "schema", Set.of(TARGET));
    }

    private RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata metadataWithIds(Set<String> ids) {
        return new RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata(
                "gateway.tidbcloud.com", 4000, "lichsuvn", "8.0.11-TiDB-v8.5.3-serverless",
                "42", 361, "schema", ids);
    }

    private PlanRow change(String id) {
        ObjectNode before = mapper.createObjectNode().put("geoType", "no_location");
        ObjectNode after = mapper.createObjectNode().put("geoType", "multi_point");
        String nonGeo = projection.nonGeoHash(release().recordsById().get(TARGET));
        return new PlanRow(id, "1287", "2026-08-01T00:00:00Z", "before-geo", nonGeo,
                "after-geo", List.of("geo_type"), before, after, mapper.createObjectNode(),
                true, "", List.of());
    }

    private PlanRow copy(PlanRow row, String nonGeo, String updatedAt) {
        return new PlanRow(row.eventId(), row.title(), updatedAt, row.expectedCurrentGeoHash(), nonGeo,
                row.desiredGeoHash(), row.changedFields(), row.beforeGeography(), row.afterGeography(),
                row.rawJsonGeoPatch(), row.updateRequired(), row.blockedReason(), row.warnings());
    }

    private void reseal(ObjectNode artifact) {
        artifact.remove("planSha256");
        artifact.put("planSha256", CanonicalGeographyProjection.sha256(
                projection.canonicalJsonString(artifact)));
    }
}
