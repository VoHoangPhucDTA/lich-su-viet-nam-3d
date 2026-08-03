package com.lichsuvn.backend.importer;

import com.lichsuvn.backend.importer.LegacyEventThumbnailBackfillService.ApplyOptions;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.PlanDigest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CommandLineRunner entry point for the legacy event thumbnail backfill. Activated
 * via the dedicated Spring profile {@code backfill-event-thumbnails}, mirroring the
 * historical RAG importer pattern.
 *
 * <p>Must run in a non-web context: see
 * {@link LegacyEventThumbnailBackfillApplication}. Default mode is dry-run with
 * artifacts written to {@code outputDir}. The {@code --apply} flag (or
 * {@code --backfill.mode=apply} or {@code app.backfill.apply=true}) is required to
 * perform an atomic batch INSERT, and even then the gate must pass.
 *
 * <p>Production dry-run requires {@code app.backfill.remote-allow-dry-run=true}.
 * Production apply additionally requires the operator-supplied
 * {@link RemoteApplyContext} (target fingerprint, plan digest, rollback snapshot,
 * Cloudinary product environment, eligible count) to match the dry-run output.
 */
@Component
@Profile("backfill-event-thumbnails")
public class LegacyEventThumbnailBackfillRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyEventThumbnailBackfillRunner.class);

    private static final Pattern MYSQL_URL = Pattern.compile(
            "^jdbc:mysql://([^/:?#]+)(?::([0-9]+))?/([^?;]+)(.*)$",
            Pattern.CASE_INSENSITIVE
    );

    private final LegacyEventThumbnailBackfillService service;
    private final LegacyThumbnailBackfillDatasourceGuard guard;
    private final Environment environment;
    private final Clock clock;
    private final boolean applyExplicit;
    private final boolean remoteAllowDryRun;
    private final boolean remoteApplyExplicit;
    private final String expectedTargetFingerprint;
    private final String expectedPlanDigest;
    private final String cloudinaryProductEnvironment;
    private final String rollbackSnapshotRunId;
    private final Path rollbackSnapshotPath;
    private final int expectedEligibleInsertCount;
    private final Path outputDir;
    private final String expectedDatabase;
    private final String expectedSchemaFingerprint;
    private final String cliRunId;

    public LegacyEventThumbnailBackfillRunner(
            LegacyEventThumbnailBackfillService service,
            LegacyThumbnailBackfillDatasourceGuard guard,
            Environment environment,
            Clock backfillClock,
            @Value("${app.backfill.apply:false}") boolean applyExplicit,
            @Value("${app.backfill.remote-allow-dry-run:false}") boolean remoteAllowDryRun,
            @Value("${app.backfill.remote-apply:false}") boolean remoteApplyExplicit,
            @Value("${app.backfill.expected-target-fingerprint:}") String expectedTargetFingerprint,
            @Value("${app.backfill.expected-plan-digest:}") String expectedPlanDigest,
            @Value("${app.backfill.cloudinary-product-environment:lichsuvn_canonical_prod}") String cloudinaryProductEnvironment,
            @Value("${app.backfill.rollback-snapshot-run-id:}") String rollbackSnapshotRunId,
            @Value("${app.backfill.rollback-snapshot-path:}") String rollbackSnapshotPath,
            @Value("${app.backfill.expected-eligible-insert-count:0}") int expectedEligibleInsertCount,
            @Value("${app.backfill.output-dir:./artifacts/event-thumbnail-backfill}") String outputDir,
            @Value("${app.backfill.expected-database:lichsuvn_local}") String expectedDatabase,
            @Value("${app.backfill.expected-schema-fingerprint:}") String expectedSchemaFingerprint,
            @Value("${app.backfill.run-id:}") String cliRunId
    ) {
        this.service = service;
        this.guard = guard;
        this.environment = environment;
        this.clock = backfillClock;
        this.applyExplicit = applyExplicit;
        this.remoteAllowDryRun = remoteAllowDryRun;
        this.remoteApplyExplicit = remoteApplyExplicit;
        this.expectedTargetFingerprint = expectedTargetFingerprint;
        this.expectedPlanDigest = expectedPlanDigest;
        this.cloudinaryProductEnvironment = cloudinaryProductEnvironment;
        this.rollbackSnapshotRunId = rollbackSnapshotRunId;
        this.rollbackSnapshotPath = rollbackSnapshotPath == null || rollbackSnapshotPath.isBlank()
                ? null : Path.of(rollbackSnapshotPath).toAbsolutePath().normalize();
        this.expectedEligibleInsertCount = expectedEligibleInsertCount;
        this.outputDir = Path.of(outputDir).toAbsolutePath().normalize();
        this.expectedDatabase = expectedDatabase;
        this.expectedSchemaFingerprint = expectedSchemaFingerprint.isBlank()
                ? LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                        LegacyThumbnailBackfillDatasourceGuard.v42Columns())
                : expectedSchemaFingerprint;
        this.cliRunId = cliRunId == null || cliRunId.isBlank() ? null : cliRunId;
    }

    @Override
    public void run(String... args) {
        // Wire the global dry-run-on-production flag from property so the guard
        // lets the dry-run path reach a TiDB Cloud production target.
        LegacyThumbnailBackfillDatasourceGuard.setProductionDryRunAllowed(remoteAllowDryRun);

        boolean applyMode = applyExplicit || hasArgsFlag(args, "--apply")
                || hasArgsFlag(args, "--backfill.mode=apply");
        String runId = resolveRunId(args);
        LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext remoteContext =
                buildRemoteContextIfNeeded(runId);

        LegacyThumbnailBackfillDatasourceGuard.Target target = guard.validate(
                environment.getProperty("spring.datasource.url", ""),
                expectedDatabase,
                expectedSchemaFingerprint,
                environment.getActiveProfiles(),
                applyMode,
                remoteContext
        );
        logTarget(target);

        log.info("Legacy thumbnail backfill: starting dry-run (runId={})", runId);
        PlanDigest digest = service.runDryRun(runId, outputDir, ApplyOptions.dryRunDefault(clock));
        log.info("Legacy thumbnail backfill dry-run complete (runId={}): eligible={}, conflicts={}, shadowed={}, digest={}",
                runId,
                digest.eligibleInsertCount(),
                digest.storageIdentityConflictCount() + digest.providerAssetConflictCount()
                        + digest.invalidMetadataCount() + digest.unsupportedResourceCount(),
                digest.shadowedAssetCount(),
                digest.hashDigest());

        if (!applyMode) {
            log.info("Legacy thumbnail backfill finished in dry-run mode. Apply refused: --apply not set.");
            return;
        }
        log.warn("Legacy thumbnail backfill received --apply; performing batch insert under gate.");
        var plan = service.buildPlan(runId, new ApplyOptions(true, Integer.MAX_VALUE, clock.instant()));
        var outcome = service.apply(plan, target, new ApplyOptions(true, Integer.MAX_VALUE, clock.instant()));
        log.info("Legacy thumbnail backfill apply complete (runId={}): affected={}, digest={}",
                runId, outcome.affected(), outcome.digest().hashDigest());
    }

    private LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext buildRemoteContextIfNeeded(String runId) {
        if (!remoteApplyExplicit) {
            return null;
        }
        long rollbackBytes = 0L;
        if (rollbackSnapshotPath != null && Files.exists(rollbackSnapshotPath)) {
            try {
                rollbackBytes = Files.size(rollbackSnapshotPath);
            } catch (Exception ignored) {
                rollbackBytes = 0L;
            }
        }
        String snapshotRunId = rollbackSnapshotRunId.isBlank() ? runId : rollbackSnapshotRunId;
        return new RemoteApplyContext(
                remoteApplyExplicit,
                expectedTargetFingerprint,
                expectedPlanDigest,
                LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                        LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                expectedEligibleInsertCount,
                cloudinaryProductEnvironment,
                snapshotRunId,
                rollbackBytes
        );
    }

    private String resolveRunId(String... args) {
        if (cliRunId != null && !cliRunId.isBlank()) {
            return cliRunId;
        }
        if (args != null) {
            for (String arg : args) {
                if (arg.startsWith("--backfill.run-id=")) {
                    return arg.substring("--backfill.run-id=".length());
                }
            }
        }
        // Deterministic run id for production runs so the dry-run artifact can be
        // referenced by the apply command. For ad-hoc local use, falls back to
        // a timestamped run id.
        if (remoteApplyExplicit || hasProductionDatasource()) {
            return "release-f-" + DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                    .withZone(ZoneOffset.UTC)
                    .format(LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
        }
        return "legacy-thumb-" + DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                .withZone(ZoneOffset.UTC)
                .format(LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
    }

    private boolean hasProductionDatasource() {
        String url = environment.getProperty("spring.datasource.url", "");
        if (url.isBlank()) {
            return false;
        }
        Matcher matcher = MYSQL_URL.matcher(url.trim());
        if (!matcher.matches()) {
            return false;
        }
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        return host.contains("prod.alicloud.tidbcloud.com")
                || host.contains(".tidbcloud.com");
    }

    private static boolean hasArgsFlag(String[] args, String prefixOrExact) {
        if (args == null) {
            return false;
        }
        for (String arg : args) {
            if (prefixOrExact.equalsIgnoreCase(arg)) {
                return true;
            }
            if (arg.startsWith(prefixOrExact)) {
                return true;
            }
        }
        return false;
    }

    private void logTarget(LegacyThumbnailBackfillDatasourceGuard.Target target) {
        log.info("Legacy thumbnail backfill target: host={} database={} profiles={} sanitizedUrl={}",
                target.hostname(),
                target.database(),
                target.activeProfiles(),
                target.sanitizedUrl());
    }
}
