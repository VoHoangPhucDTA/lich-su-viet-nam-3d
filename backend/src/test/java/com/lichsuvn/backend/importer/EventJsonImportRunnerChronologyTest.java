package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EventJsonImportRunnerChronologyTest {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void derivesKnownStartAndKnownEnd() throws IOException {
        EventJsonImportRunner.ChronologyYears years = chronology(1945, 1954);

        assertEquals(1945, years.startYear());
        assertEquals(1954, years.endYear());
        assertEquals(1954, years.effectiveEndYear());
    }

    @Test
    void derivesKnownStartAndNullEndAsPointChronology() throws IOException {
        EventJsonImportRunner.ChronologyYears years = chronology(1945, null);

        assertEquals(1945, years.startYear());
        assertNull(years.endYear());
        assertEquals(1945, years.effectiveEndYear());
    }

    @Test
    void preservesNullStartAndKnownEndAsPartialChronology() throws IOException {
        EventJsonImportRunner.ChronologyYears years = chronology(null, 1945);

        assertNull(years.startYear());
        assertEquals(1945, years.endYear());
        assertEquals(1945, years.effectiveEndYear());
    }

    @Test
    void preservesFullyNullChronology() throws IOException {
        EventJsonImportRunner.ChronologyYears years = chronology(null, null);

        assertNull(years.startYear());
        assertNull(years.endYear());
        assertNull(years.effectiveEndYear());
    }

    @Test
    void preservesNegativeBceYears() throws IOException {
        EventJsonImportRunner.ChronologyYears years = chronology(-500, -401);

        assertEquals(-500, years.startYear());
        assertEquals(-401, years.endYear());
        assertEquals(-401, years.effectiveEndYear());
    }

    @Test
    void rejectsStartYearZero() {
        assertThrows(IllegalArgumentException.class, () -> chronology(0, 1945));
    }

    @Test
    void rejectsEndYearZero() {
        assertThrows(IllegalArgumentException.class, () -> chronology(1945, 0));
    }

    @Test
    void rejectsKnownReversedRange() {
        assertThrows(IllegalArgumentException.class, () -> chronology(1954, 1945));
    }

    @Test
    void mergeAdoptsKnownIncomingStartWhenCurrentStartIsNull() {
        EventJsonImportRunner.ChronologyYears merged = EventJsonImportRunner.mergeChronology(
                new EventJsonImportRunner.ChronologyYears(null, null, null),
                new EventJsonImportRunner.ChronologyYears(1945, null, 1945)
        );

        assertEquals(1945, merged.startYear());
        assertNull(merged.endYear());
        assertEquals(1945, merged.effectiveEndYear());
    }

    @Test
    void mergePreservesKnownCurrentStartWhenIncomingStartIsNull() {
        EventJsonImportRunner.ChronologyYears merged = EventJsonImportRunner.mergeChronology(
                new EventJsonImportRunner.ChronologyYears(1945, null, 1945),
                new EventJsonImportRunner.ChronologyYears(null, null, null)
        );

        assertEquals(1945, merged.startYear());
        assertNull(merged.endYear());
        assertEquals(1945, merged.effectiveEndYear());
    }

    @Test
    void mergePreservesFullyNullChronology() {
        EventJsonImportRunner.ChronologyYears merged = EventJsonImportRunner.mergeChronology(
                new EventJsonImportRunner.ChronologyYears(null, null, null),
                new EventJsonImportRunner.ChronologyYears(null, null, null)
        );

        assertNull(merged.startYear());
        assertNull(merged.endYear());
        assertNull(merged.effectiveEndYear());
    }

    @Test
    void mergeKeepsCurrentKnownChronologyPrecedence() {
        EventJsonImportRunner.ChronologyYears merged = EventJsonImportRunner.mergeChronology(
                new EventJsonImportRunner.ChronologyYears(1945, 1954, 1954),
                new EventJsonImportRunner.ChronologyYears(1975, 1986, 1986)
        );

        assertEquals(1945, merged.startYear());
        assertEquals(1954, merged.endYear());
        assertEquals(1954, merged.effectiveEndYear());
    }

    private static EventJsonImportRunner.ChronologyYears chronology(Integer startYear, Integer endYear) throws IOException {
        JsonNode chronology = OBJECT_MAPPER.readTree("""
                {
                  "start": {"year": %s, "month": null, "day": null},
                  "end": %s,
                  "displayDate": "fixture"
                }
                """.formatted(
                startYear == null ? "null" : startYear,
                endYear == null ? "null" : """
                        {"year": %d, "month": null, "day": null}
                        """.formatted(endYear)
        ));
        return EventJsonImportRunner.chronologyYearsFrom(chronology);
    }
}
