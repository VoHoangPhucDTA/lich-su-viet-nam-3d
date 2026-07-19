package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Repairs normalized event support tables from historical_events.raw_json.
 *
 * This is deliberately a one-shot command profile. It only adds missing rows
 * and does not delete media, relations, or other enrichment that may not be
 * represented in the raw event document.
 */
@Component
@Profile("sync-source-json")
public class EventSourceJsonSyncRunner implements CommandLineRunner {

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final boolean apply;
    private final String scope;

    public EventSourceJsonSyncRunner(
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper,
            @Value("${app.import.source-json-sync.apply:false}") boolean apply,
            @Value("${app.import.source-json-sync.scope:all}") String scope
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.apply = apply;
        this.scope = scope;
    }

    @Override
    @Transactional
    public void run(String... args) {
        List<EventDocument> events = jdbc.query(
                "SELECT id, raw_json FROM historical_events ORDER BY id",
                new MapSqlParameterSource(),
                (rs, rowNum) -> new EventDocument(rs.getString("id"), parse(rs.getString("raw_json")))
        );
        Set<String> eventIds = events.stream().map(EventDocument::id).collect(java.util.stream.Collectors.toSet());
        SyncStats stats = new SyncStats();

        for (EventDocument event : events) {
            if (syncs("all", "grades")) syncGrades(event, stats);
            if (syncs("all", "textbook-refs")) syncTextbookRefs(event, stats);
            if (syncs("all", "media")) syncMedia(event, stats);
            if (syncs("all", "relations")) syncRelations(event, eventIds, stats);
        }

        System.out.printf(
                "Source JSON sync %s: events=%d, grades missing=%d inserted=%d, " +
                        "textbook refs missing=%d updated=%d inserted=%d, media missing=%d inserted=%d, " +
                        "relations missing=%d inserted=%d%n",
                apply ? "APPLIED" : "DRY-RUN",
                events.size(),
                stats.gradesMissing, stats.gradesInserted,
                stats.textbookRefsMissing, stats.textbookRefsUpdated, stats.textbookRefsInserted,
                stats.mediaMissing, stats.mediaInserted,
                stats.relationsMissing, stats.relationsInserted
        );
    }

    private boolean syncs(String... allowedScopes) {
        for (String allowed : allowedScopes) {
            if (allowed.equals(scope)) return true;
        }
        return false;
    }

    private void syncGrades(EventDocument event, SyncStats stats) {
        JsonNode grades = event.raw().path("coverage").path("grades");
        if (!grades.isArray()) return;

        Set<Integer> uniqueGrades = new LinkedHashSet<>();
        grades.forEach(value -> {
            int grade = value.asInt(-1);
            if (grade >= 10 && grade <= 12) uniqueGrades.add(grade);
        });

        for (Integer grade : uniqueGrades) {
            boolean exists = exists("""
                    SELECT 1 FROM event_grades
                    WHERE event_id = :eventId AND grade = :grade
                    LIMIT 1
                    """, params(event.id()).addValue("grade", grade));
            if (!exists) {
                stats.gradesMissing++;
                if (apply) {
                    jdbc.update("""
                            INSERT INTO event_grades (event_id, grade)
                            VALUES (:eventId, :grade)
                            """, params(event.id()).addValue("grade", grade));
                    stats.gradesInserted++;
                }
            }
        }
    }

    private void syncTextbookRefs(EventDocument event, SyncStats stats) {
        List<JsonNode> refs = textbookRefs(event.raw());
        for (JsonNode ref : refs) {
            Integer grade = integer(ref.path("grade"));
            if (grade == null || grade < 10 || grade > 12) continue;

            String book = text(ref, "book");
            if (!StringUtils.hasText(book)) book = "SGK Lich su " + grade;
            String theme = text(ref, "theme");
            String lesson = text(ref, "lesson");
            Integer pageStart = firstInteger(ref.path("pageStart"), ref.path("pageRange").path("start"));
            Integer pageEnd = firstInteger(ref.path("pageEnd"), ref.path("pageRange").path("end"));
            String excerpt = text(ref, "excerpt");
            String url = text(ref, "url");
            String sourceKey = "SGK" + grade + ":" + event.id();

            MapSqlParameterSource params = params(event.id())
                    .addValue("grade", grade)
                    .addValue("book", book)
                    .addValue("theme", theme)
                    .addValue("lesson", lesson)
                    .addValue("pageStart", pageStart)
                    .addValue("pageEnd", pageEnd)
                    .addValue("excerpt", excerpt)
                    .addValue("url", url)
                    .addValue("sourceKey", sourceKey);
            TextbookRefState existing = findTextbookRef(params);
            if (existing == null) {
                stats.textbookRefsMissing++;
                if (apply) {
                    jdbc.update("""
                            INSERT INTO event_textbook_refs
                                (event_id, grade, book, theme, lesson, page_start, page_end, excerpt,
                                 url, source_key)
                            VALUES
                                (:eventId, :grade, :book, :theme, :lesson, :pageStart, :pageEnd, :excerpt,
                                 :url, :sourceKey)
                            """, params);
                    stats.textbookRefsInserted++;
                }
            } else if (existing.hasMissingData(pageStart, pageEnd, url)) {
                stats.textbookRefsMissing++;
                stats.textbookRefsUpdated++;
                if (apply) {
                    jdbc.update("""
                            UPDATE event_textbook_refs
                            SET page_start = COALESCE(page_start, :pageStart),
                                page_end = COALESCE(page_end, :pageEnd),
                                url = COALESCE(url, :url)
                            WHERE id = :id
                            """, params.addValue("id", existing.id()));
                }
            }
        }
    }

    private TextbookRefState findTextbookRef(MapSqlParameterSource params) {
        List<TextbookRefState> refs = jdbc.query("""
                SELECT id, page_start, page_end, url
                FROM event_textbook_refs
                WHERE event_id = :eventId
                  AND grade = :grade
                  AND book = :book
                  AND ((theme = :theme) OR (theme IS NULL AND :theme IS NULL))
                  AND ((lesson = :lesson) OR (lesson IS NULL AND :lesson IS NULL))
                  AND ((excerpt = :excerpt) OR (excerpt IS NULL AND :excerpt IS NULL))
                  AND ((source_key = :sourceKey) OR (source_key IS NULL AND :sourceKey IS NULL))
                  AND (page_start = :pageStart OR page_start IS NULL OR :pageStart IS NULL)
                  AND (page_end = :pageEnd OR page_end IS NULL OR :pageEnd IS NULL)
                ORDER BY id
                LIMIT 1
                """, params, (rs, rowNum) -> new TextbookRefState(
                rs.getLong("id"),
                rs.getObject("page_start", Integer.class),
                rs.getObject("page_end", Integer.class),
                rs.getString("url")
        ));
        return refs.isEmpty() ? null : refs.get(0);
    }

    private void syncMedia(EventDocument event, SyncStats stats) {
        List<MediaRow> media = new ArrayList<>();
        String thumbnail = text(event.raw().path("media"), "thumbnail");
        if (StringUtils.hasText(thumbnail)) {
            media.add(new MediaRow("image", thumbnail, text(event.raw().path("titles"), "primary"),
                    text(event.raw().path("titles"), "short"), null, null, storageType(thumbnail), true, 0));
        }

        JsonNode items = event.raw().path("media").path("items");
        if (items.isArray()) {
            int sortOrder = 1;
            for (JsonNode item : items) {
                String url = text(item, "url");
                if (!StringUtils.hasText(url)) continue;
                String type = normalizeMediaType(text(item, "type"));
                media.add(new MediaRow(type, url, text(item, "caption"), text(item, "caption"),
                        text(item, "sourceName"), text(item, "license"), storageType(url), false, sortOrder++));
            }
        }

        for (MediaRow row : media) {
            MapSqlParameterSource params = params(event.id())
                    .addValue("mediaType", row.mediaType())
                    .addValue("url", row.url());
            boolean exists = exists("""
                    SELECT 1 FROM event_media
                    WHERE event_id = :eventId AND media_type = :mediaType AND url = :url
                    LIMIT 1
                    """, params);
            if (!exists) {
                stats.mediaMissing++;
                if (apply) {
                    jdbc.update("""
                            INSERT INTO event_media
                                (event_id, media_type, url, caption, alt_text, source_name, license,
                                 storage_type, is_thumbnail, sort_order, status)
                            VALUES
                                (:eventId, :mediaType, :url, :caption, :altText, :sourceName, :license,
                                 :storageType, :isThumbnail, :sortOrder, 'active')
                            """, params
                            .addValue("caption", row.caption())
                            .addValue("altText", row.altText())
                            .addValue("sourceName", row.sourceName())
                            .addValue("license", row.license())
                            .addValue("storageType", row.storageType())
                            .addValue("isThumbnail", row.thumbnail())
                            .addValue("sortOrder", row.sortOrder()));
                    stats.mediaInserted++;
                }
            }
        }
    }

    private void syncRelations(EventDocument event, Set<String> eventIds, SyncStats stats) {
        JsonNode associations = event.raw().path("associations");
        syncRelationArray(event.id(), associations.path("relatedEventIds"), "related", eventIds, stats);
        syncRelationArray(event.id(), associations.path("predecessorEventIds"), "predecessor", eventIds, stats);
        syncRelationArray(event.id(), associations.path("successorEventIds"), "successor", eventIds, stats);
    }

    private void syncRelationArray(String sourceId, JsonNode targets, String relationType,
                                   Set<String> eventIds, SyncStats stats) {
        if (!targets.isArray()) return;
        int sortOrder = 1;
        for (JsonNode targetNode : targets) {
            String targetId = targetNode.asText(null);
            if (!StringUtils.hasText(targetId) || sourceId.equals(targetId) || !eventIds.contains(targetId)) {
                sortOrder++;
                continue;
            }
            MapSqlParameterSource params = params(sourceId)
                    .addValue("targetId", targetId)
                    .addValue("relationType", relationType);
            boolean exists = exists("""
                    SELECT 1 FROM event_relations
                    WHERE source_event_id = :eventId
                      AND target_event_id = :targetId
                      AND relation_type = :relationType
                    LIMIT 1
                    """, params);
            if (!exists) {
                stats.relationsMissing++;
                if (apply) {
                    jdbc.update("""
                            INSERT INTO event_relations
                                (source_event_id, target_event_id, association_type, relation_type, sort_order)
                            VALUES
                                (:eventId, :targetId, :relationType, :relationType, :sortOrder)
                            """, params.addValue("sortOrder", sortOrder));
                    stats.relationsInserted++;
                }
            }
            sortOrder++;
        }
    }

    private boolean exists(String sql, MapSqlParameterSource params) {
        return !jdbc.queryForList(sql, params, Integer.class).isEmpty();
    }

    private List<JsonNode> textbookRefs(JsonNode raw) {
        Map<String, JsonNode> unique = new LinkedHashMap<>();
        addRefNodes(unique, raw.path("textbookRefs"));
        addRefNodes(unique, raw.path("textbookContent").path("textbookRefs"));
        return new ArrayList<>(unique.values());
    }

    private void addRefNodes(Map<String, JsonNode> target, JsonNode refs) {
        if (!refs.isArray()) return;
        for (JsonNode ref : refs) target.putIfAbsent(ref.toString(), ref);
    }

    private JsonNode parse(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Invalid historical_events.raw_json", ex);
        }
    }

    private static MapSqlParameterSource params(String eventId) {
        return new MapSqlParameterSource("eventId", eventId);
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        String value = node.path(field).asText(null);
        return StringUtils.hasText(value) ? value : null;
    }

    private static Integer integer(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (node.isNumber()) return node.intValue();
        String value = node.asText(null);
        if (!StringUtils.hasText(value)) return null;
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Integer firstInteger(JsonNode primary, JsonNode fallback) {
        Integer value = integer(primary);
        return value != null ? value : integer(fallback);
    }

    private static String normalizeMediaType(String type) {
        return switch (type == null ? "" : type.toLowerCase()) {
            case "video" -> "video";
            case "document", "pdf" -> "document";
            case "audio" -> "audio";
            default -> "image";
        };
    }

    private static String storageType(String url) {
        return url != null && (url.startsWith("http://") || url.startsWith("https://"))
                ? "external" : "local";
    }

    private record EventDocument(String id, JsonNode raw) {}

    private record TextbookRefState(Long id, Integer pageStart, Integer pageEnd, String url) {
        private boolean hasMissingData(Integer sourcePageStart, Integer sourcePageEnd,
                                       String sourceUrl) {
            return pageStart == null && sourcePageStart != null
                    || pageEnd == null && sourcePageEnd != null
                    || !StringUtils.hasText(url) && StringUtils.hasText(sourceUrl);
        }
    }

    private record MediaRow(String mediaType, String url, String caption, String altText,
                            String sourceName, String license, String storageType,
                            boolean thumbnail, int sortOrder) {}

    private static final class SyncStats {
        private int gradesMissing;
        private int gradesInserted;
        private int textbookRefsMissing;
        private int textbookRefsUpdated;
        private int textbookRefsInserted;
        private int mediaMissing;
        private int mediaInserted;
        private int relationsMissing;
        private int relationsInserted;
    }
}
