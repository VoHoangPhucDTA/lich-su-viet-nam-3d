package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class HistoryRagPackageReaderTest {

    @Test
    void validatesGeneratedPackageAndBaselineCounts() {
        var reader = new HistoryRagPackageReader(new ObjectMapper());

        var packageData = reader.read(Path.of("../data/history-rag/v1"));

        assertEquals("001751243f659c449c6622ff7b417ad74fc12cf2f72dcf59305fad11bca6ee4c",
                packageData.workbookSha256());
        assertEquals("25fea8369332b6585cab9d81ca60e9dbae6b6ffcd7cc350600a6e4878246a529",
                packageData.packageSha256());
        assertEquals(386, packageData.textbookReferences().size());
        assertEquals(9, packageData.textbookReferenceRemovals().size());
        assertEquals(345, packageData.textbookReferences().stream()
                .map(HistoryRagPackageReader.TextbookReference::eventId)
                .distinct()
                .count());
        assertEquals(386, packageData.textbookReferences().stream()
                .map(HistoryRagPackageReader.TextbookReference::id)
                .distinct()
                .count());
        assertEquals(359, packageData.textbookReferences().stream()
                .filter(HistoryRagPackageReader.TextbookReference::showOnDetail)
                .count());
        assertEquals(27, packageData.textbookReferences().stream()
                .filter(reference -> !reference.showOnDetail())
                .count());
        assertEquals(13, packageData.textbookReferences().stream()
                .filter(reference -> reference.pageScope().equals("EXACT_EXCERPT_PAGE"))
                .count());
        assertEquals(373, packageData.textbookReferences().stream()
                .filter(reference -> reference.pageScope().equals("REFERENCE_RANGE"))
                .count());
        assertFalse(packageData.textbookReferences().stream()
                .anyMatch(reference -> reference.excerpt().isBlank()));
        assertEquals(Set.of(120268L, 120270L, 120271L, 120337L, 120437L, 120594L),
                removalIds(packageData, "REMOVE_WRONG_MAPPING"));
        assertEquals(Set.of(120303L, 120327L, 120609L),
                removalIds(packageData, "REMOVE_QUARANTINED"));
        assertFalse(packageData.textbookReferences().stream().anyMatch(reference ->
                packageData.textbookReferenceRemovals().stream()
                        .anyMatch(removal -> removal.id() == reference.id())));
    }

    private Set<Long> removalIds(
            HistoryRagPackageReader.PackageData packageData,
            String category
    ) {
        return packageData.textbookReferenceRemovals().stream()
                .filter(removal -> category.equals(removal.removalCategory()))
                .map(HistoryRagPackageReader.TextbookReferenceRemoval::id)
                .collect(java.util.stream.Collectors.toSet());
    }
}
