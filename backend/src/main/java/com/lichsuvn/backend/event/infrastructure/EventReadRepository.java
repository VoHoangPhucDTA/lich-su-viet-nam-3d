package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventExternalSourceDto;
import com.lichsuvn.backend.event.api.dto.EventMediaDto;
import com.lichsuvn.backend.event.api.dto.EventRelatedEventDto;
import com.lichsuvn.backend.event.api.dto.EventRelatedEventsDto;
import com.lichsuvn.backend.event.api.dto.EventRelationDto;
import com.lichsuvn.backend.event.api.dto.EventSummaryDto;
import com.lichsuvn.backend.event.api.dto.EventTextbookRefDto;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import com.lichsuvn.backend.common.media.EventMediaReadPolicy;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Repository đọc dữ liệu event bằng JdbcTemplate projection.
 *
 * Lý do không dùng JPA entity cho các endpoint này:
 * - Map/timeline/sidebar là read-heavy và chỉ cần DTO nhẹ.
 * - Không muốn list endpoint vô tình SELECT/serialize raw_json hoặc narrative dài.
 * - Query có filter theo grade/year/type/geoType cần kiểm soát SQL và index rõ ràng.
 */
@Repository
public class EventReadRepository {
    static final String NUMERIC_CHRONOLOGY_REQUIRED =
            "e.start_year IS NOT NULL AND e.effective_end_year IS NOT NULL";
    static final String PUBLIC_PARENT_ID = """
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM historical_events visible_parent
                    WHERE visible_parent.id = e.parent_id
                      AND visible_parent.status = 'published'
                )
                THEN e.parent_id
                ELSE NULL
            END AS parent_id
            """;
    static final String PUBLIC_ROOT_ID = """
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM historical_events visible_root
                    WHERE visible_root.id = e.root_id
                      AND visible_root.status = 'published'
                )
                THEN e.root_id
                ELSE NULL
            END AS root_id
            """;
    static final String CHRONOLOGY_NULL_LAST_ORDER = """
            CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
            e.start_year ASC,
            e.order_in_parent ASC,
            e.title ASC,
            e.id ASC
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final MediaUrlPolicy mediaUrlPolicy;
    private final EventMediaReadPolicy mediaReadPolicy;
    private volatile Boolean eventRelationsHasAssociationType;

    public EventReadRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this(jdbc, objectMapper, new MediaUrlPolicy());
    }

    public EventReadRepository(
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper,
            MediaUrlPolicy mediaUrlPolicy
    ) {
        this(jdbc, objectMapper, mediaUrlPolicy, new EventMediaReadPolicy(mediaUrlPolicy));
    }

    @Autowired
    public EventReadRepository(
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper,
            MediaUrlPolicy mediaUrlPolicy,
            EventMediaReadPolicy mediaReadPolicy
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.mediaUrlPolicy = mediaUrlPolicy;
        this.mediaReadPolicy = mediaReadPolicy;
    }

    /**
     * Backward-compatible entry point retained for existing repository tests and callers.
     */
    public List<EventSummaryDto> findEvents(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level,
            int limit,
            int offset
    ) {
        return findEvents(
                year, grade, eventType, geoType, query, parentId, level,
                null, null, null, "year", "asc", limit, offset
        );
    }

    public List<EventSummaryDto> findEvents(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level,
            String eventLevel,
            Integer startYearFrom,
            Integer startYearTo,
            String sortBy,
            String sortDir,
            int limit,
            int offset
    ) {
        QueryParts parts = buildEventFilters(
                year, grade, eventType, geoType, query, parentId, level,
                eventLevel, startYearFrom, startYearTo
        );
        parts.params.addValue("limit", limit);
        parts.params.addValue("offset", offset);

        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, %s, %s, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
                       (
                           SELECT em.url
                           FROM event_media em
                           WHERE em.event_id = e.id
                             AND em.status = 'active'
                             AND (
                               em.storage_state='UNMANAGED'
                               OR (
                                 em.storage_state='READY'
                                 AND em.storage_provider='cloudinary'
                                 AND TRIM(em.storage_public_id)<>''
                               )
                             )
                             AND em.is_thumbnail = TRUE
                           ORDER BY em.sort_order ASC, em.id ASC
                           LIMIT 1
                       ) AS thumbnail_url,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count
                FROM historical_events e
                WHERE e.status = 'published'
                """.formatted(PUBLIC_PARENT_ID, PUBLIC_ROOT_ID)
                + parts.whereSql + buildOrderBy(sortBy, sortDir) + """
                LIMIT :limit OFFSET :offset
                """;

        // 1.1.6: MySQL: Trả về danh sách Event Entity.
        return jdbc.query(sql, parts.params(), summaryMapper());
    }

    public int countEvents(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level,
            String eventLevel,
            Integer startYearFrom,
            Integer startYearTo
    ) {
        QueryParts parts = buildEventFilters(
                year, grade, eventType, geoType, query, parentId, level,
                eventLevel, startYearFrom, startYearTo
        );
        String sql = """
                SELECT COUNT(*)
                FROM historical_events e
                WHERE e.status = 'published'
                """ + parts.whereSql;
        Integer total = jdbc.queryForObject(sql, parts.params(), Integer.class);
        return total == null ? 0 : total;
    }

    public List<TimelineEventDto> findTimeline(Integer from, Integer to, Integer grade, String eventType) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> filters = new ArrayList<>();

        if (grade != null) {
            filters.add("""
                    EXISTS (
                        SELECT 1
                        FROM event_grades eg
                        WHERE eg.event_id = e.id
                          AND eg.grade = :grade
                    )
                    """);
            params.addValue("grade", grade);
        }
        if (from != null) {
            addNumericChronologyRequired(filters);
            filters.add("e.effective_end_year >= :fromYear");
            params.addValue("fromYear", from);
        }
        if (to != null) {
            addNumericChronologyRequired(filters);
            filters.add("e.start_year <= :toYear");
            params.addValue("toYear", to);
        }
        if (StringUtils.hasText(eventType)) {
            filters.add("e.event_type = :eventType");
            params.addValue("eventType", eventType);
        }

        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_type,
                       e.start_year, e.end_year, e.display_date, %s, e.level, e.featured
                FROM historical_events e
                WHERE e.status = 'published'
                  AND e.show_on_timeline = TRUE
                """.formatted(PUBLIC_PARENT_ID) + toWhere(filters)
                + " ORDER BY " + CHRONOLOGY_NULL_LAST_ORDER + """
                """;

        return jdbc.query(sql, params, timelineMapper());
    }

    public Optional<EventDetailDto> findDetailByIdOrSlug(String idOrSlug) {
        MapSqlParameterSource params = new MapSqlParameterSource("idOrSlug", idOrSlug);
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.effective_end_year,
                       e.display_date, e.date_precision, e.geo_type, e.lat, e.lng,
                       e.province_names, e.historical_locations, %s, %s,
                       e.level, e.order_in_parent, e.card_summary, e.canonical_summary,
                       e.detailed_narrative, e.significance, e.key_facts, e.show_on_homepage,
                       e.show_on_timeline, e.featured,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count,
                       e.status, e.raw_json
                FROM historical_events e
                WHERE e.status = 'published'
                  AND (e.id = :idOrSlug OR e.slug = :idOrSlug)
                LIMIT 1
                """.formatted(PUBLIC_PARENT_ID, PUBLIC_ROOT_ID);

        List<EventDetailDto> results = jdbc.query(sql, params, detailMapper());
        if (results.isEmpty()) {
            return Optional.empty();
        }

        EventDetailDto base = results.get(0);
        return Optional.of(new EventDetailDto(
                base.id(),
                base.slug(),
                base.title(),
                base.shortTitle(),
                base.eventLevel(),
                base.eventType(),
                base.eventSubtype(),
                base.startYear(),
                base.endYear(),
                base.effectiveEndYear(),
                base.displayDate(),
                base.datePrecision(),
                base.geoType(),
                base.lat(),
                base.lng(),
                base.provinceNames(),
                base.historicalLocations(),
                base.parentId(),
                base.rootId(),
                base.level(),
                base.orderInParent(),
                base.cardSummary(),
                base.canonicalSummary(),
                base.detailedNarrative(),
                base.significance(),
                base.keyFacts(),
                base.showOnHomepage(),
                base.showOnTimeline(),
                base.featured(),
                base.childCount(),
                base.status(),
                findGrades(base.id()),
                findTextbookRefs(base.id()),
                findExternalSources(base.id()),
                findMedia(base.id()),
                findRelations(base.id()),
                findRelatedEvents(base.id()),
                findTextbookContent(base.id()),
                base.mapData()
        ));
    }

    public List<EventSummaryDto> findChildren(String eventId) {
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, %s, %s, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
                       (
                           SELECT em.url
                           FROM event_media em
                           WHERE em.event_id = e.id
                             AND em.status = 'active'
                             AND (
                               em.storage_state='UNMANAGED'
                               OR (
                                 em.storage_state='READY'
                                 AND em.storage_provider='cloudinary'
                                 AND TRIM(em.storage_public_id)<>''
                               )
                             )
                             AND em.is_thumbnail = TRUE
                           ORDER BY em.sort_order ASC, em.id ASC
                           LIMIT 1
                       ) AS thumbnail_url,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count
                FROM historical_events e
                WHERE e.status = 'published'
                  AND e.parent_id = :eventId
                  AND EXISTS (
                      SELECT 1 FROM historical_events source_event
                      WHERE source_event.id=:eventId
                        AND source_event.status='published'
                  )
                ORDER BY e.order_in_parent ASC,
                         CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
                         e.start_year ASC,
                         e.title ASC,
                         e.id ASC
                """.formatted(PUBLIC_PARENT_ID, PUBLIC_ROOT_ID);

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), summaryMapper());
    }

    public List<EventRelationDto> findRelations(String eventId) {
        String associationTypeSql = eventRelationAssociationTypeSql("r");
        String sql = """
                SELECT %s AS association_type, r.relation_type, r.sort_order,
                       e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, %s, %s, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
                       (
                           SELECT em.url
                           FROM event_media em
                           WHERE em.event_id = e.id
                             AND em.status = 'active'
                             AND (
                               em.storage_state='UNMANAGED'
                               OR (
                                 em.storage_state='READY'
                                 AND em.storage_provider='cloudinary'
                                 AND TRIM(em.storage_public_id)<>''
                               )
                             )
                             AND em.is_thumbnail = TRUE
                           ORDER BY em.sort_order ASC, em.id ASC
                           LIMIT 1
                       ) AS thumbnail_url,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count
                FROM event_relations r
                JOIN historical_events e ON e.id = r.target_event_id
                WHERE r.source_event_id = :eventId
                  AND e.status = 'published'
                  AND EXISTS (
                      SELECT 1 FROM historical_events source_event
                      WHERE source_event.id=:eventId
                        AND source_event.status='published'
                  )
                  AND e.id <> :eventId
                ORDER BY FIELD(%s, 'predecessor', 'successor', 'related'),
                         r.sort_order ASC,
                         r.relation_type ASC,
                         CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
                         e.start_year ASC,
                         e.title ASC,
                         e.id ASC
                """.formatted(
                associationTypeSql,
                PUBLIC_PARENT_ID,
                PUBLIC_ROOT_ID,
                associationTypeSql
        );

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) ->
                new EventRelationDto(
                        rs.getString("association_type"),
                        rs.getString("relation_type"),
                        EventRelationDto.relationLabel(rs.getString("relation_type")),
                        rs.getInt("sort_order"),
                        mapSummary(rs)
                )
        );
    }

    public EventRelatedEventsDto findRelatedEvents(String eventId) {
        String associationTypeSql = eventRelationAssociationTypeSql("r");
        String sql = """
                SELECT %s AS association_type, r.relation_type, r.sort_order,
                       e.id, e.slug, e.title, e.short_title, e.display_date,
                       e.card_summary, e.event_type, e.geo_type, e.start_year,
                       (
                           SELECT em.url
                           FROM event_media em
                           WHERE em.event_id = e.id
                             AND em.status = 'active'
                             AND (
                               em.storage_state='UNMANAGED'
                               OR (
                                 em.storage_state='READY'
                                 AND em.storage_provider='cloudinary'
                                 AND TRIM(em.storage_public_id)<>''
                               )
                             )
                             AND em.is_thumbnail = TRUE
                           ORDER BY em.sort_order ASC, em.id ASC
                           LIMIT 1
                       ) AS thumbnail_url
                FROM event_relations r
                JOIN historical_events e ON e.id = r.target_event_id
                WHERE r.source_event_id = :eventId
                  AND e.status = 'published'
                  AND EXISTS (
                      SELECT 1 FROM historical_events source_event
                      WHERE source_event.id=:eventId
                        AND source_event.status='published'
                  )
                  AND e.id <> :eventId
                ORDER BY FIELD(%s, 'predecessor', 'successor', 'related'),
                         r.sort_order ASC,
                         r.relation_type ASC,
                         CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
                         e.start_year ASC,
                         e.title ASC,
                         e.id ASC
                """.formatted(associationTypeSql, associationTypeSql);

        List<EventRelatedEventDto> rows = jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) ->
                new EventRelatedEventDto(
                        rs.getString("id"),
                        rs.getString("slug"),
                        rs.getString("title"),
                        rs.getString("short_title"),
                        rs.getString("display_date"),
                        rs.getString("card_summary"),
                        rs.getString("event_type"),
                        rs.getString("geo_type"),
                        mediaUrlPolicy.redactDisplayUrl(rs.getString("thumbnail_url")),
                        rs.getString("association_type"),
                        rs.getString("relation_type"),
                        EventRelationDto.relationLabel(rs.getString("relation_type")),
                        rs.getInt("sort_order")
                )
        );

        List<EventRelatedEventDto> predecessors = new ArrayList<>();
        List<EventRelatedEventDto> successors = new ArrayList<>();
        List<EventRelatedEventDto> related = new ArrayList<>();
        Set<String> seenEventIds = new LinkedHashSet<>();

        for (EventRelatedEventDto row : rows) {
            if (!seenEventIds.add(row.id())) {
                continue;
            }
            switch (row.associationType()) {
                case "predecessor" -> predecessors.add(row);
                case "successor" -> successors.add(row);
                default -> related.add(row);
            }
        }

        return new EventRelatedEventsDto(predecessors, successors, related);
    }

    private String eventRelationAssociationTypeSql(String alias) {
        if (hasEventRelationAssociationTypeColumn()) {
            return alias + ".association_type";
        }
        return """
                CASE
                    WHEN %s.relation_type = 'predecessor' THEN 'predecessor'
                    WHEN %s.relation_type = 'successor' THEN 'successor'
                    ELSE 'related'
                END
                """.formatted(alias, alias);
    }

    private boolean hasEventRelationAssociationTypeColumn() {
        Boolean cached = eventRelationsHasAssociationType;
        if (cached != null) {
            return cached;
        }
        try {
            Integer count = jdbc.getJdbcTemplate().queryForObject("""
                    SELECT COUNT(*)
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'event_relations'
                      AND COLUMN_NAME = 'association_type'
                    """, Integer.class);
            boolean exists = count != null && count > 0;
            eventRelationsHasAssociationType = exists;
            return exists;
        } catch (Exception ignored) {
            eventRelationsHasAssociationType = false;
            return false;
        }
    }

    private List<Integer> findGrades(String eventId) {
        String sql = "SELECT grade FROM event_grades WHERE event_id = :eventId ORDER BY grade";
        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) -> rs.getInt("grade"));
    }

    private List<EventTextbookRefDto> findTextbookRefs(String eventId) {
        String sql = """
                SELECT id, grade, book, theme, lesson, page_start, page_end, excerpt,
                       url, source_key
                FROM event_textbook_refs
                WHERE event_id = :eventId
                  AND show_on_detail = 1
                ORDER BY grade ASC, page_start ASC, id ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) -> new EventTextbookRefDto(
                rs.getLong("id"),
                rs.getInt("grade"),
                rs.getString("book"),
                rs.getString("theme"),
                rs.getString("lesson"),
                getInteger(rs, "page_start"),
                getInteger(rs, "page_end"),
                rs.getString("excerpt"),
                rs.getString("url"),
                rs.getString("source_key")
        ));
    }

    private String findTextbookContent(String eventId) {
        return jdbc.query("""
                SELECT content
                FROM event_textbook_contents
                WHERE event_id = :eventId
                """, new MapSqlParameterSource("eventId", eventId),
                rs -> rs.next() ? rs.getString("content") : null);
    }

    private List<EventMediaDto> findMedia(String eventId) {
        String sql = """
                SELECT id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status,
                       storage_state,storage_provider,storage_public_id,storage_version
                FROM event_media
                WHERE event_id = :eventId
                  AND status = 'active'
                ORDER BY is_thumbnail DESC, sort_order ASC, id ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) -> {
            Long providerVersion = rs.getObject("storage_version") == null
                    ? null : rs.getLong("storage_version");
            String visibleUrl = mediaReadPolicy.visibleUrl(
                    new EventMediaReadPolicy.MediaDescriptor(
                            rs.getString("storage_state"),
                            rs.getString("status"),
                            rs.getString("url"),
                            rs.getString("storage_provider"),
                            rs.getString("storage_public_id"),
                            providerVersion,
                            rs.getBoolean("is_thumbnail")));
            if (visibleUrl == null) {
                return null;
            }
            return new EventMediaDto(
                rs.getLong("id"),
                rs.getString("media_type"),
                visibleUrl,
                mediaUrlPolicy.redactMetadata(rs.getString("caption")),
                mediaUrlPolicy.redactMetadata(rs.getString("alt_text")),
                mediaUrlPolicy.redactMetadata(rs.getString("source_name")),
                mediaUrlPolicy.redactMetadata(rs.getString("license")),
                rs.getString("storage_type"),
                rs.getBoolean("is_thumbnail"),
                rs.getInt("sort_order")
            );
        }).stream().filter(java.util.Objects::nonNull).toList();
    }

    private QueryParts buildEventFilters(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level,
            String eventLevel,
            Integer startYearFrom,
            Integer startYearTo
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> filters = new ArrayList<>();

        if (year != null) {
            filters.add(NUMERIC_CHRONOLOGY_REQUIRED + " AND e.start_year <= :year AND e.effective_end_year >= :year");
            params.addValue("year", year);
        }
        if (grade != null) {
            filters.add("""
                    EXISTS (
                        SELECT 1
                        FROM event_grades eg
                        WHERE eg.event_id = e.id
                          AND eg.grade = :grade
                    )
                    """);
            params.addValue("grade", grade);
        }
        if (StringUtils.hasText(eventType)) {
            filters.add("e.event_type = :eventType");
            params.addValue("eventType", eventType);
        }
        if (StringUtils.hasText(geoType)) {
            filters.add("e.geo_type = :geoType");
            params.addValue("geoType", geoType);
        }
        if (StringUtils.hasText(query)) {
            filters.add("""
                    (
                        e.title COLLATE utf8mb4_0900_ai_ci LIKE :query COLLATE utf8mb4_0900_ai_ci
                        OR e.short_title COLLATE utf8mb4_0900_ai_ci LIKE :query COLLATE utf8mb4_0900_ai_ci
                        OR e.card_summary COLLATE utf8mb4_0900_ai_ci LIKE :query COLLATE utf8mb4_0900_ai_ci
                        OR e.canonical_summary COLLATE utf8mb4_0900_ai_ci LIKE :query COLLATE utf8mb4_0900_ai_ci
                        OR e.significance COLLATE utf8mb4_0900_ai_ci LIKE :query COLLATE utf8mb4_0900_ai_ci
                    )
                    """);
            params.addValue("query", "%" + query.trim() + "%");
        }
        if (StringUtils.hasText(parentId)) {
            filters.add("e.parent_id = :parentId");
            params.addValue("parentId", parentId);
        }
        if (level != null) {
            filters.add("e.level = :level");
            params.addValue("level", level);
        }
        if (StringUtils.hasText(eventLevel)) {
            filters.add("e.event_level = :eventLevel");
            params.addValue("eventLevel", eventLevel);
        }
        if (startYearFrom != null) {
            filters.add("e.start_year >= :startYearFrom");
            params.addValue("startYearFrom", startYearFrom);
        }
        if (startYearTo != null) {
            filters.add("e.start_year < :startYearTo");
            params.addValue("startYearTo", startYearTo);
        }

        return new QueryParts(toWhere(filters), params);
    }

    private String buildOrderBy(String sortBy, String sortDir) {
        String direction = "desc".equalsIgnoreCase(sortDir) ? "DESC" : "ASC";
        if ("name".equalsIgnoreCase(sortBy)) {
            return " ORDER BY e.title " + direction + ", e.id ASC ";
        }
        return " ORDER BY CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END, e.start_year "
                + direction + ", e.order_in_parent ASC, e.title ASC, e.id ASC ";
    }

    private RowMapper<EventSummaryDto> summaryMapper() {
        return (rs, rowNum) -> mapSummary(rs);
    }

    private RowMapper<TimelineEventDto> timelineMapper() {
        return (rs, rowNum) -> new TimelineEventDto(
                rs.getString("id"),
                rs.getString("slug"),
                rs.getString("title"),
                rs.getString("short_title"),
                rs.getString("event_type"),
                getInteger(rs, "start_year"),
                getInteger(rs, "end_year"),
                rs.getString("display_date"),
                rs.getString("parent_id"),
                rs.getInt("level"),
                rs.getBoolean("featured")
        );
    }

    private RowMapper<EventDetailDto> detailMapper() {
        return (rs, rowNum) -> new EventDetailDto(
                rs.getString("id"),
                rs.getString("slug"),
                rs.getString("title"),
                rs.getString("short_title"),
                rs.getString("event_level"),
                rs.getString("event_type"),
                rs.getString("event_subtype"),
                getInteger(rs, "start_year"),
                getInteger(rs, "end_year"),
                getInteger(rs, "effective_end_year"),
                rs.getString("display_date"),
                rs.getString("date_precision"),
                rs.getString("geo_type"),
                rs.getBigDecimal("lat"),
                rs.getBigDecimal("lng"),
                parseStringList(rs.getString("province_names")),
                parseStringList(rs.getString("historical_locations")),
                rs.getString("parent_id"),
                rs.getString("root_id"),
                rs.getInt("level"),
                rs.getInt("order_in_parent"),
                rs.getString("card_summary"),
                rs.getString("canonical_summary"),
                rs.getString("detailed_narrative"),
                rs.getString("significance"),
                parseStringList(rs.getString("key_facts")),
                rs.getBoolean("show_on_homepage"),
                rs.getBoolean("show_on_timeline"),
                rs.getBoolean("featured"),
                rs.getInt("child_count"),
                rs.getString("status"),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                EventRelatedEventsDto.empty(),
                null,
                parsePublicMapData(rs.getString("raw_json"))
        );
    }

    private EventSummaryDto mapSummary(ResultSet rs) throws SQLException {
        return new EventSummaryDto(
                rs.getString("id"),
                rs.getString("slug"),
                rs.getString("title"),
                rs.getString("short_title"),
                rs.getString("event_level"),
                rs.getString("event_type"),
                rs.getString("event_subtype"),
                getInteger(rs, "start_year"),
                getInteger(rs, "end_year"),
                rs.getString("display_date"),
                rs.getString("geo_type"),
                getBigDecimal(rs, "lat"),
                getBigDecimal(rs, "lng"),
                parseStringList(rs.getString("province_names")),
                rs.getString("parent_id"),
                rs.getString("root_id"),
                rs.getInt("level"),
                rs.getInt("order_in_parent"),
                rs.getString("card_summary"),
                rs.getBoolean("featured"),
                mediaUrlPolicy.redactDisplayUrl(rs.getString("thumbnail_url")),
                rs.getInt("child_count")
        );
    }

    JsonNode parsePublicMapData(String value) {
        return PublicMapDataSanitizer.fromDocument(objectMapper, value);
    }

    private List<String> parseStringList(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(value);
            if (!node.isArray()) {
                return List.of();
            }
            List<String> items = new ArrayList<>();
            for (JsonNode item : node) {
                if (item.isTextual() || item.isNumber()) {
                    items.add(item.asText());
                }
            }
            return items;
        } catch (Exception ex) {
            return List.of();
        }
    }

    private static String toWhere(List<String> filters) {
        if (filters.isEmpty()) {
            return "";
        }
        return " AND " + String.join(" AND ", filters) + " ";
    }

    private List<EventExternalSourceDto> findExternalSources(String eventId) {
        String sql = """
                SELECT s.source_type, s.title, s.canonical_uri, s.external_id, s.language,
                       e.source_order, e.match_type, e.is_primary, e.verification_status, e.notes
                FROM event_external_sources e
                JOIN source_catalog s ON s.id = e.source_id
                WHERE e.event_id = :eventId
                  AND s.is_internal = FALSE
                ORDER BY e.is_primary DESC, e.source_order ASC, s.id ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) ->
                new EventExternalSourceDto(
                        rs.getString("source_type"),
                        rs.getString("title"),
                        rs.getString("canonical_uri"),
                        rs.getString("external_id"),
                        rs.getString("language"),
                        getInteger(rs, "source_order"),
                        rs.getString("match_type"),
                        rs.getBoolean("is_primary"),
                        rs.getString("verification_status"),
                        rs.getString("notes")
                ));
    }

    private static void addNumericChronologyRequired(List<String> filters) {
        if (!filters.contains(NUMERIC_CHRONOLOGY_REQUIRED)) {
            filters.add(NUMERIC_CHRONOLOGY_REQUIRED);
        }
    }

    static Integer getInteger(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static BigDecimal getBigDecimal(ResultSet rs, String column) throws SQLException {
        BigDecimal value = rs.getBigDecimal(column);
        return rs.wasNull() ? null : value;
    }

    private record QueryParts(String whereSql, MapSqlParameterSource params) {
    }
}
