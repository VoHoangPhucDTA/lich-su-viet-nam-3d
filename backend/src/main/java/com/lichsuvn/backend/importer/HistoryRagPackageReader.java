package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class HistoryRagPackageReader {

    private static final String PACKAGE_VERSION = "v1";
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
    private static final Map<String, Integer> EXPECTED_COUNTS = Map.ofEntries(
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
    private static final Map<String, String> COUNT_FILE_MAPPING = Map.of(
            "historicalEvents", "historical-events.ndjson",
            "textbookReferences", "textbook-references.ndjson",
            "textbookReferenceRemovals", "textbook-reference-removals.ndjson",
            "textbookContents", "textbook-contents.ndjson",
            "textbookContentRefs", "textbook-content-refs.ndjson",
            "researchSources", "research-sources.ndjson",
            "eventResearchSources", "event-research-sources.ndjson",
            "eventExternalSources", "event-external-sources.ndjson"
    );

    private final ObjectMapper objectMapper;

    public HistoryRagPackageReader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public PackageData read(Path packageDirectory) {
        Path directory = packageDirectory.toAbsolutePath().normalize();
        if (!Files.isDirectory(directory)) {
            throw new PackageValidationException("Package directory does not exist: " + directory);
        }

        JsonNode manifest = readJson(directory.resolve("manifest.json"));
        requireEquals(PACKAGE_VERSION, text(manifest, "packageVersion"), "packageVersion");
        requireSha256(text(manifest, "workbookSha256"), "workbookSha256");
        requireSha256(text(manifest, "packageSha256"), "packageSha256");

        JsonNode countNode = manifest.path("counts");
        EXPECTED_COUNTS.forEach((name, expected) ->
                requireEquals(expected, integer(countNode, name), "counts." + name));

        JsonNode fileNode = manifest.path("files");
        Map<String, String> fileHashes = new LinkedHashMap<>();
        Map<String, Integer> lineCounts = new LinkedHashMap<>();
        for (String fileName : PACKAGE_FILES) {
            Path file = directory.resolve(fileName);
            if (!Files.isRegularFile(file)) {
                throw new PackageValidationException("Missing package file: " + fileName);
            }
            String expectedHash = text(fileNode, fileName);
            requireSha256(expectedHash, "files." + fileName);
            String actualHash = sha256(file);
            requireEquals(expectedHash, actualHash, "SHA-256 for " + fileName);
            fileHashes.put(fileName, actualHash);
            lineCounts.put(fileName, countNonBlankLines(file));
        }
        requireEquals(text(manifest, "packageSha256"), packageSha256(fileHashes), "packageSha256");
        COUNT_FILE_MAPPING.forEach((countName, fileName) ->
                requireEquals(integer(countNode, countName), lineCounts.get(fileName), "line count for " + fileName));

        List<HistoricalEvent> historicalEvents = readRecords(
                directory.resolve("historical-events.ndjson"), HistoricalEvent.class);
        requireUnique(historicalEvents.stream().map(HistoricalEvent::eventId).toList(), "historical event_id");
        requireEquals(EXPECTED_COUNTS.get("historicalEvents"), historicalEvents.size(), "historical event count");

        List<TextbookReference> references = readTextbookReferences(directory.resolve("textbook-references.ndjson"));
        requireEquals(EXPECTED_COUNTS.get("textbookReferences"), references.size(), "textbook reference count");
        long exactPages = references.stream()
                .filter(reference -> reference.pageScope().equals("EXACT_EXCERPT_PAGE"))
                .count();
        long referenceRanges = references.stream()
                .filter(reference -> reference.pageScope().equals("REFERENCE_RANGE"))
                .count();
        requireEquals(EXPECTED_COUNTS.get("exactExcerptPages").longValue(), exactPages, "exact page count");
        requireEquals(EXPECTED_COUNTS.get("referenceRanges").longValue(), referenceRanges, "reference range count");
        requireEquals(EXPECTED_COUNTS.get("visibleTextbookReferences").longValue(),
                references.stream().filter(TextbookReference::showOnDetail).count(), "visible textbook reference count");
        requireEquals(EXPECTED_COUNTS.get("hiddenTextbookReferences").longValue(),
                references.stream().filter(reference -> !reference.showOnDetail()).count(), "hidden textbook reference count");
        requireEquals(EXPECTED_COUNTS.get("activeTextbookEvents").longValue(),
                references.stream().map(TextbookReference::eventId).distinct().count(), "active textbook event count");

        List<TextbookReferenceRemoval> referenceRemovals = readRecords(
                directory.resolve("textbook-reference-removals.ndjson"), TextbookReferenceRemoval.class);
        requireEquals(EXPECTED_COUNTS.get("textbookReferenceRemovals"), referenceRemovals.size(),
                "textbook reference removal count");
        requireUnique(referenceRemovals.stream().map(TextbookReferenceRemoval::id).toList(),
                "textbook reference removal id");
        validateReferenceRemovals(references, referenceRemovals);

        Set<String> eventIds = historicalEvents.stream().map(HistoricalEvent::eventId).collect(java.util.stream.Collectors.toSet());
        Set<Long> referenceIds = references.stream().map(TextbookReference::id).collect(java.util.stream.Collectors.toSet());
        List<TextbookContent> textbookContents = readRecords(
                directory.resolve("textbook-contents.ndjson"), TextbookContent.class);
        requireUnique(textbookContents.stream().map(TextbookContent::eventId).toList(), "textbook content event_id");
        requireEquals(EXPECTED_COUNTS.get("textbookContents"), textbookContents.size(), "textbook content count");
        textbookContents.forEach(content -> validateTextbookContent(content, eventIds));

        List<TextbookContentRef> textbookContentRefs = readRecords(
                directory.resolve("textbook-content-refs.ndjson"), TextbookContentRef.class);
        requireEquals(EXPECTED_COUNTS.get("textbookContentRefs"), textbookContentRefs.size(), "textbook content ref count");
        Set<String> contentRefKeys = new LinkedHashSet<>();
        textbookContentRefs.forEach(ref -> {
            if (!eventIds.contains(ref.eventId()) || !referenceIds.contains(ref.textbookRefId())) {
                throw new PackageValidationException("Orphan textbook content ref: " + ref);
            }
            if (!contentRefKeys.add(ref.eventId() + "\u0000" + ref.textbookRefId())) {
                throw new PackageValidationException("Duplicate textbook content ref: " + ref);
            }
        });

        List<ResearchSource> researchSources = readRecords(
                directory.resolve("research-sources.ndjson"), ResearchSource.class);
        requireUnique(researchSources.stream().map(ResearchSource::importKey).toList(), "research source import_key");
        requireEquals(EXPECTED_COUNTS.get("researchSources"), researchSources.size(), "research source count");
        Set<String> sourceKeys = researchSources.stream().map(ResearchSource::importKey).collect(java.util.stream.Collectors.toSet());
        researchSources.forEach(source -> {
            if (source.importKey() == null || source.dedupeKey() == null || source.dedupeKey().isBlank()
                    || source.title() == null) {
                throw new PackageValidationException("Incomplete research source: " + source);
            }
        });

        List<EventResearchSource> eventResearchSources = readRecords(
                directory.resolve("event-research-sources.ndjson"), EventResearchSource.class);
        requireEquals(EXPECTED_COUNTS.get("eventResearchSources"), eventResearchSources.size(), "event research source count");
        Set<String> researchMappingKeys = new LinkedHashSet<>();
        eventResearchSources.forEach(mapping -> {
            if (!eventIds.contains(mapping.eventId()) || !sourceKeys.contains(mapping.sourceImportKey())) {
                throw new PackageValidationException("Orphan event research source: " + mapping);
            }
            if (!researchMappingKeys.add(mapping.eventId() + "\u0000" + mapping.sourceImportKey())) {
                throw new PackageValidationException("Duplicate event research source: " + mapping);
            }
        });

        List<EventExternalSource> eventExternalSources = readRecords(
                directory.resolve("event-external-sources.ndjson"), EventExternalSource.class);
        requireEquals(EXPECTED_COUNTS.get("eventExternalSources"), eventExternalSources.size(), "event external source count");
        Set<String> externalMappingKeys = new LinkedHashSet<>();
        eventExternalSources.forEach(mapping -> {
            if (!eventIds.contains(mapping.eventId()) || mapping.dedupeKey() == null
                    || mapping.canonicalUri() == null || mapping.sourceType() == null) {
                throw new PackageValidationException("Incomplete event external source: " + mapping);
            }
            if (!externalMappingKeys.add(mapping.eventId() + "\u0000" + mapping.dedupeKey()
                    + "\u0000" + mapping.matchType())) {
                throw new PackageValidationException("Duplicate event external source: " + mapping);
            }
        });

        return new PackageData(
                directory,
                text(manifest, "workbookSha256"),
                text(manifest, "packageSha256"),
                Map.copyOf(lineCounts),
                List.copyOf(historicalEvents),
                List.copyOf(references),
                List.copyOf(referenceRemovals),
                List.copyOf(textbookContents),
                List.copyOf(textbookContentRefs),
                List.copyOf(researchSources),
                List.copyOf(eventResearchSources),
                List.copyOf(eventExternalSources)
        );
    }

    private <T> List<T> readRecords(Path file, Class<T> type) {
        List<T> records = new ArrayList<>();
        int lineNumber = 0;
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isBlank()) {
                    continue;
                }
                try {
                    records.add(objectMapper.readValue(line, type));
                } catch (IOException ex) {
                    throw new PackageValidationException(
                            "Invalid " + type.getSimpleName() + " at " + file.getFileName()
                                    + ":" + lineNumber, ex);
                }
            }
        } catch (IOException ex) {
            throw new PackageValidationException("Failed to read " + file, ex);
        }
        return records;
    }

    private void validateTextbookContent(TextbookContent content, Set<String> eventIds) {
        if (!eventIds.contains(content.eventId())) {
            throw new PackageValidationException("Orphan textbook content event_id: " + content.eventId());
        }
        if (content.referenceCount() < 0 || content.contentStatus() == null || content.contentSource() == null) {
            throw new PackageValidationException("Invalid textbook content: " + content.eventId());
        }
        if (content.content() == null && content.contentHash() != null) {
            throw new PackageValidationException("Null textbook content has a hash: " + content.eventId());
        }
        if (content.content() != null && !sha256Text(content.content()).equals(content.contentHash())) {
            throw new PackageValidationException("Textbook content hash mismatch: " + content.eventId());
        }
    }

    private String sha256Text(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private void requireUnique(List<?> values, String label) {
        Set<?> unique = new LinkedHashSet<>(values);
        if (unique.size() != values.size() || values.stream().anyMatch(value -> value == null || value.toString().isBlank())) {
            throw new PackageValidationException("Duplicate or blank " + label);
        }
    }

    private List<TextbookReference> readTextbookReferences(Path file) {
        List<TextbookReference> references = new ArrayList<>();
        Set<Long> ids = new LinkedHashSet<>();
        int lineNumber = 0;
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isBlank()) {
                    continue;
                }
                JsonNode node = objectMapper.readTree(line);
                TextbookReference reference = new TextbookReference(
                        requiredLong(node, "id", lineNumber),
                        requiredText(node, "event_id", lineNumber),
                        requiredInteger(node, "grade", lineNumber),
                        requiredText(node, "book", lineNumber),
                        nullableText(node, "theme"),
                        nullableText(node, "lesson"),
                        requiredText(node, "url", lineNumber),
                        requiredText(node, "source_key", lineNumber),
                        requiredText(node, "excerpt", lineNumber),
                        requiredInteger(node, "page_start", lineNumber),
                        requiredInteger(node, "page_end", lineNumber),
                        requiredText(node, "page_scope", lineNumber),
                        requiredText(node, "page_number_basis", lineNumber),
                        requiredText(node, "page_mapping_status", lineNumber),
                        requiredBoolean(node, "show_on_detail", lineNumber)
                );
                validateReference(reference, lineNumber);
                if (!ids.add(reference.id())) {
                    throw new PackageValidationException("Duplicate textbook reference id: " + reference.id());
                }
                references.add(reference);
            }
        } catch (IOException ex) {
            throw new PackageValidationException("Failed to read " + file, ex);
        }
        return references;
    }

    private void validateReference(TextbookReference reference, int lineNumber) {
        if (reference.grade() < 10 || reference.grade() > 12) {
            throw new PackageValidationException("Invalid grade at textbook reference line " + lineNumber);
        }
        if (reference.pageEnd() < reference.pageStart()) {
            throw new PackageValidationException("Invalid page range at textbook reference line " + lineNumber);
        }
        requireEquals("PRINTED_BOOK_PAGE", reference.pageNumberBasis(), "page_number_basis at line " + lineNumber);
        switch (reference.pageScope()) {
            case "EXACT_EXCERPT_PAGE" -> requireEquals(
                    "EXACT_PAGE_MAPPED", reference.pageMappingStatus(), "page_mapping_status at line " + lineNumber);
            case "REFERENCE_RANGE" -> requireEquals(
                    "REFERENCE_RANGE_MAPPED", reference.pageMappingStatus(), "page_mapping_status at line " + lineNumber);
            default -> throw new PackageValidationException(
                    "Invalid page_scope at textbook reference line " + lineNumber + ": " + reference.pageScope());
        }
    }

    private void validateReferenceRemovals(
            List<TextbookReference> references,
            List<TextbookReferenceRemoval> removals
    ) {
        Set<Long> activeIds = references.stream().map(TextbookReference::id).collect(java.util.stream.Collectors.toSet());
        Set<Long> removalIds = removals.stream().map(TextbookReferenceRemoval::id).collect(java.util.stream.Collectors.toSet());
        if (!java.util.Collections.disjoint(activeIds, removalIds)) {
            throw new PackageValidationException("Active and removed textbook reference IDs overlap");
        }
        if (activeIds.size() + removalIds.size() != 395) {
            throw new PackageValidationException("Semantic textbook reference partition must contain 395 IDs");
        }
        Set<Long> wrong = removals.stream()
                .filter(removal -> removal.removalCategory().equals("REMOVE_WRONG_MAPPING"))
                .map(TextbookReferenceRemoval::id).collect(java.util.stream.Collectors.toSet());
        Set<Long> quarantined = removals.stream()
                .filter(removal -> removal.removalCategory().equals("REMOVE_QUARANTINED"))
                .map(TextbookReferenceRemoval::id).collect(java.util.stream.Collectors.toSet());
        requireEquals(Set.of(120268L, 120270L, 120271L, 120337L, 120437L, 120594L), wrong,
                "wrong textbook reference removal IDs");
        requireEquals(Set.of(120303L, 120327L, 120609L), quarantined,
                "quarantined textbook reference removal IDs");
    }

    private JsonNode readJson(Path file) {
        try {
            return objectMapper.readTree(file.toFile());
        } catch (IOException ex) {
            throw new PackageValidationException("Failed to read JSON file: " + file, ex);
        }
    }

    private int countNonBlankLines(Path file) {
        try (var lines = Files.lines(file, StandardCharsets.UTF_8)) {
            return Math.toIntExact(lines.filter(line -> !line.isBlank()).count());
        } catch (IOException ex) {
            throw new PackageValidationException("Failed to count lines in " + file, ex);
        }
    }

    private String sha256(Path file) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
        } catch (IOException | NoSuchAlgorithmException ex) {
            throw new PackageValidationException("Failed to hash " + file, ex);
        }
    }

    private String packageSha256(Map<String, String> fileHashes) {
        StringBuilder payload = new StringBuilder();
        PACKAGE_FILES.forEach(fileName -> payload
                .append(fileName)
                .append('\0')
                .append(fileHashes.get(fileName))
                .append('\n'));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(payload.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private String requiredText(JsonNode node, String field, int lineNumber) {
        String value = nullableText(node, field);
        if (value == null || value.isBlank()) {
            throw new PackageValidationException("Missing " + field + " at textbook reference line " + lineNumber);
        }
        return value;
    }

    private String nullableText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private int requiredInteger(JsonNode node, String field, int lineNumber) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToInt()) {
            throw new PackageValidationException("Missing " + field + " at textbook reference line " + lineNumber);
        }
        return value.intValue();
    }

    private boolean requiredBoolean(JsonNode node, String field, int lineNumber) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) {
            throw new PackageValidationException("Missing or invalid " + field + " at textbook reference line " + lineNumber);
        }
        return value.booleanValue();
    }

    private long requiredLong(JsonNode node, String field, int lineNumber) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong()) {
            throw new PackageValidationException("Missing " + field + " at textbook reference line " + lineNumber);
        }
        return value.longValue();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            throw new PackageValidationException("Missing manifest field: " + field);
        }
        return value.asText();
    }

    private static int integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToInt()) {
            throw new PackageValidationException("Missing integer manifest field: " + field);
        }
        return value.intValue();
    }

    private static void requireSha256(String value, String label) {
        if (!value.matches("[0-9a-f]{64}")) {
            throw new PackageValidationException("Invalid SHA-256 in " + label);
        }
    }

    private static void requireEquals(Object expected, Object actual, String label) {
        if (!expected.equals(actual)) {
            throw new PackageValidationException(label + ": expected " + expected + ", got " + actual);
        }
    }

    public record PackageData(
            Path directory,
            String workbookSha256,
            String packageSha256,
            Map<String, Integer> lineCounts,
            List<HistoricalEvent> historicalEvents,
            List<TextbookReference> textbookReferences,
            List<TextbookReferenceRemoval> textbookReferenceRemovals,
            List<TextbookContent> textbookContents,
            List<TextbookContentRef> textbookContentRefs,
            List<ResearchSource> researchSources,
            List<EventResearchSource> eventResearchSources,
            List<EventExternalSource> eventExternalSources
    ) {
        public PackageData(
                Path directory,
                String workbookSha256,
                String packageSha256,
                Map<String, Integer> lineCounts,
                List<TextbookReference> textbookReferences
        ) {
            this(directory, workbookSha256, packageSha256, lineCounts,
                    List.of(), textbookReferences, List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
    }

    public record HistoricalEvent(
            @JsonProperty("event_id") String eventId,
            String title,
            @JsonProperty("card_summary") String cardSummary,
            @JsonProperty("canonical_summary") String canonicalSummary,
            @JsonProperty("detailed_narrative") String detailedNarrative,
            String significance
    ) {
    }

    public record TextbookContent(
            @JsonProperty("event_id") String eventId,
            String content,
            @JsonProperty("content_status") String contentStatus,
            @JsonProperty("content_source") String contentSource,
            @JsonProperty("reference_count") int referenceCount,
            @JsonProperty("grade_scope") String gradeScope,
            @JsonProperty("correction_note") String correctionNote,
            @JsonProperty("content_hash") String contentHash,
            @JsonProperty("verified_at") String verifiedAt,
            @JsonProperty("verified_by") String verifiedBy
    ) {
    }

    public record TextbookContentRef(
            @JsonProperty("event_id") String eventId,
            @JsonProperty("textbook_ref_id") long textbookRefId,
            @JsonProperty("source_order") int sourceOrder
    ) {
    }

    public record ResearchSource(
            @JsonProperty("import_key") String importKey,
            @JsonProperty("dedupe_key") String dedupeKey,
            @JsonProperty("source_type") String sourceType,
            String title,
            @JsonProperty("canonical_uri") String canonicalUri,
            @JsonProperty("external_id") String externalId,
            String language,
            @JsonProperty("is_internal") boolean internal,
            @JsonProperty("source_role") String sourceRole,
            @JsonProperty("usage_note") String usageNote,
            String batch
    ) {
    }

    public record EventResearchSource(
            @JsonProperty("event_id") String eventId,
            @JsonProperty("source_import_key") String sourceImportKey,
            @JsonProperty("source_order") int sourceOrder,
            @JsonProperty("source_role") String sourceRole,
            @JsonProperty("usage_note") String usageNote,
            @JsonProperty("verification_status") String verificationStatus
    ) {
    }

    public record EventExternalSource(
            @JsonProperty("event_id") String eventId,
            @JsonProperty("source_order") int sourceOrder,
            @JsonProperty("source_import_key") String sourceImportKey,
            @JsonProperty("dedupe_key") String dedupeKey,
            @JsonProperty("source_type") String sourceType,
            String title,
            @JsonProperty("canonical_uri") String canonicalUri,
            @JsonProperty("external_id") String externalId,
            @JsonProperty("is_internal") boolean internal,
            String language,
            @JsonProperty("match_type") String matchType,
            @JsonProperty("is_primary") boolean primary,
            @JsonProperty("verification_status") String verificationStatus,
            String notes
    ) {
    }

    public record TextbookReference(
            long id,
            String eventId,
            int grade,
            String book,
            String theme,
            String lesson,
            String url,
            String sourceKey,
            String excerpt,
            int pageStart,
            int pageEnd,
            String pageScope,
            String pageNumberBasis,
            String pageMappingStatus,
            boolean showOnDetail
    ) {
    }

    public record TextbookReferenceRemoval(
            long id,
            @JsonProperty("event_id") String eventId,
            int grade,
            String book,
            String theme,
            String lesson,
            @JsonProperty("page_start") int pageStart,
            @JsonProperty("page_end") int pageEnd,
            String excerpt,
            String url,
            @JsonProperty("source_key") String sourceKey,
            @JsonProperty("created_at") String createdAt,
            @JsonProperty("removal_category") String removalCategory,
            @JsonProperty("semantic_status") String semanticStatus,
            @JsonProperty("audit_reason") String auditReason,
            @JsonProperty("recommended_action") String recommendedAction
    ) {
    }

    public static class PackageValidationException extends RuntimeException {
        public PackageValidationException(String message) {
            super(message);
        }

        public PackageValidationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
