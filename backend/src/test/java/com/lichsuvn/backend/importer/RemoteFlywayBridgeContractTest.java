package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RemoteFlywayBridgeContractTest {
    private static final Path MIGRATION_DIR = Path.of("src/main/resources/db/migration");
    private static final Path LOCAL_V12 = MIGRATION_DIR.resolve("V12__nullable_event_chronology.sql");
    private static final Path BRIDGE_V14 = MIGRATION_DIR.resolve("V14__nullable_event_chronology_remote_bridge.sql");
    private static final Path BRIDGE_PROFILE = Path.of("src/main/resources/application-remote-flyway-bridge.properties");
    private static final Path REMOTE_PRODUCTION_PROFILE = Path.of("src/main/resources/application-remote-production.properties");
    private static final Path DEFAULT_PROPERTIES = Path.of("src/main/resources/application.properties");

    @Test
    void currentMigrationSetConflictsWithKnownRemoteV12History() throws IOException {
        List<String> migrationNames = Files.list(MIGRATION_DIR)
                .map(path -> path.getFileName().toString())
                .filter(name -> name.endsWith(".sql"))
                .sorted()
                .toList();

        assertTrue(migrationNames.contains("V12__nullable_event_chronology.sql"));
        assertFalse(migrationNames.contains("V12__expand_event_geo_type_enum.sql"));
        assertFalse(migrationNames.contains("V13__exam_v2_attempts.sql"));

        String remoteV12Description = "expand event geo type enum";
        String resolvedV12Description = descriptionOf("V12__nullable_event_chronology.sql");
        assertFalse(
                remoteV12Description.equals(resolvedV12Description),
                "Remote V12 and repo V12 intentionally differ, so default Flyway validation would fail."
        );
    }

    @Test
    void bridgeMigrationIsForwardOnlyAndDoesNotEditTheAppliedLocalMigration() throws IOException {
        assertEquals("12", versionOf(LOCAL_V12.getFileName().toString()));
        assertEquals("14", versionOf(BRIDGE_V14.getFileName().toString()));

        String bridgeSql = normalizedSql(BRIDGE_V14);
        assertTrue(bridgeSql.contains("MODIFY COLUMN START_YEAR INT NULL"));
        assertTrue(bridgeSql.contains("MODIFY COLUMN EFFECTIVE_END_YEAR INT NULL"));
        assertTrue(bridgeSql.contains("SET START_YEAR = NULL WHERE START_YEAR = 0"));
        assertTrue(bridgeSql.contains("SET END_YEAR = NULL WHERE END_YEAR = 0"));
        assertTrue(bridgeSql.contains("SET EFFECTIVE_END_YEAR = NULL WHERE EFFECTIVE_END_YEAR = 0"));

        assertFalse(bridgeSql.contains("INSERT INTO FLYWAY_SCHEMA_HISTORY"));
        assertFalse(bridgeSql.contains("DELETE FROM FLYWAY_SCHEMA_HISTORY"));
        assertFalse(bridgeSql.contains("UPDATE FLYWAY_SCHEMA_HISTORY"));
        assertFalse(bridgeSql.contains("DROP TABLE"));
        assertFalse(bridgeSql.contains("DROP COLUMN"));
        assertFalse(bridgeSql.contains("EVENT_MEDIA"));
    }

    @Test
    void bridgeProfileDisablesValidationOnlyWhenExplicitlyActivated() throws IOException {
        String profile = Files.readString(BRIDGE_PROFILE).replaceAll("\\s+", "");
        String defaults = Files.readString(DEFAULT_PROPERTIES);

        assertTrue(profile.contains("spring.flyway.validate-on-migrate=false"));
        assertFalse(defaults.contains("spring.flyway.validate-on-migrate=false"));
        assertFalse(profile.contains("spring.flyway.enabled=false"));
    }

    @Test
    void remoteProductionProfileDisablesFlywayInsteadOfPermanentlyHidingValidationErrors() throws IOException {
        String profile = Files.readString(REMOTE_PRODUCTION_PROFILE).replaceAll("\\s+", "");
        String defaults = Files.readString(DEFAULT_PROPERTIES);

        assertTrue(profile.contains("spring.flyway.enabled=false"));
        assertFalse(profile.contains("spring.flyway.validate-on-migrate=false"));

        assertTrue(defaults.contains("spring.flyway.enabled=true"));
        assertTrue(defaults.contains("spring.flyway.locations=classpath:db/migration"));
        assertFalse(defaults.contains("spring.flyway.enabled=false"));
    }

    private static String normalizedSql(Path path) throws IOException {
        return Files.readString(path).replaceAll("\\s+", " ").toUpperCase();
    }

    private static String versionOf(String filename) {
        Matcher matcher = Pattern.compile("^V([^_]+)__.+\\.sql$").matcher(filename);
        assertTrue(matcher.matches(), "Unexpected Flyway migration name: " + filename);
        return matcher.group(1);
    }

    private static String descriptionOf(String filename) {
        Matcher matcher = Pattern.compile("^V[^_]+__(.+)\\.sql$").matcher(filename);
        assertTrue(matcher.matches(), "Unexpected Flyway migration name: " + filename);
        return matcher.group(1).replace('_', ' ');
    }
}
