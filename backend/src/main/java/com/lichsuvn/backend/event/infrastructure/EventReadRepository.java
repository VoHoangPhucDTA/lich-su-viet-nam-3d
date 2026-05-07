package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventMediaDto;
import com.lichsuvn.backend.event.api.dto.EventRelationDto;
import com.lichsuvn.backend.event.api.dto.EventSummaryDto;
import com.lichsuvn.backend.event.api.dto.EventTextbookRefDto;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public EventReadRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

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
        QueryParts parts = buildEventFilters(year, grade, eventType, geoType, query, parentId, level);
        parts.params.addValue("limit", limit);
        parts.params.addValue("offset", offset);

        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, e.parent_id, e.root_id, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count
                FROM historical_events e
                WHERE e.status = 'published'
                """ + parts.whereSql + """
                ORDER BY e.start_year ASC, e.order_in_parent ASC, e.title ASC
                LIMIT :limit OFFSET :offset
                """;

        return jdbc.query(sql, parts.params, summaryMapper());
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
            filters.add("e.effective_end_year >= :fromYear");
            params.addValue("fromYear", from);
        }
        if (to != null) {
            filters.add("e.start_year <= :toYear");
            params.addValue("toYear", to);
        }
        if (StringUtils.hasText(eventType)) {
            filters.add("e.event_type = :eventType");
            params.addValue("eventType", eventType);
        }

        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_type,
                       e.start_year, e.end_year, e.display_date, e.parent_id, e.level, e.featured
                FROM historical_events e
                WHERE e.status = 'published'
                  AND e.show_on_timeline = TRUE
                """ + toWhere(filters) + """
                ORDER BY e.start_year ASC, e.order_in_parent ASC, e.title ASC
                """;

        return jdbc.query(sql, params, timelineMapper());
    }

    public Optional<EventDetailDto> findDetailByIdOrSlug(String idOrSlug) {
        MapSqlParameterSource params = new MapSqlParameterSource("idOrSlug", idOrSlug);
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.effective_end_year,
                       e.display_date, e.date_precision, e.geo_type, e.lat, e.lng,
                       e.province_names, e.historical_locations, e.parent_id, e.root_id,
                       e.level, e.order_in_parent, e.card_summary, e.canonical_summary,
                       e.detailed_narrative, e.significance, e.show_on_homepage,
                       e.show_on_timeline, e.featured, e.status, e.raw_json
                FROM historical_events e
                WHERE e.status = 'published'
                  AND (e.id = :idOrSlug OR e.slug = :idOrSlug)
                LIMIT 1
                """;

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
                base.showOnHomepage(),
                base.showOnTimeline(),
                base.featured(),
                base.status(),
                findGrades(base.id()),
                findTextbookRefs(base.id()),
                findMedia(base.id()),
                findRelations(base.id()),
                base.sourceJson()
        ));
    }

    public List<EventSummaryDto> findChildren(String eventId) {
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, e.parent_id, e.root_id, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
                       (
                           SELECT COUNT(*)
                           FROM historical_events c
                           WHERE c.parent_id = e.id
                             AND c.status = 'published'
                       ) AS child_count
                FROM historical_events e
                WHERE e.status = 'published'
                  AND e.parent_id = :eventId
                ORDER BY e.order_in_parent ASC, e.start_year ASC, e.title ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), summaryMapper());
    }

    public List<EventRelationDto> findRelations(String eventId) {
        String sql = """
                SELECT r.relation_type,
                       e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.display_date, e.geo_type,
                       e.lat, e.lng, e.province_names, e.parent_id, e.root_id, e.level,
                       e.order_in_parent, e.card_summary, e.featured,
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
                ORDER BY r.relation_type ASC, r.sort_order ASC, e.start_year ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) ->
                new EventRelationDto(rs.getString("relation_type"), mapSummary(rs))
        );
    }

    private List<Integer> findGrades(String eventId) {
        String sql = "SELECT grade FROM event_grades WHERE event_id = :eventId ORDER BY grade";
        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) -> rs.getInt("grade"));
    }

    private List<EventTextbookRefDto> findTextbookRefs(String eventId) {
        String sql = """
                SELECT id, grade, book, theme, lesson, page_start, page_end, excerpt, source_key
                FROM event_textbook_refs
                WHERE event_id = :eventId
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
                rs.getString("source_key")
        ));
    }

    private List<EventMediaDto> findMedia(String eventId) {
        String sql = """
                SELECT id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order
                FROM event_media
                WHERE event_id = :eventId
                  AND status = 'active'
                ORDER BY is_thumbnail DESC, sort_order ASC, id ASC
                """;

        return jdbc.query(sql, new MapSqlParameterSource("eventId", eventId), (rs, rowNum) -> new EventMediaDto(
                rs.getLong("id"),
                rs.getString("media_type"),
                rs.getString("url"),
                rs.getString("caption"),
                rs.getString("alt_text"),
                rs.getString("source_name"),
                rs.getString("license"),
                rs.getString("storage_type"),
                rs.getBoolean("is_thumbnail"),
                rs.getInt("sort_order")
        ));
    }

    private QueryParts buildEventFilters(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level
    ) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> filters = new ArrayList<>();

        if (year != null) {
            filters.add("e.start_year <= :year AND e.effective_end_year >= :year");
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
                        e.title LIKE :query
                        OR e.short_title LIKE :query
                        OR e.card_summary LIKE :query
                        OR e.canonical_summary LIKE :query
                        OR e.significance LIKE :query
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

        return new QueryParts(toWhere(filters), params);
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
                rs.getInt("start_year"),
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
                rs.getInt("start_year"),
                getInteger(rs, "end_year"),
                rs.getInt("effective_end_year"),
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
                rs.getBoolean("show_on_homepage"),
                rs.getBoolean("show_on_timeline"),
                rs.getBoolean("featured"),
                rs.getString("status"),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                parseObject(rs.getString("raw_json"))
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
                rs.getInt("start_year"),
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
                rs.getInt("child_count")
        );
    }

    private JsonNode parseJson(String value) {
        if (!StringUtils.hasText(value)) {
            return objectMapper.nullNode();
        }
        try {
            return objectMapper.readTree(value);
        } catch (Exception ex) {
            return objectMapper.nullNode();
        }
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

    private Object parseObject(String value) {
        if (!StringUtils.hasText(value)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(value, Object.class);
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private static String toWhere(List<String> filters) {
        if (filters.isEmpty()) {
            return "";
        }
        return " AND " + String.join(" AND ", filters) + " ";
    }

    private static Integer getInteger(ResultSet rs, String column) throws SQLException {
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
