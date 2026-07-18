package com.lichsuvn.backend.importer;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class HistoryRagTextbookRefPreflight {

    private static final Set<String> REQUIRED_COLUMNS = Set.of(
            "id", "event_id", "grade", "book", "theme", "lesson", "url", "source_key",
            "excerpt", "page_start", "page_end", "page_scope", "page_number_basis",
            "page_mapping_status", "show_on_detail", "created_at"
    );

    private final NamedParameterJdbcTemplate jdbc;

    public HistoryRagTextbookRefPreflight(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public PreflightReport run(HistoryRagPackageReader.PackageData packageData) {
        ensureRequiredSchema();
        List<DatabaseReference> databaseReferences = jdbc.query("""
                SELECT id, event_id, grade, book, theme, lesson, url, source_key,
                       excerpt, page_start, page_end, page_scope, page_number_basis,
                       page_mapping_status, show_on_detail, created_at
                FROM event_textbook_refs
                ORDER BY id
                """, new MapSqlParameterSource(), (rs, rowNum) -> new DatabaseReference(
                rs.getLong("id"),
                rs.getString("event_id"),
                rs.getInt("grade"),
                rs.getString("book"),
                rs.getString("theme"),
                rs.getString("lesson"),
                rs.getString("url"),
                rs.getString("source_key"),
                rs.getString("excerpt"),
                rs.getObject("page_start", Integer.class),
                rs.getObject("page_end", Integer.class),
                rs.getString("page_scope"),
                rs.getString("page_number_basis"),
                rs.getString("page_mapping_status"),
                rs.getBoolean("show_on_detail"),
                rs.getTimestamp("created_at")
        ));
        return compare(packageData.textbookReferences(), packageData.textbookReferenceRemovals(), databaseReferences);
    }

    private void ensureRequiredSchema() {
        List<String> columns = jdbc.getJdbcTemplate().queryForList("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'event_textbook_refs'
                """, String.class);
        Set<String> missing = REQUIRED_COLUMNS.stream()
                .filter(column -> !columns.contains(column))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!missing.isEmpty()) {
            throw new SchemaNotReadyException(
                    "History RAG schema is not ready; missing event_textbook_refs columns: " + missing);
        }
    }

    PreflightReport compare(
            List<HistoryRagPackageReader.TextbookReference> activeReferences,
            List<HistoryRagPackageReader.TextbookReferenceRemoval> removals,
            List<DatabaseReference> databaseReferences
    ) {
        Map<Long, DatabaseReference> databaseById = databaseReferences.stream().collect(Collectors.toMap(
                DatabaseReference::id, reference -> reference, (first, second) -> first, LinkedHashMap::new));
        Set<Long> expectedIds = new LinkedHashSet<>();
        activeReferences.forEach(reference -> expectedIds.add(reference.id()));
        removals.forEach(removal -> expectedIds.add(removal.id()));

        List<RowComparison> rows = new ArrayList<>();
        activeReferences.forEach(reference -> rows.add(compareActive(reference, databaseById.get(reference.id()))));
        removals.forEach(removal -> rows.add(compareRemoval(removal, databaseById.get(removal.id()))));
        databaseReferences.stream()
                .filter(reference -> !expectedIds.contains(reference.id()))
                .forEach(reference -> rows.add(RowComparison.unexpected(reference)));

        return new PreflightReport(
                activeReferences.size(),
                databaseReferences.size(),
                count(rows, Classification.KEEP_UNCHANGED),
                count(rows, Classification.UPDATE_REQUIRED),
                count(rows, Classification.REMOVE_WRONG_MAPPING),
                count(rows, Classification.REMOVE_QUARANTINED),
                count(rows, Classification.ALREADY_ABSENT),
                count(rows, Classification.ACTIVE_REF_MISSING),
                count(rows, Classification.IDENTITY_CONFLICT),
                count(rows, Classification.UNEXPECTED_CURRENT_ROW),
                rows.stream().filter(row -> row.classification() == Classification.UPDATE_REQUIRED
                        && row.differingFields().contains("show_on_detail")).count(),
                List.copyOf(rows)
        );
    }

    private RowComparison compareActive(
            HistoryRagPackageReader.TextbookReference expected,
            DatabaseReference current
    ) {
        if (current == null) {
            return RowComparison.active(expected, null, Classification.ACTIVE_REF_MISSING, List.of());
        }
        List<String> identityConflicts = identityDifferences(
                expected.eventId(), expected.grade(), expected.book(), expected.theme(), expected.lesson(),
                expected.url(), expected.sourceKey(), current);
        if (!identityConflicts.isEmpty()) {
            return RowComparison.active(expected, current, Classification.IDENTITY_CONFLICT, identityConflicts);
        }
        List<String> differences = new ArrayList<>();
        difference(differences, "excerpt", expected.excerpt(), current.excerpt());
        difference(differences, "page_start", expected.pageStart(), current.pageStart());
        difference(differences, "page_end", expected.pageEnd(), current.pageEnd());
        difference(differences, "page_scope", expected.pageScope(), current.pageScope());
        difference(differences, "page_number_basis", expected.pageNumberBasis(), current.pageNumberBasis());
        difference(differences, "page_mapping_status", expected.pageMappingStatus(), current.pageMappingStatus());
        difference(differences, "show_on_detail", expected.showOnDetail(), current.showOnDetail());
        return RowComparison.active(expected, current,
                differences.isEmpty() ? Classification.KEEP_UNCHANGED : Classification.UPDATE_REQUIRED,
                differences);
    }

    private RowComparison compareRemoval(
            HistoryRagPackageReader.TextbookReferenceRemoval expected,
            DatabaseReference current
    ) {
        if (current == null) {
            return RowComparison.removal(expected, null, Classification.ALREADY_ABSENT, List.of());
        }
        List<String> identityConflicts = identityDifferences(
                expected.eventId(), expected.grade(), expected.book(), expected.theme(), expected.lesson(),
                expected.url(), expected.sourceKey(), current);
        if (!identityConflicts.isEmpty()) {
            return RowComparison.removal(expected, current, Classification.IDENTITY_CONFLICT, identityConflicts);
        }
        Classification classification = switch (expected.removalCategory()) {
            case "REMOVE_WRONG_MAPPING" -> Classification.REMOVE_WRONG_MAPPING;
            case "REMOVE_QUARANTINED" -> Classification.REMOVE_QUARANTINED;
            default -> throw new IllegalArgumentException("Unsupported textbook removal category: "
                    + expected.removalCategory());
        };
        return RowComparison.removal(expected, current, classification, List.of());
    }

    private List<String> identityDifferences(
            String eventId, int grade, String book, String theme, String lesson, String url, String sourceKey,
            DatabaseReference current
    ) {
        List<String> differences = new ArrayList<>();
        difference(differences, "event_id", eventId, current.eventId());
        difference(differences, "grade", grade, current.grade());
        difference(differences, "book", book, current.book());
        difference(differences, "theme", theme, current.theme());
        difference(differences, "lesson", lesson, current.lesson());
        difference(differences, "url", url, current.url());
        difference(differences, "source_key", sourceKey, current.sourceKey());
        return differences;
    }

    private void difference(List<String> differences, String field, Object expected, Object current) {
        if (!Objects.equals(expected, current)) {
            differences.add(field);
        }
    }

    private long count(List<RowComparison> rows, Classification classification) {
        return rows.stream().filter(row -> row.classification() == classification).count();
    }

    public enum Classification {
        KEEP_UNCHANGED,
        UPDATE_REQUIRED,
        REMOVE_WRONG_MAPPING,
        REMOVE_QUARANTINED,
        ALREADY_ABSENT,
        ACTIVE_REF_MISSING,
        IDENTITY_CONFLICT,
        UNEXPECTED_CURRENT_ROW
    }

    public record DatabaseReference(
            long id,
            String eventId,
            int grade,
            String book,
            String theme,
            String lesson,
            String url,
            String sourceKey,
            String excerpt,
            Integer pageStart,
            Integer pageEnd,
            String pageScope,
            String pageNumberBasis,
            String pageMappingStatus,
            boolean showOnDetail,
            Timestamp createdAt
    ) {
    }

    public record RowComparison(
            HistoryRagPackageReader.TextbookReference activeReference,
            HistoryRagPackageReader.TextbookReferenceRemoval removal,
            DatabaseReference database,
            Classification classification,
            List<String> differingFields
    ) {
        static RowComparison active(
                HistoryRagPackageReader.TextbookReference activeReference,
                DatabaseReference database,
                Classification classification,
                List<String> differingFields
        ) {
            return new RowComparison(activeReference, null, database, classification, List.copyOf(differingFields));
        }

        static RowComparison removal(
                HistoryRagPackageReader.TextbookReferenceRemoval removal,
                DatabaseReference database,
                Classification classification,
                List<String> differingFields
        ) {
            return new RowComparison(null, removal, database, classification, List.copyOf(differingFields));
        }

        static RowComparison unexpected(DatabaseReference database) {
            return new RowComparison(null, null, database, Classification.UNEXPECTED_CURRENT_ROW, List.of());
        }
    }

    public record PreflightReport(
            long workbookActiveReferences,
            long currentDatabaseReferences,
            long keepUnchanged,
            long updateRequired,
            long removeWrongMapping,
            long removeQuarantined,
            long alreadyAbsentRemovals,
            long activeRefMissing,
            long identityConflicts,
            long unexpectedCurrentRows,
            long showOnDetailUpdatesRequired,
            List<RowComparison> rows
    ) {
        public boolean applyBlocked() {
            return activeRefMissing > 0 || identityConflicts > 0 || unexpectedCurrentRows > 0;
        }

        public long approvedRemovalsPresent() {
            return removeWrongMapping + removeQuarantined;
        }
    }

    public static class SchemaNotReadyException extends RuntimeException {
        public SchemaNotReadyException(String message) {
            super(message);
        }
    }
}
