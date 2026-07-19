package com.lichsuvn.backend.importer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Set;

@Component
@Profile("history-rag-import")
public class HistoryRagImportRunner implements CommandLineRunner {

    private static final Set<String> SECTIONS = Set.of(
            "historical", "textbook-refs", "textbook-content", "sources", "all"
    );

    private final HistoryRagPackageReader packageReader;
    private final HistoryRagDatasourceGuard datasourceGuard;
    private final HistoryRagTextbookRefPreflight textbookRefPreflight;
    private final Environment environment;
    private final boolean dryRun;
    private final boolean allowWrite;
    private final String expectedDatabase;
    private final Path packageDirectory;
    private final String section;
    private final String rollbackRunId;
    private final boolean releaseAEnabled;
    private final boolean releaseAApproved;
    private final String releaseAExpectedHost;
    private final String releaseAExpectedDatabase;
    private final String releaseAExpectedPackageSha256;
    private final boolean releaseCEnabled;
    private final boolean releaseCApproved;
    private final String releaseCExpectedHost;
    private final String releaseCExpectedDatabase;
    private final String releaseCExpectedPackageSha256;
    private final String releaseCBackupSha256;
    private final boolean releaseCRestoreVerified;

    @Autowired(required = false)
    private HistoryRagImportService importService;

    public HistoryRagImportRunner(
            HistoryRagPackageReader packageReader,
            HistoryRagDatasourceGuard datasourceGuard,
            HistoryRagTextbookRefPreflight textbookRefPreflight,
            Environment environment,
            @Value("${history-rag.import.dry-run:true}") boolean dryRun,
            @Value("${history-rag.import.allow-write:false}") boolean allowWrite,
            @Value("${history-rag.import.expected-database:}") String expectedDatabase,
            @Value("${history-rag.import.package-dir:../data/history-rag/v1}") String packageDirectory,
            @Value("${history-rag.import.section:all}") String section,
            @Value("${history-rag.import.rollback-run-id:}") String rollbackRunId,
            @Value("${history-rag.import.release-a-enabled:false}") boolean releaseAEnabled,
            @Value("${history-rag.import.release-a-approved:false}") boolean releaseAApproved,
            @Value("${history-rag.import.release-a-expected-host:}") String releaseAExpectedHost,
            @Value("${history-rag.import.release-a-expected-database:}") String releaseAExpectedDatabase,
            @Value("${history-rag.import.release-a-package-sha256:}") String releaseAExpectedPackageSha256,
            @Value("${history-rag.import.release-c-enabled:false}") boolean releaseCEnabled,
            @Value("${history-rag.import.release-c-approved:false}") boolean releaseCApproved,
            @Value("${history-rag.import.release-c-expected-host:}") String releaseCExpectedHost,
            @Value("${history-rag.import.release-c-expected-database:}") String releaseCExpectedDatabase,
            @Value("${history-rag.import.release-c-package-sha256:}") String releaseCExpectedPackageSha256,
            @Value("${history-rag.import.release-c-backup-sha256:}") String releaseCBackupSha256,
            @Value("${history-rag.import.release-c-restore-verified:false}") boolean releaseCRestoreVerified
    ) {
        this.packageReader = packageReader;
        this.datasourceGuard = datasourceGuard;
        this.textbookRefPreflight = textbookRefPreflight;
        this.environment = environment;
        this.dryRun = dryRun;
        this.allowWrite = allowWrite;
        this.expectedDatabase = expectedDatabase;
        this.packageDirectory = Path.of(packageDirectory);
        this.section = section;
        this.rollbackRunId = rollbackRunId;
        this.releaseAEnabled = releaseAEnabled;
        this.releaseAApproved = releaseAApproved;
        this.releaseAExpectedHost = releaseAExpectedHost;
        this.releaseAExpectedDatabase = releaseAExpectedDatabase;
        this.releaseAExpectedPackageSha256 = releaseAExpectedPackageSha256;
        this.releaseCEnabled = releaseCEnabled;
        this.releaseCApproved = releaseCApproved;
        this.releaseCExpectedHost = releaseCExpectedHost;
        this.releaseCExpectedDatabase = releaseCExpectedDatabase;
        this.releaseCExpectedPackageSha256 = releaseCExpectedPackageSha256;
        this.releaseCBackupSha256 = releaseCBackupSha256;
        this.releaseCRestoreVerified = releaseCRestoreVerified;
    }

    @Override
    public void run(String... args) {
        if (!SECTIONS.contains(section)) {
            throw new IllegalArgumentException("Unsupported history RAG import section: " + section);
        }
        if (releaseAEnabled && releaseCEnabled) {
            throw new IllegalArgumentException("Release A and Release C authorization cannot be enabled together");
        }
        var target = releaseCEnabled
                ? datasourceGuard.validateReleaseC(
                        environment.getProperty("spring.datasource.url"),
                        expectedDatabase,
                        environment.getActiveProfiles(),
                        dryRun,
                        allowWrite,
                        rollbackRunId,
                        new HistoryRagDatasourceGuard.ReleaseCAuthorization(
                                true,
                                releaseCApproved,
                                releaseCExpectedHost,
                                releaseCExpectedDatabase,
                                releaseCExpectedPackageSha256,
                                releaseCBackupSha256,
                                releaseCRestoreVerified
                        )
                )
                : releaseAEnabled ? datasourceGuard.validateReleaseA(
                        environment.getProperty("spring.datasource.url"),
                        expectedDatabase,
                        environment.getActiveProfiles(),
                        dryRun,
                        allowWrite,
                        rollbackRunId,
                        new HistoryRagDatasourceGuard.ReleaseAAuthorization(
                                true,
                                releaseAApproved,
                                releaseAExpectedHost,
                                releaseAExpectedDatabase,
                                releaseAExpectedPackageSha256
                        )
                ) : datasourceGuard.validateDryRun(
                        environment.getProperty("spring.datasource.url"),
                        expectedDatabase,
                        environment.getActiveProfiles(),
                        dryRun,
                        allowWrite,
                        rollbackRunId
                );
        printTarget(target);

        if (!rollbackRunId.isBlank()) {
            requireExplicitWritePermission();
            if (importService == null) {
                throw new IllegalStateException("History RAG import service is unavailable");
            }
            long runId = parseRollbackRunId();
            var result = importService.rollback(runId);
            System.out.printf("History RAG rollback finished: runId=%d, changed=%d, conflicts=%d%n",
                    result.runId(), result.changed(), result.conflicts());
            return;
        }

        var packageData = packageReader.read(packageDirectory);
        String expectedReleasePackageSha256 = releaseCEnabled
                ? releaseCExpectedPackageSha256
                : releaseAEnabled ? releaseAExpectedPackageSha256 : "";
        if (!expectedReleasePackageSha256.isBlank()
                && !packageData.packageSha256().equalsIgnoreCase(expectedReleasePackageSha256)) {
            throw new IllegalStateException("History RAG release package SHA-256 does not match the approved artifact");
        }
        System.out.printf(
                "History RAG package validated: version=v1, workbookSha256=%s, packageSha256=%s, directory=%s%n",
                packageData.workbookSha256(),
                packageData.packageSha256(),
                packageData.directory()
        );

        if (dryRun) {
            if (section.equals("textbook-refs")) {
                printTextbookReport(textbookRefPreflight.run(packageData));
            } else if (importService != null) {
                printPreflight(importService.preflight(packageData, section));
            }
            System.out.println("History RAG importer finished in DRY-RUN mode. Database writes: 0");
            return;
        }

        requireExplicitWritePermission();
        if (importService == null) {
            throw new IllegalStateException("History RAG import service is unavailable");
        }
        var result = importService.apply(packageData, section);
        System.out.printf("History RAG importer applied: runId=%d, section=%s, changed=%d%n",
                result.runId(), result.section(), result.changed());
    }

    private long parseRollbackRunId() {
        try {
            long runId = Long.parseLong(rollbackRunId);
            if (runId <= 0) {
                throw new NumberFormatException("run ID must be positive");
            }
            return runId;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Rollback run ID must be a positive integer", ex);
        }
    }

    private void requireExplicitWritePermission() {
        String writeFlag = environment.getProperty("HISTORY_RAG_IMPORT_ALLOW_WRITE", "false");
        String expectedDatabaseFlag = environment.getProperty("HISTORY_RAG_IMPORT_EXPECTED_DATABASE", "");
        if (!Boolean.parseBoolean(writeFlag)) {
            throw new IllegalArgumentException(
                    "Apply requires HISTORY_RAG_IMPORT_ALLOW_WRITE=true; refusing to write");
        }
        if (!expectedDatabase.equals(expectedDatabaseFlag)) {
            throw new IllegalArgumentException(
                    "Apply requires HISTORY_RAG_IMPORT_EXPECTED_DATABASE to match expected database");
        }
    }

    private void printPreflight(HistoryRagImportService.ImportPreflight report) {
        System.out.println("History RAG import preflight:");
        for (var sectionReport : report.sections()) {
            System.out.printf("  %s: blocked=%s, missing=%d, conflicts=%d, updates=%d, %s%n",
                    sectionReport.section(), sectionReport.blocked(), sectionReport.missing(),
                    sectionReport.conflicts(), sectionReport.updates(), sectionReport.detail());
        }
        System.out.println("  Future apply blocked: " + report.blocked());
    }

    private void printTarget(HistoryRagDatasourceGuard.DatasourceTarget target) {
        System.out.println("History RAG datasource target:");
        System.out.println("  Sanitized URL: " + target.sanitizedUrl());
        System.out.println("  Hostname: " + target.hostname());
        System.out.println("  Database: " + target.database());
        System.out.println("  Active profiles: " + target.activeProfiles());
    }

    private void printTextbookReport(HistoryRagTextbookRefPreflight.PreflightReport report) {
        System.out.println("History RAG textbook reference preflight:");
        System.out.println("  Workbook active refs: " + report.workbookActiveReferences());
        System.out.println("  Current database refs: " + report.currentDatabaseReferences());
        System.out.println("  KEEP_UNCHANGED: " + report.keepUnchanged());
        System.out.println("  UPDATE_REQUIRED: " + report.updateRequired());
        System.out.println("  REMOVE_WRONG_MAPPING: " + report.removeWrongMapping());
        System.out.println("  REMOVE_QUARANTINED: " + report.removeQuarantined());
        System.out.println("  Already absent removals: " + report.alreadyAbsentRemovals());
        System.out.println("  show_on_detail updates required: " + report.showOnDetailUpdatesRequired());
        System.out.println("  ACTIVE_REF_MISSING: " + report.activeRefMissing());
        System.out.println("  Identity conflicts: " + report.identityConflicts());
        System.out.println("  UNEXPECTED_CURRENT_ROW: " + report.unexpectedCurrentRows());
        System.out.println("  Future apply blocked: " + report.applyBlocked());
    }
}
