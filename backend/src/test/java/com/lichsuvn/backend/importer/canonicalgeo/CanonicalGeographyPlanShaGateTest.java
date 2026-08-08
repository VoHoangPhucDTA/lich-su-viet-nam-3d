package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.ApplyResult;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.RollbackSnapshotRow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * C2-T5 regression suite for the raw plan-file SHA gate (Option A).
 *
 * <p>Contract under test: {@code canonical-geo-sync.expected-plan-sha} is the
 * SHA-256 of the EXACT plan file bytes (raw artifact checksum, compatible with
 * {@code sha256sum}), never a parse/re-serialize hash. Tests A-H of the C2-T5
 * review are covered. All tests are hermetic: temp files and stub
 * collaborators only; the local database 127.0.0.1:3307 is never touched.
 */
class CanonicalGeographyPlanShaGateTest {

    /** DECIMAL(10,7)-scaled lat/lng like the locked R2 plan file (16.0000000/106.0000000). */
    private static final String PLAN_LINE = "{\"eventId\":\"ev-1\",\"title\":\"Event 1\","
            + "\"expectedUpdatedAt\":\"2026-07-29T16:56:01\",\"expectedCurrentGeoHash\":\"h1\","
            + "\"expectedCurrentNonGeoHash\":\"h2\",\"desiredGeoHash\":\"h3\","
            + "\"changedFields\":[\"lat_lng\"],"
            + "\"beforeGeography\":{\"geoType\":\"point\",\"lat\":16.0000000,\"lng\":106.0000000,"
            + "\"provinceNames\":[],\"showOnMap\":true},"
            + "\"afterGeography\":{\"geoType\":\"point\",\"lat\":16.0,\"lng\":106.0,"
            + "\"provinceNames\":[],\"showOnMap\":true},"
            + "\"rawJsonGeoPatch\":{},\"updateRequired\":true,\"blockedReason\":\"\",\"warnings\":[]}";

    private static final String BLOCKED_LINE = PLAN_LINE
            .replace("\"updateRequired\":true", "\"updateRequired\":false")
            .replace("\"blockedReason\":\"\"", "\"blockedReason\":\"invalid_raw_json: test\"");

    @TempDir
    Path tempDir;

    private Path writePlan(String name, String line) throws Exception {
        Path dir = Files.createDirectories(tempDir.resolve("plan"));
        Path file = dir.resolve(name);
        Files.writeString(file, line + "\n", StandardCharsets.UTF_8);
        return file;
    }

    private static String sha256Hex(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(bytes);
        StringBuilder hex = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    // Test A - exact raw artifact succeeds ---------------------------------

    @Test
    void exactRawArtifactShaPassesGate() throws Exception {
        Path file = writePlan("exact.jsonl", PLAN_LINE);
        String rawSha = CanonicalGeographySyncService.sha256FileBytes(file);
        assertEquals(64, rawSha.length());
        assertTrue(rawSha.matches("[0-9a-f]{64}"));
        // independent verification over the exact same bytes
        assertEquals(sha256Hex(Files.readAllBytes(file)), rawSha);
        // the raw gate accepts the correct raw SHA
        assertEquals(rawSha, CanonicalGeographySyncRunner.verifyPlanFileSha(file, rawSha));
    }

    // Test B - one-byte mutation fails --------------------------------------

    @Test
    void oneByteMutationFailsRawGate() throws Exception {
        Path original = writePlan("original.jsonl", PLAN_LINE);
        String originalSha = CanonicalGeographySyncService.sha256FileBytes(original);
        Path mutated = writePlan("mutated.jsonl", PLAN_LINE.replace("16.0000000", "16.0000001"));
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> CanonicalGeographySyncRunner.verifyPlanFileSha(mutated, originalSha));
        assertTrue(ex.getMessage().contains("expected raw plan-file SHA"), ex.getMessage());
        assertTrue(ex.getMessage().contains("actual raw plan-file SHA"), ex.getMessage());
    }

    // Test C - lexically different but numerically equal fails --------------

    @Test
    void numericallyEqualLexicalChangeFailsRawGate() throws Exception {
        Path original = writePlan("original.jsonl", PLAN_LINE);
        String originalSha = CanonicalGeographySyncService.sha256FileBytes(original);
        Path lexical = writePlan("lexical.jsonl", PLAN_LINE.replace("16.0000000", "16.0"));
        assertThrows(IllegalStateException.class,
                () -> CanonicalGeographySyncRunner.verifyPlanFileSha(lexical, originalSha));
    }

    // Test D - parser normalization does not affect the raw gate ------------

    @Test
    void parserNormalizationDoesNotAffectRawGate() throws Exception {
        Path file = writePlan("scaled.jsonl", PLAN_LINE);
        String rawSha = CanonicalGeographySyncService.sha256FileBytes(file);
        assertEquals(rawSha, CanonicalGeographySyncRunner.verifyPlanFileSha(file, rawSha));
        List<PlanRow> rows = CanonicalGeographyAuditWriter.readPlan(file, new ObjectMapper());
        assertEquals(1, rows.size());
        String parsedSha = CanonicalGeographySyncService.planSha256(rows);
        assertNotEquals(rawSha, parsedSha); // 16.0000000 collapses to 16.0 on parse; raw gate unaffected
    }

    // Test E - matching raw SHA does not bypass semantic validation ----------

    @Test
    void matchingRawShaDoesNotBypassSemanticValidation() throws Exception {
        Path file = writePlan("blocked.jsonl", BLOCKED_LINE);
        String rawSha = CanonicalGeographySyncService.sha256FileBytes(file);
        assertEquals(rawSha, CanonicalGeographySyncRunner.verifyPlanFileSha(file, rawSha));
        List<PlanRow> rows = CanonicalGeographyAuditWriter.readPlan(file, new ObjectMapper());
        assertTrue(rows.get(0).blocked());
        CanonicalGeographySyncService service = new CanonicalGeographySyncService(
                new StubRepository(Set.of()), new CanonicalGeographyProjection(new ObjectMapper()),
                new ObjectMapper(), new DirectTransactionManager());
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.apply(rows, CanonicalGeographySyncService.planSha256(rows),
                        "canonical", "fp", "38"));
        assertTrue(ex.getMessage().contains("Apply blocked"), ex.getMessage());
    }

    // Test F - existing blocker fixture --------------------------------------

    @Test
    void blockerFixtureRawShaDiffersFromParsedSha() throws Exception {
        Path file = writePlan("blocker.jsonl", PLAN_LINE);
        String rawSha = CanonicalGeographySyncService.sha256FileBytes(file);
        List<PlanRow> rows = CanonicalGeographyAuditWriter.readPlan(file, new ObjectMapper());
        assertNotEquals(rawSha, CanonicalGeographySyncService.planSha256(rows));
        assertEquals(rawSha, CanonicalGeographySyncRunner.verifyPlanFileSha(file, rawSha));
    }

    // Test G - transaction not entered on raw SHA mismatch -------------------

    @Test
    void rawShaMismatchBlocksBeforeTransactionAndApply() throws Exception {
        Path planDir = Files.createDirectories(tempDir.resolve("plan"));
        Path planFile = planDir.resolve("canonical-geo-sync-plan.jsonl");
        Files.writeString(planFile, "{\"eventId\":\"ev-1\"}\n", StandardCharsets.UTF_8);
        RecordingService service = new RecordingService(new StubRepository(Set.of()));
        MockEnvironment environment = new MockEnvironment()
                .withProperty("APP_CANONICAL_GEO_SYNC_ENABLED", "true");
        CanonicalGeographySyncRunner runner = new CanonicalGeographySyncRunner(
                service, new StubRepository(Set.of()), new StubGuard(),
                new ObjectMapper(), environment,
                false, true, "lichsuvn_phase4a",
                tempDir.resolve("canonical.jsonl").toString(),
                tempDir.toString(),
                "", "0".repeat(64), "", "38", "", "", "");
        IllegalStateException ex = assertThrows(IllegalStateException.class, runner::run);
        assertTrue(ex.getMessage().contains("Plan file SHA-256 mismatch"), ex.getMessage());
        assertFalse(service.applyCalled, "service.apply must not be invoked when the raw plan-file SHA differs");
        assertFalse(service.snapshotCalled, "rollback snapshot must not be exported when the raw plan-file SHA differs");
    }

    // Test H - service internal plan-row consistency check stays active ------

    @Test
    void serviceInternalPlanRowConsistencyCheckRemainsActive() throws Exception {
        Path file = writePlan("valid.jsonl", PLAN_LINE);
        List<PlanRow> rows = CanonicalGeographyAuditWriter.readPlan(file, new ObjectMapper());
        String planRowsSha256 = CanonicalGeographySyncService.planSha256(rows);
        CanonicalGeographySyncService service = new CanonicalGeographySyncService(
                new StubRepository(Set.of("ev-1")), new CanonicalGeographyProjection(new ObjectMapper()),
                new ObjectMapper(), new DirectTransactionManager());
        // Correct internal SHA: the check passes and the transaction is entered
        // (the stub repository reports the row missing at FOR UPDATE time).
        IllegalStateException reached = assertThrows(IllegalStateException.class,
                () -> service.apply(rows, planRowsSha256, "canonical", "fp", "38"));
        assertTrue(reached.getMessage().contains("Row disappeared during apply"), reached.getMessage());
        assertFalse(reached.getMessage().contains("Plan SHA-256 mismatch"));
        // Wrong internal SHA: the check must reject immediately
        // (IllegalArgumentException, per the service's plan-SHA guard).
        IllegalArgumentException rejected = assertThrows(IllegalArgumentException.class,
                () -> service.apply(rows, "0".repeat(64), "canonical", "fp", "38"));
        assertTrue(rejected.getMessage().contains("Plan SHA-256 mismatch"), rejected.getMessage());
    }

    // ---------------------------------------------------------------- stubs

    /** Runs callback-style transactions inline; enough for the non-DB paths under test. */
    static final class DirectTransactionManager implements PlatformTransactionManager {
        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
        }

        @Override
        public void rollback(TransactionStatus status) {
        }
    }

    /** Repository stub: never executes JDBC in these tests. */
    static final class StubRepository extends CanonicalGeographySyncRepository {
        private final Set<String> ids;

        StubRepository(Set<String> ids) {
            super(new NamedParameterJdbcTemplate(new DriverManagerDataSource()));
            this.ids = ids;
        }

        @Override
        public Set<String> loadIds() {
            return ids;
        }

        @Override
        public List<DbEventRow> loadForUpdate(String eventId) {
            return List.of();
        }

        @Override
        public String flywayVersion() {
            return "38";
        }

        @Override
        public long countRows() {
            return ids.size();
        }

        @Override
        public String serverVersion() {
            return "8.4.8";
        }

        @Override
        public String schemaSignature() {
            return "stub-schema";
        }
    }

    /** Datasource guard stub: always reports the expected loopback target. */
    static final class StubGuard extends CanonicalGeographyDatasourceGuard {
        @Override
        public DatasourceTarget validate(String datasourceUrl, String expectedDatabase, String[] activeProfiles) {
            return new DatasourceTarget("jdbc:mysql://127.0.0.1:3307/test?password=<redacted>",
                    "127.0.0.1", "3307", "lichsuvn_phase4a");
        }
    }

    /** Service that records apply/snapshot invocations and cans the canonical input. */
    static final class RecordingService extends CanonicalGeographySyncService {
        boolean applyCalled;
        boolean snapshotCalled;

        RecordingService(CanonicalGeographySyncRepository repository) {
            super(repository, new CanonicalGeographyProjection(new ObjectMapper()),
                    new ObjectMapper(), new DirectTransactionManager());
        }

        @Override
        public CanonicalRelease validateCanonical(Path eventsPath, String expectedSha256,
                                                  Map<String, Long> expectedCounts) {
            return new CanonicalRelease(Map.of(),
                    java.util.Collections.nCopies(CanonicalGeographyReleaseContract.RECORD_COUNT,
                            com.fasterxml.jackson.databind.node.NullNode.getInstance()),
                    CanonicalGeographyReleaseContract.CANONICAL_SHA256,
                    CanonicalGeographyReleaseContract.GEO_TYPE_COUNTS);
        }

        @Override
        public ApplyResult apply(List<PlanRow> plan, String expectedPlanSha256, String expectedCanonicalSha256,
                                 String expectedDbFingerprint, String expectedFlywayVersion) {
            applyCalled = true;
            return new ApplyResult(0, 0, List.of(), List.of());
        }

        @Override
        public List<RollbackSnapshotRow> exportRollbackSnapshot() {
            snapshotCalled = true;
            return List.of();
        }
    }
}
