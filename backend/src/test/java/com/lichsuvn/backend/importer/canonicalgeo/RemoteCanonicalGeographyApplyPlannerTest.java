package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RemoteCanonicalGeographyApplyPlannerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final RemoteCanonicalGeographyApplyPlanner planner =
            new RemoteCanonicalGeographyApplyPlanner(mapper);

    @Test
    void happyPathUpdatesOnceVerifiesThenCommits() throws Exception {
        ObjectNode artifact = reviewed();
        PlanRow row = row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID);
        var prepared = planner.prepare(artifact,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row));
        FakePort port = new FakePort();
        var result = planner.execute(prepared, authorized(), port);
        assertTrue(result.wrote());
        assertEquals(1, result.affectedRows());
        assertEquals(List.of("begin", "lock", "update", "readBack", "commit"), port.calls);
        assertEquals("multi_point", port.command.geoType());
        assertEquals(new BigDecimal("20.8833"), port.command.lat());
        assertEquals(new BigDecimal("106.8"), port.command.lng());
        assertEquals(RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID, port.command.eventId());
        assertEquals(RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT,
                port.command.expectedUpdatedAt());
    }

    @Test
    void noAuthorizationAndWrongAuthorizationPerformZeroUpdates() throws Exception {
        ObjectNode artifact = reviewed();
        var prepared = planner.prepare(artifact,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID)));
        FakePort noAuth = new FakePort();
        assertFalse(planner.execute(prepared,
                new RemoteCanonicalGeographyApplyPlanner.Authorization(false, ""), noAuth).wrote());
        assertTrue(noAuth.calls.isEmpty());
        FakePort wrongSha = new FakePort();
        assertThrows(IllegalStateException.class, () -> planner.execute(prepared,
                new RemoteCanonicalGeographyApplyPlanner.Authorization(true, "0".repeat(64)), wrongSha));
        assertTrue(wrongSha.calls.isEmpty());
    }

    @Test
    void reviewedPlanDatabaseAndLivePlanMismatchesBlockBeforeTransaction() throws Exception {
        ObjectNode artifact = reviewed();
        PlanRow row = row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID);
        ObjectNode wrongReviewed = artifact.deepCopy();
        wrongReviewed.put("expectedAffectedRows", 2);
        assertThrows(IllegalStateException.class, () -> planner.prepare(wrongReviewed,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row)));
        assertThrows(IllegalStateException.class, () -> planner.prepare(artifact, "wrong-fingerprint",
                artifact, List.of(row)));
        ObjectNode changedLive = artifact.deepCopy();
        changedLive.put("toolVersion", "changed");
        reseal(changedLive);
        assertThrows(IllegalStateException.class, () -> planner.prepare(artifact,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                changedLive, List.of(row)));
    }

    @Test
    void unexpectedOrExtraEventDiffBlocksBeforeTransaction() throws Exception {
        ObjectNode artifact = reviewed();
        assertThrows(IllegalStateException.class, () -> planner.prepare(artifact,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT, artifact,
                List.of(row(artifact, "unexpected"))));
        assertThrows(IllegalStateException.class, () -> planner.prepare(artifact,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT, artifact,
                List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID),
                        row(artifact, "unexpected"))));
    }

    @Test
    void staleUpdatedAtBeforeGeoAndNonGeoEachRollbackWithoutUpdate() throws Exception {
        var prepared = prepared();
        for (String failure : List.of("updatedAt", "beforeGeo", "beforeNonGeo")) {
            FakePort port = new FakePort();
            port.failure = failure;
            assertThrows(IllegalStateException.class, () -> planner.execute(prepared, authorized(), port));
            assertEquals(0, port.updateCalls);
            assertEquals(0, port.commitCalls);
            assertEquals(1, port.rollbackCalls);
        }
    }

    @Test
    void affectedRowAndPostReadFailuresAlwaysRollback() throws Exception {
        for (String failure : List.of("affected0", "affected2", "postGeo", "postNonGeo")) {
            FakePort port = new FakePort();
            port.failure = failure;
            assertThrows(IllegalStateException.class,
                    () -> planner.execute(prepared(), authorized(), port));
            assertEquals(0, port.commitCalls);
            assertEquals(1, port.rollbackCalls);
        }
    }

    @Test
    void transactionExceptionRollsBackAndNeverCommits() throws Exception {
        FakePort port = new FakePort();
        port.failure = "exception";
        assertThrows(IllegalStateException.class, () -> planner.execute(prepared(), authorized(), port));
        assertEquals(1, port.rollbackCalls);
        assertEquals(0, port.commitCalls);
    }

    @Test
    void jdbcApplyUsesPreparedOptimisticUpdateAndHasNoGenericScopeFlags() throws Exception {
        String source = Files.readString(Path.of("src", "main", "java", "com", "lichsuvn", "backend",
                "importer", "canonicalgeo", "RemoteCanonicalGeographyApplyCli.java"));
        assertTrue(source.contains("connection.prepareStatement(sql)"));
        assertTrue(source.contains("WHERE id=? AND updated_at=?"));
        assertTrue(source.contains("statement.setString(7, command.eventId())"));
        assertTrue(source.contains("statement.setTimestamp(8"));
        assertFalse(source.contains("--force"));
        assertFalse(source.contains("--all"));
        assertFalse(source.contains("--unsafe"));
        assertFalse(source.contains("--skip"));
    }

    private RemoteCanonicalGeographyApplyPlanner.PreparedApply prepared() throws Exception {
        ObjectNode artifact = reviewed();
        return planner.prepare(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID)));
    }

    private RemoteCanonicalGeographyApplyPlanner.Authorization authorized() {
        return new RemoteCanonicalGeographyApplyPlanner.Authorization(true,
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_PLAN_SHA);
    }

    private ObjectNode reviewed() throws Exception {
        return (ObjectNode) mapper.readTree(Files.readString(Path.of("..", "docs", "map-qa",
                "remote-sync-1287-plan.json")));
    }

    private PlanRow row(ObjectNode artifact, String eventId) {
        var change = artifact.path("changes").path(0);
        ObjectNode patch = mapper.createObjectNode();
        patch.set("mapData", change.path("after").path("mapData").deepCopy());
        patch.put("showOnMap", change.path("after").path("showOnMap").asBoolean());
        return new PlanRow(eventId, "1287", change.path("expectedUpdatedAt").asText(),
                change.path("beforeGeographyFingerprint").asText(),
                change.path("nonGeographyFingerprint").asText(),
                change.path("afterGeographyFingerprint").asText(),
                List.of("geo_type", "lat_lng", "raw_json.mapData", "raw_json.display.showOnMap"),
                (ObjectNode) change.path("before").deepCopy(), (ObjectNode) change.path("after").deepCopy(),
                patch, true, "", List.of());
    }

    private void reseal(ObjectNode artifact) {
        artifact.remove("planSha256");
        artifact.put("planSha256", CanonicalGeographyProjection.sha256(
                CanonicalGeographyProjection.canonicalJsonString(artifact)));
    }

    private static final class FakePort implements RemoteCanonicalGeographyApplyPlanner.TransactionPort {
        final List<String> calls = new ArrayList<>();
        String failure = "";
        int updateCalls;
        int commitCalls;
        int rollbackCalls;
        RemoteCanonicalGeographyApplyPlanner.UpdateCommand command;

        @Override
        public <T> T inTransaction(RemoteCanonicalGeographyApplyPlanner.TransactionWork<T> work) {
            calls.add("begin");
            try {
                T result = work.run();
                calls.add("commit");
                commitCalls++;
                return result;
            } catch (Exception ex) {
                calls.add("rollback");
                rollbackCalls++;
                if (ex instanceof RuntimeException runtime) throw runtime;
                throw new IllegalStateException(ex);
            }
        }

        @Override
        public DbEventRow lockTarget(String eventId) {
            calls.add("lock");
            Timestamp timestamp = Timestamp.valueOf((failure.equals("updatedAt")
                    ? "2026-08-07T18:43:22.767893"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT).replace('T', ' '));
            return row("no_location", timestamp);
        }

        @Override
        public int update(RemoteCanonicalGeographyApplyPlanner.UpdateCommand command) {
            calls.add("update");
            updateCalls++;
            this.command = command;
            if (failure.equals("exception")) throw new IllegalStateException("simulated");
            if (failure.equals("affected0")) return 0;
            if (failure.equals("affected2")) return 2;
            return 1;
        }

        @Override public DbEventRow readBack(String eventId) { calls.add("readBack"); return row("multi_point",
                Timestamp.valueOf(RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT.replace('T', ' '))); }
        @Override public String geoHash(DbEventRow row) {
            if (row.geoType().equals("no_location")) return failure.equals("beforeGeo") ? "wrong"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_BEFORE_GEO_SHA;
            return failure.equals("postGeo") ? "wrong"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_AFTER_GEO_SHA;
        }
        @Override public String nonGeoHash(DbEventRow row) {
            if (row.geoType().equals("no_location") && failure.equals("beforeNonGeo")) return "wrong";
            if (row.geoType().equals("multi_point") && failure.equals("postNonGeo")) return "wrong";
            return RemoteCanonicalGeographyApplyPlanner.EXPECTED_NON_GEO_SHA;
        }

        private DbEventRow row(String geoType, Timestamp timestamp) {
            return new DbEventRow(RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID, "1287", geoType,
                    null, null, "[]", "[]", "{\"display\":{},\"mapData\":{}}", timestamp);
        }
    }
}
