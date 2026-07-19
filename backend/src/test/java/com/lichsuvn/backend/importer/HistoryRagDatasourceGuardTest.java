package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HistoryRagDatasourceGuardTest {

    private final HistoryRagDatasourceGuard guard = new HistoryRagDatasourceGuard();

    @Test
    void acceptsLocalDryRunAndRedactsSensitiveQueryValues() {
        var target = guard.validateDryRun(
                "jdbc:mysql://localhost:3306/lichsuvn?useSSL=false&token=secret-value",
                "lichsuvn",
                new String[]{"history-rag-import"},
                true,
                false,
                ""
        );

        assertEquals("localhost", target.hostname());
        assertEquals("lichsuvn", target.database());
        assertTrue(target.sanitizedUrl().contains("token=<redacted>"));
    }

    @Test
    void rejectsRemoteAndWriteModesBeforeAnyQuery() {
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                true,
                false,
                ""
        ));
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://localhost:3306/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                true,
                true,
                ""
        ));
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://localhost:3306/lichsuvn",
                "lichsuvn",
                new String[]{"remote-production", "history-rag-import"},
                true,
                false,
                ""
        ));
    }

    @Test
    void rejectsDatabaseMismatchAndRollback() {
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://127.0.0.1:3306/other_database",
                "lichsuvn",
                new String[]{"history-rag-import"},
                true,
                false,
                ""
        ));
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                true,
                false,
                "42"
        ));
    }

    @Test
    void acceptsExplicitLocalApplyAndRollbackMode() {
        var apply = guard.validateDryRun(
                "jdbc:mysql://localhost:3306/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                false,
                true,
                ""
        );
        var rollback = guard.validateDryRun(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                false,
                true,
                "42"
        );

        assertEquals("localhost", apply.hostname());
        assertEquals("127.0.0.1", rollback.hostname());
    }

    @Test
    void rejectsApplyWithoutWritePermission() {
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateDryRun(
                "jdbc:mysql://localhost:3306/lichsuvn",
                "lichsuvn",
                new String[]{"history-rag-import"},
                false,
                false,
                ""
        ));
    }

    @Test
    void acceptsOnlyExplicitApprovedReleaseAForTidb() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseAAuthorization(
                true,
                true,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "a".repeat(64)
        );

        var target = guard.validateReleaseA(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                "lichsuvn",
                new String[]{"remote-release-a", "history-rag-import"},
                false,
                true,
                "",
                authorization
        );

        assertEquals("gateway.prod.tidbcloud.com", target.hostname());
    }

    @Test
    void rejectsTidbReleaseAWithoutExactAuthorization() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseAAuthorization(
                true,
                false,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "a".repeat(64)
        );

        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateReleaseA(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                "lichsuvn",
                new String[]{"remote-release-a", "history-rag-import"},
                false,
                true,
                "",
                authorization
        ));
    }

    @Test
    void acceptsOnlyExplicitApprovedReleaseBWithRestoreEvidence() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseBAuthorization(
                true,
                true,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "b".repeat(64),
                true
        );

        var target = guard.validateReleaseB(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                new String[]{"remote-production", "remote-release-b"},
                authorization
        );

        assertEquals("gateway.prod.tidbcloud.com", target.hostname());
    }

    @Test
    void rejectsReleaseBWithoutRestoreEvidence() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseBAuthorization(
                true,
                true,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "b".repeat(64),
                false
        );

        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateReleaseB(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                new String[]{"remote-release-b"},
                authorization
        ));
    }

    @Test
    void acceptsOnlyExplicitApprovedReleaseCWithPackageAndRestoreEvidence() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseCAuthorization(
                true,
                true,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "c".repeat(64),
                "b".repeat(64),
                true
        );

        var target = guard.validateReleaseC(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                "lichsuvn",
                new String[]{"remote-release-c", "history-rag-import"},
                false,
                true,
                "",
                authorization
        );

        assertEquals("gateway.prod.tidbcloud.com", target.hostname());
    }

    @Test
    void rejectsReleaseCWithoutRestoreEvidenceOrExactProfile() {
        var authorization = new HistoryRagDatasourceGuard.ReleaseCAuthorization(
                true,
                true,
                "gateway.prod.tidbcloud.com",
                "lichsuvn",
                "c".repeat(64),
                "b".repeat(64),
                false
        );

        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateReleaseC(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                "lichsuvn",
                new String[]{"remote-release-c", "history-rag-import"},
                false,
                true,
                "",
                authorization
        ));
        assertThrows(HistoryRagDatasourceGuard.UnsafeDatasourceException.class, () -> guard.validateReleaseC(
                "jdbc:mysql://gateway.prod.tidbcloud.com:4000/lichsuvn?sslMode=REQUIRED",
                "lichsuvn",
                new String[]{"remote-release-a", "history-rag-import"},
                false,
                true,
                "",
                new HistoryRagDatasourceGuard.ReleaseCAuthorization(
                        true, true, "gateway.prod.tidbcloud.com", "lichsuvn",
                        "c".repeat(64), "b".repeat(64), true)
        ));
    }
}
