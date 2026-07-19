package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NullableChronologyMigrationContractTest {
    private static final Path MIGRATION = Path.of(
            "src/main/resources/db/migration/V12__nullable_event_chronology.sql"
    );

    @Test
    void migrationMakesChronologyBoundsNullableAndBackfillsZeroSentinels() throws IOException {
        String sql = Files.readString(MIGRATION);
        String normalized = sql.replaceAll("\\s+", " ").toUpperCase();

        assertTrue(normalized.contains("MODIFY COLUMN START_YEAR INT NULL"));
        assertTrue(normalized.contains("MODIFY COLUMN EFFECTIVE_END_YEAR INT NULL"));
        assertFalse(normalized.contains("MODIFY COLUMN END_YEAR INT NOT NULL"));

        assertTrue(normalized.contains("SET START_YEAR = NULL WHERE START_YEAR = 0"));
        assertTrue(normalized.contains("SET END_YEAR = NULL WHERE END_YEAR = 0"));
        assertTrue(normalized.contains("SET EFFECTIVE_END_YEAR = NULL WHERE EFFECTIVE_END_YEAR = 0"));

        assertFalse(normalized.contains("DROP INDEX IDX_EVENTS_TIMELINE"));
        assertFalse(normalized.contains("DROP INDEX IDX_EVENTS_TYPE_TIMELINE"));
        assertFalse(normalized.contains("DROP KEY IDX_EVENTS_TIMELINE"));
        assertFalse(normalized.contains("DROP KEY IDX_EVENTS_TYPE_TIMELINE"));
    }

    @Test
    void migrationRejectsFutureYearZeroRowsWithoutAddingChronologyScope() throws IOException {
        String sql = Files.readString(MIGRATION);
        String normalized = sql.replaceAll("\\s+", " ").toUpperCase();

        assertTrue(normalized.contains("CHECK (START_YEAR IS NULL OR START_YEAR <> 0)"));
        assertTrue(normalized.contains("CHECK (END_YEAR IS NULL OR END_YEAR <> 0)"));
        assertTrue(normalized.contains("CHECK (EFFECTIVE_END_YEAR IS NULL OR EFFECTIVE_END_YEAR <> 0)"));

        assertFalse(normalized.contains("BOUNDARY_STATE"));
        assertFalse(normalized.contains("OPEN_BOUNDARY"));
        assertFalse(normalized.contains("TO_PRESENT"));
        assertFalse(normalized.contains("MULTIPLE_INTERVAL"));
        assertFalse(normalized.contains("RELATIVE_CHRONOLOGY"));
    }
}
