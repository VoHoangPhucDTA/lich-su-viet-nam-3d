package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanSummary;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Canonical geography sync CLI. Dry-run is the default and never writes.
 * Apply requires: allow-write, the canonical SHA, the exact plan-file SHA-256
 * (raw file bytes), the exact DB fingerprint, the Flyway version and the
 * APP_CANONICAL_GEO_SYNC_ENABLED environment flag. No --force exists.
 */
@Component
@Profile("canonical-geo-sync")
public class CanonicalGeographySyncRunner implements CommandLineRunner {

    private static final Logger LOG = LoggerFactory.getLogger(CanonicalGeographySyncRunner.class);

    private final CanonicalGeographySyncService service;
    private final CanonicalGeographySyncRepository repository;
    private final CanonicalGeographyDatasourceGuard guard;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    private final boolean dryRun;
    private final boolean allowWrite;
    private final String expectedDatabase;
    private final Path eventsPath;
    private final Path outputDir;
    private final String expectedCanonicalSha;
    private final String expectedPlanSha;
    private final String expectedDbFingerprint;
    private final String expectedFlywayVersion;
    private final String rollbackSnapshotPath;

    public CanonicalGeographySyncRunner(
            CanonicalGeographySyncService service,
            CanonicalGeographySyncRepository repository,
            CanonicalGeographyDatasourceGuard guard,
            ObjectMapper objectMapper,
            Environment environment,
            @Value("${canonical-geo-sync.dry-run:true}") boolean dryRun,
            @Value("${canonical-geo-sync.allow-write:false}") boolean allowWrite,
            @Value("${canonical-geo-sync.expected-database:}") String expectedDatabase,
            @Value("${canonical-geo-sync.events-path:../crawData/stage4b_curate_tree/output/phase2/core_events.jsonl}") String eventsPath,
            @Value("${canonical-geo-sync.output-dir:../geo-phase-c2-db-sync}") String outputDir,
            @Value("${canonical-geo-sync.expected-canonical-sha:}") String expectedCanonicalSha,
            @Value("${canonical-geo-sync.expected-plan-sha:}") String expectedPlanSha,
            @Value("${canonical-geo-sync.expected-db-fingerprint:}") String expectedDbFingerprint,
            @Value("${canonical-geo-sync.expected-flyway-version:}") String expectedFlywayVersion,
            @Value("${canonical-geo-sync.rollback-snapshot:}") String rollbackSnapshotPath
    ) {
        this.service = service;
        this.repository = repository;
        this.guard = guard;
        this.objectMapper = objectMapper;
        this.environment = environment;
        this.dryRun = dryRun;
        this.allowWrite = allowWrite;
        this.expectedDatabase = expectedDatabase;
        this.eventsPath = Path.of(eventsPath).toAbsolutePath().normalize();
        this.outputDir = Path.of(outputDir).toAbsolutePath().normalize();
        this.expectedCanonicalSha = expectedCanonicalSha;
        this.expectedPlanSha = expectedPlanSha;
        this.expectedDbFingerprint = expectedDbFingerprint;
        this.expectedFlywayVersion = expectedFlywayVersion;
        this.rollbackSnapshotPath = rollbackSnapshotPath;
    }

    @Override
    public void run(String... args) throws Exception {
        if (dryRun && allowWrite) {
            throw new IllegalArgumentException("Dry-run cannot be combined with allow-write");
        }
        if (!dryRun && !allowWrite) {
            throw new IllegalArgumentException("Apply mode requires canonical-geo-sync.allow-write=true");
        }
        if (!dryRun && !"true".equalsIgnoreCase(environment.getProperty("APP_CANONICAL_GEO_SYNC_ENABLED", ""))) {
            throw new IllegalStateException(
                    "Apply blocked: APP_CANONICAL_GEO_SYNC_ENABLED must be 'true'");
        }

        var target = guard.validate(
                environment.getProperty("spring.datasource.url"),
                expectedDatabase,
                environment.getActiveProfiles());
        System.out.println("Datasource target: " + target);

        String flywayVersion = repository.flywayVersion();
        String fingerprint = buildFingerprint(target, flywayVersion);
        System.out.println("DB fingerprint: " + fingerprint);
        System.out.println("Flyway version: " + flywayVersion);
        System.out.println("DB rows: " + repository.countRows());

        if (!rollbackSnapshotPath.isBlank()) {
            runRollback(target, fingerprint, flywayVersion);
            return;
        }

        Map<String, Long> expectedCounts = Map.of(
                "point", 46L, "multi_point", 19L, "multi_polygon", 24L,
                "mixed", 0L, "nationwide", 18L, "no_location", 254L);
        CanonicalRelease release = service.validateCanonical(eventsPath, expectedCanonicalSha, expectedCounts);
        System.out.println("Canonical: " + release.recordsById().size() + " records, sha=" + release.sha256());

        if (dryRun) {
            runDryRun(release, fingerprint, flywayVersion);
            return;
        }
        runApply(release, fingerprint, flywayVersion);
    }

    private void runDryRun(CanonicalRelease release, String fingerprint, String flywayVersion) throws Exception {
        List<PlanRow> rows = service.buildPlan(release);
        String planSha = CanonicalGeographySyncService.planSha256(rows);
        Set<String> canonicalIds = new LinkedHashSet<>(release.recordsById().keySet());
        Set<String> dbIds = repository.loadIds();
        PlanSummary summary = service.summarize(rows, planSha, release.sha256(), fingerprint, flywayVersion,
                canonicalIds, dbIds);
        Files.createDirectories(outputDir.resolve("plan"));
        CanonicalGeographyAuditWriter.writePlan(outputDir, rows, summary, objectMapper);
        printSummary(summary);
        System.out.println("DRY-RUN complete. Database writes: 0");
    }

    private void runRollback(CanonicalGeographyDatasourceGuard.DatasourceTarget target,
                             String fingerprint, String flywayVersion) throws Exception {
        Path snapshotFile = Path.of(rollbackSnapshotPath).toAbsolutePath().normalize();
        if (!Files.isRegularFile(snapshotFile)) {
            throw new IllegalStateException("Rollback snapshot not found: " + snapshotFile);
        }
        if (!expectedDbFingerprint.isBlank() && !expectedDbFingerprint.equals(fingerprint)) {
            throw new IllegalStateException("Rollback blocked: DB fingerprint mismatch");
        }
        List<CanonicalGeographySyncService.RollbackSnapshotRow> rows =
                CanonicalGeographyAuditWriter.readRollbackSnapshot(snapshotFile, objectMapper);
        if (!expectedPlanSha.isBlank()) {
            throw new IllegalStateException("Rollback does not accept a plan SHA; use the snapshot SHA gate");
        }
        int restored = service.restoreFromSnapshot(rows);
        System.out.println("ROLLBACK committed: restored=" + restored + " rows");
        System.out.println("Fingerprint (verify): " + fingerprint);
    }

    private void runApply(CanonicalRelease release, String fingerprint, String flywayVersion) throws Exception {
        Path planFile = outputDir.resolve("plan/canonical-geo-sync-plan.jsonl");
        if (!Files.isRegularFile(planFile)) {
            throw new IllegalStateException("Apply requires the plan file produced by dry-run: " + planFile);
        }
        // Gate 1 - exact artifact SHA. expected-plan-sha is the SHA-256 of the
        // EXACT plan file bytes (raw file, sha256sum-compatible), so it locks
        // the reviewed artifact itself and is independent of JSON
        // parse/re-serialize behaviour. Runs before parsing, before the
        // rollback-snapshot export and before any transaction.
        String planFileSha256 = verifyPlanFileSha(planFile, expectedPlanSha);
        System.out.println("Plan file SHA-256: " + planFileSha256);
        if (!expectedDbFingerprint.isBlank() && !expectedDbFingerprint.equals(fingerprint)) {
            throw new IllegalStateException("DB fingerprint mismatch:\n  expected " + expectedDbFingerprint
                    + "\n  actual   " + fingerprint);
        }
        if (!expectedFlywayVersion.isBlank() && !expectedFlywayVersion.equals(flywayVersion)) {
            throw new IllegalStateException("Flyway version mismatch: expected " + expectedFlywayVersion
                    + ", got " + flywayVersion);
        }
        if (!expectedCanonicalSha.isBlank() && !expectedCanonicalSha.equalsIgnoreCase(release.sha256())) {
            throw new IllegalStateException("Canonical SHA mismatch: expected " + expectedCanonicalSha
                    + ", got " + release.sha256());
        }
        List<PlanRow> rows = CanonicalGeographyAuditWriter.readPlan(planFile, objectMapper);
        // Internal plan-row consistency value only: NEVER compared with the raw
        // artifact SHA. Passed to the service so its internal plan-row check
        // stays self-consistent on the same parsed rows.
        String planRowsSha256 = CanonicalGeographySyncService.planSha256(rows);

        // Geo-only rollback snapshot, exported before any write.
        var snapshot = service.exportRollbackSnapshot();
        CanonicalGeographyAuditWriter.writeRollbackSnapshot(outputDir, snapshot, objectMapper);
        System.out.println("Rollback snapshot exported: " + snapshot.size() + " rows");

        var result = service.apply(rows, planRowsSha256,
                expectedCanonicalSha.isBlank() ? release.sha256() : expectedCanonicalSha,
                expectedDbFingerprint.isBlank() ? fingerprint : expectedDbFingerprint,
                expectedFlywayVersion.isBlank() ? flywayVersion : expectedFlywayVersion);

        Files.createDirectories(outputDir.resolve("apply"));
        CanonicalGeographyAuditWriter.writeApplyResult(outputDir, result, release, objectMapper);
        System.out.println("APPLY committed: updated=" + result.updated()
                + ", unchanged=" + result.unchanged());

        // Idempotence: second dry-run must report zero updates.
        var idempotence = service.verifyIdempotence(release);
        CanonicalGeographyAuditWriter.writeIdempotence(outputDir, idempotence, objectMapper);
        System.out.println("Idempotence: updatesRequired=" + idempotence.updatesRequired()
                + ", blocked=" + idempotence.blockedRows());
        if (idempotence.updatesRequired() != 0 || idempotence.blockedRows() != 0) {
            throw new IllegalStateException("Post-apply idempotence failed: " + idempotence.eventIds());
        }
    }

    private String buildFingerprint(CanonicalGeographyDatasourceGuard.DatasourceTarget target, String flywayVersion) {
        String idSetHash = CanonicalGeographyProjection.sha256(String.join(",", repository.loadIds()));
        String schemaHash = CanonicalGeographyProjection.sha256(repository.schemaSignature());
        return "LOOPBACK|" + target.port() + "|" + target.database()
                + "|" + repository.serverVersion()
                + "|flyway=" + flywayVersion
                + "|rows=" + repository.countRows()
                + "|schema=" + schemaHash
                + "|ids=" + idSetHash;
    }

    /**
     * Raw plan-file SHA gate. {@code expectedPlanFileSha256} is the SHA-256 of
     * the EXACT plan file bytes, so the gate locks the reviewed artifact and
     * must run before parsing and before any transaction.
     */
    static String verifyPlanFileSha(Path planFile, String expectedPlanFileSha256) {
        String actual = CanonicalGeographySyncService.sha256FileBytes(planFile);
        if (!expectedPlanFileSha256.isBlank() && !expectedPlanFileSha256.equalsIgnoreCase(actual)) {
            throw new IllegalStateException("Plan file SHA-256 mismatch: expected raw plan-file SHA "
                    + expectedPlanFileSha256 + ", actual raw plan-file SHA " + actual);
        }
        return actual;
    }

    private void printSummary(PlanSummary summary) {
        System.out.printf("""
                PLAN SUMMARY:
                  total=%d updates=%d unchanged=%d blocked=%d
                  canonicalOnlyIds=%d dbOnlyIds=%d legacyGeoTypes=%d
                  canonicalMismatches=%d rawMapDataMismatches=%d latLngMismatches=%d
                  provinceNamesMismatches=%d showOnMapMismatches=%d invalidRawJson=%d
                  planSha=%s
                """,
                summary.totalRows(), summary.updatesRequired(), summary.unchanged(), summary.blockedRows(),
                summary.canonicalOnlyIds(), summary.dbOnlyIds(), summary.legacyGeoTypes(),
                summary.canonicalMismatches(), summary.rawMapDataMismatches(), summary.latLngMismatches(),
                summary.provinceNamesMismatches(), summary.showOnMapMismatches(), summary.invalidRawJson(),
                summary.planSha256());
    }
}
