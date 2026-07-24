package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.EventCompletenessFacts;
import com.lichsuvn.backend.event.infrastructure.PublicMapDataSanitizer;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminEventReadRepository {
    private static final String MAP_DATA = "JSON_EXTRACT(e.raw_json, '$.mapData')";
    private static final String CANONICAL_GEO = """
            CASE
              WHEN JSON_TYPE(JSON_EXTRACT(e.raw_json, '$.mapData.geoType')) = 'STRING'
               AND JSON_UNQUOTE(JSON_EXTRACT(e.raw_json, '$.mapData.geoType'))
                   IN ('point','multi_point','multi_polygon','mixed','nationwide','no_location')
                THEN JSON_UNQUOTE(JSON_EXTRACT(e.raw_json, '$.mapData.geoType'))
              WHEN e.geo_type = 'single_point' THEN 'point'
              WHEN e.geo_type = 'multi_region' THEN 'multi_polygon'
              ELSE e.geo_type
            END
            """;
    private static final String VALID_CHRONOLOGY = """
            e.start_year IS NOT NULL
            AND e.start_year <> 0
            AND (e.end_year IS NULL OR (e.end_year <> 0 AND e.end_year >= e.start_year))
            AND e.effective_end_year = COALESCE(e.end_year, e.start_year)
            """;
    private static final String UNKNOWN_CHRONOLOGY =
            "e.start_year IS NULL AND e.end_year IS NULL AND e.effective_end_year IS NULL";

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public AdminEventReadRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public long count(AdminEventReadService.Query query) {
        SqlParts parts = filters(query);
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM historical_events e " + parts.where(),
                parts.params(), Long.class);
        return count == null ? 0 : count;
    }

    public List<ListRow> findPage(AdminEventReadService.Query query) {
        SqlParts parts = filters(query);
        parts.params().addValue("limit", query.limit()).addValue("offset", query.offset());
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.effective_end_year,
                       e.display_date, e.date_precision, e.status, e.geo_type, e.lat, e.lng,
                       e.card_summary,
                       e.province_names, e.historical_locations, e.show_on_homepage,
                       e.show_on_timeline, e.featured, e.created_at, e.updated_at,
                       e.key_facts,
                       (TRIM(e.title) <> '') AS title_present,
                       (TRIM(e.slug) <> '') AS slug_present,
                       (e.card_summary IS NOT NULL AND TRIM(e.card_summary) <> '') AS card_present,
                       (e.canonical_summary IS NOT NULL AND TRIM(e.canonical_summary) <> '') AS canonical_present,
                       (e.detailed_narrative IS NOT NULL AND TRIM(e.detailed_narrative) <> '') AS narrative_present,
                       (e.significance IS NOT NULL AND TRIM(e.significance) <> '') AS significance_present,
                       JSON_TYPE(%s) AS map_data_type,
                       %s AS map_data_json,
                       COALESCE((
                           SELECT COUNT(*) FROM event_media active_media
                           WHERE active_media.event_id = e.id
                             AND active_media.status = 'active'
                             AND TRIM(active_media.url) <> ''
                             AND LOWER(TRIM(active_media.url)) NOT LIKE 'local:%%'
                       ), 0) AS active_media_count,
                       (
                           SELECT thumb.id FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_id,
                       (
                           SELECT thumb.url FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_url,
                       (
                           SELECT thumb.alt_text FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_alt
                FROM historical_events e
                %s
                %s
                LIMIT :limit OFFSET :offset
                """.formatted(MAP_DATA, MAP_DATA, parts.where(), orderBy(query));
        return jdbc.query(sql, parts.params(), (rs, row) -> mapListRow(rs));
    }

    /**
     * Bounded Dashboard projection. It intentionally selects only presence facts and compact
     * operational fields; narrative/source payloads are never loaded.
     */
    public List<ListRow> findDashboardRows() {
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.effective_end_year,
                       e.display_date, e.date_precision, e.status, e.geo_type, e.lat, e.lng,
                       e.card_summary,
                       e.province_names, e.historical_locations, e.show_on_homepage,
                       e.show_on_timeline, e.featured, e.created_at, e.updated_at,
                       e.key_facts,
                       (TRIM(e.title) <> '') AS title_present,
                       (TRIM(e.slug) <> '') AS slug_present,
                       (e.card_summary IS NOT NULL AND TRIM(e.card_summary) <> '') AS card_present,
                       (e.canonical_summary IS NOT NULL AND TRIM(e.canonical_summary) <> '') AS canonical_present,
                       (e.detailed_narrative IS NOT NULL AND TRIM(e.detailed_narrative) <> '') AS narrative_present,
                       (e.significance IS NOT NULL AND TRIM(e.significance) <> '') AS significance_present,
                       JSON_TYPE(%s) AS map_data_type,
                       %s AS map_data_json,
                       COALESCE((
                           SELECT COUNT(*) FROM event_media active_media
                           WHERE active_media.event_id = e.id
                             AND active_media.status = 'active'
                             AND TRIM(active_media.url) <> ''
                             AND LOWER(TRIM(active_media.url)) NOT LIKE 'local:%%'
                       ), 0) AS active_media_count,
                       (
                           SELECT thumb.id FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_id,
                       (
                           SELECT thumb.url FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_url,
                       (
                           SELECT thumb.alt_text FROM event_media thumb
                           WHERE thumb.event_id = e.id AND thumb.status = 'active'
                             AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                             AND TRIM(thumb.url) <> ''
                             AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                           ORDER BY thumb.sort_order, thumb.id LIMIT 1
                       ) AS thumbnail_alt
                FROM historical_events e
                ORDER BY e.id
                """.formatted(MAP_DATA, MAP_DATA);
        return jdbc.query(sql, new MapSqlParameterSource(), (rs, row) -> mapListRow(rs));
    }

    public Map<String, List<Integer>> findGrades(List<String> eventIds) {
        if (eventIds.isEmpty()) return Map.of();
        Map<String, List<Integer>> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT event_id, grade FROM event_grades
                WHERE event_id IN (:eventIds)
                ORDER BY event_id, grade
                """, new MapSqlParameterSource("eventIds", eventIds), rs -> {
            result.computeIfAbsent(rs.getString("event_id"), ignored -> new ArrayList<>())
                    .add(rs.getInt("grade"));
        });
        return result;
    }

    public Optional<DetailRow> findCore(String id) {
        String sql = """
                SELECT e.id, e.slug, e.title, e.short_title, e.event_level, e.event_type,
                       e.event_subtype, e.start_year, e.end_year, e.effective_end_year,
                       e.display_date, e.date_precision, e.status, e.geo_type, e.lat, e.lng,
                       e.province_names, e.historical_locations, e.card_summary,
                       e.canonical_summary, e.detailed_narrative, e.significance, e.key_facts,
                       e.show_on_homepage, e.show_on_timeline, e.featured,
                       e.parent_id, e.root_id, e.published_at, e.created_at, e.updated_at,
                       JSON_TYPE(%s) AS map_data_type, %s AS map_data_json,
                       (SELECT COUNT(*) FROM event_textbook_refs tr WHERE tr.event_id=e.id) AS textbook_ref_count,
                       (SELECT COUNT(*) FROM event_textbook_refs vr WHERE vr.event_id=e.id AND vr.show_on_detail=1) AS visible_ref_count,
                       EXISTS(
                           SELECT 1 FROM event_textbook_contents tc
                           WHERE tc.event_id=e.id AND tc.content IS NOT NULL AND TRIM(tc.content) <> ''
                       ) AS has_textbook_content,
                       (SELECT COUNT(*) FROM event_media am
                        WHERE am.event_id=e.id AND am.status='active' AND TRIM(am.url)<>''
                          AND LOWER(TRIM(am.url)) NOT LIKE 'local:%%')
                           AS active_media_count,
                       (SELECT tm.id FROM event_media tm
                        WHERE tm.event_id=e.id AND tm.status='active'
                          AND tm.is_thumbnail=TRUE AND tm.media_type='image' AND TRIM(tm.url)<>''
                          AND LOWER(TRIM(tm.url)) NOT LIKE 'local:%%'
                        ORDER BY tm.sort_order, tm.id LIMIT 1) AS thumbnail_id,
                       (TRIM(e.title) <> '') AS title_present,
                       (TRIM(e.slug) <> '') AS slug_present,
                       (e.card_summary IS NOT NULL AND TRIM(e.card_summary) <> '') AS card_present,
                       (e.canonical_summary IS NOT NULL AND TRIM(e.canonical_summary) <> '') AS canonical_present,
                       (e.detailed_narrative IS NOT NULL AND TRIM(e.detailed_narrative) <> '') AS narrative_present,
                       (e.significance IS NOT NULL AND TRIM(e.significance) <> '') AS significance_present
                FROM historical_events e WHERE e.id=:id
                """.formatted(MAP_DATA, MAP_DATA);
        List<DetailRow> rows = jdbc.query(sql, new MapSqlParameterSource("id", id),
                (rs, row) -> mapDetailRow(rs));
        return rows.stream().findFirst();
    }

    public List<AdminEventDtos.Media> findMedia(String id) {
        return jdbc.query("""
                SELECT id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status, created_at
                FROM event_media WHERE event_id=:id
                ORDER BY is_thumbnail DESC, sort_order, id
                """, new MapSqlParameterSource("id", id), (rs, row) -> new AdminEventDtos.Media(
                rs.getLong("id"), rs.getString("media_type"), safeUri(rs.getString("url"), true),
                safeText(rs.getString("caption")), safeText(rs.getString("alt_text")),
                safeText(rs.getString("source_name")), safeText(rs.getString("license")),
                rs.getString("storage_type"), rs.getBoolean("is_thumbnail"),
                rs.getInt("sort_order"), rs.getString("status"), instant(rs, "created_at")
        )).stream().filter(media -> media.url() != null).toList();
    }

    public List<AdminEventDtos.TextbookReference> findVisibleTextbookReferences(String id) {
        return jdbc.query("""
                SELECT id, grade, book, theme, lesson, page_start, page_end, excerpt, url
                FROM event_textbook_refs
                WHERE event_id=:id AND show_on_detail=1
                ORDER BY grade, page_start, id
                """, new MapSqlParameterSource("id", id), (rs, row) ->
                new AdminEventDtos.TextbookReference(
                        rs.getLong("id"), integer(rs, "grade"), safeText(rs.getString("book")),
                        safeText(rs.getString("theme")), safeText(rs.getString("lesson")),
                        integer(rs, "page_start"), integer(rs, "page_end"),
                        safeText(rs.getString("excerpt")), safeUri(rs.getString("url"), false)
                ));
    }

    public List<AdminEventDtos.ExternalSource> findExternalSources(String id) {
        return jdbc.query("""
                SELECT s.source_type, s.title, s.canonical_uri, s.external_id, s.language,
                       es.source_order, es.match_type, es.is_primary, es.verification_status
                FROM event_external_sources es
                JOIN source_catalog s ON s.id=es.source_id
                WHERE es.event_id=:id
                  AND s.is_internal=FALSE
                  AND LOWER(TRIM(s.canonical_uri)) REGEXP '^https?://'
                  AND LOWER(TRIM(s.canonical_uri)) NOT LIKE 'local:%'
                  AND LOWER(TRIM(s.title)) NOT LIKE 'local:%'
                ORDER BY es.is_primary DESC, es.source_order, s.id
                """, new MapSqlParameterSource("id", id), (rs, row) ->
                new AdminEventDtos.ExternalSource(
                        rs.getString("source_type"), safeText(rs.getString("title")),
                        safeUri(rs.getString("canonical_uri"), false),
                        safeText(rs.getString("external_id")), rs.getString("language"),
                        rs.getInt("source_order"), rs.getString("match_type"),
                        rs.getBoolean("is_primary"), rs.getString("verification_status")
                ));
    }

    public HierarchyRows findHierarchy(String id, String parentId, String rootId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("id", id).addValue("parentId", parentId).addValue("rootId", rootId);
        List<HierarchyRow> rows = jdbc.query("""
                SELECT e.id, e.slug, e.title, e.status, e.event_level, e.start_year, e.end_year,
                       (e.id=:parentId) AS is_parent, (e.id=:rootId) AS is_root,
                       (e.parent_id=:id) AS is_child, e.order_in_parent
                FROM historical_events e
                WHERE e.id=:parentId OR e.id=:rootId OR e.parent_id=:id
                ORDER BY is_child DESC, e.order_in_parent,
                         CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
                         e.start_year, e.id
                """, params, (rs, row) -> new HierarchyRow(
                link(rs), rs.getBoolean("is_parent"), rs.getBoolean("is_root"),
                rs.getBoolean("is_child")
        ));
        AdminEventDtos.EventLink parent = rows.stream().filter(HierarchyRow::parent)
                .map(HierarchyRow::event).findFirst().orElse(null);
        AdminEventDtos.EventLink root = rows.stream().filter(HierarchyRow::root)
                .map(HierarchyRow::event).findFirst().orElse(null);
        List<AdminEventDtos.EventLink> children = rows.stream().filter(HierarchyRow::child)
                .map(HierarchyRow::event).toList();
        return new HierarchyRows(parent, root, children);
    }

    public List<AdminEventDtos.Relation> findRelations(String id) {
        return jdbc.query("""
                SELECT r.association_type, r.relation_type, r.sort_order,
                       e.id, e.slug, e.title, e.status, e.event_level, e.start_year, e.end_year
                FROM event_relations r
                JOIN historical_events e ON e.id=r.target_event_id
                WHERE r.source_event_id=:id AND e.id<>:id
                ORDER BY FIELD(r.association_type,'predecessor','successor','related'),
                         r.sort_order,
                         CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END,
                         e.start_year, e.id
                """, new MapSqlParameterSource("id", id), (rs, row) ->
                new AdminEventDtos.Relation(
                        rs.getString("association_type"), rs.getString("relation_type"),
                        rs.getInt("sort_order"), link(rs)
                ));
    }

    private SqlParts filters(AdminEventReadService.Query query) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> filters = new ArrayList<>();
        if (StringUtils.hasText(query.query())) {
            filters.add("""
                    (e.title LIKE :query ESCAPE '=' OR e.short_title LIKE :query ESCAPE '='
                     OR e.slug LIKE :query ESCAPE '=' OR e.card_summary LIKE :query ESCAPE '=')
                    """);
            params.addValue("query", "%" + escapeLike(query.query()) + "%");
        }
        addEquals(filters, params, "e.status", "status", query.status());
        addEquals(filters, params, "e.event_level", "eventLevel", query.eventLevel());
        addEquals(filters, params, "e.event_type", "eventType", query.eventType());
        if (query.grade() != null) {
            filters.add("EXISTS(SELECT 1 FROM event_grades g WHERE g.event_id=e.id AND g.grade=:grade)");
            params.addValue("grade", query.grade());
        }
        if (query.geoType() != null) {
            filters.add("(" + CANONICAL_GEO + ")=:geoType");
            params.addValue("geoType", query.geoType());
        }
        if ("known".equals(query.chronology())) filters.add(VALID_CHRONOLOGY);
        if ("unknown".equals(query.chronology())) filters.add(UNKNOWN_CHRONOLOGY);
        if (query.startYearFrom() != null) {
            filters.add("e.start_year>=:startYearFrom");
            params.addValue("startYearFrom", query.startYearFrom());
        }
        if (query.startYearTo() != null) {
            filters.add("e.start_year<:startYearTo");
            params.addValue("startYearTo", query.startYearTo());
        }
        missingFilter(filters, query.missingThumbnail(), """
                EXISTS(SELECT 1 FROM event_media tm WHERE tm.event_id=e.id
                  AND tm.status='active' AND tm.is_thumbnail=TRUE
                  AND tm.media_type='image' AND TRIM(tm.url)<>''
                  AND LOWER(TRIM(tm.url)) NOT LIKE 'local:%')
                """);
        missingFilter(filters, query.missingMedia(), """
                EXISTS(SELECT 1 FROM event_media am WHERE am.event_id=e.id
                  AND am.status='active' AND TRIM(am.url)<>''
                  AND LOWER(TRIM(am.url)) NOT LIKE 'local:%')
                """);
        if (query.missingMapData() != null) {
            String mapDataPresent = "JSON_TYPE(" + MAP_DATA + ") IS NOT NULL"
                    + " AND JSON_TYPE(" + MAP_DATA + ")<>'NULL'";
            String mapDataRequired = "COALESCE((" + CANONICAL_GEO + ")<>'no_location', TRUE)";
            String mapDataMissing = mapDataRequired
                    + " AND NOT COALESCE((" + mapDataPresent + "), FALSE)";
            filters.add(query.missingMapData()
                    ? "(" + mapDataMissing + ")"
                    : "NOT (" + mapDataMissing + ")");
        }
        return new SqlParts(filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters), params);
    }

    private String orderBy(AdminEventReadService.Query query) {
        String direction = "desc".equals(query.sortDir()) ? "DESC" : "ASC";
        return switch (query.sortBy()) {
            case "title" -> "ORDER BY e.title " + direction + ", e.id ASC";
            case "chronology" -> "ORDER BY CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END, "
                    + "e.start_year " + direction + ", e.id ASC";
            case "createdAt" -> "ORDER BY e.created_at " + direction + ", e.id ASC";
            default -> "ORDER BY e.updated_at " + direction + ", e.id ASC";
        };
    }

    private ListRow mapListRow(ResultSet rs) throws SQLException {
        JsonNode mapData = PublicMapDataSanitizer.fromMapDataJson(objectMapper, rs.getString("map_data_json"));
        EventCompletenessFacts facts = facts(rs, mapData, List.of());
        AdminEventDtos.Thumbnail thumbnail = rs.getObject("thumbnail_id") == null ? null
                : new AdminEventDtos.Thumbnail(
                rs.getLong("thumbnail_id"), rs.getString("thumbnail_url"),
                safeText(rs.getString("thumbnail_alt")));
        return new ListRow(
                rs.getString("id"), rs.getString("slug"), rs.getString("title"),
                rs.getString("short_title"), rs.getString("event_level"),
                rs.getString("event_type"), rs.getString("event_subtype"),
                chronology(rs), rs.getString("status"), rs.getString("geo_type"),
                rs.getString("card_summary"), thumbnail, rs.getInt("active_media_count"), flags(rs),
                instant(rs, "created_at"), instant(rs, "updated_at"), facts
        );
    }

    private DetailRow mapDetailRow(ResultSet rs) throws SQLException {
        JsonNode mapData = PublicMapDataSanitizer.fromMapDataJson(objectMapper, rs.getString("map_data_json"));
        return new DetailRow(
                rs.getString("id"), rs.getString("slug"), rs.getString("title"),
                rs.getString("short_title"), rs.getString("event_level"),
                rs.getString("event_type"), rs.getString("event_subtype"),
                chronology(rs), rs.getString("status"), rs.getString("geo_type"),
                rs.getBigDecimal("lat"), rs.getBigDecimal("lng"),
                stringList(rs.getString("province_names")), stringList(rs.getString("historical_locations")),
                rs.getString("card_summary"), rs.getString("canonical_summary"),
                rs.getString("detailed_narrative"), rs.getString("significance"),
                stringList(rs.getString("key_facts")), flags(rs),
                rs.getString("parent_id"), rs.getString("root_id"),
                instantNullable(rs, "published_at"), instant(rs, "created_at"), instant(rs, "updated_at"),
                rs.getInt("textbook_ref_count"), rs.getInt("visible_ref_count"),
                rs.getBoolean("has_textbook_content"), mapData, mapData(mapData),
                facts(rs, mapData, List.of())
        );
    }

    private EventCompletenessFacts facts(ResultSet rs, JsonNode mapData, List<Integer> grades)
            throws SQLException {
        String mapDataType = rs.getString("map_data_type");
        return new EventCompletenessFacts(
                rs.getBoolean("title_present"), rs.getBoolean("slug_present"),
                rs.getBoolean("card_present"), rs.getBoolean("canonical_present"),
                rs.getBoolean("narrative_present"), rs.getBoolean("significance_present"),
                json(rs.getString("key_facts")), rs.getObject("thumbnail_id") != null,
                rs.getInt("active_media_count"), rs.getString("geo_type"),
                rs.getBigDecimal("lat"), rs.getBigDecimal("lng"),
                stringList(rs.getString("province_names")), stringList(rs.getString("historical_locations")),
                mapDataType != null && !"NULL".equals(mapDataType),
                "OBJECT".equals(mapDataType), mapData,
                integer(rs, "start_year"), integer(rs, "end_year"),
                integer(rs, "effective_end_year"), rs.getString("event_level"),
                rs.getString("event_type"), grades
        );
    }

    private AdminEventDtos.MapData mapData(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        return new AdminEventDtos.MapData(
                text(node.get("geoType")), marker(node.get("marker")), markers(node.get("markers")),
                strings(node.get("provinceNames")), strings(node.get("historicalLocations")),
                strings(node.get("gadmRefs")), display(node.get("displayGeometry")),
                focus(node.get("focusGeometry"))
        );
    }

    private AdminEventDtos.DisplayGeometry display(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        return new AdminEventDtos.DisplayGeometry(
                text(node.get("geoType")), marker(node.get("marker")),
                strings(node.get("provinceNames")), strings(node.get("historicalLocations"))
        );
    }

    private AdminEventDtos.FocusGeometry focus(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        JsonNode center = node.get("center");
        AdminEventDtos.Point point = center != null && center.isObject()
                ? new AdminEventDtos.Point(decimal(center.get("lat")), decimal(center.get("lng"))) : null;
        return new AdminEventDtos.FocusGeometry(
                text(node.get("mode")), decimal(node.get("zoom")), point,
                strings(node.get("provinceNames"))
        );
    }

    private AdminEventDtos.Marker marker(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        return new AdminEventDtos.Marker(
                text(node.get("name")), text(node.get("label")),
                decimal(node.get("lat")), decimal(node.get("lng")), decimal(node.get("confidence"))
        );
    }

    private List<AdminEventDtos.Marker> markers(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<AdminEventDtos.Marker> result = new ArrayList<>();
        for (JsonNode item : node) {
            AdminEventDtos.Marker marker = marker(item);
            if (marker != null) result.add(marker);
        }
        return List.copyOf(result);
    }

    private JsonNode json(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return objectMapper.readTree(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<String> stringList(String value) {
        return strings(json(value));
    }

    private List<String> strings(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (item.isTextual() && StringUtils.hasText(item.asText())
                    && !PublicMapDataSanitizer.isLocal(item.asText())) values.add(item.asText());
        }
        return List.copyOf(values);
    }

    private static String safeText(String value) {
        return !StringUtils.hasText(value) || PublicMapDataSanitizer.isLocal(value) ? null : value;
    }

    private static String safeUri(String value, boolean relativeAllowed) {
        if (!StringUtils.hasText(value) || PublicMapDataSanitizer.isLocal(value)) return null;
        String normalized = value.trim().toLowerCase();
        if (relativeAllowed && (normalized.startsWith("/") || normalized.startsWith("./"))) return value;
        return normalized.startsWith("https://") || normalized.startsWith("http://") ? value : null;
    }

    private static String escapeLike(String value) {
        return value.replace("=", "==").replace("%", "=%").replace("_", "=_");
    }

    private static void addEquals(
            List<String> filters, MapSqlParameterSource params, String column, String parameter, String value
    ) {
        if (value != null) {
            filters.add(column + "=:" + parameter);
            params.addValue(parameter, value);
        }
    }

    private static void missingFilter(List<String> filters, Boolean missing, String presentPredicate) {
        if (missing != null) {
            String nullSafePresent = "COALESCE((" + presentPredicate + "), FALSE)";
            filters.add(missing ? "NOT " + nullSafePresent : nullSafePresent);
        }
    }

    private static AdminEventDtos.Chronology chronology(ResultSet rs) throws SQLException {
        return new AdminEventDtos.Chronology(
                integer(rs, "start_year"), integer(rs, "end_year"),
                integer(rs, "effective_end_year"), rs.getString("display_date"),
                rs.getString("date_precision")
        );
    }

    private static AdminEventDtos.Flags flags(ResultSet rs) throws SQLException {
        return new AdminEventDtos.Flags(
                rs.getBoolean("show_on_homepage"), rs.getBoolean("show_on_timeline"),
                rs.getBoolean("featured")
        );
    }

    private static AdminEventDtos.EventLink link(ResultSet rs) throws SQLException {
        return new AdminEventDtos.EventLink(
                rs.getString("id"), rs.getString("slug"), rs.getString("title"),
                rs.getString("status"), rs.getString("event_level"),
                integer(rs, "start_year"), integer(rs, "end_year")
        );
    }

    private static Integer integer(ResultSet rs, String name) throws SQLException {
        int value = rs.getInt(name);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String name) throws SQLException {
        return rs.getTimestamp(name).toInstant();
    }

    private static Instant instantNullable(ResultSet rs, String name) throws SQLException {
        Timestamp value = rs.getTimestamp(name);
        return value == null ? null : value.toInstant();
    }

    private static BigDecimal decimal(JsonNode value) {
        return value != null && value.isNumber() ? value.decimalValue() : null;
    }

    private static String text(JsonNode value) {
        return value != null && value.isTextual() && !PublicMapDataSanitizer.isLocal(value.asText())
                ? value.asText() : null;
    }

    private record SqlParts(String where, MapSqlParameterSource params) {
    }

    public record ListRow(
            String id, String slug, String title, String shortTitle,
            String eventLevel, String eventType, String eventSubtype,
            AdminEventDtos.Chronology chronology, String status, String normalizedGeoType,
            String cardSummary, AdminEventDtos.Thumbnail thumbnail, int activeMediaCount,
            AdminEventDtos.Flags flags, Instant createdAt, Instant updatedAt,
            EventCompletenessFacts facts
    ) {
    }

    public record DetailRow(
            String id, String slug, String title, String shortTitle,
            String eventLevel, String eventType, String eventSubtype,
            AdminEventDtos.Chronology chronology, String status, String normalizedGeoType,
            BigDecimal lat, BigDecimal lng, List<String> provinceNames,
            List<String> historicalLocations, String cardSummary, String canonicalSummary,
            String detailedNarrative, String significance, List<String> keyFacts,
            AdminEventDtos.Flags flags, String parentId, String rootId,
            Instant publishedAt, Instant createdAt, Instant updatedAt,
            int textbookRefCount, int visibleRefCount, boolean hasTextbookContent,
            JsonNode sanitizedMapData, AdminEventDtos.MapData mapData,
            EventCompletenessFacts facts
    ) {
    }

    private record HierarchyRow(
            AdminEventDtos.EventLink event, boolean parent, boolean root, boolean child
    ) {
    }

    public record HierarchyRows(
            AdminEventDtos.EventLink parent,
            AdminEventDtos.EventLink root,
            List<AdminEventDtos.EventLink> children
    ) {
    }
}
