package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests the production-TiDB allowlist and the new {@link
 * LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext} validation logic.
 *
 * <p>Every test here exercises the gate only; no DB row is inserted, no CLI is
 * invoked. The gate is fail-closed: every missing field flips the gate to throw
 * a {@link LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException}.
 */
class LegacyThumbnailBackfillDatasourceGuardRemoteApplyTest {

    private static final String TIDB_PROD_URL =
            "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn"
                    + "?useSSL=false&user=r**&password=p**&token=t**";

    private static LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext goodContext() {
        String fingerprint = LegacyThumbnailBackfillDatasourceGuard
                .synthesizedTargetFingerprint(
                        "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
                        "4000", "lichsuvn");
        return new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                fingerprint,
                "deadbeef" + "0123456789abcdef".repeat(7),
                LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                        LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                361,
                "lichsuvn_canonical_prod",
                "runid-2026-08-02",
                4096L);
    }

    private static String[] profiles(String name) {
        return new String[]{name};
    }

    @Test
    void productionApplyPassesWhenAllGatesMatch() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        LegacyThumbnailBackfillDatasourceGuard.Target t = assertDoesNotThrow(() ->
                guard.validate(
                        TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"),
                        true,
                        goodContext()));
        assertEquals("gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com", t.hostname());
        assertEquals("4000", t.port());
        assertEquals("lichsuvn", t.database());
        assertTrue(t.remoteAllowed());
        assertFalse(t.sanitizedUrl().contains("password="));
    }

    @Test
    void productionApplyRefusedWhenRemoteApplyFlagIsFalse() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                false,
                goodContext().expectedTargetFingerprint(),
                goodContext().expectedPlanDigest(),
                goodContext().expectedSchemaFingerprint(),
                361,
                "lichsuvn_canonical_prod",
                "runid-2026-08-02",
                4096L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("app.backfill.remote-apply=true"));
    }

    @Test
    void productionApplyRefusedWhenPlanDigestMissing() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                goodContext().expectedTargetFingerprint(),
                "",
                goodContext().expectedSchemaFingerprint(),
                361,
                "lichsuvn_canonical_prod",
                "runid-2026-08-02",
                4096L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("expectedPlanDigest"));
    }

    @Test
    void productionApplyRefusedWhenCloudinaryEnvNotProd() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                goodContext().expectedTargetFingerprint(),
                goodContext().expectedPlanDigest(),
                goodContext().expectedSchemaFingerprint(),
                361,
                "nonprod_only",
                "runid-2026-08-02",
                4096L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("CLOUDINARY_PROD"));
    }

    @Test
    void productionApplyRefusedWhenRollbackSnapshotEmpty() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                goodContext().expectedTargetFingerprint(),
                goodContext().expectedPlanDigest(),
                goodContext().expectedSchemaFingerprint(),
                361,
                "lichsuvn_canonical_prod",
                "",
                0L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("rollbackSnapshotRunId"));
    }

    @Test
    void productionApplyRefusedWhenTargetFingerprintMismatches() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        String otherFingerprint = "00000000000000000000000000000000"
                + "00000000000000000000000000000000";
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                otherFingerprint,
                goodContext().expectedPlanDigest(),
                goodContext().expectedSchemaFingerprint(),
                361,
                "lichsuvn_canonical_prod",
                "runid-2026-08-02",
                4096L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("target fingerprint"));
    }

    @Test
    void productionApplyRefusedWhenDatabaseMismatch() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        String wrongDbUrl = TIDB_PROD_URL.replace("/lichsuvn", "/wrong_db");
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(wrongDbUrl, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, goodContext()));
        assertTrue(ex.getMessage().contains("Production database mismatch"));
    }

    @Test
    void productionApplyRefusedWhenProfileNotRemoteProduction() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("local-mysql"), true, goodContext()));
        assertTrue(ex.getMessage().contains("profile=remote-production"));
    }

    @Test
    void productionTargetRefusedWhenNoRemoteContext() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, null));
        assertTrue(ex.getMessage().contains("RemoteApplyContext"));
    }

    @Test
    void eligibleCountAboveHardCapRefused() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        var ctx = new LegacyThumbnailBackfillDatasourceGuard.RemoteApplyContext(
                true,
                goodContext().expectedTargetFingerprint(),
                goodContext().expectedPlanDigest(),
                goodContext().expectedSchemaFingerprint(),
                50000,
                "lichsuvn_canonical_prod",
                "runid-2026-08-02",
                4096L);
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(TIDB_PROD_URL, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, ctx));
        assertTrue(ex.getMessage().contains("out of bounds"));
    }

    @Test
    void hostPatternStrictlyGated() {
        LegacyThumbnailBackfillDatasourceGuard guard =
                new LegacyThumbnailBackfillDatasourceGuard();
        String nonTidb = "jdbc:mysql://attacker.example.org:4000/lichsuvn?user=a&password=b";
        var ex = assertThrows(
                LegacyThumbnailBackfillDatasourceGuard.BackfillGuardException.class,
                () -> guard.validate(nonTidb, "lichsuvn",
                        LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(
                                LegacyThumbnailBackfillDatasourceGuard.v42Columns()),
                        profiles("remote-production"), true, goodContext()));
        assertTrue(
                ex.getMessage().contains("Profile=remote-production requires a TiDB Cloud production hostname")
                || ex.getMessage().contains("Remote apply context supplied")
                || ex.getMessage().contains("production allowlist"),
                "guard must reject non-TiDB-Cloud hostnames even with green remoteContext");
        assertFalse(ex.getMessage().contains("password="));
    }
}
