package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class HistoryRagTestPackageFixture {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final List<String> PACKAGE_FILES = List.of(
            "historical-events.ndjson",
            "textbook-references.ndjson",
            "textbook-reference-removals.ndjson",
            "textbook-contents.ndjson",
            "textbook-content-refs.ndjson",
            "research-sources.ndjson",
            "event-research-sources.ndjson",
            "event-external-sources.ndjson"
    );
    private static final Map<String, Integer> COUNTS = Map.ofEntries(
            Map.entry("historicalEvents", 361),
            Map.entry("textbookReferences", 386),
            Map.entry("textbookReferenceRemovals", 9),
            Map.entry("visibleTextbookReferences", 359),
            Map.entry("hiddenTextbookReferences", 27),
            Map.entry("activeTextbookEvents", 345),
            Map.entry("textbookContents", 361),
            Map.entry("textbookContentRefs", 386),
            Map.entry("researchSources", 231),
            Map.entry("eventResearchSources", 1265),
            Map.entry("eventExternalSources", 648),
            Map.entry("exactExcerptPages", 13),
            Map.entry("referenceRanges", 373),
            Map.entry("internalLocalSources", 28)
    );
    private static final List<Long> WRONG_MAPPING_REMOVALS =
            List.of(120268L, 120270L, 120271L, 120337L, 120437L, 120594L);
    private static final List<Long> QUARANTINED_REMOVALS =
            List.of(120303L, 120327L, 120609L);

    private HistoryRagTestPackageFixture() {
    }

    static Fixture create(Path directory) throws IOException {
        Files.createDirectories(directory);

        writeNdjson(directory.resolve(PACKAGE_FILES.get(0)), historicalEvents());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(1)), textbookReferences());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(2)), textbookReferenceRemovals());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(3)), textbookContents());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(4)), textbookContentReferences());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(5)), researchSources());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(6)), eventResearchSources());
        writeNdjson(directory.resolve(PACKAGE_FILES.get(7)), eventExternalSources());

        Map<String, String> fileHashes = new LinkedHashMap<>();
        for (String fileName : PACKAGE_FILES) {
            fileHashes.put(fileName, sha256(Files.readAllBytes(directory.resolve(fileName))));
        }
        String workbookSha256 = sha256("self-contained-history-rag-fixture-v1".getBytes(StandardCharsets.UTF_8));
        String packageSha256 = packageSha256(fileHashes);

        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("packageVersion", "v1");
        manifest.put("workbookSha256", workbookSha256);
        manifest.put("packageSha256", packageSha256);
        manifest.put("counts", COUNTS);
        manifest.put("files", fileHashes);
        Files.writeString(
                directory.resolve("manifest.json"),
                OBJECT_MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n",
                StandardCharsets.UTF_8
        );
        return new Fixture(directory, workbookSha256, packageSha256);
    }

    private static List<Map<String, Object>> historicalEvents() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("historicalEvents"); index++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("event_id", eventId(index));
            row.put("title", "Test event " + index);
            row.put("card_summary", "Deterministic card summary " + index);
            row.put("canonical_summary", "Deterministic canonical summary " + index);
            row.put("detailed_narrative", "Deterministic narrative " + index);
            row.put("significance", "Deterministic significance " + index);
            rows.add(row);
        }
        return rows;
    }

    private static List<Map<String, Object>> textbookReferences() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("textbookReferences"); index++) {
            int eventIndex = index <= COUNTS.get("activeTextbookEvents") ? index : 1;
            boolean exactPage = index <= COUNTS.get("exactExcerptPages");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", (long) index);
            row.put("event_id", eventId(eventIndex));
            row.put("grade", 10 + ((index - 1) % 3));
            row.put("book", "Kết nối tri thức");
            row.put("theme", "Test theme");
            row.put("lesson", "Test lesson " + index);
            row.put("url", "https://example.invalid/textbook/" + index);
            row.put("source_key", "testbook:" + index);
            row.put("excerpt", "Deterministic textbook excerpt " + index);
            row.put("page_start", index);
            row.put("page_end", index);
            row.put("page_scope", exactPage ? "EXACT_EXCERPT_PAGE" : "REFERENCE_RANGE");
            row.put("page_number_basis", "PRINTED_BOOK_PAGE");
            row.put("page_mapping_status", exactPage ? "EXACT_PAGE_MAPPED" : "REFERENCE_RANGE_MAPPED");
            row.put("show_on_detail", index <= COUNTS.get("visibleTextbookReferences"));
            rows.add(row);
        }
        return rows;
    }

    private static List<Map<String, Object>> textbookReferenceRemovals() {
        List<Map<String, Object>> rows = new ArrayList<>();
        WRONG_MAPPING_REMOVALS.forEach(id -> rows.add(removal(id, "REMOVE_WRONG_MAPPING")));
        QUARANTINED_REMOVALS.forEach(id -> rows.add(removal(id, "REMOVE_QUARANTINED")));
        return rows;
    }

    private static Map<String, Object> removal(long id, String category) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("event_id", eventId(1));
        row.put("grade", 10);
        row.put("book", "Kết nối tri thức");
        row.put("theme", "Test theme");
        row.put("lesson", "Removed test mapping");
        row.put("page_start", 1);
        row.put("page_end", 1);
        row.put("excerpt", "Removed deterministic excerpt " + id);
        row.put("url", "https://example.invalid/removed/" + id);
        row.put("source_key", "removed:" + id);
        row.put("created_at", "2026-01-01T00:00:00Z");
        row.put("removal_category", category);
        row.put("semantic_status", "REMOVED");
        row.put("audit_reason", "Deterministic fixture removal");
        row.put("recommended_action", "Keep removed");
        return row;
    }

    private static List<Map<String, Object>> textbookContents() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("textbookContents"); index++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("event_id", eventId(index));
            row.put("content", null);
            row.put("content_status", "MISSING");
            row.put("content_source", "SELF_CONTAINED_TEST_FIXTURE");
            row.put("reference_count", 0);
            row.put("grade_scope", "10-12");
            row.put("correction_note", null);
            row.put("content_hash", null);
            row.put("verified_at", null);
            row.put("verified_by", null);
            rows.add(row);
        }
        return rows;
    }

    private static List<Map<String, Object>> textbookContentReferences() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("textbookContentRefs"); index++) {
            int eventIndex = index <= COUNTS.get("activeTextbookEvents") ? index : 1;
            rows.add(Map.of(
                    "event_id", eventId(eventIndex),
                    "textbook_ref_id", (long) index,
                    "source_order", index
            ));
        }
        return rows;
    }

    private static List<Map<String, Object>> researchSources() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("researchSources"); index++) {
            rows.add(Map.ofEntries(
                    Map.entry("import_key", sourceKey(index)),
                    Map.entry("dedupe_key", "test-source-dedupe-" + index),
                    Map.entry("source_type", "TEST_SOURCE"),
                    Map.entry("title", "Deterministic source " + index),
                    Map.entry("canonical_uri", "https://example.invalid/source/" + index),
                    Map.entry("external_id", "test-" + index),
                    Map.entry("language", "vi"),
                    Map.entry("is_internal", index <= COUNTS.get("internalLocalSources")),
                    Map.entry("source_role", "REFERENCE"),
                    Map.entry("usage_note", "Self-contained fixture"),
                    Map.entry("batch", "test-v1")
            ));
        }
        return rows;
    }

    private static List<Map<String, Object>> eventResearchSources() {
        List<Map<String, Object>> rows = new ArrayList<>();
        int sourceCount = COUNTS.get("researchSources");
        for (int index = 0; index < COUNTS.get("eventResearchSources"); index++) {
            rows.add(Map.of(
                    "event_id", eventId((index / sourceCount) + 1),
                    "source_import_key", sourceKey((index % sourceCount) + 1),
                    "source_order", (index % sourceCount) + 1,
                    "source_role", "REFERENCE",
                    "usage_note", "Self-contained fixture mapping",
                    "verification_status", "VERIFIED"
            ));
        }
        return rows;
    }

    private static List<Map<String, Object>> eventExternalSources() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index <= COUNTS.get("eventExternalSources"); index++) {
            rows.add(Map.ofEntries(
                    Map.entry("event_id", eventId(((index - 1) % COUNTS.get("historicalEvents")) + 1)),
                    Map.entry("source_order", index),
                    Map.entry("source_import_key", "external-source-" + index),
                    Map.entry("dedupe_key", "external-dedupe-" + index),
                    Map.entry("source_type", "TEST_EXTERNAL"),
                    Map.entry("title", "Deterministic external source " + index),
                    Map.entry("canonical_uri", "https://example.invalid/external/" + index),
                    Map.entry("external_id", "external-" + index),
                    Map.entry("is_internal", false),
                    Map.entry("language", "vi"),
                    Map.entry("match_type", "DIRECT"),
                    Map.entry("is_primary", index % 2 == 0),
                    Map.entry("verification_status", "VERIFIED"),
                    Map.entry("notes", "Self-contained fixture")
            ));
        }
        return rows;
    }

    private static void writeNdjson(Path path, List<Map<String, Object>> rows) throws IOException {
        StringBuilder payload = new StringBuilder();
        for (Map<String, Object> row : rows) {
            payload.append(OBJECT_MAPPER.writeValueAsString(row)).append('\n');
        }
        Files.writeString(path, payload.toString(), StandardCharsets.UTF_8);
    }

    private static String eventId(int index) {
        return "test-event-%03d".formatted(index);
    }

    private static String sourceKey(int index) {
        return "test-source-%03d".formatted(index);
    }

    private static String packageSha256(Map<String, String> fileHashes) {
        StringBuilder payload = new StringBuilder();
        PACKAGE_FILES.forEach(fileName -> payload
                .append(fileName)
                .append('\0')
                .append(fileHashes.get(fileName))
                .append('\n'));
        return sha256(payload.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    record Fixture(Path directory, String workbookSha256, String packageSha256) {
    }
}
