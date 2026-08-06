package com.lichsuvn.backend.importer;

import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationService.Plan;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationDatasourceGuard.RemoteApplyContext;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.BatchOutcome;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.PlanDigest;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.RowOutcome;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.UploadResult;
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
 * CommandLineRunner entry point for the local-gallery → managed Cloudinary
 * migration. Activated by the dedicated Spring profile
 * {@code backfill-gallery-images}.
 *
 * <p>Default mode is dry-run:{@link #writeDryRunArtifacts write artifacts} under
 * {@code outputDir} but make no DB write and no Cloudinary call beyond the
 * signed multipart upload required by the apply phase. Production apply requires
 * the operator-supplied {@link RemoteApplyContext} (target fingerprint, plan
 * digest, rollback snapshot bytes, Cloudinary product environment, eligible
 * count) to match the dry-run output.
 */
@Component
@Profile("backfill-gallery-images")
public class LegacyEventGalleryMigrationRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyEventGalleryMigrationRunner.class);

    private static final Pattern MYSQL_URL = Pattern.compile(
            "^jdbc:mysql://([^/:?#]+)(?::([0-9]+))?/([^?;]+)(.*)$",
            Pattern.CASE_INSENSITIVE
    );

    private final LegacyEventGalleryMigrationService service;
    private final LegacyEventGalleryMigrationDatasourceGuard guard;
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

    public LegacyEventGalleryMigrationRunner(
            LegacyEventGalleryMigrationService service,
            LegacyEventGalleryMigrationDatasourceGuard guard,
            Environment environment,
            Clock backfillClock,
            @Value("${app.gallery.apply:false}") boolean applyExplicit,
            @Value("${app.gallery.remote-allow-dry-run:false}") boolean remoteAllowDryRun,
            @Value("${app.gallery.remote-apply:false}") boolean remoteApplyExplicit,
            @Value("${app.gallery.expected-target-fingerprint:}") String expectedTargetFingerprint,
            @Value("${app.gallery.expected-plan-digest:}") String expectedPlanDigest,
            @Value("${app.gallery.cloudinary-product-environment:CLOUDINARY_PROD}") String cloudinaryProductEnvironment,
            @Value("${app.gallery.rollback-snapshot-run-id:}") String rollbackSnapshotRunId,
            @Value("${app.gallery.rollback-snapshot-path:}") String rollbackSnapshotPath,
            @Value("${app.gallery.expected-eligible-insert-count:0}") int expectedEligibleInsertCount,
            @Value("${app.gallery.output-dir:./artifacts/event-gallery-cloudinary-migration}") String outputDir,
            @Value("${app.gallery.expected-database:lichsuvn}") String expectedDatabase,
            @Value("${app.gallery.expected-schema-fingerprint:}") String expectedSchemaFingerprint,
            @Value("${app.gallery.run-id:}") String cliRunId
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
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(remoteAllowDryRun);
        boolean applyMode = applyExplicit || hasArgsFlag(args, "--apply")
                || hasArgsFlag(args, "--gallery.mode=apply");
        String runId = resolveRunId(args);

        RemoteApplyContext remoteContext = buildRemoteContextIfNeeded(runId);
        LegacyEventGalleryMigrationDatasourceGuard.Target target = guard.validate(
                environment.getProperty("spring.datasource.url", ""),
                expectedDatabase,
                environment.getActiveProfiles(),
                applyMode,
                remoteContext
        );
        log.info("Gallery migration target: host={} database={} profiles={} sanitizedUrl={}",
                target.hostname(), target.database(), target.activeProfiles(), target.sanitizedUrl());

        Plan plan = service.buildPlan(runId);
        Path runDir = outputDir.resolve(runId);
        try {
            int written = service.writeArtifacts(plan, runDir);
            log.info("Gallery migration dry-run artifacts written: dir={} bytes={}", runDir, written);
        } catch (Exception exception) {
            log.error("Gallery migration failed to write artifacts", exception);
            throw new IllegalStateException(
                    "Gallery migration artifact write failed: " + exception.getMessage(),
                    exception);
        }
        PlanDigest digest = plan.digest();
        log.info("Gallery migration dry-run summary: eligible={} missingFile={} "
                        + "invalidImage={} unsupportedFormat={} alreadyManaged={} digest={}",
                digest.eligibleRowCount(),
                digest.missingFileCount(),
                digest.invalidImageCount(),
                digest.unsupportedFormatCount(),
                digest.alreadyManagedCount(),
                digest.hashDigest());

        if (!applyMode) {
            log.info("Gallery migration finished in dry-run mode. Apply refused: --apply not set.");
            return;
        }
        if (digest.eligibleRowCount() == 0) {
            log.warn("Gallery migration apply refused: eligible=0 (already migrated).");
            return;
        }
        // Release H contract: no partial apply. The eligible plan must cover every
        // remaining candidate row; any missing, invalid or unsupported local source
        // is a hard apply blocker. (Release G's partial-migration classification is
        // no longer applicable once WebP became a supported lifecycle format.)
        if (digest.missingFileCount() > 0 || digest.invalidImageCount() > 0
                || digest.unsupportedFormatCount() > 0) {
            throw new IllegalStateException(
                    "Gallery migration apply refused: dry-run reported missing="
                            + digest.missingFileCount() + " invalid="
                            + digest.invalidImageCount() + " unsupported="
                            + digest.unsupportedFormatCount()
                            + " (no partial apply is permitted)");
        }
        log.warn("Gallery migration received --apply; performing batch upload under gate.");
        BatchOutcome outcome = service.apply(plan);
        long cleanup = outcome.rowOutcomes().stream()
                .filter(o -> o.result() == UploadResult.CLEANUP_ENQUEUED)
                .count();
        long uploadFailed = outcome.rowOutcomes().stream()
                .filter(o -> o.result() == UploadResult.UPLOAD_FAILED)
                .count();
        long finalizeConflict = outcome.rowOutcomes().stream()
                .filter(o -> o.result() == UploadResult.FINALIZE_CONFLICT)
                .count();
        log.info("Gallery migration apply complete (runId={}): affected={}, alreadyManaged={}, "
                        + "uploadFailed={}, finalizeConflict={}, cleanupEnqueued={}",
                runId, outcome.affectedRows(), outcome.alreadyManagedRows(),
                uploadFailed, finalizeConflict, outcome.cleanupEnqueued());
        if (uploadFailed > 0 || finalizeConflict > 0 || cleanup > 0) {
            log.warn("Gallery migration apply reported non-zero failures or compensations.");
        }
    }

    private RemoteApplyContext buildRemoteContextIfNeeded(String runId) {
        if (!remoteApplyExplicit) {
            return null;
        }
        long rollbackBytes = 0L;
        if (rollbackSnapshotPath != null && Files.exists(rollbackSnapshotPath)) {
            rollbackBytes = LegacyEventGalleryMigrationDatasourceGuard
                    .measureSnapshotBytes(rollbackSnapshotPath);
        }
        String snapshotRunId = rollbackSnapshotRunId.isBlank() ? runId : rollbackSnapshotRunId;
        return new RemoteApplyContext(
                remoteApplyExplicit,
                expectedTargetFingerprint,
                expectedPlanDigest,
                expectedSchemaFingerprint,
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
                if (arg.startsWith("--gallery.run-id=")) {
                    return arg.substring("--gallery.run-id=".length());
                }
            }
        }
        if (remoteApplyExplicit || hasProductionDatasource()) {
            return "release-g-" + DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss")
                    .withZone(ZoneOffset.UTC)
                    .format(LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
        }
        return "gallery-migration-" + DateTimeFormatter.ofPattern("yyyy-MM-dd-HHmmss")
                .withZone(ZoneOffset.UTC)
                .format(LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC));
    }

    private boolean hasProductionDatasource() {
        String url = environment.getProperty("spring.datasource.url", "");
        if (url.isBlank()) return false;
        Matcher matcher = MYSQL_URL.matcher(url.trim());
        if (!matcher.matches()) return false;
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        return host.contains("prod.alicloud.tidbcloud.com") || host.contains(".tidbcloud.com");
    }

    private static boolean hasArgsFlag(String[] args, String prefixOrExact) {
        if (args == null) return false;
        for (String arg : args) {
            if (prefixOrExact.equalsIgnoreCase(arg)) return true;
            if (arg.startsWith(prefixOrExact)) return true;
        }
        return false;
    }

    @SuppressWarnings("unused")
    private static RowOutcome unused() { return null; }
}
