package com.lichsuvn.backend.importer.canonicalgeo;

import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyDatasourceGuard.DatasourceTarget;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyDatasourceGuard.UnsafeDatasourceException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CanonicalGeographyDatasourceGuardTest {

    private final CanonicalGeographyDatasourceGuard guard = new CanonicalGeographyDatasourceGuard();

    @Test
    void acceptsLoopbackAndExpectedDatabase() {
        DatasourceTarget target = guard.validate(
                "jdbc:mysql://127.0.0.1:3307/lichsuvn_phase4a?useSSL=false",
                "lichsuvn_phase4a",
                new String[]{"canonical-geo-sync"});
        assertEquals("127.0.0.1", target.hostname());
        assertEquals("3307", target.port());
        assertEquals("lichsuvn_phase4a", target.database());
    }

    @Test
    void acceptsLocalhostAndTestcontainersHost() {
        guard.validate("jdbc:mysql://localhost:3306/lichsuvn", "lichsuvn", new String[]{});
        guard.validate("jdbc:mysql://host.testcontainers.internal:3306/db", "db", new String[]{});
    }

    @Test
    void rejectsTidbCloudProduction() {
        assertThrows(UnsafeDatasourceException.class, () -> guard.validate(
                "jdbc:mysql://gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn",
                "lichsuvn",
                new String[]{"canonical-geo-sync"}));
    }

    @Test
    void rejectsAnyRemoteHost() {
        assertThrows(UnsafeDatasourceException.class, () -> guard.validate(
                "jdbc:mysql://db.example.com:3306/lichsuvn", "lichsuvn", new String[]{}));
    }

    @Test
    void rejectsRemoteProfiles() {
        assertThrows(UnsafeDatasourceException.class, () -> guard.validate(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn", "lichsuvn",
                new String[]{"remote-production"}));
    }

    @Test
    void rejectsDatabaseMismatch() {
        assertThrows(UnsafeDatasourceException.class, () -> guard.validate(
                "jdbc:mysql://127.0.0.1:3306/otherdb", "lichsuvn", new String[]{}));
    }

    @Test
    void rejectsNonMysqlUrl() {
        assertThrows(UnsafeDatasourceException.class, () -> guard.validate(
                "jdbc:postgresql://127.0.0.1:5432/x", "x", new String[]{}));
    }

    @Test
    void sanitizesUrlParameters() {
        DatasourceTarget target = guard.validate(
                "jdbc:mysql://127.0.0.1:3306/lichsuvn?user=u&password=secret",
                "lichsuvn",
                new String[]{});
        assertEquals(true, target.sanitizedUrl().contains("password=<redacted>"));
        assertEquals(false, target.sanitizedUrl().contains("password=secret"));
    }
}
