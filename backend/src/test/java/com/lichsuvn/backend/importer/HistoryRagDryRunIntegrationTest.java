package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.util.LinkedHashSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class HistoryRagDryRunIntegrationTest {

    @TempDir
    private static Path temporaryDirectory;

    private static MySQLContainer<?> mysql;
    private static HistoryRagPackageReader.PackageData packageData;
    private static HistoryRagTextbookRefPreflight preflight;
    private static NamedParameterJdbcTemplate jdbc;
    private static boolean mysqlAvailable;
    private static String unavailableReason;

    @BeforeAll
    static void setupDisposableDatabase() {
        boolean containerStarted = false;
        try {
            mysql = new MySQLContainer<>("mysql:8.0.36")
                    .withDatabaseName("history_rag_dry_run_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            containerStarted = true;

            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();
            DataSource dataSource = new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
            jdbc = new NamedParameterJdbcTemplate(dataSource);
            Path packageDirectory = temporaryDirectory.resolve("history-rag-v1");
            HistoryRagTestPackageFixture.create(packageDirectory);
            packageData = new HistoryRagPackageReader(new ObjectMapper()).read(packageDirectory);
            seedPackageReferences();
            preflight = new HistoryRagTextbookRefPreflight(jdbc);
            mysqlAvailable = true;
        } catch (Exception ex) {
            if (mysql != null) {
                mysql.stop();
            }
            if (containerStarted) {
                throw new IllegalStateException("History RAG disposable database setup failed", ex);
            }
            unavailableReason = "Testcontainers MySQL unavailable: " + ex.getClass().getSimpleName()
                    + " - " + ex.getMessage();
        }
    }

    @AfterAll
    static void stopContainer() {
        if (mysql != null) {
            mysql.stop();
        }
    }

    @Test
    void productionPreflightQueryClassifiesACompleteDisposableDatabase() {
        assumeTrue(mysqlAvailable, unavailableReason);

        var report = preflight.run(packageData);

        assertEquals(386, report.workbookActiveReferences());
        assertEquals(386, report.currentDatabaseReferences());
        assertEquals(386, report.keepUnchanged());
        assertEquals(0, report.updateRequired());
        assertEquals(0, report.approvedRemovalsPresent());
        assertEquals(9, report.alreadyAbsentRemovals());
        assertEquals(0, report.activeRefMissing());
        assertEquals(0, report.identityConflicts());
        assertEquals(0, report.unexpectedCurrentRows());
        assertFalse(report.applyBlocked());
    }

    private static void seedPackageReferences() {
        LinkedHashSet<String> eventIds = packageData.textbookReferences().stream()
                .map(HistoryRagPackageReader.TextbookReference::eventId)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        MapSqlParameterSource[] events = eventIds.stream()
                .map(eventId -> new MapSqlParameterSource()
                        .addValue("id", eventId)
                        .addValue("title", eventId))
                .toArray(MapSqlParameterSource[]::new);
        jdbc.batchUpdate("""
                INSERT INTO historical_events (
                    id, slug, title, event_level, event_type, start_year,
                    effective_end_year, geo_type, key_facts, raw_json
                ) VALUES (
                    :id, :id, :title, 'atomic', 'political', 1,
                    1, 'no_location', JSON_ARRAY(), JSON_OBJECT('id', :id)
                )
                """, events);

        MapSqlParameterSource[] references = packageData.textbookReferences().stream()
                .map(reference -> new MapSqlParameterSource()
                        .addValue("id", reference.id())
                        .addValue("eventId", reference.eventId())
                        .addValue("grade", reference.grade())
                        .addValue("book", reference.book())
                        .addValue("theme", reference.theme())
                        .addValue("lesson", reference.lesson())
                        .addValue("pageStart", reference.pageStart())
                        .addValue("pageEnd", reference.pageEnd())
                        .addValue("pageScope", reference.pageScope())
                        .addValue("pageNumberBasis", reference.pageNumberBasis())
                        .addValue("pageMappingStatus", reference.pageMappingStatus())
                        .addValue("showOnDetail", reference.showOnDetail())
                        .addValue("excerpt", reference.excerpt())
                        .addValue("url", reference.url())
                        .addValue("sourceKey", reference.sourceKey()))
                .toArray(MapSqlParameterSource[]::new);
        jdbc.batchUpdate("""
                INSERT INTO event_textbook_refs (
                    id, event_id, grade, book, theme, lesson, page_start, page_end,
                    page_scope, page_number_basis, page_mapping_status, show_on_detail,
                    excerpt, url, source_key
                ) VALUES (
                    :id, :eventId, :grade, :book, :theme, :lesson, :pageStart, :pageEnd,
                    :pageScope, :pageNumberBasis, :pageMappingStatus, :showOnDetail,
                    :excerpt, :url, :sourceKey
                )
                """, references);
    }
}
