package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegacyEventGalleryMigrationDatasourceGuardTest {

    private final LegacyEventGalleryMigrationDatasourceGuard guard =
            new LegacyEventGalleryMigrationDatasourceGuard();

    @AfterEach
    void resetFlag() {
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(false);
    }

    @Test
    void localModeAcceptsLoopbackHost() {
        var target = guard.validate(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn?user=admin&password=secret",
                "lichsuvn",
                new String[]{"backfill-gallery-images"},
                false,
                null
        );
        assertEquals("127.0.0.1", target.hostname());
        assertEquals("lichsuvn", target.database());
        assertFalse(target.remoteAllowed());
        assertTrue(target.sanitizedUrl().contains("user=<redacted>"));
        assertTrue(target.sanitizedUrl().contains("password=<redacted>"));
    }

    @Test
    void localModeRejectsProductionHostWithoutRemoteFlag() {
        var exception = assertThrows(
                LegacyEventGalleryMigrationDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn"
                                + "?user=admin&password=secret",
                        "lichsuvn",
                        new String[]{"remote-production", "backfill-gallery-images"},
                        false,
                        null
                )
        );
        assertTrue(exception.getMessage().contains("Production dry-run requires"));
    }

    @Test
    void productionDryRunAllowed() {
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(true);
        var target = guard.validate(
                "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn"
                        + "?user=admin&password=secret",
                "lichsuvn",
                new String[]{"remote-production", "backfill-gallery-images"},
                false,
                null
        );
        assertEquals("gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com", target.hostname());
        assertEquals("4000", target.port());
        assertEquals("lichsuvn", target.database());
        assertTrue(target.remoteAllowed());
        assertTrue(target.sanitizedUrl().contains("<redacted-credentials>"));
    }

    @Test
    void productionDatabaseMismatchRefused() {
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(true);
        var exception = assertThrows(
                LegacyEventGalleryMigrationDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://gateway03.eu-west-1.prod.alicloud.tidbcloud.com:4000/lichsuvn_legacy",
                        "lichsuvn",
                        new String[]{"remote-production", "backfill-gallery-images"},
                        false,
                        null
                )
        );
        assertTrue(exception.getMessage().contains("Production database mismatch"));
    }

    @Test
    void productionApplyWithoutRemoteContextRefused() {
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(true);
        var exception = assertThrows(
                LegacyEventGalleryMigrationDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn",
                        "lichsuvn",
                        new String[]{"remote-production", "backfill-gallery-images"},
                        true,
                        null
                )
        );
        assertTrue(exception.getMessage().contains("Production apply requires"));
    }

    @Test
    void productionApplyRequiresFingerprintMatch() {
        LegacyEventGalleryMigrationDatasourceGuard.setProductionDryRunAllowed(true);
        var contextual = new LegacyEventGalleryMigrationDatasourceGuard.RemoteApplyContext(
                true,
                "fp-mismatch",
                "0123456789abcdef",
                "schema",
                100,
                "CLOUDINARY_PROD",
                "release-g-snapshot",
                1024L
        );
        var exception = assertThrows(
                LegacyEventGalleryMigrationDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn",
                        "lichsuvn",
                        new String[]{"remote-production", "backfill-gallery-images"},
                        true,
                        contextual
                )
        );
        assertTrue(exception.getMessage().contains("fingerprint mismatch"));
    }

    @Test
    void refusedProfileBlocksApply() {
        var exception = assertThrows(
                LegacyEventGalleryMigrationDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://127.0.0.1:3306/lichsuvn",
                        "lichsuvn",
                        new String[]{"remote-release-a"},
                        false,
                        null
                )
        );
        assertTrue(exception.getMessage().contains("refuses profile"));
    }
}
