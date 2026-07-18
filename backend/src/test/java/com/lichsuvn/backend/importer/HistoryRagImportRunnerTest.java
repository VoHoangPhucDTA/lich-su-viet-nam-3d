package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class HistoryRagImportRunnerTest {

    @Test
    void validatesDatasourceAndPackageBeforeRunningProductionPreflight() {
        var packageReader = mock(HistoryRagPackageReader.class);
        var guard = mock(HistoryRagDatasourceGuard.class);
        var preflight = mock(HistoryRagTextbookRefPreflight.class);
        var environment = mock(Environment.class);
        var packageData = new HistoryRagPackageReader.PackageData(
                Path.of("package"), "a".repeat(64), "b".repeat(64), Map.of(), List.of());
        var target = new HistoryRagDatasourceGuard.DatasourceTarget(
                "jdbc:mysql://localhost:3306/lichsuvn", "localhost", "lichsuvn", "history-rag-import");
        var report = new HistoryRagTextbookRefPreflight.PreflightReport(
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, List.of());
        when(environment.getProperty("spring.datasource.url"))
                .thenReturn("jdbc:mysql://localhost:3306/lichsuvn");
        when(environment.getActiveProfiles()).thenReturn(new String[]{"history-rag-import"});
        when(guard.validateDryRun(anyString(), anyString(), any(), anyBoolean(), anyBoolean(), anyString()))
                .thenReturn(target);
        when(packageReader.read(Path.of("package"))).thenReturn(packageData);
        when(preflight.run(packageData)).thenReturn(report);

        var runner = new HistoryRagImportRunner(
                packageReader, guard, preflight, environment,
                true, false, "lichsuvn", "package", "textbook-refs", "",
                false, false, "", "", "",
                false, false, "", "", "", "", false);

        runner.run();

        var order = inOrder(guard, packageReader, preflight);
        order.verify(guard).validateDryRun(
                eq("jdbc:mysql://localhost:3306/lichsuvn"),
                eq("lichsuvn"),
                any(String[].class),
                eq(true),
                eq(false),
                eq("")
        );
        order.verify(packageReader).read(Path.of("package"));
        order.verify(preflight).run(packageData);
    }

    @Test
    void invalidSectionIsRejectedBeforeDatasourceOrDatabaseAccess() {
        var packageReader = mock(HistoryRagPackageReader.class);
        var guard = mock(HistoryRagDatasourceGuard.class);
        var preflight = mock(HistoryRagTextbookRefPreflight.class);
        var environment = mock(Environment.class);
        var runner = new HistoryRagImportRunner(
                packageReader, guard, preflight, environment,
                true, false, "lichsuvn", "package", "unknown", "",
                false, false, "", "", "",
                false, false, "", "", "", "", false);

        assertThrows(IllegalArgumentException.class, runner::run);

        verifyNoInteractions(guard, packageReader, preflight, environment);
    }

    @Test
    void rollbackUsesAuditRunWithoutReadingOrApplyingPackage() {
        var packageReader = mock(HistoryRagPackageReader.class);
        var guard = mock(HistoryRagDatasourceGuard.class);
        var preflight = mock(HistoryRagTextbookRefPreflight.class);
        var importService = mock(HistoryRagImportService.class);
        var environment = mock(Environment.class);
        var target = new HistoryRagDatasourceGuard.DatasourceTarget(
                "jdbc:mysql://localhost:3306/lichsuvn", "localhost", "lichsuvn", "history-rag-import");
        when(environment.getProperty("spring.datasource.url"))
                .thenReturn("jdbc:mysql://localhost:3306/lichsuvn");
        when(environment.getActiveProfiles()).thenReturn(new String[]{"history-rag-import"});
        when(environment.getProperty("HISTORY_RAG_IMPORT_ALLOW_WRITE", "false")).thenReturn("true");
        when(environment.getProperty("HISTORY_RAG_IMPORT_EXPECTED_DATABASE", "")).thenReturn("lichsuvn");
        when(guard.validateDryRun(anyString(), anyString(), any(), anyBoolean(), anyBoolean(), anyString()))
                .thenReturn(target);
        when(importService.rollback(42L)).thenReturn(new HistoryRagImportService.RollbackResult(42L, 10, 1));
        var runner = new HistoryRagImportRunner(
                packageReader, guard, preflight, environment,
                false, true, "lichsuvn", "package", "all", "42",
                false, false, "", "", "",
                false, false, "", "", "", "", false);
        ReflectionTestUtils.setField(runner, "importService", importService);

        runner.run();

        verify(importService).rollback(42L);
        verifyNoInteractions(packageReader, preflight);
    }
}
