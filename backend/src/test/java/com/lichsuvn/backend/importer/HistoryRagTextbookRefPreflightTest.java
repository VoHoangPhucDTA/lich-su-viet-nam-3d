package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class HistoryRagTextbookRefPreflightTest {

    private final HistoryRagTextbookRefPreflight preflight = new HistoryRagTextbookRefPreflight(mock());

    @Test
    void classifiesActiveRowsAndBlocksMissingOrIdentityConflicts() {
        var unchanged = workbook(1, "event-1", "Excerpt 1", 10, 11, "REFERENCE_RANGE", true);
        var update = workbook(2, "event-2", "New excerpt", 20, 21, "EXACT_EXCERPT_PAGE", true);
        var missing = workbook(3, "event-3", "Excerpt 3", 30, 31, "REFERENCE_RANGE", false);
        var conflict = workbook(4, "event-4", "Excerpt 4", 40, 41, "REFERENCE_RANGE", true);

        var report = preflight.compare(
                List.of(unchanged, update, missing, conflict),
                List.of(),
                List.of(
                        database(unchanged),
                        new HistoryRagTextbookRefPreflight.DatabaseReference(
                                2, "event-2", 11, "KNTT", null, "Bai 1", "https://example.test/2", "SGK11:event-2",
                                "Old excerpt", 19, 21, "REFERENCE_RANGE", "PRINTED_BOOK_PAGE", "REFERENCE_RANGE_MAPPED", false, null
                        ),
                        new HistoryRagTextbookRefPreflight.DatabaseReference(
                                4, "wrong-event", 11, "KNTT", null, "Bai 1", "https://example.test/4", "SGK11:event-4",
                                "Excerpt 4", 40, 41, "REFERENCE_RANGE", "PRINTED_BOOK_PAGE", "REFERENCE_RANGE_MAPPED", true, null
                        )
                )
        );

        assertEquals(4, report.workbookActiveReferences());
        assertEquals(3, report.currentDatabaseReferences());
        assertEquals(1, report.keepUnchanged());
        assertEquals(1, report.updateRequired());
        assertEquals(1, report.activeRefMissing());
        assertEquals(1, report.identityConflicts());
        assertEquals(1, report.showOnDetailUpdatesRequired());
        assertTrue(report.applyBlocked());
    }

    @Test
    void classifiesApprovedRemovalsAndUnexpectedCurrentRows() {
        var active = workbook(1, "event-1", "Excerpt 1", 10, 11, "REFERENCE_RANGE", true);
        var wrong = removal(2, "event-2", "REMOVE_WRONG_MAPPING");
        var quarantined = removal(3, "event-3", "REMOVE_QUARANTINED");
        var unexpected = database(workbook(99, "unexpected", "Excerpt 99", 1, 1, "REFERENCE_RANGE", false));

        var report = preflight.compare(
                List.of(active),
                List.of(wrong, quarantined),
                List.of(database(active), database(wrong), unexpected)
        );

        assertEquals(1, report.keepUnchanged());
        assertEquals(1, report.removeWrongMapping());
        assertEquals(0, report.removeQuarantined());
        assertEquals(1, report.alreadyAbsentRemovals());
        assertEquals(1, report.unexpectedCurrentRows());
        assertTrue(report.applyBlocked());
    }

    private HistoryRagPackageReader.TextbookReference workbook(
            long id, String eventId, String excerpt, int pageStart, int pageEnd,
            String pageScope, boolean showOnDetail
    ) {
        return new HistoryRagPackageReader.TextbookReference(
                id, eventId, 11, "KNTT", null, "Bai 1", "https://example.test/" + id,
                "SGK11:" + eventId, excerpt, pageStart, pageEnd, pageScope,
                "PRINTED_BOOK_PAGE", pageScope.equals("EXACT_EXCERPT_PAGE")
                ? "EXACT_PAGE_MAPPED" : "REFERENCE_RANGE_MAPPED", showOnDetail
        );
    }

    private HistoryRagPackageReader.TextbookReferenceRemoval removal(
            long id, String eventId, String category
    ) {
        return new HistoryRagPackageReader.TextbookReferenceRemoval(
                id, eventId, 11, "KNTT", null, "Bai 1", 10, 11,
                "Excerpt " + id, "https://example.test/" + id, "SGK11:" + eventId,
                null, category, category.equals("REMOVE_WRONG_MAPPING") ? "WRONG_MAPPING" : "UNVERIFIED",
                "Audit reason", "Remove"
        );
    }

    private HistoryRagTextbookRefPreflight.DatabaseReference database(
            HistoryRagPackageReader.TextbookReference reference
    ) {
        return new HistoryRagTextbookRefPreflight.DatabaseReference(
                reference.id(), reference.eventId(), reference.grade(), reference.book(), null,
                reference.lesson(), reference.url(), reference.sourceKey(), reference.excerpt(),
                reference.pageStart(), reference.pageEnd(), reference.pageScope(),
                reference.pageNumberBasis(), reference.pageMappingStatus(), reference.showOnDetail(), null
        );
    }

    private HistoryRagTextbookRefPreflight.DatabaseReference database(
            HistoryRagPackageReader.TextbookReferenceRemoval reference
    ) {
        return new HistoryRagTextbookRefPreflight.DatabaseReference(
                reference.id(), reference.eventId(), reference.grade(), reference.book(), reference.theme(),
                reference.lesson(), reference.url(), reference.sourceKey(), reference.excerpt(),
                reference.pageStart(), reference.pageEnd(), "REFERENCE_RANGE", "PRINTED_BOOK_PAGE",
                "REFERENCE_RANGE_MAPPED", false, null
        );
    }
}
