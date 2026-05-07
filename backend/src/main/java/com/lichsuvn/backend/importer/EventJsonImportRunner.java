package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

@Component
@Profile("import-events")
public class EventJsonImportRunner implements CommandLineRunner {

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final Path eventsPath;

    public EventJsonImportRunner(
            NamedParameterJdbcTemplate jdbc,
            @Value("${app.import.events-path:../history_events_export_2026-04-24T14-28-46-607Z}") String eventsPath
    ) {
        this.jdbc = jdbc;
        this.objectMapper = new ObjectMapper();
        this.eventsPath = Path.of(eventsPath).toAbsolutePath().normalize();
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        if (!Files.isDirectory(eventsPath)) {
            throw new IllegalArgumentException("Event import path does not exist: " + eventsPath);
        }

        long importRunId = createImportRun();
        List<String> warnings = new ArrayList<>();

        try {
            List<Path> jsonFiles = listJsonFiles();
            Map<String, ImportedEvent> eventsById = readAndMergeEvents(jsonFiles, warnings);

            upsertEventsWithoutHierarchy(eventsById.values());
            updateHierarchy(eventsById);
            replaceSupportTables(eventsById);
            insertImportRunEvents(importRunId, eventsById.values(), warnings);

            String status = warnings.isEmpty() ? "success" : "partial";
            finishImportRun(importRunId, status, jsonFiles.size(), eventsById.size(), warnings.size(), warnings);

            System.out.printf(
                    "Imported %d JSON files into %d unique historical events. Status: %s%n",
                    jsonFiles.size(),
                    eventsById.size(),
                    status
            );
        } catch (Exception ex) {
            failImportRun(importRunId, ex);
            throw ex;
        }
    }

    private List<Path> listJsonFiles() throws IOException {
        try (Stream<Path> files = Files.walk(eventsPath)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json"))
                    .sorted(Comparator.comparing(Path::toString))
                    .toList();
        }
    }

    private Map<String, ImportedEvent> readAndMergeEvents(List<Path> jsonFiles, List<String> warnings) {
        Map<String, ImportedEvent> eventsById = new LinkedHashMap<>();
        for (Path file : jsonFiles) {
            try {
                JsonNode raw = objectMapper.readTree(file.toFile());
                String id = text(raw, "id");
                if (isBlank(id)) {
                    warnings.add("Skipped file without id: " + file);
                    continue;
                }

                ImportedEvent incoming = ImportedEvent.from(raw, file, objectMapper);
                eventsById.merge(id, incoming, ImportedEvent::merge);
            } catch (Exception ex) {
                warnings.add("Failed to read " + file + ": " + ex.getMessage());
            }
        }
        return eventsById;
    }

    private long createImportRun() {
        String sql = """
                INSERT INTO data_import_runs
                    (source_name, source_path, import_type, status, started_at)
                VALUES
                    (:sourceName, :sourcePath, 'event_json', 'running', :startedAt)
                """;
        jdbc.update(sql, params()
                .addValue("sourceName", eventsPath.getFileName().toString())
                .addValue("sourcePath", eventsPath.toString())
                .addValue("startedAt", LocalDateTime.now()));

        return jdbc.getJdbcTemplate().queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private void upsertEventsWithoutHierarchy(Iterable<ImportedEvent> events) {
        String sql = """
                INSERT INTO historical_events (
                    id, slug, title, short_title, event_level, event_type, event_subtype,
                    start_year, end_year, effective_end_year, display_date, date_precision,
                    geo_type, lat, lng, province_names, historical_locations,
                    parent_id, root_id, level, order_in_parent,
                    card_summary, canonical_summary, detailed_narrative, significance,
                    show_on_homepage, show_on_timeline, featured, status,
                    content_hash, raw_json, published_at
                ) VALUES (
                    :id, :slug, :title, :shortTitle, :eventLevel, :eventType, :eventSubtype,
                    :startYear, :endYear, :effectiveEndYear, :displayDate, :datePrecision,
                    :geoType, :lat, :lng, :provinceNames, :historicalLocations,
                    NULL, NULL, :level, :orderInParent,
                    :cardSummary, :canonicalSummary, :detailedNarrative, :significance,
                    :showOnHomepage, :showOnTimeline, :featured, 'published',
                    :contentHash, :rawJson, CURRENT_TIMESTAMP
                )
                ON DUPLICATE KEY UPDATE
                    slug = VALUES(slug),
                    title = VALUES(title),
                    short_title = VALUES(short_title),
                    event_level = VALUES(event_level),
                    event_type = VALUES(event_type),
                    event_subtype = VALUES(event_subtype),
                    start_year = VALUES(start_year),
                    end_year = VALUES(end_year),
                    effective_end_year = VALUES(effective_end_year),
                    display_date = VALUES(display_date),
                    date_precision = VALUES(date_precision),
                    geo_type = VALUES(geo_type),
                    lat = VALUES(lat),
                    lng = VALUES(lng),
                    province_names = VALUES(province_names),
                    historical_locations = VALUES(historical_locations),
                    level = VALUES(level),
                    order_in_parent = VALUES(order_in_parent),
                    card_summary = VALUES(card_summary),
                    canonical_summary = VALUES(canonical_summary),
                    detailed_narrative = VALUES(detailed_narrative),
                    significance = VALUES(significance),
                    show_on_homepage = VALUES(show_on_homepage),
                    show_on_timeline = VALUES(show_on_timeline),
                    featured = VALUES(featured),
                    status = VALUES(status),
                    content_hash = VALUES(content_hash),
                    raw_json = VALUES(raw_json),
                    published_at = COALESCE(published_at, VALUES(published_at))
                """;

        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : events) {
            batch.add(params()
                    .addValue("id", event.id)
                    .addValue("slug", max(event.slug, 180))
                    .addValue("title", max(event.title, 500))
                    .addValue("shortTitle", max(event.shortTitle, 255))
                    .addValue("eventLevel", event.eventLevel)
                    .addValue("eventType", event.eventType)
                    .addValue("eventSubtype", max(event.eventSubtype, 120))
                    .addValue("startYear", event.startYear)
                    .addValue("endYear", event.endYear)
                    .addValue("effectiveEndYear", event.effectiveEndYear)
                    .addValue("displayDate", max(event.displayDate, 120))
                    .addValue("datePrecision", max(event.datePrecision, 40))
                    .addValue("geoType", event.geoType)
                    .addValue("lat", event.lat)
                    .addValue("lng", event.lng)
                    .addValue("provinceNames", toJson(event.provinceNames))
                    .addValue("historicalLocations", toJson(event.historicalLocations))
                    .addValue("level", event.level)
                    .addValue("orderInParent", event.orderInParent)
                    .addValue("cardSummary", max(event.cardSummary, 1000))
                    .addValue("canonicalSummary", event.canonicalSummary)
                    .addValue("detailedNarrative", event.detailedNarrative)
                    .addValue("significance", event.significance)
                    .addValue("showOnHomepage", event.showOnHomepage)
                    .addValue("showOnTimeline", event.showOnTimeline)
                    .addValue("featured", event.featured)
                    .addValue("contentHash", event.contentHash)
                    .addValue("rawJson", event.rawJsonText));
        }
        jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void updateHierarchy(Map<String, ImportedEvent> eventsById) {
        String sql = """
                UPDATE historical_events
                SET parent_id = :parentId,
                    root_id = :rootId,
                    level = :level,
                    order_in_parent = :orderInParent
                WHERE id = :id
                """;

        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : eventsById.values()) {
            String parentId = eventsById.containsKey(event.parentId) ? event.parentId : null;
            String rootId = eventsById.containsKey(event.rootId) ? event.rootId : null;
            batch.add(params()
                    .addValue("id", event.id)
                    .addValue("parentId", parentId)
                    .addValue("rootId", rootId)
                    .addValue("level", event.level)
                    .addValue("orderInParent", event.orderInParent));
        }
        jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void replaceSupportTables(Map<String, ImportedEvent> eventsById) {
        List<String> ids = new ArrayList<>(eventsById.keySet());
        deleteByEventIds("event_grades", "event_id", ids);
        deleteByEventIds("event_textbook_refs", "event_id", ids);
        deleteByEventIds("event_media", "event_id", ids);
        deleteRelations(ids);

        insertGrades(eventsById.values());
        insertTextbookRefs(eventsById.values());
        insertMedia(eventsById.values());
        insertRelations(eventsById);
    }

    private void deleteByEventIds(String table, String column, List<String> ids) {
        if (ids.isEmpty()) return;
        jdbc.update("DELETE FROM " + table + " WHERE " + column + " IN (:ids)", params().addValue("ids", ids));
    }

    private void deleteRelations(List<String> ids) {
        if (ids.isEmpty()) return;
        jdbc.update("""
                DELETE FROM event_relations
                WHERE source_event_id IN (:ids) OR target_event_id IN (:ids)
                """, params().addValue("ids", ids));
    }

    private void insertGrades(Iterable<ImportedEvent> events) {
        String sql = """
                INSERT INTO event_grades (event_id, grade)
                VALUES (:eventId, :grade)
                ON DUPLICATE KEY UPDATE grade = VALUES(grade)
                """;
        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : events) {
            for (Integer grade : event.grades) {
                batch.add(params().addValue("eventId", event.id).addValue("grade", grade));
            }
        }
        if (!batch.isEmpty()) jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void insertTextbookRefs(Iterable<ImportedEvent> events) {
        String sql = """
                INSERT INTO event_textbook_refs
                    (event_id, grade, book, theme, lesson, page_start, page_end, excerpt, source_key)
                VALUES
                    (:eventId, :grade, :book, :theme, :lesson, :pageStart, :pageEnd, :excerpt, :sourceKey)
                """;
        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : events) {
            for (JsonNode ref : event.textbookRefs) {
                Integer grade = intValue(ref.path("grade"));
                if (grade == null || !isValidGrade(grade)) continue;
                String book = text(ref, "book");
                if (isBlank(book)) book = "SGK Lich su " + grade;
                batch.add(params()
                        .addValue("eventId", event.id)
                        .addValue("grade", grade)
                        .addValue("book", book)
                        .addValue("theme", text(ref, "theme"))
                        .addValue("lesson", text(ref, "lesson"))
                        .addValue("pageStart", intValue(ref.path("pageStart")))
                        .addValue("pageEnd", intValue(ref.path("pageEnd")))
                        .addValue("excerpt", text(ref, "excerpt"))
                        .addValue("sourceKey", "SGK" + grade + ":" + event.id));
            }
        }
        if (!batch.isEmpty()) jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void insertMedia(Iterable<ImportedEvent> events) {
        String sql = """
                INSERT INTO event_media
                    (event_id, media_type, url, caption, alt_text, source_name, license, storage_type, is_thumbnail, sort_order, status)
                VALUES
                    (:eventId, :mediaType, :url, :caption, :altText, :sourceName, :license, :storageType, :isThumbnail, :sortOrder, 'active')
                """;
        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : events) {
            String thumbnail = event.raw.path("media").path("thumbnail").asText(null);
            if (!isBlank(thumbnail)) {
                batch.add(params()
                        .addValue("eventId", event.id)
                        .addValue("mediaType", "image")
                        .addValue("url", thumbnail)
                        .addValue("caption", event.title)
                        .addValue("altText", event.shortTitle)
                        .addValue("sourceName", null)
                        .addValue("license", null)
                        .addValue("storageType", storageType(thumbnail))
                        .addValue("isThumbnail", true)
                        .addValue("sortOrder", 0));
            }

            JsonNode items = event.raw.path("media").path("items");
            if (items.isArray()) {
                int index = 1;
                for (JsonNode item : items) {
                    String url = text(item, "url");
                    if (isBlank(url)) continue;
                    batch.add(params()
                            .addValue("eventId", event.id)
                            .addValue("mediaType", normalizeMediaType(text(item, "type")))
                            .addValue("url", url)
                            .addValue("caption", text(item, "caption"))
                            .addValue("altText", text(item, "caption"))
                            .addValue("sourceName", text(item, "sourceName"))
                            .addValue("license", text(item, "license"))
                            .addValue("storageType", storageType(url))
                            .addValue("isThumbnail", false)
                            .addValue("sortOrder", index++));
                }
            }
        }
        if (!batch.isEmpty()) jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void insertRelations(Map<String, ImportedEvent> eventsById) {
        String sql = """
                INSERT INTO event_relations (source_event_id, target_event_id, relation_type)
                VALUES (:sourceId, :targetId, :relationType)
                ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type)
                """;
        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : eventsById.values()) {
            addRelations(batch, eventsById, event.id, event.raw.path("associations").path("relatedEventIds"), "related");
            addRelations(batch, eventsById, event.id, event.raw.path("associations").path("predecessorEventIds"), "predecessor");
            addRelations(batch, eventsById, event.id, event.raw.path("associations").path("successorEventIds"), "successor");
        }
        if (!batch.isEmpty()) jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void addRelations(
            List<MapSqlParameterSource> batch,
            Map<String, ImportedEvent> eventsById,
            String sourceId,
            JsonNode targetIds,
            String relationType
    ) {
        if (!targetIds.isArray()) return;
        for (JsonNode target : targetIds) {
            String targetId = target.asText(null);
            if (isBlank(targetId) || sourceId.equals(targetId) || !eventsById.containsKey(targetId)) continue;
            batch.add(params()
                    .addValue("sourceId", sourceId)
                    .addValue("targetId", targetId)
                    .addValue("relationType", relationType));
        }
    }

    private void insertImportRunEvents(long importRunId, Iterable<ImportedEvent> events, List<String> warnings) {
        String sql = """
                INSERT INTO import_run_events
                    (import_run_id, event_id, action, old_content_hash, new_content_hash, message)
                VALUES
                    (:importRunId, :eventId, 'updated', NULL, :newContentHash, :message)
                ON DUPLICATE KEY UPDATE
                    action = VALUES(action),
                    new_content_hash = VALUES(new_content_hash),
                    message = VALUES(message)
                """;
        String joinedWarnings = warnings.isEmpty() ? null : String.join("\n", warnings);
        String message = joinedWarnings == null ? null : max(joinedWarnings, 4000);
        List<MapSqlParameterSource> batch = new ArrayList<>();
        for (ImportedEvent event : events) {
            batch.add(params()
                    .addValue("importRunId", importRunId)
                    .addValue("eventId", event.id)
                    .addValue("newContentHash", event.contentHash)
                    .addValue("message", message));
        }
        if (!batch.isEmpty()) jdbc.batchUpdate(sql, batch.toArray(MapSqlParameterSource[]::new));
    }

    private void finishImportRun(
            long importRunId,
            String status,
            int jsonFileCount,
            int uniqueEventCount,
            int failedCount,
            List<String> warnings
    ) {
        String sql = """
                UPDATE data_import_runs
                SET source_hash = :sourceHash,
                    event_count = :eventCount,
                    created_count = :createdCount,
                    updated_count = :updatedCount,
                    skipped_count = 0,
                    failed_count = :failedCount,
                    status = :status,
                    finished_at = :finishedAt,
                    error_log = :errorLog
                WHERE id = :id
                """;
        jdbc.update(sql, params()
                .addValue("id", importRunId)
                .addValue("sourceHash", sha256(eventsPath.toString() + ":" + jsonFileCount + ":" + uniqueEventCount))
                .addValue("eventCount", uniqueEventCount)
                .addValue("createdCount", 0)
                .addValue("updatedCount", uniqueEventCount)
                .addValue("failedCount", failedCount)
                .addValue("status", status)
                .addValue("finishedAt", LocalDateTime.now())
                .addValue("errorLog", warnings.isEmpty() ? null : String.join("\n", warnings)));
    }

    private void failImportRun(long importRunId, Exception ex) {
        jdbc.update("""
                UPDATE data_import_runs
                SET status = 'failed',
                    finished_at = :finishedAt,
                    error_log = :errorLog
                WHERE id = :id
                """, params()
                .addValue("id", importRunId)
                .addValue("finishedAt", LocalDateTime.now())
                .addValue("errorLog", ex.getMessage()));
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize JSON value", ex);
        }
    }

    private static String normalizeGeoType(String value) {
        if (value == null) return "no_location";
        return switch (value) {
            case "point", "single_point" -> "single_point";
            case "multi_point", "multi_region", "polygon", "multi_polygon", "mixed" -> "multi_region";
            case "nationwide" -> "nationwide";
            default -> "no_location";
        };
    }

    private static String normalizeEventType(String value) {
        if (value == null) return "cultural";
        return switch (value) {
            case "military", "political", "economic", "cultural" -> value;
            default -> "cultural";
        };
    }

    private static String normalizeMediaType(String value) {
        if (value == null) return "image";
        return switch (value) {
            case "image", "video", "document", "audio" -> value;
            default -> "image";
        };
    }

    private static String storageType(String url) {
        if (url == null) return "external";
        return url.startsWith("http://") || url.startsWith("https://") ? "external" : "local";
    }

    private static boolean isValidGrade(Integer grade) {
        return grade != null && (grade == 10 || grade == 11 || grade == 12);
    }

    private static MapSqlParameterSource params() {
        return new MapSqlParameterSource();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.path(field);
        if (value == null || value.isMissingNode() || value.isNull()) return null;
        String text = value.asText(null);
        return isBlank(text) ? null : text;
    }

    private static Integer intValue(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (node.isInt() || node.isLong()) return node.asInt();
        String text = node.asText(null);
        if (isBlank(text)) return null;
        try {
            return Integer.parseInt(text.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static BigDecimal decimalValue(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (!node.isNumber()) return null;
        return BigDecimal.valueOf(node.asDouble());
    }

    private static boolean boolValue(JsonNode node, boolean fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        return node.asBoolean(fallback);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String firstNonBlank(String first, String second) {
        return isBlank(first) ? second : first;
    }

    private static String max(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private static final class ImportedEvent {
        private final String id;
        private String slug;
        private String title;
        private String shortTitle;
        private String eventLevel;
        private String eventType;
        private String eventSubtype;
        private int startYear;
        private Integer endYear;
        private int effectiveEndYear;
        private String displayDate;
        private String datePrecision;
        private String geoType;
        private BigDecimal lat;
        private BigDecimal lng;
        private final Set<String> provinceNames = new LinkedHashSet<>();
        private final Set<String> historicalLocations = new LinkedHashSet<>();
        private String parentId;
        private String rootId;
        private int level;
        private int orderInParent;
        private String cardSummary;
        private String canonicalSummary;
        private String detailedNarrative;
        private String significance;
        private boolean showOnHomepage;
        private boolean showOnTimeline;
        private boolean featured;
        private String contentHash;
        private String rawJsonText;
        private JsonNode raw;
        private final Set<Integer> grades = new LinkedHashSet<>();
        private final List<JsonNode> textbookRefs = new ArrayList<>();

        private ImportedEvent(String id) {
            this.id = id;
        }

        private static ImportedEvent from(JsonNode raw, Path file, ObjectMapper objectMapper) throws IOException {
            String id = text(raw, "id");
            ImportedEvent event = new ImportedEvent(id);
            event.raw = raw;
            event.slug = firstNonBlank(text(raw, "slug"), id);
            event.title = firstNonBlank(text(raw.path("titles"), "primary"), id);
            event.shortTitle = text(raw.path("titles"), "short");
            event.eventLevel = firstNonBlank(text(raw, "eventLevel"), "atomic");
            if (!Objects.equals(event.eventLevel, "collection")) event.eventLevel = "atomic";
            event.eventType = normalizeEventType(text(raw.path("classification"), "eventType"));
            event.eventSubtype = text(raw.path("classification"), "eventSubtype");

            Integer startYear = intValue(raw.path("chronology").path("start").path("year"));
            event.startYear = startYear == null ? 0 : startYear;
            event.endYear = intValue(raw.path("chronology").path("end").path("year"));
            event.effectiveEndYear = event.endYear == null ? event.startYear : event.endYear;
            event.displayDate = text(raw.path("chronology"), "displayDate");
            event.datePrecision = text(raw.path("chronology"), "datePrecision");

            JsonNode displayGeometry = raw.path("mapData").path("displayGeometry");
            JsonNode marker = displayGeometry.path("marker");
            JsonNode focusCenter = raw.path("mapData").path("focusGeometry").path("center");
            event.geoType = normalizeGeoType(text(displayGeometry, "geoType"));
            event.lat = marker.hasNonNull("lat") ? decimalValue(marker.path("lat")) : decimalValue(focusCenter.path("lat"));
            event.lng = marker.hasNonNull("lng") ? decimalValue(marker.path("lng")) : decimalValue(focusCenter.path("lng"));
            addStringArray(event.provinceNames, displayGeometry.path("provinceNames"));
            addStringArray(event.historicalLocations, displayGeometry.path("historicalLocations"));

            JsonNode hierarchy = raw.path("hierarchy");
            event.parentId = text(hierarchy, "parentId");
            event.rootId = text(hierarchy, "rootId");
            event.level = intValue(hierarchy.path("level")) == null ? 0 : intValue(hierarchy.path("level"));
            event.orderInParent = intValue(hierarchy.path("orderInParent")) == null ? 0 : intValue(hierarchy.path("orderInParent"));

            event.cardSummary = text(raw.path("summary"), "cardSummary");
            event.canonicalSummary = text(raw.path("textbookContent"), "canonicalSummary");
            event.detailedNarrative = text(raw.path("textbookContent"), "detailedNarrative");
            event.significance = text(raw.path("textbookContent"), "significance");
            event.showOnHomepage = boolValue(raw.path("display").path("showOnHomepage"), true);
            event.showOnTimeline = boolValue(raw.path("display").path("showOnTimeline"), true);
            event.featured = boolValue(raw.path("display").path("featured"), false);

            addGrades(event.grades, raw.path("coverage").path("grades"), file);
            if (raw.path("textbookRefs").isArray()) {
                raw.path("textbookRefs").forEach(event.textbookRefs::add);
            }

            event.rawJsonText = objectMapper.writeValueAsString(raw);
            event.contentHash = sha256(event.rawJsonText);
            return event;
        }

        private ImportedEvent merge(ImportedEvent incoming) {
            this.slug = firstNonBlank(this.slug, incoming.slug);
            this.title = firstNonBlank(this.title, incoming.title);
            this.shortTitle = firstNonBlank(this.shortTitle, incoming.shortTitle);
            this.eventLevel = firstNonBlank(this.eventLevel, incoming.eventLevel);
            this.eventType = firstNonBlank(this.eventType, incoming.eventType);
            this.eventSubtype = firstNonBlank(this.eventSubtype, incoming.eventSubtype);
            if (this.startYear == 0 && incoming.startYear != 0) this.startYear = incoming.startYear;
            if (this.endYear == null) this.endYear = incoming.endYear;
            this.effectiveEndYear = this.endYear == null ? this.startYear : this.endYear;
            this.displayDate = firstNonBlank(this.displayDate, incoming.displayDate);
            this.datePrecision = firstNonBlank(this.datePrecision, incoming.datePrecision);
            if (Objects.equals(this.geoType, "no_location") && !Objects.equals(incoming.geoType, "no_location")) {
                this.geoType = incoming.geoType;
                this.lat = incoming.lat;
                this.lng = incoming.lng;
            }
            this.provinceNames.addAll(incoming.provinceNames);
            this.historicalLocations.addAll(incoming.historicalLocations);
            this.parentId = firstNonBlank(this.parentId, incoming.parentId);
            this.rootId = firstNonBlank(this.rootId, incoming.rootId);
            if (this.level == 0) this.level = incoming.level;
            if (this.orderInParent == 0) this.orderInParent = incoming.orderInParent;
            this.cardSummary = firstNonBlank(this.cardSummary, incoming.cardSummary);
            this.canonicalSummary = firstNonBlank(this.canonicalSummary, incoming.canonicalSummary);
            this.detailedNarrative = firstNonBlank(this.detailedNarrative, incoming.detailedNarrative);
            this.significance = firstNonBlank(this.significance, incoming.significance);
            this.showOnHomepage = this.showOnHomepage || incoming.showOnHomepage;
            this.showOnTimeline = this.showOnTimeline || incoming.showOnTimeline;
            this.featured = this.featured || incoming.featured;
            this.grades.addAll(incoming.grades);
            this.textbookRefs.addAll(incoming.textbookRefs);
            return this;
        }

        private static void addStringArray(Set<String> target, JsonNode values) {
            if (!values.isArray()) return;
            for (JsonNode value : values) {
                String text = value.asText(null);
                if (!isBlank(text)) target.add(text);
            }
        }

        private static void addGrades(Set<Integer> target, JsonNode values, Path file) {
            if (values.isArray()) {
                for (JsonNode value : values) {
                    Integer grade = intValue(value);
                    if (isValidGrade(grade)) target.add(grade);
                }
            }
            String folder = file.getParent() == null ? "" : file.getParent().getFileName().toString();
            if (folder.matches("json1[0-2]")) {
                target.add(Integer.parseInt(folder.substring(4)));
            }
        }
    }
}
