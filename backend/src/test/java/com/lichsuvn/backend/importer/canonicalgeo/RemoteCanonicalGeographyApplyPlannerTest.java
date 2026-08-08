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
import java.sql.Connection;
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
        planner.prepare(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row));
        FakePort port = new FakePort();
        var result = planner.execute(artifact, authorized(), port);
        assertTrue(result.wrote());
        assertEquals(1, result.affectedRows());
        assertEquals(List.of("begin", "revalidate", "lock", "update", "readBack", "commit"),
                port.calls);
        assertEquals("multi_point", port.command.geoType());
        assertEquals(new BigDecimal("20.8833"), port.command.lat());
        assertEquals(new BigDecimal("106.8"), port.command.lng());
        assertEquals(RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID, port.command.eventId());
        assertEquals(RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT,
                port.command.expectedUpdatedAt());
        var raw = mapper.readTree(port.command.rawJson());
        assertEquals(4, raw.path("mapData").path("markers").size());
        assertTrue(raw.path("display").path("showOnMap").asBoolean());
    }

    @Test
    void noAuthorizationAndWrongAuthorizationPerformZeroUpdates() throws Exception {
        ObjectNode artifact = reviewed();
        planner.prepare(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID)));
        FakePort noAuth = new FakePort();
        assertFalse(planner.execute(artifact,
                new RemoteCanonicalGeographyApplyPlanner.Authorization(false, "", "", "", "", ""),
                noAuth).wrote());
        assertTrue(noAuth.calls.isEmpty());
        FakePort wrongSha = new FakePort();
        assertThrows(IllegalStateException.class, () -> planner.execute(artifact,
                authorization("0".repeat(64),
                        ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                        ControlledGeographyRelease1287Contract.EVENT_ID), wrongSha));
        assertTrue(wrongSha.calls.isEmpty());
    }

    @Test
    void wrongReleaseCanonicalOrEventIdentityBlocksBeforeTransaction() throws Exception {
        var artifact = reviewed();
        List<RemoteCanonicalGeographyApplyPlanner.Authorization> invalid = List.of(
                new RemoteCanonicalGeographyApplyPlanner.Authorization(true, "wrong-release",
                        ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                        ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                        ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                        ControlledGeographyRelease1287Contract.EVENT_ID),
                authorization(ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                        "0".repeat(64), ControlledGeographyRelease1287Contract.EVENT_ID),
                authorization(ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                        ControlledGeographyRelease1287Contract.CANONICAL_SHA256, "another-event")
        );
        for (var authorization : invalid) {
            FakePort port = new FakePort();
            assertThrows(IllegalStateException.class,
                    () -> planner.execute(artifact, authorization, port));
            assertTrue(port.calls.isEmpty());
        }
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
        var artifact = reviewed();
        for (String failure : List.of("updatedAt", "beforeGeo", "beforeNonGeo")) {
            FakePort port = new FakePort();
            port.failure = failure;
            assertThrows(IllegalStateException.class, () -> planner.execute(artifact, authorized(), port));
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
                    () -> planner.execute(reviewed(), authorized(), port));
            assertEquals(0, port.commitCalls);
            assertEquals(1, port.rollbackCalls);
        }
    }

    @Test
    void transactionExceptionRollsBackAndNeverCommits() throws Exception {
        FakePort port = new FakePort();
        port.failure = "exception";
        assertThrows(IllegalStateException.class, () -> planner.execute(reviewed(), authorized(), port));
        assertEquals(1, port.rollbackCalls);
        assertEquals(0, port.commitCalls);
    }

    @Test
    void validPreflightCannotAuthorizeChangedTransactionalState() throws Exception {
        ObjectNode artifact = reviewed();
        planner.prepare(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT,
                artifact, List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID)));
        for (String failure : List.of("liveDb", "liveExtra", "livePlan")) {
            FakePort port = new FakePort();
            port.failure = failure;
            assertThrows(IllegalStateException.class,
                    () -> planner.execute(artifact, authorized(), port));
            assertEquals(List.of("begin", "revalidate", "rollback"), port.calls);
            assertEquals(0, port.updateCalls);
        }
    }

    @Test
    void validationLockUpdateAndReadbackShareOneTransactionContext() throws Exception {
        FakePort port = new FakePort();
        planner.execute(reviewed(), authorized(), port);
        assertTrue(port.allReleaseOperationsObservedInsideTransaction);
        assertFalse(port.inTransaction);
    }

    @Test
    void jdbcTransactionalPlanReaderUsesTheSameOpenTransactionConnection() throws Exception {
        List<String> calls = new ArrayList<>();
        boolean[] autoCommit = {true};
        int[] isolation = {Connection.TRANSACTION_READ_COMMITTED};
        Connection connection = (Connection) java.lang.reflect.Proxy.newProxyInstance(
                Connection.class.getClassLoader(), new Class<?>[]{Connection.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "getAutoCommit" -> autoCommit[0];
                    case "setAutoCommit" -> {
                        autoCommit[0] = (boolean) args[0];
                        calls.add("autoCommit=" + args[0]);
                        yield null;
                    }
                    case "getTransactionIsolation" -> isolation[0];
                    case "setTransactionIsolation" -> {
                        isolation[0] = (int) args[0];
                        calls.add("isolation=" + args[0]);
                        yield null;
                    }
                    case "commit" -> { calls.add("commit"); yield null; }
                    case "rollback" -> { calls.add("rollback"); yield null; }
                    case "toString" -> "controlled-release-test-connection";
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    default -> throw new UnsupportedOperationException(method.getName());
                });
        ObjectNode artifact = reviewed();
        var run = new RemoteCanonicalGeographyReadOnlyCli.RunResult(artifact,
                List.of(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID)),
                RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT);
        var port = new RemoteCanonicalGeographyApplyCli.JdbcTransactionPort(connection, "locked-url",
                (observedConnection, observedUrl) -> {
                    assertSame(connection, observedConnection);
                    assertEquals("locked-url", observedUrl);
                    assertFalse(autoCommit[0]);
                    assertEquals(Connection.TRANSACTION_REPEATABLE_READ, isolation[0]);
                    calls.add("transactionalPlan");
                    return run;
                });
        port.inTransaction(() -> {
            port.revalidateCurrentState();
            calls.add("work");
            return null;
        });
        assertEquals(List.of("isolation=" + Connection.TRANSACTION_REPEATABLE_READ,
                "autoCommit=false", "transactionalPlan", "work", "commit",
                "autoCommit=true", "isolation=" + Connection.TRANSACTION_READ_COMMITTED), calls);
    }

    @Test
    void provinceNamesDriftBlocksAndHistoricalLocationsAreNeverOverwritten() throws Exception {
        FakePort provinceDrift = new FakePort();
        provinceDrift.failure = "provinceNames";
        assertThrows(IllegalStateException.class,
                () -> planner.execute(reviewed(), authorized(), provinceDrift));
        assertEquals(0, provinceDrift.updateCalls);

        FakePort historicalDrift = new FakePort();
        historicalDrift.historicalLocationsJson = "[\"legacy-preserved\"]";
        planner.execute(reviewed(), authorized(), historicalDrift);
        assertEquals(historicalDrift.lockedProvinceNamesJson,
                historicalDrift.readBackProvinceNamesJson);
        assertEquals("[\"legacy-preserved\"]", historicalDrift.lockedHistoricalLocationsJson);
        assertEquals(historicalDrift.lockedHistoricalLocationsJson,
                historicalDrift.readBackHistoricalLocationsJson);
    }

    @Test
    void realGeographyHasherRecognizesTheExactReviewedPostState() throws Exception {
        ObjectNode artifact = reviewed();
        var after = artifact.path("changes").path(0).path("after");
        ObjectNode raw = mapper.createObjectNode();
        raw.set("mapData", after.path("mapData").deepCopy());
        raw.putObject("display").put("showOnMap", after.path("showOnMap").asBoolean());
        DbEventRow row = new DbEventRow(RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID,
                "1287", after.path("geoType").asText(), after.path("lat").decimalValue(),
                after.path("lng").decimalValue(), "[]", "[\"preserved\"]",
                mapper.writeValueAsString(raw), Timestamp.valueOf(
                        RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT.replace('T', ' ')));
        var port = new RemoteCanonicalGeographyApplyCli.JdbcTransactionPort(null, "jdbc:mysql://unused");
        assertEquals(RemoteCanonicalGeographyApplyPlanner.EXPECTED_AFTER_GEO_SHA, port.geoHash(row));
    }

    @Test
    void jdbcApplyUsesPreparedOptimisticUpdateAndHasNoGenericScopeFlags() throws Exception {
        String source = Files.readString(Path.of("src", "main", "java", "com", "lichsuvn", "backend",
                "importer", "canonicalgeo", "RemoteCanonicalGeographyApplyCli.java"));
        assertTrue(source.contains("connection.prepareStatement(sql)"));
        assertTrue(source.contains("WHERE id=? AND updated_at=?"));
        assertTrue(source.contains("statement.setString(5, command.eventId())"));
        assertTrue(source.contains("statement.setTimestamp(6"));
        assertFalse(source.contains("province_names=CAST"));
        assertFalse(source.contains("historical_locations=CAST"));
        List<String> commandFields = java.util.Arrays.stream(
                        RemoteCanonicalGeographyApplyPlanner.UpdateCommand.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName).toList();
        assertFalse(commandFields.contains("provinceNamesJson"));
        assertFalse(commandFields.contains("historicalLocationsJson"));
        assertFalse(source.contains("--force"));
        assertFalse(source.contains("--all"));
        assertFalse(source.contains("--unsafe"));
        assertFalse(source.contains("--skip"));
        assertTrue(source.contains("--release-id="));
        assertTrue(source.contains("--authorization="));
        assertTrue(source.contains("--canonical-sha="));
        assertTrue(source.contains("--event-id="));
    }

    private RemoteCanonicalGeographyApplyPlanner.Authorization authorized() {
        return authorization(ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256,
                ControlledGeographyRelease1287Contract.CANONICAL_SHA256,
                ControlledGeographyRelease1287Contract.EVENT_ID);
    }

    private RemoteCanonicalGeographyApplyPlanner.Authorization authorization(
            String planSha, String canonicalSha, String eventId) {
        return new RemoteCanonicalGeographyApplyPlanner.Authorization(true,
                ControlledGeographyRelease1287Contract.RELEASE_ID,
                ControlledGeographyRelease1287Contract.APPLY_AUTHORIZATION,
                planSha, canonicalSha, eventId);
    }

    private ObjectNode reviewed() throws Exception {
        return (ObjectNode) mapper.readTree(Files.readString(Path.of("..", "docs", "data", "releases",
                "geo-1287-controlled-release", "REVIEWED_PLAN.json")));
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

    private final class FakePort implements RemoteCanonicalGeographyApplyPlanner.TransactionPort {
        final List<String> calls = new ArrayList<>();
        String failure = "";
        int updateCalls;
        int commitCalls;
        int rollbackCalls;
        RemoteCanonicalGeographyApplyPlanner.UpdateCommand command;
        boolean inTransaction;
        boolean allReleaseOperationsObservedInsideTransaction = true;
        String historicalLocationsJson = "[]";
        String provinceNamesJson = "[]";
        String lockedProvinceNamesJson;
        String readBackProvinceNamesJson;
        String lockedHistoricalLocationsJson;
        String readBackHistoricalLocationsJson;

        @Override
        public <T> T inTransaction(RemoteCanonicalGeographyApplyPlanner.TransactionWork<T> work) {
            calls.add("begin");
            inTransaction = true;
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
            } finally {
                inTransaction = false;
            }
        }

        @Override
        public RemoteCanonicalGeographyApplyPlanner.LiveState revalidateCurrentState() {
            observeTransaction("revalidate");
            try {
                ObjectNode artifact = reviewed();
                if (failure.equals("livePlan")) {
                    artifact.put("toolVersion", "changed-in-transaction");
                    reseal(artifact);
                }
                List<PlanRow> rows = new ArrayList<>();
                rows.add(row(artifact, RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID));
                if (failure.equals("liveExtra")) rows.add(row(artifact, "unexpected"));
                String fingerprint = failure.equals("liveDb") ? "changed-database"
                        : RemoteCanonicalGeographyApplyPlanner.EXPECTED_DATABASE_FINGERPRINT;
                return new RemoteCanonicalGeographyApplyPlanner.LiveState(
                        fingerprint, artifact, List.copyOf(rows));
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }

        @Override
        public DbEventRow lockTarget(String eventId) {
            observeTransaction("lock");
            Timestamp timestamp = Timestamp.valueOf((failure.equals("updatedAt")
                    ? "2026-08-07T18:43:22.767893"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT).replace('T', ' '));
            DbEventRow row = dbRow("no_location", timestamp);
            lockedProvinceNamesJson = row.provinceNamesJson();
            lockedHistoricalLocationsJson = row.historicalLocationsJson();
            return row;
        }

        @Override
        public int update(RemoteCanonicalGeographyApplyPlanner.UpdateCommand command) {
            observeTransaction("update");
            updateCalls++;
            this.command = command;
            if (failure.equals("exception")) throw new IllegalStateException("simulated");
            if (failure.equals("affected0")) return 0;
            if (failure.equals("affected2")) return 2;
            return 1;
        }

        @Override public DbEventRow readBack(String eventId) {
            observeTransaction("readBack");
            DbEventRow row = dbRow("multi_point", Timestamp.valueOf(
                    RemoteCanonicalGeographyApplyPlanner.EXPECTED_UPDATED_AT.replace('T', ' ')));
            readBackProvinceNamesJson = row.provinceNamesJson();
            readBackHistoricalLocationsJson = row.historicalLocationsJson();
            return row;
        }
        @Override public String geoHash(DbEventRow row) {
            if (row.geoType().equals("no_location")) return failure.equals("beforeGeo")
                    || failure.equals("provinceNames") ? "wrong"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_BEFORE_GEO_SHA;
            return failure.equals("postGeo") ? "wrong"
                    : RemoteCanonicalGeographyApplyPlanner.EXPECTED_AFTER_GEO_SHA;
        }
        @Override public String nonGeoHash(DbEventRow row) {
            if (row.geoType().equals("no_location") && failure.equals("beforeNonGeo")) return "wrong";
            if (row.geoType().equals("multi_point") && failure.equals("postNonGeo")) return "wrong";
            return RemoteCanonicalGeographyApplyPlanner.EXPECTED_NON_GEO_SHA;
        }

        private DbEventRow dbRow(String geoType, Timestamp timestamp) {
            return new DbEventRow(RemoteCanonicalGeographyApplyPlanner.EXPECTED_EVENT_ID, "1287", geoType,
                    null, null, provinceNamesJson, historicalLocationsJson,
                    "{\"display\":{},\"mapData\":{}}", timestamp);
        }

        private void observeTransaction(String call) {
            calls.add(call);
            allReleaseOperationsObservedInsideTransaction &= inTransaction;
        }
    }
}
