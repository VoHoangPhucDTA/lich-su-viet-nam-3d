package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegacyThumbnailBackfillDatasourceGuardTest {

    private static final String[] NO_PROFILES = new String[0];
    private static final String FINGERPRINT =
            LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                    LegacyThumbnailBackfillDatasourceGuard.v42Columns());

    @Test
    void allowsLocalhostDryRun() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var target = guard.validate(
                "jdbc:mysql://localhost:3306/lichsuvn_local?user=backfill&password=xxx",
                "lichsuvn_local",
                FINGERPRINT,
                NO_PROFILES,
                false);
        assertEquals("localhost", target.hostname());
        assertEquals("3306", target.port());
        assertEquals("lichsuvn_local", target.database());
        assertTrue(target.sanitizedUrl().contains("<redacted>"));
        assertTrue(!target.sanitizedUrl().contains("backfill"));
        assertTrue(!target.sanitizedUrl().contains("xxx"));
    }

    @Test
    void allowsHundredAndTwentySevenApplyWithMatchingDb() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var target = guard.validate(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn_local?user=admin&password=t0psecret",
                "lichsuvn_local",
                FINGERPRINT,
                NO_PROFILES,
                true);
        assertEquals("127.0.0.1", target.hostname());
        assertTrue(target.sanitizedUrl().contains("<redacted>"));
        assertTrue(!target.sanitizedUrl().contains("admin"));
        assertTrue(!target.sanitizedUrl().contains("t0psecret"));
    }

    @Test
    void allowsTestcontainersInternal() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var target = guard.validate(
                "jdbc:mysql://host.testcontainers.internal:3306/lichsuvn_local",
                "lichsuvn_local",
                FINGERPRINT,
                NO_PROFILES,
                false);
        assertEquals("host.testcontainers.internal", target.hostname());
        assertEquals("[]", target.activeProfiles());
    }

    @Test
    void refusesTidbCloudDryRun() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://gateway.tidbcloud.com:4000/lichsuvn",
                        "lichsuvn_local",
                        FINGERPRINT,
                        NO_PROFILES,
                        false));
        assertTrue(ex.getMessage().contains("tidbcloud.com"));
    }

    @Test
    void refusesRemoteProductionProfileWithoutProductionHost() {
        // The profile=remote-production now implies a production TiDB Cloud target.
        // A localhost URL paired with that profile is mismatched and must be refused.
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://localhost:3306/lichsuvn_local",
                        "lichsuvn_local",
                        FINGERPRINT,
                        new String[]{"remote-production"},
                        false));
    }

    @Test
    void refusesRemoteReleaseProfiles() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        for (String profile : new String[]{"remote-release-a", "remote-release-b", "remote-release-c", "remote-flyway-bridge"}) {
            assertThrows(
                    LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                    () -> guard.validate(
                            "jdbc:mysql://localhost:3306/lichsuvn_local",
                            "lichsuvn_local",
                            FINGERPRINT,
                            new String[]{profile},
                            false));
        }
    }

    @Test
    void refusesDatabaseMismatch() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://localhost:3306/lichsuvn_prod",
                        "lichsuvn_local",
                        FINGERPRINT,
                        NO_PROFILES,
                        false));
        assertTrue(ex.getMessage().contains("mismatch"));
    }

    @Test
    void applyRequiresKnownSchemaFingerprint() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:mysql://localhost:3306/lichsuvn_local",
                        "lichsuvn_local",
                        "wrong-fingerprint",
                        NO_PROFILES,
                        true));
    }

    @Test
    void rejectsUnknownProtocol() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(
                        "jdbc:postgresql://localhost:5432/lichsuvn_local",
                        "lichsuvn_local",
                        FINGERPRINT,
                        NO_PROFILES,
                        false));
    }

    @Test
    void sanitizationNeverLeaksNestedPassword() {
        var guard = new LegacyThumbnailBackfillDatasourceGuard();
        var target = guard.validate(
                "jdbc:mysql://localhost:3306/lichsuvn_local?user=alice&password=topsecret&token=abc",
                "lichsuvn_local",
                FINGERPRINT,
                NO_PROFILES,
                false);
        assertNotNull(target.sanitizedUrl());
        assertTrue(!target.sanitizedUrl().contains("alice"));
        assertTrue(!target.sanitizedUrl().contains("topsecret"));
        assertTrue(!target.sanitizedUrl().contains("abc"));
        assertTrue(target.sanitizedUrl().contains("<redacted>"));
    }
}
