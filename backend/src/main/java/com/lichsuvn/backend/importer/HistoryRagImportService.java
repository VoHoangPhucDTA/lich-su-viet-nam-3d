package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class HistoryRagImportService {

    private static final String HISTORICAL_SECTION = "historical";
    private static final String TEXTBOOK_REFS_SECTION = "textbook-refs";
    private static final String TEXTBOOK_CONTENT_SECTION = "textbook-content";
    private static final String SOURCES_SECTION = "sources";

    private final NamedParameterJdbcTemplate jdbc;
    private final HistoryRagTextbookRefPreflight textbookRefPreflight;
    private final ObjectMapper objectMapper;
    private final ThreadLocal<List<AuditRow>> pendingAuditRows = new ThreadLocal<>();

    public HistoryRagImportService(
            NamedParameterJdbcTemplate jdbc,
            HistoryRagTextbookRefPreflight textbookRefPreflight,
            ObjectMapper objectMapper
    ) {
        this.jdbc = jdbc;
        this.textbookRefPreflight = textbookRefPreflight;
        this.objectMapper = objectMapper;
    }

    public ImportPreflight preflight(HistoryRagPackageReader.PackageData packageData, String section) {
        List<SectionReport> reports = new ArrayList<>();
        if (section.equals(HISTORICAL_SECTION) || section.equals("all")) {
            reports.add(preflightHistorical(packageData.historicalEvents()));
        }
        if (section.equals(TEXTBOOK_REFS_SECTION) || section.equals("all")) {
            var report = textbookRefPreflight.run(packageData);
            reports.add(new SectionReport(
                    TEXTBOOK_REFS_SECTION,
                    report.activeRefMissing(),
                    report.identityConflicts(),
                    report.updateRequired() + report.approvedRemovalsPresent(),
                    report.applyBlocked(),
                    "missing=" + report.activeRefMissing()
                            + ", conflicts=" + report.identityConflicts()
                            + ", unexpected=" + report.unexpectedCurrentRows()
                            + ", updates=" + report.updateRequired()
                            + ", removeWrong=" + report.removeWrongMapping()
                            + ", removeQuarantined=" + report.removeQuarantined()
            ));
        }
        if (section.equals(TEXTBOOK_CONTENT_SECTION) || section.equals("all")) {
            reports.add(preflightTextbookContent(packageData));
        }
        if (section.equals(SOURCES_SECTION) || section.equals("all")) {
            reports.add(preflightSources(packageData));
        }
        return new ImportPreflight(reports);
    }

    @Transactional
    public ApplyResult apply(HistoryRagPackageReader.PackageData packageData, String section) {
        ImportPreflight preflight = preflight(packageData, section);
        if (preflight.blocked()) {
            throw new ImportBlockedException("History RAG apply is blocked: " + preflight.summary());
        }

        long runId = createRun(packageData, section);
        pendingAuditRows.set(new ArrayList<>());
        try {
            int changed = 0;
            if (section.equals(HISTORICAL_SECTION) || section.equals("all")) {
                changed += applyHistorical(packageData.historicalEvents(), runId);
            }
            if (section.equals(TEXTBOOK_REFS_SECTION) || section.equals("all")) {
                changed += applyTextbookReferences(packageData, runId);
            }
            if (section.equals(TEXTBOOK_CONTENT_SECTION) || section.equals("all")) {
                changed += applyTextbookContent(packageData, runId);
            }
            if (section.equals(SOURCES_SECTION) || section.equals("all")) {
                changed += applySources(packageData, runId);
            }
            flushAuditRows();
            finishRun(runId, "success", changed, null);
            return new ApplyResult(runId, changed, section);
        } catch (RuntimeException ex) {
            finishRun(runId, "failed", 0, ex.getMessage());
            throw ex;
        } finally {
            pendingAuditRows.remove();
        }
    }

    @Transactional
    public RollbackResult rollback(long runId) {
        Map<String, Object> run = queryOne("""
                SELECT id, import_type, status
                FROM data_import_runs
                WHERE id = :runId
                """, Map.of("runId", runId));
        if (run == null || !"rag_seed".equals(String.valueOf(run.get("import_type")))) {
            throw new ImportBlockedException("History RAG import run does not exist: " + runId);
        }
        if (!"success".equals(String.valueOf(run.get("status")))) {
            throw new ImportBlockedException("Only a successful History RAG import run can be rolled back: " + runId);
        }

        List<RollbackChange> changes = jdbc.query("""
                SELECT id, section, operation, before_json, after_json
                FROM history_rag_import_changes
                WHERE run_id = :runId AND status IN ('APPLIED', 'ROLLBACK_CONFLICT')
                ORDER BY id DESC
                """, new MapSqlParameterSource("runId", runId), (rs, rowNum) -> new RollbackChange(
                rs.getLong("id"),
                rs.getString("section"),
                rs.getString("operation"),
                parseJson(rs.getString("before_json")),
                parseJson(rs.getString("after_json"))
        ));

        int changed = 0;
        int conflicts = 0;
        List<RollbackStatusUpdate> statusUpdates = new ArrayList<>(changes.size());
        for (RollbackChange change : changes) {
            RollbackOutcome outcome = rollbackChange(change);
            if (outcome.conflict()) {
                conflicts++;
                statusUpdates.add(new RollbackStatusUpdate(change.id(), "ROLLBACK_CONFLICT", outcome.message()));
            } else {
                if (outcome.changed()) {
                    changed++;
                }
                statusUpdates.add(new RollbackStatusUpdate(change.id(), "ROLLED_BACK", null));
            }
        }
        updateRollbackStatuses(statusUpdates);
        return new RollbackResult(runId, changed, conflicts);
    }

    private RollbackOutcome rollbackChange(RollbackChange change) {
        Map<String, Object> identity = change.after() != null ? change.after() : change.before();
        if (identity == null) {
            return RollbackOutcome.conflict("Audit row has neither before nor after value");
        }
        if (change.section().equals(HISTORICAL_SECTION)) {
            return rollbackHistorical(change, identity);
        }
        if (change.section().equals(TEXTBOOK_REFS_SECTION)) {
            return rollbackTextbookReference(change, identity);
        }
        if (change.section().equals(TEXTBOOK_CONTENT_SECTION)) {
            return identity.containsKey("textbook_ref_id")
                    ? rollbackTextbookContentReference(change, identity)
                    : rollbackTextbookContent(change, identity);
        }
        if (change.section().equals(SOURCES_SECTION)) {
            if (identity.containsKey("dedupe_key")) {
                return rollbackSource(change, identity);
            }
            if (identity.containsKey("match_type")) {
                return rollbackExternalSourceRelation(change, identity);
            }
            return rollbackResearchSourceRelation(change, identity);
        }
        return RollbackOutcome.conflict("Unsupported audit section: " + change.section());
    }

    private RollbackOutcome rollbackHistorical(RollbackChange change, Map<String, Object> identity) {
        String eventId = String.valueOf(identity.get("id"));
        Map<String, Object> current = queryOne("""
                SELECT id, card_summary, canonical_summary, detailed_narrative, significance
                FROM historical_events WHERE id = :id
                """, Map.of("id", eventId));
        return reverse(change, current,
                () -> { throw new ImportBlockedException("Historical event inserts are not rollback-supported"); },
                () -> jdbc.update("""
                        UPDATE historical_events
                        SET card_summary = :card_summary, canonical_summary = :canonical_summary,
                            detailed_narrative = :detailed_narrative, significance = :significance
                        WHERE id = :id
                        """, params(change.before())),
                () -> { throw new ImportBlockedException("Historical event deletes are not rollback-supported"); });
    }

    private RollbackOutcome rollbackTextbookReference(RollbackChange change, Map<String, Object> identity) {
        long id = number(identity.get("id")).longValue();
        Map<String, Object> current = queryOne("""
                SELECT id, event_id, grade, book, theme, lesson, url, source_key, excerpt,
                       page_start, page_end, page_scope, page_number_basis, page_mapping_status,
                       show_on_detail, created_at
                FROM event_textbook_refs WHERE id = :id
                """, Map.of("id", id));
        return reverse(change, current,
                () -> { throw new ImportBlockedException("Textbook reference inserts are not rollback-supported"); },
                () -> jdbc.update("""
                        UPDATE event_textbook_refs
                        SET excerpt = :excerpt, page_start = :page_start, page_end = :page_end,
                            page_scope = :page_scope, page_number_basis = :page_number_basis,
                            page_mapping_status = :page_mapping_status,
                            show_on_detail = :show_on_detail
                        WHERE id = :id AND event_id = :event_id
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO event_textbook_refs (
                            id, event_id, grade, book, theme, lesson, page_start, page_end,
                            page_scope, page_number_basis, page_mapping_status, show_on_detail,
                            excerpt, url, source_key, created_at
                        ) VALUES (
                            :id, :event_id, :grade, :book, :theme, :lesson, :page_start, :page_end,
                            :page_scope, :page_number_basis, :page_mapping_status, :show_on_detail,
                            :excerpt, :url, :source_key, :created_at
                        )
                        """, params(change.before())));
    }

    private RollbackOutcome rollbackTextbookContent(RollbackChange change, Map<String, Object> identity) {
        String eventId = String.valueOf(identity.get("event_id"));
        Map<String, Object> current = queryOne("""
                SELECT event_id, content, content_status, content_source, reference_count,
                       grade_scope, correction_note, content_hash, verified_at, verified_by
                FROM event_textbook_contents WHERE event_id = :eventId
                """, Map.of("eventId", eventId));
        return reverse(change, current,
                () -> jdbc.update("DELETE FROM event_textbook_contents WHERE event_id = :event_id",
                        params(change.after())),
                () -> jdbc.update("""
                        UPDATE event_textbook_contents
                        SET content = :content, content_status = :content_status,
                            content_source = :content_source, reference_count = :reference_count,
                            grade_scope = :grade_scope, correction_note = :correction_note,
                            content_hash = :content_hash, verified_at = :verified_at,
                            verified_by = :verified_by
                        WHERE event_id = :event_id
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO event_textbook_contents
                            (event_id, content, content_status, content_source, reference_count,
                             grade_scope, correction_note, content_hash, verified_at, verified_by)
                        VALUES (:event_id, :content, :content_status, :content_source, :reference_count,
                                :grade_scope, :correction_note, :content_hash, :verified_at, :verified_by)
                        """, params(change.before())));
    }

    private RollbackOutcome rollbackTextbookContentReference(RollbackChange change, Map<String, Object> identity) {
        MapSqlParameterSource identityParams = params(identity);
        Map<String, Object> current = queryOne("""
                SELECT event_id, textbook_ref_id, source_order
                FROM event_textbook_content_refs
                WHERE event_id = :event_id AND textbook_ref_id = :textbook_ref_id
                """, identity);
        return reverse(change, current,
                () -> jdbc.update("""
                        DELETE FROM event_textbook_content_refs
                        WHERE event_id = :event_id AND textbook_ref_id = :textbook_ref_id
                        """, identityParams),
                () -> jdbc.update("""
                        UPDATE event_textbook_content_refs SET source_order = :source_order
                        WHERE event_id = :event_id AND textbook_ref_id = :textbook_ref_id
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO event_textbook_content_refs (event_id, textbook_ref_id, source_order)
                        VALUES (:event_id, :textbook_ref_id, :source_order)
                        """, params(change.before())));
    }

    private RollbackOutcome rollbackSource(RollbackChange change, Map<String, Object> identity) {
        String dedupeKey = String.valueOf(identity.get("dedupe_key"));
        Map<String, Object> current = queryOne("""
                SELECT id, import_key, dedupe_key, source_type, title, canonical_uri,
                       external_id, language, is_internal
                FROM source_catalog WHERE dedupe_key = :dedupeKey
                """, Map.of("dedupeKey", dedupeKey));
        return reverse(change, current,
                () -> jdbc.update("DELETE FROM source_catalog WHERE dedupe_key = :dedupe_key", params(change.after())),
                () -> jdbc.update("""
                        UPDATE source_catalog
                        SET import_key = :import_key, source_type = :source_type, title = :title,
                            canonical_uri = :canonical_uri, external_id = :external_id,
                            language = :language, is_internal = :is_internal
                        WHERE dedupe_key = :dedupe_key
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO source_catalog
                            (id, import_key, dedupe_key, source_type, title, canonical_uri,
                             external_id, language, is_internal)
                        VALUES (:id, :import_key, :dedupe_key, :source_type, :title, :canonical_uri,
                                :external_id, :language, :is_internal)
                        """, params(change.before())));
    }

    private RollbackOutcome rollbackResearchSourceRelation(RollbackChange change, Map<String, Object> identity) {
        Map<String, Object> current = queryOne("""
                SELECT event_id, source_id, source_order, source_role, usage_note, verification_status
                FROM event_research_sources WHERE event_id = :event_id AND source_id = :source_id
                """, identity);
        return reverse(change, current,
                () -> jdbc.update("""
                        DELETE FROM event_research_sources WHERE event_id = :event_id AND source_id = :source_id
                        """, params(change.after())),
                () -> jdbc.update("""
                        UPDATE event_research_sources
                        SET source_order = :source_order, source_role = :source_role,
                            usage_note = :usage_note, verification_status = :verification_status
                        WHERE event_id = :event_id AND source_id = :source_id
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO event_research_sources
                            (event_id, source_id, source_order, source_role, usage_note, verification_status)
                        VALUES (:event_id, :source_id, :source_order, :source_role, :usage_note, :verification_status)
                        """, params(change.before())));
    }

    private RollbackOutcome rollbackExternalSourceRelation(RollbackChange change, Map<String, Object> identity) {
        Map<String, Object> current = queryOne("""
                SELECT event_id, source_id, source_order, match_type, is_primary,
                       verification_status, notes
                FROM event_external_sources
                WHERE event_id = :event_id AND source_id = :source_id AND match_type = :match_type
                """, identity);
        return reverse(change, current,
                () -> jdbc.update("""
                        DELETE FROM event_external_sources
                        WHERE event_id = :event_id AND source_id = :source_id AND match_type = :match_type
                        """, params(change.after())),
                () -> jdbc.update("""
                        UPDATE event_external_sources
                        SET source_order = :source_order, is_primary = :is_primary,
                            verification_status = :verification_status, notes = :notes
                        WHERE event_id = :event_id AND source_id = :source_id AND match_type = :match_type
                        """, params(change.before())),
                () -> jdbc.update("""
                        INSERT INTO event_external_sources
                            (event_id, source_id, source_order, match_type, is_primary,
                             verification_status, notes)
                        VALUES (:event_id, :source_id, :source_order, :match_type, :is_primary,
                                :verification_status, :notes)
                        """, params(change.before())));
    }

    private RollbackOutcome reverse(RollbackChange change, Map<String, Object> current,
                                    Runnable undoInsert, Runnable undoUpdate, Runnable undoDelete) {
        if (change.operation().equals("INSERT")) {
            if (current == null) {
                return RollbackOutcome.unchanged();
            }
            if (!valuesMatch(current, change.after())) {
                return RollbackOutcome.conflict("Current value no longer matches the imported INSERT after-image");
            }
            undoInsert.run();
            return RollbackOutcome.changedResult();
        }
        if (change.operation().equals("UPDATE")) {
            if (current != null && valuesMatch(current, change.before())) {
                return RollbackOutcome.unchanged();
            }
            if (current == null || !valuesMatch(current, change.after())) {
                return RollbackOutcome.conflict("Current value no longer matches the imported UPDATE after-image");
            }
            undoUpdate.run();
            return RollbackOutcome.changedResult();
        }
        if (change.operation().equals("DELETE")) {
            if (current != null && valuesMatch(current, change.before())) {
                return RollbackOutcome.unchanged();
            }
            if (current != null) {
                return RollbackOutcome.conflict("A different value now occupies the imported DELETE identity");
            }
            undoDelete.run();
            return RollbackOutcome.changedResult();
        }
        return RollbackOutcome.conflict("Unsupported audit operation: " + change.operation());
    }

    private void updateRollbackStatuses(List<RollbackStatusUpdate> updates) {
        if (updates.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("""
                UPDATE history_rag_import_changes
                SET status = :status, error_message = :message
                WHERE id = :id
                """, updates.stream().map(update -> new MapSqlParameterSource()
                .addValue("id", update.changeId()).addValue("status", update.status())
                .addValue("message", update.message())).toArray(MapSqlParameterSource[]::new));
    }

    private SectionReport preflightHistorical(List<HistoryRagPackageReader.HistoricalEvent> events) {
        Set<String> ids = events.stream().map(HistoryRagPackageReader.HistoricalEvent::eventId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> existing = existingStrings("historical_events", "id", ids);
        long missing = ids.size() - existing.size();
        long updates = 0;
        if (!existing.isEmpty()) {
            Map<String, Map<String, Object>> rows = queryMaps("""
                    SELECT id, card_summary, canonical_summary, detailed_narrative, significance
                    FROM historical_events WHERE id IN (:ids)
                    """, ids);
            for (var event : events) {
                Map<String, Object> row = rows.get(event.eventId());
                if (row != null && !historicalMatches(event, row)) {
                    updates++;
                }
            }
        }
        return new SectionReport(
                HISTORICAL_SECTION, missing, 0, updates, missing > 0,
                "missing=" + missing + ", updates=" + updates
        );
    }

    private SectionReport preflightTextbookContent(HistoryRagPackageReader.PackageData packageData) {
        Set<String> eventIds = packageData.textbookContents().stream()
                .map(HistoryRagPackageReader.TextbookContent::eventId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> existingEvents = existingStrings("historical_events", "id", eventIds);
        long missing = eventIds.size() - existingEvents.size();
        Set<Long> referenceIds = packageData.textbookContentRefs().stream()
                .map(HistoryRagPackageReader.TextbookContentRef::textbookRefId).collect(Collectors.toSet());
        long refMissing = referenceIds.size() - existingLongs("event_textbook_refs", "id", referenceIds).size();
        return new SectionReport(
                TEXTBOOK_CONTENT_SECTION, missing + refMissing, 0, 0,
                missing > 0 || refMissing > 0,
                "missingEvents=" + missing + ", missingRefs=" + refMissing
        );
    }

    private SectionReport preflightSources(HistoryRagPackageReader.PackageData packageData) {
        Set<String> eventIds = new LinkedHashSet<>();
        packageData.eventResearchSources().forEach(row -> eventIds.add(row.eventId()));
        packageData.eventExternalSources().forEach(row -> eventIds.add(row.eventId()));
        long missingEvents = eventIds.size() - existingStrings("historical_events", "id", eventIds).size();
        return new SectionReport(
                SOURCES_SECTION, missingEvents, 0, 0, missingEvents > 0,
                "missingEvents=" + missingEvents
        );
    }

    private int applyHistorical(List<HistoryRagPackageReader.HistoricalEvent> events, long runId) {
        Set<String> ids = events.stream().map(HistoryRagPackageReader.HistoricalEvent::eventId).collect(Collectors.toSet());
        Map<String, Map<String, Object>> current = queryMaps("""
                SELECT id, card_summary, canonical_summary, detailed_narrative, significance
                FROM historical_events WHERE id IN (:ids)
                """, ids);
        requireComplete(current.keySet(), ids, HISTORICAL_SECTION);
        int changed = 0;
        for (var event : events) {
            Map<String, Object> before = current.get(event.eventId());
            if (historicalMatches(event, before)) {
                continue;
            }
            MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("eventId", event.eventId())
                    .addValue("cardSummary", event.cardSummary())
                    .addValue("canonicalSummary", event.canonicalSummary())
                    .addValue("detailedNarrative", event.detailedNarrative())
                    .addValue("significance", event.significance());
            int affected = jdbc.update("""
                    UPDATE historical_events
                    SET card_summary = :cardSummary,
                        canonical_summary = :canonicalSummary,
                        detailed_narrative = :detailedNarrative,
                        significance = :significance
                    WHERE id = :eventId
                    """, params);
            if (affected != 1) {
                throw new ImportBlockedException("Historical event update affected " + affected + " rows: " + event.eventId());
            }
            Map<String, Object> after = historicalAfter(event);
            recordChange(runId, HISTORICAL_SECTION, event.eventId(), "UPDATE", before, after);
            changed++;
        }
        return changed;
    }

    private int applyTextbookReferences(HistoryRagPackageReader.PackageData packageData, long runId) {
        var report = textbookRefPreflight.run(packageData);
        if (report.applyBlocked()) {
            throw new ImportBlockedException("Textbook reference apply is blocked: missing="
                    + report.activeRefMissing() + ", conflicts=" + report.identityConflicts()
                    + ", unexpected=" + report.unexpectedCurrentRows());
        }
        int changed = 0;
        for (var row : report.rows()) {
            if (row.classification() != HistoryRagTextbookRefPreflight.Classification.REMOVE_WRONG_MAPPING
                    && row.classification() != HistoryRagTextbookRefPreflight.Classification.REMOVE_QUARANTINED) {
                continue;
            }
            var removal = row.removal();
            Map<String, Object> relation = queryOne("""
                    SELECT event_id, textbook_ref_id, source_order
                    FROM event_textbook_content_refs
                    WHERE event_id = :eventId AND textbook_ref_id = :refId
                    """, Map.of("eventId", removal.eventId(), "refId", removal.id()));
            if (relation != null) {
                int relationAffected = jdbc.update("""
                        DELETE FROM event_textbook_content_refs
                        WHERE event_id = :eventId AND textbook_ref_id = :refId
                        """, new MapSqlParameterSource()
                        .addValue("eventId", removal.eventId()).addValue("refId", removal.id()));
                if (relationAffected != 1) {
                    throw new ImportBlockedException("Textbook relation delete affected " + relationAffected
                            + " rows: " + removal.id());
                }
                recordChange(runId, TEXTBOOK_CONTENT_SECTION,
                        removal.eventId() + "\u0000" + removal.id(), "DELETE", relation, null);
                changed++;
            }
            Map<String, Object> before = new LinkedHashMap<>(textbookReferenceMap(row.database()));
            before.put("_audit_workbook_sha256", packageData.workbookSha256());
            before.put("_audit_removal_category", removal.removalCategory());
            before.put("_audit_reason", removal.auditReason());
            int affected = jdbc.update("""
                    DELETE FROM event_textbook_refs
                    WHERE id = :id AND event_id = :eventId
                    """, new MapSqlParameterSource("id", removal.id()).addValue("eventId", removal.eventId()));
            if (affected != 1) {
                throw new ImportBlockedException("Textbook reference delete affected " + affected
                        + " rows: " + removal.id());
            }
            recordChange(runId, TEXTBOOK_REFS_SECTION, String.valueOf(removal.id()), "DELETE", before, null);
            changed++;
        }
        for (var row : report.rows()) {
            if (row.classification() != HistoryRagTextbookRefPreflight.Classification.UPDATE_REQUIRED) {
                continue;
            }
            var before = textbookReferenceMap(row.database());
            var expected = row.activeReference();
            List<String> assignments = new ArrayList<>();
            MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("id", expected.id()).addValue("eventId", expected.eventId());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "excerpt", "excerpt", expected.excerpt());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "page_start", "pageStart", expected.pageStart());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "page_end", "pageEnd", expected.pageEnd());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "page_scope", "pageScope", expected.pageScope());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "page_number_basis", "pageNumberBasis", expected.pageNumberBasis());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "page_mapping_status", "pageMappingStatus", expected.pageMappingStatus());
            addTextbookReferenceAssignment(assignments, params, row.differingFields(),
                    "show_on_detail", "showOnDetail", expected.showOnDetail());
            int affected = jdbc.update("UPDATE event_textbook_refs SET " + String.join(", ", assignments)
                    + " WHERE id = :id AND event_id = :eventId", params);
            if (affected != 1) {
                throw new ImportBlockedException("Textbook reference update affected " + affected + " rows: " + expected.id());
            }
            recordChange(runId, TEXTBOOK_REFS_SECTION, String.valueOf(expected.id()), "UPDATE",
                    before, textbookReferenceMap(expected, row.database()));
            changed++;
        }
        return changed;
    }

    private void addTextbookReferenceAssignment(
            List<String> assignments,
            MapSqlParameterSource params,
            List<String> differingFields,
            String column,
            String parameter,
            Object value
    ) {
        if (differingFields.contains(column)) {
            assignments.add(column + " = :" + parameter);
            params.addValue(parameter, value);
        }
    }

    private int applyTextbookContent(HistoryRagPackageReader.PackageData packageData, long runId) {
        Set<String> eventIds = packageData.textbookContents().stream()
                .map(HistoryRagPackageReader.TextbookContent::eventId).collect(Collectors.toSet());
        requireComplete(existingStrings("historical_events", "id", eventIds), eventIds, TEXTBOOK_CONTENT_SECTION);
        Set<Long> refIds = packageData.textbookContentRefs().stream()
                .map(HistoryRagPackageReader.TextbookContentRef::textbookRefId).collect(Collectors.toSet());
        requireComplete(existingLongs("event_textbook_refs", "id", refIds), refIds, TEXTBOOK_CONTENT_SECTION);
        int changed = 0;
        Map<String, Map<String, Object>> current = queryMaps("""
                SELECT event_id, content, content_status, content_source, reference_count,
                       grade_scope, correction_note, content_hash, verified_at, verified_by
                FROM event_textbook_contents WHERE event_id IN (:ids)
                """, eventIds);
        for (var content : packageData.textbookContents()) {
            Map<String, Object> before = current.get(content.eventId());
            Map<String, Object> after = textbookContentMap(content);
            if (before == null) {
                jdbc.update("""
                        INSERT INTO event_textbook_contents
                            (event_id, content, content_status, content_source, reference_count,
                             grade_scope, correction_note, content_hash, verified_at, verified_by)
                        VALUES (:eventId, :content, :contentStatus, :contentSource, :referenceCount,
                                :gradeScope, :correctionNote, :contentHash, :verifiedAt, :verifiedBy)
                        """, textbookContentParams(content));
                recordChange(runId, TEXTBOOK_CONTENT_SECTION, content.eventId(), "INSERT", null, after);
                changed++;
            } else if (!valuesMatch(before, after)) {
                jdbc.update("""
                        UPDATE event_textbook_contents
                        SET content = :content, content_status = :contentStatus,
                            content_source = :contentSource, reference_count = :referenceCount,
                            grade_scope = :gradeScope, correction_note = :correctionNote,
                            content_hash = :contentHash, verified_at = :verifiedAt, verified_by = :verifiedBy
                        WHERE event_id = :eventId
                        """, textbookContentParams(content));
                recordChange(runId, TEXTBOOK_CONTENT_SECTION, content.eventId(), "UPDATE", before, after);
                changed++;
            }
        }
        changed += applyTextbookContentRefs(packageData, runId);
        return changed;
    }

    private int applyTextbookContentRefs(HistoryRagPackageReader.PackageData packageData, long runId) {
        Set<String> eventIds = packageData.textbookContents().stream()
                .map(HistoryRagPackageReader.TextbookContent::eventId).collect(Collectors.toSet());
        Map<String, Set<Long>> expected = new HashMap<>();
        packageData.textbookContentRefs().forEach(ref -> expected
                .computeIfAbsent(ref.eventId(), ignored -> new LinkedHashSet<>()).add(ref.textbookRefId()));
        List<Map<String, Object>> existing = queryMapsList("""
                SELECT event_id, textbook_ref_id, source_order
                FROM event_textbook_content_refs WHERE event_id IN (:ids)
                """, eventIds);
        Map<String, Map<String, Object>> existingByKey = existing.stream().collect(Collectors.toMap(
                row -> row.get("event_id") + "\u0000" + row.get("textbook_ref_id"),
                row -> row, (first, second) -> first, LinkedHashMap::new));
        Set<String> existingKeys = existingByKey.keySet();
        Set<String> expectedKeys = packageData.textbookContentRefs().stream()
                .map(ref -> ref.eventId() + "\u0000" + ref.textbookRefId()).collect(Collectors.toSet());
        int changed = 0;
        for (var ref : packageData.textbookContentRefs()) {
            String key = ref.eventId() + "\u0000" + ref.textbookRefId();
            if (existingKeys.contains(key)) {
                Map<String, Object> current = existingByKey.get(key);
                if (number(current.get("source_order")).intValue() != ref.sourceOrder()) {
                    int affected = jdbc.update("""
                            UPDATE event_textbook_content_refs SET source_order = :sourceOrder
                            WHERE event_id = :eventId AND textbook_ref_id = :refId
                            """, new MapSqlParameterSource()
                            .addValue("eventId", ref.eventId()).addValue("refId", ref.textbookRefId())
                            .addValue("sourceOrder", ref.sourceOrder()));
                    if (affected != 1) {
                        throw new ImportBlockedException("Textbook relation order update affected " + affected
                                + " rows: " + key);
                    }
                    recordChange(runId, TEXTBOOK_CONTENT_SECTION, key, "UPDATE", current,
                            Map.of("event_id", ref.eventId(), "textbook_ref_id", ref.textbookRefId(),
                                    "source_order", ref.sourceOrder()));
                    changed++;
                }
                continue;
            }
            jdbc.update("""
                    INSERT INTO event_textbook_content_refs (event_id, textbook_ref_id, source_order)
                    VALUES (:eventId, :refId, :sourceOrder)
                    """, new MapSqlParameterSource()
                    .addValue("eventId", ref.eventId())
                    .addValue("refId", ref.textbookRefId())
                    .addValue("sourceOrder", ref.sourceOrder()));
            recordChange(runId, TEXTBOOK_CONTENT_SECTION, key, "INSERT", null,
                    Map.of("event_id", ref.eventId(), "textbook_ref_id", ref.textbookRefId(), "source_order", ref.sourceOrder()));
            changed++;
        }
        for (Map<String, Object> row : existing) {
            String key = row.get("event_id") + "\u0000" + row.get("textbook_ref_id");
            if (expectedKeys.contains(key)) {
                continue;
            }
            jdbc.update("""
                    DELETE FROM event_textbook_content_refs
                    WHERE event_id = :eventId AND textbook_ref_id = :refId
                    """, new MapSqlParameterSource()
                    .addValue("eventId", row.get("event_id"))
                    .addValue("refId", row.get("textbook_ref_id")));
            recordChange(runId, TEXTBOOK_CONTENT_SECTION, key, "DELETE", row, null);
            changed++;
        }
        return changed;
    }

    private int applySources(HistoryRagPackageReader.PackageData packageData, long runId) {
        Set<String> eventIds = new LinkedHashSet<>();
        packageData.eventResearchSources().forEach(row -> eventIds.add(row.eventId()));
        packageData.eventExternalSources().forEach(row -> eventIds.add(row.eventId()));
        requireComplete(existingStrings("historical_events", "id", eventIds), eventIds, SOURCES_SECTION);

        List<SourceInput> sourceInputs = new ArrayList<>();
        packageData.researchSources().forEach(source -> sourceInputs.add(SourceInput.research(source)));
        packageData.eventExternalSources().stream()
                .map(source -> SourceInput.external(source))
                .forEach(sourceInputs::add);
        Map<String, SourceInput> uniqueSources = sourceInputs.stream().collect(Collectors.toMap(
                SourceInput::dedupeKey, source -> source, (first, second) -> {
                    if (!first.sameIdentity(second)) {
                        throw new ImportBlockedException("Conflicting source dedupe key: " + first.dedupeKey());
                    }
                    return first;
                }, LinkedHashMap::new));
        Map<String, Long> sourceIds = new HashMap<>();
        Map<String, Long> sourceIdsByDedupeKey = new HashMap<>();
        Set<String> dedupeKeys = uniqueSources.keySet();
        Map<String, Map<String, Object>> existingByDedupe = queryMapsByKey("""
                SELECT id, import_key, dedupe_key, source_type, title, canonical_uri,
                       external_id, language, is_internal
                FROM source_catalog WHERE dedupe_key IN (:dedupeKeys)
                """, dedupeKeys, "dedupe_key");
        List<SourceInput> missingSources = uniqueSources.values().stream()
                .filter(source -> !existingByDedupe.containsKey(source.dedupeKey()))
                .toList();
        if (!missingSources.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO source_catalog
                        (import_key, dedupe_key, source_type, title, canonical_uri,
                         external_id, language, is_internal)
                    VALUES (:importKey, :dedupeKey, :sourceType, :title, :canonicalUri,
                            :externalId, :language, :internal)
                    """, missingSources.stream().map(this::sourceParams).toArray(MapSqlParameterSource[]::new));
        }
        Map<String, Map<String, Object>> afterInsertByDedupe = queryMapsByKey("""
                SELECT id, import_key, dedupe_key, source_type, title, canonical_uri,
                       external_id, language, is_internal
                FROM source_catalog WHERE dedupe_key IN (:dedupeKeys)
                """, dedupeKeys, "dedupe_key");
        int changed = 0;
        for (SourceInput source : uniqueSources.values()) {
            Map<String, Object> before = existingByDedupe.get(source.dedupeKey());
            Map<String, Object> after = sourceMap(source);
            Map<String, Object> stored = afterInsertByDedupe.get(source.dedupeKey());
            sourceIdsByDedupeKey.put(source.dedupeKey(), ((Number) stored.get("id")).longValue());
            if (before == null) {
                recordChange(runId, SOURCES_SECTION, source.dedupeKey(), "INSERT", null, after);
                changed++;
            } else if (!valuesMatch(before, after)) {
                jdbc.update("""
                        UPDATE source_catalog
                        SET import_key = :importKey, source_type = :sourceType, title = :title,
                            canonical_uri = :canonicalUri, external_id = :externalId,
                            language = :language, is_internal = :internal
                        WHERE dedupe_key = :dedupeKey
                        """, sourceParams(source));
                recordChange(runId, SOURCES_SECTION, source.dedupeKey(), "UPDATE", before, after);
                changed++;
            }
        }
        packageData.researchSources().forEach(source -> sourceIds.put(
                source.importKey(), sourceIdsByDedupeKey.get(source.dedupeKey())));
        packageData.eventExternalSources().forEach(source -> sourceIds.put(
                source.sourceImportKey(), sourceIdsByDedupeKey.get(source.dedupeKey())));
        changed += applyResearchMappings(packageData.eventResearchSources(), sourceIds, runId);
        changed += applyExternalMappings(packageData.eventExternalSources(), sourceIds, runId);
        return changed;
    }

    private int applyResearchMappings(List<HistoryRagPackageReader.EventResearchSource> mappings,
                                       Map<String, Long> sourceIds, long runId) {
        Map<String, ResolvedResearchMapping> resolvedMappings = new LinkedHashMap<>();
        for (var mapping : mappings) {
            Long sourceId = sourceIds.get(mapping.sourceImportKey());
            if (sourceId == null) {
                throw new ImportBlockedException("Missing research source mapping: " + mapping.sourceImportKey());
            }
            String key = mapping.eventId() + "\u0000" + sourceId;
            ResolvedResearchMapping candidate = new ResolvedResearchMapping(key, sourceId, mapping);
            resolvedMappings.merge(key, candidate, (first, second) ->
                    second.mapping().sourceOrder() < first.mapping().sourceOrder() ? second : first);
        }
        Set<String> eventIds = resolvedMappings.values().stream().map(value -> value.mapping().eventId())
                .collect(Collectors.toSet());
        Set<Long> ids = resolvedMappings.values().stream().map(ResolvedResearchMapping::sourceId)
                .collect(Collectors.toSet());
        Map<String, Map<String, Object>> current = queryRelationMaps("""
                SELECT event_id, source_id, source_order, source_role, usage_note, verification_status
                FROM event_research_sources
                WHERE event_id IN (:eventIds) AND source_id IN (:sourceIds)
                """, eventIds, ids, "event_id", "source_id");
        List<MapSqlParameterSource> inserts = new ArrayList<>();
        List<MapSqlParameterSource> updates = new ArrayList<>();
        List<AuditValue> audit = new ArrayList<>();
        for (var resolved : resolvedMappings.values()) {
            var mapping = resolved.mapping();
            Long sourceId = resolved.sourceId();
            String key = resolved.key();
            Map<String, Object> before = current.get(key);
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("event_id", mapping.eventId()); after.put("source_id", sourceId);
            after.put("source_order", mapping.sourceOrder()); after.put("source_role", mapping.sourceRole());
            after.put("usage_note", mapping.usageNote()); after.put("verification_status", mapping.verificationStatus());
            MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("eventId", mapping.eventId()).addValue("sourceId", sourceId)
                    .addValue("sourceOrder", mapping.sourceOrder()).addValue("sourceRole", mapping.sourceRole())
                    .addValue("usageNote", mapping.usageNote()).addValue("verificationStatus", mapping.verificationStatus());
            if (before == null) {
                inserts.add(params);
                audit.add(new AuditValue(key, "INSERT", null, after));
            } else if (!valuesMatch(before, after)) {
                updates.add(params);
                audit.add(new AuditValue(key, "UPDATE", before, after));
            }
        }
        if (!inserts.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO event_research_sources
                        (event_id, source_id, source_order, source_role, usage_note, verification_status)
                    VALUES (:eventId, :sourceId, :sourceOrder, :sourceRole, :usageNote, :verificationStatus)
                    """, inserts.toArray(MapSqlParameterSource[]::new));
        }
        if (!updates.isEmpty()) {
            jdbc.batchUpdate("""
                    UPDATE event_research_sources
                    SET source_order = :sourceOrder, source_role = :sourceRole,
                        usage_note = :usageNote, verification_status = :verificationStatus
                    WHERE event_id = :eventId AND source_id = :sourceId
                    """, updates.toArray(MapSqlParameterSource[]::new));
        }
        audit.forEach(value -> recordChange(runId, SOURCES_SECTION, value.recordKey(), value.operation(),
                value.before(), value.after()));
        return audit.size();
    }

    private int applyExternalMappings(List<HistoryRagPackageReader.EventExternalSource> mappings,
                                       Map<String, Long> sourceIds, long runId) {
        Map<String, ResolvedExternalMapping> resolvedMappings = new LinkedHashMap<>();
        for (var mapping : mappings) {
            Long sourceId = sourceIds.get(mapping.sourceImportKey());
            if (sourceId == null) {
                throw new ImportBlockedException("Missing external source mapping: " + mapping.sourceImportKey());
            }
            String key = mapping.eventId() + "\u0000" + sourceId + "\u0000" + mapping.matchType();
            ResolvedExternalMapping candidate = new ResolvedExternalMapping(key, sourceId, mapping);
            resolvedMappings.merge(key, candidate, (first, second) ->
                    second.mapping().sourceOrder() < first.mapping().sourceOrder() ? second : first);
        }
        Set<String> eventIds = resolvedMappings.values().stream().map(value -> value.mapping().eventId())
                .collect(Collectors.toSet());
        Set<Long> ids = resolvedMappings.values().stream().map(ResolvedExternalMapping::sourceId)
                .collect(Collectors.toSet());
        Set<String> matchTypes = resolvedMappings.values().stream().map(value -> value.mapping().matchType())
                .collect(Collectors.toSet());
        Map<String, Map<String, Object>> current = queryExternalRelationMaps(eventIds, ids, matchTypes);
        List<MapSqlParameterSource> inserts = new ArrayList<>();
        List<MapSqlParameterSource> updates = new ArrayList<>();
        List<AuditValue> audit = new ArrayList<>();
        for (var resolved : resolvedMappings.values()) {
            var mapping = resolved.mapping();
            Long sourceId = resolved.sourceId();
            String key = resolved.key();
            Map<String, Object> before = current.get(key);
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("event_id", mapping.eventId()); after.put("source_id", sourceId);
            after.put("source_order", mapping.sourceOrder()); after.put("match_type", mapping.matchType());
            after.put("is_primary", mapping.primary()); after.put("verification_status", mapping.verificationStatus());
            after.put("notes", mapping.notes());
            MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("eventId", mapping.eventId()).addValue("sourceId", sourceId)
                    .addValue("sourceOrder", mapping.sourceOrder()).addValue("matchType", mapping.matchType())
                    .addValue("primary", mapping.primary()).addValue("verificationStatus", mapping.verificationStatus())
                    .addValue("notes", mapping.notes());
            if (before == null) {
                inserts.add(params);
                audit.add(new AuditValue(key, "INSERT", null, after));
            } else if (!valuesMatch(before, after)) {
                updates.add(params);
                audit.add(new AuditValue(key, "UPDATE", before, after));
            }
        }
        if (!inserts.isEmpty()) {
            jdbc.batchUpdate("""
                    INSERT INTO event_external_sources
                        (event_id, source_id, source_order, match_type, is_primary, verification_status, notes)
                    VALUES (:eventId, :sourceId, :sourceOrder, :matchType, :primary, :verificationStatus, :notes)
                    """, inserts.toArray(MapSqlParameterSource[]::new));
        }
        if (!updates.isEmpty()) {
            jdbc.batchUpdate("""
                    UPDATE event_external_sources
                    SET source_order = :sourceOrder, is_primary = :primary,
                        verification_status = :verificationStatus, notes = :notes
                    WHERE event_id = :eventId AND source_id = :sourceId AND match_type = :matchType
                    """, updates.toArray(MapSqlParameterSource[]::new));
        }
        audit.forEach(value -> recordChange(runId, SOURCES_SECTION, value.recordKey(), value.operation(),
                value.before(), value.after()));
        return audit.size();
    }

    private long createRun(HistoryRagPackageReader.PackageData data, String section) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
                INSERT INTO data_import_runs
                    (source_name, source_path, source_hash, import_type, event_count,
                     created_count, updated_count, skipped_count, failed_count, status)
                VALUES (:sourceName, :sourcePath, :sourceHash, 'rag_seed', :eventCount,
                        0, 0, 0, 0, 'running')
                """, new MapSqlParameterSource()
                .addValue("sourceName", "history-rag-v1:" + section)
                .addValue("sourcePath", data.directory().toString())
                .addValue("sourceHash", data.packageSha256())
                .addValue("eventCount", data.historicalEvents().size()), keyHolder, new String[]{"id"});
        if (keyHolder.getKey() == null) {
            throw new IllegalStateException("Could not create History RAG import run");
        }
        return keyHolder.getKey().longValue();
    }

    private void finishRun(long runId, String status, int changed, String error) {
        jdbc.update("""
                UPDATE data_import_runs
                SET created_count = :changed,
                    updated_count = 0,
                    status = :status,
                    finished_at = CURRENT_TIMESTAMP,
                    error_log = :error
                WHERE id = :runId
                """, new MapSqlParameterSource()
                .addValue("runId", runId).addValue("changed", changed)
                .addValue("status", status).addValue("error", error));
    }

    private void recordChange(long runId, String section, String recordKey, String operation,
                              Map<String, Object> before, Map<String, Object> after) {
        List<AuditRow> rows = pendingAuditRows.get();
        if (rows == null) {
            throw new IllegalStateException("History RAG audit buffer is not active");
        }
        rows.add(new AuditRow(runId, section, recordKey, operation, json(before), json(after)));
    }

    private void flushAuditRows() {
        List<AuditRow> rows = pendingAuditRows.get();
        if (rows == null || rows.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("""
                INSERT INTO history_rag_import_changes
                    (run_id, section, record_key, operation, before_json, after_json, status)
                VALUES (:runId, :section, :recordKey, :operation, :beforeJson, :afterJson, 'APPLIED')
                """, rows.stream().map(row -> new MapSqlParameterSource()
                        .addValue("runId", row.runId()).addValue("section", row.section())
                        .addValue("recordKey", row.recordKey()).addValue("operation", row.operation())
                        .addValue("beforeJson", row.beforeJson()).addValue("afterJson", row.afterJson()))
                .toArray(MapSqlParameterSource[]::new));
    }

    private MapSqlParameterSource textbookContentParams(HistoryRagPackageReader.TextbookContent content) {
        return new MapSqlParameterSource()
                .addValue("eventId", content.eventId()).addValue("content", content.content())
                .addValue("contentStatus", content.contentStatus()).addValue("contentSource", content.contentSource())
                .addValue("referenceCount", content.referenceCount()).addValue("gradeScope", content.gradeScope())
                .addValue("correctionNote", content.correctionNote()).addValue("contentHash", content.contentHash())
                .addValue("verifiedAt", timestamp(content.verifiedAt())).addValue("verifiedBy", content.verifiedBy());
    }

    private Map<String, Object> textbookContentMap(HistoryRagPackageReader.TextbookContent content) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("event_id", content.eventId()); result.put("content", content.content());
        result.put("content_status", content.contentStatus()); result.put("content_source", content.contentSource());
        result.put("reference_count", content.referenceCount()); result.put("grade_scope", content.gradeScope());
        result.put("correction_note", content.correctionNote()); result.put("content_hash", content.contentHash());
        result.put("verified_at", timestamp(content.verifiedAt())); result.put("verified_by", content.verifiedBy());
        return result;
    }

    private Map<String, Object> historicalAfter(HistoryRagPackageReader.HistoricalEvent event) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", event.eventId()); result.put("card_summary", event.cardSummary());
        result.put("canonical_summary", event.canonicalSummary()); result.put("detailed_narrative", event.detailedNarrative());
        result.put("significance", event.significance());
        return result;
    }

    private boolean historicalMatches(HistoryRagPackageReader.HistoricalEvent event, Map<String, Object> row) {
        return Objects.equals(event.cardSummary(), row.get("card_summary"))
                && Objects.equals(event.canonicalSummary(), row.get("canonical_summary"))
                && Objects.equals(event.detailedNarrative(), row.get("detailed_narrative"))
                && Objects.equals(event.significance(), row.get("significance"));
    }

    private Map<String, Object> textbookReferenceMap(HistoryRagTextbookRefPreflight.DatabaseReference row) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", row.id()); result.put("event_id", row.eventId()); result.put("grade", row.grade());
        result.put("book", row.book()); result.put("theme", row.theme()); result.put("lesson", row.lesson());
        result.put("url", row.url());
        result.put("source_key", row.sourceKey()); result.put("excerpt", row.excerpt());
        result.put("page_start", row.pageStart()); result.put("page_end", row.pageEnd());
        result.put("page_scope", row.pageScope()); result.put("page_number_basis", row.pageNumberBasis());
        result.put("page_mapping_status", row.pageMappingStatus()); result.put("show_on_detail", row.showOnDetail());
        result.put("created_at", row.createdAt());
        return result;
    }

    private Map<String, Object> textbookReferenceMap(HistoryRagPackageReader.TextbookReference workbook,
                                                       HistoryRagTextbookRefPreflight.DatabaseReference before) {
        Map<String, Object> result = textbookReferenceMap(before);
        // created_at is an immutable audit field; the UPDATE path never changes it.
        // Excluding it from the after-image avoids timezone/driver representation
        // differences turning a valid rollback into a false conflict.
        result.remove("created_at");
        result.put("excerpt", workbook.excerpt()); result.put("page_start", workbook.pageStart());
        result.put("page_end", workbook.pageEnd()); result.put("page_scope", workbook.pageScope());
        result.put("page_number_basis", workbook.pageNumberBasis());
        result.put("page_mapping_status", workbook.pageMappingStatus());
        result.put("show_on_detail", workbook.showOnDetail());
        return result;
    }

    private boolean valuesMatch(Map<String, Object> before, Map<String, Object> after) {
        for (String key : after.keySet()) {
            if (key.startsWith("_audit_")) {
                continue;
            }
            if (!Objects.equals(normalize(before.get(key)), normalize(after.get(key)))) {
                return false;
            }
        }
        return true;
    }

    private Object normalize(Object value) {
        if (value instanceof java.sql.Timestamp timestamp) {
            return BigDecimal.valueOf(timestamp.getTime());
        }
        if (value instanceof java.sql.Date date) {
            return BigDecimal.valueOf(date.getTime());
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString()).stripTrailingZeros();
        }
        return value;
    }

    private Timestamp timestamp(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Timestamp.valueOf(LocalDateTime.parse(value.replace(" ", "T")));
    }

    private Map<String, Object> queryOne(String sql, Map<String, ?> params) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, new MapSqlParameterSource(params));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private MapSqlParameterSource params(Map<String, Object> values) {
        MapSqlParameterSource parameters = new MapSqlParameterSource();
        values.forEach((key, value) -> parameters.addValue(key,
                key.equals("created_at") || key.equals("verified_at")
                        ? auditTimestamp(value)
                        : value));
        return parameters;
    }

    private Timestamp auditTimestamp(Object value) {
        if (value == null || value instanceof Timestamp) {
            return (Timestamp) value;
        }
        if (value instanceof Number number) {
            return new Timestamp(number.longValue());
        }
        if (value instanceof String text) {
            if (text.isBlank()) {
                return null;
            }
            if (text.matches("\\d+")) {
                return new Timestamp(Long.parseLong(text));
            }
            return Timestamp.valueOf(LocalDateTime.parse(text.replace(" ", "T")));
        }
        throw new ImportBlockedException("Expected timestamp audit value, got: " + value);
    }

    private Number number(Object value) {
        if (value instanceof Number number) {
            return number;
        }
        throw new ImportBlockedException("Expected numeric audit identity, got: " + value);
    }

    private Map<String, Object> parseJson(String value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.readValue(value, new TypeReference<>() { });
        } catch (JsonProcessingException ex) {
            throw new ImportBlockedException("Could not parse History RAG audit JSON: " + ex.getMessage());
        }
    }

    private Map<String, Map<String, Object>> queryMaps(String sql, Set<?> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        List<Map<String, Object>> rows = queryMapsList(sql, ids);
        Map<String, Map<String, Object>> result = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object id = row.get("id");
            if (id == null) {
                id = row.get("event_id");
            }
            result.put(String.valueOf(id), row);
        }
        return result;
    }

    private Map<String, Map<String, Object>> queryMapsByKey(String sql, Set<?> ids, String key) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return jdbc.queryForList(sql, new MapSqlParameterSource("dedupeKeys", ids)).stream()
                .collect(Collectors.toMap(row -> String.valueOf(row.get(key)), row -> row,
                        (first, second) -> first, LinkedHashMap::new));
    }

    private Map<String, Map<String, Object>> queryRelationMaps(
            String sql, Set<String> eventIds, Set<Long> sourceIds, String eventKey, String sourceKey) {
        if (eventIds.isEmpty() || sourceIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.queryForList(sql, new MapSqlParameterSource()
                        .addValue("eventIds", eventIds).addValue("sourceIds", sourceIds)).stream()
                .collect(Collectors.toMap(
                        row -> row.get(eventKey) + "\u0000" + row.get(sourceKey),
                        row -> row, (first, second) -> first, LinkedHashMap::new));
    }

    private Map<String, Map<String, Object>> queryExternalRelationMaps(
            Set<String> eventIds, Set<Long> sourceIds, Set<String> matchTypes) {
        if (eventIds.isEmpty() || sourceIds.isEmpty() || matchTypes.isEmpty()) {
            return Map.of();
        }
        return jdbc.queryForList("""
                SELECT event_id, source_id, source_order, match_type, is_primary,
                       verification_status, notes
                FROM event_external_sources
                WHERE event_id IN (:eventIds) AND source_id IN (:sourceIds)
                  AND match_type IN (:matchTypes)
                """, new MapSqlParameterSource()
                .addValue("eventIds", eventIds).addValue("sourceIds", sourceIds)
                .addValue("matchTypes", matchTypes)).stream()
                .collect(Collectors.toMap(
                        row -> row.get("event_id") + "\u0000" + row.get("source_id")
                                + "\u0000" + row.get("match_type"),
                        row -> row, (first, second) -> first, LinkedHashMap::new));
    }

    private List<Map<String, Object>> queryMapsList(String sql, Set<?> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.queryForList(sql, new MapSqlParameterSource("ids", ids));
    }

    private Set<String> existingStrings(String table, String column, Set<String> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        String sql = "SELECT " + column + " FROM " + table + " WHERE " + column + " IN (:ids)";
        return new HashSet<>(jdbc.queryForList(sql, new MapSqlParameterSource("ids", ids), String.class));
    }

    private Set<Long> existingLongs(String table, String column, Set<Long> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        String sql = "SELECT " + column + " FROM " + table + " WHERE " + column + " IN (:ids)";
        return new HashSet<>(jdbc.queryForList(sql, new MapSqlParameterSource("ids", ids), Long.class));
    }

    private void requireComplete(Set<?> actual, Set<?> expected, String section) {
        if (actual.size() != expected.size()) {
            Set<Object> missing = new LinkedHashSet<>(expected);
            missing.removeAll(actual);
            throw new ImportBlockedException("" + section + " has missing baseline records: "
                    + missing.stream().limit(10).toList());
        }
    }

    private String json(Map<String, Object> value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize import audit value", ex);
        }
    }

    private Map<String, Object> sourceMap(SourceInput source) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("import_key", source.importKey()); result.put("dedupe_key", source.dedupeKey());
        result.put("source_type", source.sourceType()); result.put("title", source.title());
        result.put("canonical_uri", source.canonicalUri()); result.put("external_id", source.externalId());
        result.put("language", source.language()); result.put("is_internal", source.internal());
        return result;
    }

    private MapSqlParameterSource sourceParams(SourceInput source) {
        return new MapSqlParameterSource()
                .addValue("importKey", source.importKey()).addValue("dedupeKey", source.dedupeKey())
                .addValue("sourceType", source.sourceType()).addValue("title", source.title())
                .addValue("canonicalUri", source.canonicalUri()).addValue("externalId", source.externalId())
                .addValue("language", source.language()).addValue("internal", source.internal());
    }

    private record SourceInput(String importKey, String dedupeKey, String sourceType, String title,
                               String canonicalUri, String externalId, String language, boolean internal) {
        static SourceInput research(HistoryRagPackageReader.ResearchSource source) {
            return new SourceInput(source.importKey(), source.dedupeKey(), source.sourceType(), source.title(),
                    source.canonicalUri(), source.externalId(), source.language(), source.internal());
        }

        static SourceInput external(HistoryRagPackageReader.EventExternalSource source) {
            return new SourceInput(source.dedupeKey(), source.dedupeKey(), source.sourceType(), source.title(),
                    source.canonicalUri(), source.externalId(), source.language(), source.internal());
        }

        boolean sameIdentity(SourceInput other) {
            return Objects.equals(dedupeKey, other.dedupeKey)
                    && Objects.equals(sourceType, other.sourceType)
                    && Objects.equals(canonicalUri, other.canonicalUri)
                    && Objects.equals(externalId, other.externalId);
        }
    }

    private record AuditValue(String recordKey, String operation,
                              Map<String, Object> before, Map<String, Object> after) {
    }

    private record AuditRow(long runId, String section, String recordKey, String operation,
                            String beforeJson, String afterJson) {
    }

    private record RollbackChange(long id, String section, String operation,
                                  Map<String, Object> before, Map<String, Object> after) {
    }

    private record RollbackStatusUpdate(long changeId, String status, String message) {
    }

    private record RollbackOutcome(boolean changed, boolean conflict, String message) {
        static RollbackOutcome changedResult() {
            return new RollbackOutcome(true, false, null);
        }

        static RollbackOutcome unchanged() {
            return new RollbackOutcome(false, false, null);
        }

        static RollbackOutcome conflict(String message) {
            return new RollbackOutcome(false, true, message);
        }
    }

    private record ResolvedResearchMapping(String key, long sourceId,
                                           HistoryRagPackageReader.EventResearchSource mapping) {
    }

    private record ResolvedExternalMapping(String key, long sourceId,
                                           HistoryRagPackageReader.EventExternalSource mapping) {
    }

    public record SectionReport(String section, long missing, long conflicts, long updates,
                                boolean blocked, String detail) {
    }

    public record ImportPreflight(List<SectionReport> sections) {
        public boolean blocked() {
            return sections.stream().anyMatch(SectionReport::blocked);
        }

        public String summary() {
            return sections.stream().map(report -> report.section() + "(" + report.detail() + ")")
                    .collect(Collectors.joining("; "));
        }
    }

    public record ApplyResult(long runId, int changed, String section) {
    }

    public record RollbackResult(long runId, int changed, int conflicts) {
    }

    public static class ImportBlockedException extends RuntimeException {
        public ImportBlockedException(String message) {
            super(message);
        }
    }
}
