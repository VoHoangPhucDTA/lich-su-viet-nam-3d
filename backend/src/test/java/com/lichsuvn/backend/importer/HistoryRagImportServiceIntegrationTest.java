package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.event.infrastructure.EventReadRepository;
import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.testcontainers.mysql.MySQLContainer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class HistoryRagImportServiceIntegrationTest {

    @TempDir
    private static Path temporaryDirectory;

    private static MySQLContainer mysql;
    private static HikariDataSource dataSource;
    private static NamedParameterJdbcTemplate jdbc;
    private static HistoryRagPackageReader.PackageData packageData;
    private static HistoryRagImportService service;
    private static boolean mysqlAvailable;
    private static String unavailableReason;

    @BeforeAll
    static void setupDatabase() {
        boolean containerStarted = false;
        try {
            mysql = new LocalMySqlContainer("mysql:8.0.36")
                    .withDatabaseName("history_rag_apply_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            containerStarted = true;
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();
            HikariConfig config = new HikariConfig();
            config.setJdbcUrl(mysql.getJdbcUrl());
            config.setUsername(mysql.getUsername());
            config.setPassword(mysql.getPassword());
            config.setMaximumPoolSize(4);
            dataSource = new HikariDataSource(config);
            jdbc = new NamedParameterJdbcTemplate(dataSource);
            Path packageDirectory = temporaryDirectory.resolve("history-rag-v1");
            HistoryRagTestPackageFixture.create(packageDirectory);
            packageData = new HistoryRagPackageReader(new ObjectMapper()).read(packageDirectory);
            seedBaseline();
            service = transactional(new HistoryRagImportService(
                    jdbc,
                    new HistoryRagTextbookRefPreflight(jdbc),
                    new ObjectMapper()));
            mysqlAvailable = true;
        } catch (Exception ex) {
            if (mysql != null) {
                mysql.stop();
            }
            if (containerStarted) {
                throw new IllegalStateException("History RAG apply test setup failed", ex);
            }
            unavailableReason = "Testcontainers MySQL unavailable: " + ex.getClass().getSimpleName()
                    + " - " + ex.getMessage();
        }
    }

    private static HistoryRagImportService transactional(HistoryRagImportService target) {
        var transactionManager = new DataSourceTransactionManager(dataSource);
        var interceptor = new TransactionInterceptor(
                transactionManager,
                new AnnotationTransactionAttributeSource());
        var proxyFactory = new ProxyFactory(target);
        proxyFactory.addAdvice(interceptor);
        return (HistoryRagImportService) proxyFactory.getProxy();
    }

    @AfterAll
    static void stopContainer() {
        if (dataSource != null) {
            dataSource.close();
        }
        if (mysql != null) {
            mysql.stop();
        }
    }

    @Test
    void appliesIdempotentlyAndRollsBackWithoutOverwritingLaterChanges() {
        assumeTrue(mysqlAvailable, unavailableReason);

        HistoryRagImportService.ImportPreflight preflight = service.preflight(packageData, "all");
        assertFalse(preflight.blocked(), preflight.summary());

        HistoryRagImportService.ApplyResult first = service.apply(packageData, "all");
        assertTrue(first.runId() > 0);
        assertTrue(first.changed() > 0);
        assertEquals("success", jdbc.getJdbcTemplate().queryForObject(
                "SELECT status FROM data_import_runs WHERE id = " + first.runId(), String.class));

        assertEquals(361, count("historical_events"));
        assertEquals(386, count("event_textbook_refs"));
        assertEquals(361, count("event_textbook_contents"));
        assertEquals(386, count("event_textbook_content_refs"));
        assertEquals(0, countByIds("event_textbook_refs",
                List.of(120268L, 120270L, 120271L, 120337L, 120437L, 120594L, 120303L, 120327L, 120609L)));
        HistoryRagPackageReader.TextbookReference firstReference =
                packageData.textbookReferences().getFirst();
        assertEquals(1, jdbc.getJdbcTemplate().queryForObject("""
                SELECT COUNT(*) FROM event_textbook_refs
                WHERE id = ? AND event_id = ? AND show_on_detail = 1
                """, Integer.class, firstReference.id(), firstReference.eventId()));
        assertEquals(0, jdbc.getJdbcTemplate().queryForObject("""
                SELECT reference_count FROM event_textbook_contents
                WHERE event_id = ?
                """, Integer.class, firstReference.eventId()));
        assertEquals("10-12", jdbc.getJdbcTemplate().queryForObject("""
                SELECT grade_scope FROM event_textbook_contents
                WHERE event_id = ?
                """, String.class, firstReference.eventId()));
        String eventWithoutTextbookReferences = packageData.historicalEvents().get(345).eventId();
        assertEquals(0, jdbc.getJdbcTemplate().queryForObject("""
                SELECT COUNT(*) FROM event_textbook_refs
                WHERE event_id = ?
                """, Integer.class, eventWithoutTextbookReferences));
        assertEquals(distinctResearchMappingCount(), count("event_research_sources"));
        assertEquals(648, count("event_external_sources"));
        assertEquals(distinctSourceCount(), count("source_catalog"));
        assertTrue(count("history_rag_import_changes") > 0);

        EventReadRepository eventReadRepository = new EventReadRepository(jdbc, new ObjectMapper());
        var firstEvent = eventReadRepository.findDetailByIdOrSlug(firstReference.eventId()).orElseThrow();
        assertTrue(firstEvent.textbookRefs().stream()
                .anyMatch(ref -> ref.id() == firstReference.id()));
        assertTrue(eventReadRepository.findDetailByIdOrSlug(eventWithoutTextbookReferences)
                .orElseThrow().textbookRefs().isEmpty());

        var hiddenReference = packageData.textbookReferences().stream()
                .filter(reference -> !reference.showOnDetail())
                .findFirst()
                .orElseThrow();
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_textbook_refs
                WHERE id = :id AND event_id = :eventId AND show_on_detail = 0
                """, new MapSqlParameterSource("id", hiddenReference.id())
                .addValue("eventId", hiddenReference.eventId()), Integer.class));
        assertFalse(eventReadRepository.findDetailByIdOrSlug(hiddenReference.eventId())
                .orElseThrow().textbookRefs().stream()
                .anyMatch(ref -> ref.id() == hiddenReference.id()));

        HistoryRagImportService.ApplyResult second = service.apply(packageData, "all");
        assertEquals(0, second.changed());
        assertEquals(0, jdbc.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM history_rag_import_changes WHERE run_id = " + second.runId(), Integer.class));

        String conflictEventId = packageData.historicalEvents().getFirst().eventId();
        String importedSummary = packageData.historicalEvents().getFirst().cardSummary();
        jdbc.update("UPDATE historical_events SET card_summary = 'manual-later-change' WHERE id = :id",
                new MapSqlParameterSource("id", conflictEventId));

        HistoryRagImportService.RollbackResult rollback = service.rollback(first.runId());
        assertEquals(1, rollback.conflicts());
        assertTrue(rollback.changed() > 0);
        assertEquals("manual-later-change", jdbc.queryForObject(
                "SELECT card_summary FROM historical_events WHERE id = :id",
                new MapSqlParameterSource("id", conflictEventId), String.class));
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM history_rag_import_changes
                WHERE run_id = :runId AND status = 'ROLLBACK_CONFLICT'
                """, new MapSqlParameterSource("runId", first.runId()), Integer.class));

        jdbc.update("UPDATE historical_events SET card_summary = :summary WHERE id = :id",
                new MapSqlParameterSource("id", conflictEventId).addValue("summary", importedSummary));
        HistoryRagImportService.RollbackResult retry = service.rollback(first.runId());
        assertEquals(1, retry.changed());
        assertEquals(0, retry.conflicts());
        assertEquals(0, service.rollback(first.runId()).changed());

        assertEquals(0, count("event_textbook_contents"));
        assertEquals(395, count("event_textbook_content_refs"));
        assertEquals(0, count("event_research_sources"));
        assertEquals(0, count("event_external_sources"));
        assertEquals(0, count("source_catalog"));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM history_rag_import_changes
                WHERE run_id = :runId AND status <> 'ROLLED_BACK'
                """, new MapSqlParameterSource("runId", first.runId()), Integer.class));
        assertEquals(0, jdbc.queryForObject("""
                SELECT COUNT(*) FROM historical_events WHERE card_summary IS NOT NULL
                   OR canonical_summary IS NOT NULL OR detailed_narrative IS NOT NULL
                   OR significance IS NOT NULL
                """, new MapSqlParameterSource(), Integer.class));
    }

    private static void seedBaseline() {
        MapSqlParameterSource[] events = packageData.historicalEvents().stream()
                .map(event -> new MapSqlParameterSource()
                        .addValue("id", event.eventId())
                        .addValue("title", event.title()))
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

        List<HistoryRagPackageReader.TextbookReference> baselineReferences = new ArrayList<>(packageData.textbookReferences());
        packageData.textbookReferenceRemovals().forEach(removal -> baselineReferences.add(new HistoryRagPackageReader.TextbookReference(
                removal.id(), removal.eventId(), removal.grade(), removal.book(), removal.theme(), removal.lesson(), removal.url(),
                removal.sourceKey(), removal.excerpt(), removal.pageStart(), removal.pageEnd(),
                "REFERENCE_RANGE", "PRINTED_BOOK_PAGE", "REFERENCE_RANGE_MAPPED", false)));
        MapSqlParameterSource[] references = baselineReferences.stream()
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
                        .addValue("excerpt", reference.excerpt())
                        .addValue("url", reference.url())
                        .addValue("sourceKey", reference.sourceKey())
                        .addValue("showOnDetail", false))
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

        List<MapSqlParameterSource> baselineRelations = new ArrayList<>();
        packageData.textbookContentRefs().forEach(relation -> baselineRelations.add(
                new MapSqlParameterSource()
                        .addValue("eventId", relation.eventId())
                        .addValue("textbookRefId", relation.textbookRefId())
                        .addValue("sourceOrder", relation.sourceOrder())));
        packageData.textbookReferenceRemovals().forEach(removal -> baselineRelations.add(
                new MapSqlParameterSource()
                        .addValue("eventId", removal.eventId())
                        .addValue("textbookRefId", removal.id())
                        .addValue("sourceOrder", 999)));
        jdbc.batchUpdate("""
                INSERT INTO event_textbook_content_refs (event_id, textbook_ref_id, source_order)
                VALUES (:eventId, :textbookRefId, :sourceOrder)
                """, baselineRelations.toArray(MapSqlParameterSource[]::new));
    }

    private static int count(String table) {
        return jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private static int countByIds(String table, List<Long> ids) {
        String placeholders = ids.stream().map(id -> "?").collect(java.util.stream.Collectors.joining(","));
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE id IN (" + placeholders + ")",
                Integer.class, ids.toArray());
    }

    private static int distinctSourceCount() {
        Set<String> dedupeKeys = new LinkedHashSet<>();
        packageData.researchSources().forEach(source -> dedupeKeys.add(source.dedupeKey()));
        packageData.eventExternalSources().forEach(source -> dedupeKeys.add(source.dedupeKey()));
        return dedupeKeys.size();
    }

    private static int distinctResearchMappingCount() {
        var dedupeByImportKey = packageData.researchSources().stream()
                .collect(java.util.stream.Collectors.toMap(
                        HistoryRagPackageReader.ResearchSource::importKey,
                        HistoryRagPackageReader.ResearchSource::dedupeKey));
        return (int) packageData.eventResearchSources().stream()
                .map(mapping -> mapping.eventId() + "\u0000" + dedupeByImportKey.get(mapping.sourceImportKey()))
                .distinct()
                .count();
    }
}
