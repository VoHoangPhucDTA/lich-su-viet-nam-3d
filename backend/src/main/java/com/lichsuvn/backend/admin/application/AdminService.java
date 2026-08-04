package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.auth.domain.RoleEntity;
import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.domain.UserStatus;
import com.lichsuvn.backend.auth.infrastructure.RoleRepository;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.event.domain.EventGeoType;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Service quản trị cho dữ liệu user và historical_events. */
@Service
public class AdminService {
    private static final Set<String> USER_STATUSES = Set.of("active", "pending", "disabled");
    private static final Set<String> EVENT_STATUSES = Set.of("draft", "published", "archived");
    private static final Set<String> EVENT_LEVELS = Set.of("atomic", "collection");
    private static final Set<String> EVENT_TYPES = Set.of("military", "political", "economic", "cultural");
    private static final Set<String> GEO_TYPES = EventGeoType.CANONICAL;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    public AdminService(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper, UserRepository userRepository, RoleRepository roleRepository) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
    }

    public Map<String, Object> dashboard() {
        Map<String, Object> users = new LinkedHashMap<>();
        users.put("total", count("SELECT COUNT(*) FROM users", new MapSqlParameterSource()));
        users.put("active", count("SELECT COUNT(*) FROM users WHERE status = 'active'", new MapSqlParameterSource()));
        users.put("pending", count("SELECT COUNT(*) FROM users WHERE status = 'pending'", new MapSqlParameterSource()));
        users.put("disabled", count("SELECT COUNT(*) FROM users WHERE status = 'disabled'", new MapSqlParameterSource()));
        users.put("newLast7Days", count("SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)", new MapSqlParameterSource()));

        Map<String, Object> events = new LinkedHashMap<>();
        events.put("total", count("SELECT COUNT(*) FROM historical_events", new MapSqlParameterSource()));
        events.put("published", count("SELECT COUNT(*) FROM historical_events WHERE status = 'published'", new MapSqlParameterSource()));
        events.put("draft", count("SELECT COUNT(*) FROM historical_events WHERE status = 'draft'", new MapSqlParameterSource()));
        events.put("archived", count("SELECT COUNT(*) FROM historical_events WHERE status = 'archived'", new MapSqlParameterSource()));
        events.put("atomic", count("SELECT COUNT(*) FROM historical_events WHERE event_level = 'atomic'", new MapSqlParameterSource()));
        events.put("collection", count("SELECT COUNT(*) FROM historical_events WHERE event_level = 'collection'", new MapSqlParameterSource()));
        events.put("needsContent", count("SELECT COUNT(*) FROM historical_events WHERE card_summary IS NULL OR TRIM(card_summary) = ''", new MapSqlParameterSource()));

        List<Map<String, Object>> audit = jdbc.query("""
                SELECT a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.created_at AS createdAt,
                       u.full_name AS actorName
                FROM admin_audit_logs a
                LEFT JOIN users u ON u.id = a.user_id
                ORDER BY a.created_at DESC LIMIT 8
                """, new MapSqlParameterSource(), (rs, row) -> Map.<String, Object>of(
                "action", rs.getString("action"),
                "entityType", rs.getString("entityType"),
                "entityId", rs.getString("entityId"),
                "createdAt", rs.getTimestamp("createdAt").toInstant().toString(),
                "actorName", rs.getString("actorName") == null ? "Hệ thống" : rs.getString("actorName")
        ));

        return Map.of("users", users, "events", events, "recentAudit", audit);
    }

    public Map<String, Object> users(String query, String status, String role, Integer limit, Integer offset) {
        if (StringUtils.hasText(status)) validate("status", status, USER_STATUSES);
        if (StringUtils.hasText(role)) validate("role", role, Set.of("student", "admin"));
        int safeLimit = limit == null ? 25 : Math.min(Math.max(limit, 1), 100);
        int safeOffset = offset == null ? 0 : Math.max(offset, 0);
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> filters = new ArrayList<>();
        if (StringUtils.hasText(query)) {
            filters.add("(u.full_name LIKE :query OR u.email LIKE :query)");
            params.addValue("query", "%" + query.trim() + "%");
        }
        if (StringUtils.hasText(status)) { filters.add("u.status = :status"); params.addValue("status", status); }
        if (StringUtils.hasText(role)) {
            filters.add("EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = :role)");
            params.addValue("role", role);
        }
        String where = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM users u" + where, params, Integer.class);
        params.addValue("limit", safeLimit).addValue("offset", safeOffset);
        List<Map<String, Object>> items = jdbc.query("""
                SELECT BIN_TO_UUID(u.id) AS id, u.full_name AS fullName, u.email, u.grade, u.school,
                       u.avatar_url AS avatarUrl, u.status, u.created_at AS createdAt,
                       CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'admin') THEN 'admin' ELSE 'student' END AS role,
                       (SELECT MAX(v.viewed_at) FROM event_view_logs v WHERE v.user_id = u.id) AS lastActivity
                FROM users u
                """ + where + " ORDER BY u.created_at DESC LIMIT :limit OFFSET :offset", params, (rs, row) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", rs.getString("id")); item.put("fullName", rs.getString("fullName")); item.put("email", rs.getString("email"));
            item.put("grade", rs.getObject("grade")); item.put("school", rs.getString("school")); item.put("avatarUrl", rs.getString("avatarUrl"));
            item.put("status", rs.getString("status")); item.put("role", rs.getString("role"));
            item.put("createdAt", rs.getTimestamp("createdAt").toInstant().toString());
            var last = rs.getTimestamp("lastActivity"); item.put("lastActivity", last == null ? null : last.toInstant().toString());
            return item;
        });
        return page(items, total == null ? 0 : total, safeLimit, safeOffset);
    }

    @Transactional
    public Map<String, Object> updateUserStatus(String id, Map<String, Object> body, UserPrincipal principal) {
        String next = requiredText(body, "status"); validate("status", next, USER_STATUSES);
        UserEntity target = user(id);
        if (principal.id().equals(id) && !UserStatus.ACTIVE.matches(next)) throw forbidden("Không thể tự vô hiệu hóa tài khoản quản trị.");
        if (isActiveAdmin(target) && !UserStatus.ACTIVE.matches(next) && activeAdminCount() <= 1) throw forbidden("Phải còn ít nhất một admin đang hoạt động.");
        String before = target.getStatus(); target.setStatus(next); userRepository.save(target);
        audit(principal, "user.status_updated", "user", id, Map.of("status", before), Map.of("status", next));
        return Map.of("id", id, "status", next);
    }

    @Transactional
    public Map<String, Object> updateUserRole(String id, Map<String, Object> body, UserPrincipal principal) {
        String role = requiredText(body, "role"); validate("role", role, Set.of("student", "admin"));
        UserEntity target = user(id);
        boolean admin = target.primaryRole().equals("admin");
        if (principal.id().equals(id) && !"admin".equals(role)) throw forbidden("Không thể tự gỡ quyền admin.");
        if (admin && "student".equals(role) && UserStatus.ACTIVE.matches(target.getStatus()) && activeAdminCount() <= 1) throw forbidden("Phải còn ít nhất một admin đang hoạt động.");
        RoleEntity student = roleRepository.findByCode("student").orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ROLE_SEED_MISSING", "Student role is missing"));
        RoleEntity administrator = roleRepository.findByCode("admin").orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ROLE_SEED_MISSING", "Admin role is missing"));
        Set<RoleEntity> roles = new java.util.HashSet<>(target.getRoles());
        if ("admin".equals(role)) roles.add(administrator); else { roles.removeIf(value -> "admin".equals(value.getCode())); roles.add(student); }
        target.setRoles(roles); userRepository.save(target);
        audit(principal, "user.role_updated", "user", id, Map.of("role", admin ? "admin" : "student"), Map.of("role", role));
        return Map.of("id", id, "role", role);
    }

    @Transactional
    public Map<String, Object> deleteUser(String id, UserPrincipal principal) {
        UserEntity target = user(id);
        if (principal.id().equals(id)) throw forbidden("An administrator cannot disable their own account.");
        if (isActiveAdmin(target) && activeAdminCount() <= 1) throw forbidden("At least one active administrator must remain.");
        String before = target.getStatus();
        target.setStatus("disabled");
        userRepository.save(target);
        audit(principal, "user.disabled", "user", id, Map.of("status", before), Map.of("status", "disabled"));
        return Map.of("id", id, "status", "disabled");
    }

    public Map<String, Object> events(String query, String status, String eventLevel, String eventType, Integer from, Integer to, Integer limit, Integer offset) {
        if (StringUtils.hasText(status)) validate("status", status, EVENT_STATUSES);
        if (StringUtils.hasText(eventLevel)) validate("eventLevel", eventLevel, EVENT_LEVELS);
        if (StringUtils.hasText(eventType)) validate("eventType", eventType, EVENT_TYPES);
        int safeLimit = limit == null ? 25 : Math.min(Math.max(limit, 1), 100), safeOffset = offset == null ? 0 : Math.max(offset, 0);
        MapSqlParameterSource params = new MapSqlParameterSource(); List<String> filters = new ArrayList<>();
        if (StringUtils.hasText(query)) { filters.add("(e.title LIKE :query OR e.slug LIKE :query OR e.card_summary LIKE :query)"); params.addValue("query", "%" + query.trim() + "%"); }
        if (StringUtils.hasText(status)) { filters.add("e.status = :status"); params.addValue("status", status); }
        if (StringUtils.hasText(eventLevel)) { filters.add("e.event_level = :eventLevel"); params.addValue("eventLevel", eventLevel); }
        if (StringUtils.hasText(eventType)) { filters.add("e.event_type = :eventType"); params.addValue("eventType", eventType); }
        if (from != null) { filters.add("e.start_year >= :from"); params.addValue("from", from); }
        if (to != null) { filters.add("e.start_year < :to"); params.addValue("to", to); }
        String where = filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters);
        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM historical_events e" + where, params, Integer.class);
        params.addValue("limit", safeLimit).addValue("offset", safeOffset);
        List<Map<String, Object>> items = jdbc.query("""
                SELECT e.id, e.slug, e.title, e.event_level AS eventLevel, e.event_type AS eventType, e.start_year AS startYear,
                       e.end_year AS endYear, e.status, e.featured, e.card_summary AS cardSummary, e.updated_at AS updatedAt,
                       (SELECT url FROM event_media m WHERE m.event_id = e.id AND m.is_thumbnail = TRUE AND m.status = 'active' ORDER BY m.sort_order LIMIT 1) AS thumbnailUrl
                FROM historical_events e
                """ + where + " ORDER BY e.updated_at DESC, e.id ASC LIMIT :limit OFFSET :offset", params, (rs, row) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", rs.getString("id")); item.put("slug", rs.getString("slug")); item.put("title", rs.getString("title")); item.put("eventLevel", rs.getString("eventLevel")); item.put("eventType", rs.getString("eventType")); item.put("startYear", rs.getObject("startYear"));
            item.put("endYear", rs.getObject("endYear")); item.put("status", rs.getString("status")); item.put("featured", rs.getBoolean("featured")); item.put("cardSummary", rs.getString("cardSummary")); item.put("thumbnailUrl", rs.getString("thumbnailUrl")); item.put("updatedAt", rs.getTimestamp("updatedAt").toInstant().toString()); return item;
        });
        return page(items, total == null ? 0 : total, safeLimit, safeOffset);
    }

    private static final org.slf4j.Logger ADMIN_LOG = org.slf4j.LoggerFactory.getLogger(AdminService.class);

    public Map<String, Object> event(String id) {
        List<Map<String, Object>> results = jdbc.query("SELECT * FROM historical_events WHERE id = :id", new MapSqlParameterSource("id", id), (rs, row) -> eventRow(rs));
        if (results.isEmpty()) throw new NotFoundException("EVENT_NOT_FOUND", "Historical event not found");
        Map<String, Object> event = results.getFirst();
        String rawMapDataGeoType = rawMapDataGeoTypeFromRaw(readJson(jdbc.queryForObject(
                "SELECT raw_json FROM historical_events WHERE id = :id",
                new MapSqlParameterSource("id", id),
                String.class
        )));
        String resolvedGeoType = com.lichsuvn.backend.event.domain.EventGeoType.dualRead(String.valueOf(event.get("geoType")), rawMapDataGeoType);
        if (resolvedGeoType == null) {
            ADMIN_LOG.warn("[geo] admin event {} has legacy geo_type '{}' with no canonical raw mapData geoType", id, event.get("geoType"));
            event.put("geoType", com.lichsuvn.backend.event.domain.EventGeoType.NO_LOCATION);
        } else if (!resolvedGeoType.equals(String.valueOf(event.get("geoType")))) {
            ADMIN_LOG.warn("[geo] admin event {} geo_type '{}' dual-read to canonical '{}' (raw mapData geoType '{}')", id, event.get("geoType"), resolvedGeoType, rawMapDataGeoType);
            event.put("geoType", resolvedGeoType);
        }
        return event;
    }

    private static String rawMapDataGeoTypeFromRaw(Object rawJson) {
        if (rawJson instanceof Map<?, ?> root) {
            Object mapData = root.get("mapData");
            if (mapData instanceof Map<?, ?> mapDataObj) {
                Object geoType = mapDataObj.get("geoType");
                return geoType == null ? null : String.valueOf(geoType);
            }
        }
        return null;
    }

    @Transactional
    public Map<String, Object> createEvent(Map<String, Object> body, UserPrincipal principal) {
        String slug = requiredText(body, "slug"); validateSlug(slug);
        Integer existing = jdbc.queryForObject("SELECT COUNT(*) FROM historical_events WHERE id = :id OR slug = :slug", new MapSqlParameterSource().addValue("id", slug).addValue("slug", slug), Integer.class);
        if (existing != null && existing > 0) throw new ApiException(HttpStatus.CONFLICT, "EVENT_SLUG_EXISTS", "Slug already exists");
        writeEvent(slug, body, true, principal);
        return event(slug);
    }

    @Transactional
    public Map<String, Object> updateEvent(String id, Map<String, Object> body, UserPrincipal principal) {
        Map<String, Object> before = event(id); writeEvent(id, body, false, principal); Map<String, Object> after = event(id);
        audit(principal, "event.updated", "historical_event", id, before, after); return after;
    }

    @Transactional
    public Map<String, Object> updateEventStatus(String id, Map<String, Object> body, UserPrincipal principal) {
        String status = requiredText(body, "status"); validate("status", status, EVENT_STATUSES); Map<String, Object> before = event(id);
        jdbc.update("UPDATE historical_events SET status = :status, published_at = CASE WHEN :status = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END WHERE id = :id", new MapSqlParameterSource().addValue("id", id).addValue("status", status));
        Map<String, Object> after = event(id); audit(principal, "event.status_updated", "historical_event", id, before, after); return after;
    }

    @Transactional
    public Map<String, Object> deleteEvent(String id, UserPrincipal principal) {
        Map<String, Object> before = event(id);
        Integer audioAssets = jdbc.queryForObject(
                "SELECT COUNT(*) FROM tts_audio_assets WHERE event_id = :id",
                new MapSqlParameterSource("id", id), Integer.class
        );
        if (audioAssets != null && audioAssets > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_HAS_TTS_ASSETS", "Delete related TTS assets before deleting this event");
        }
        jdbc.update("DELETE FROM historical_events WHERE id = :id", new MapSqlParameterSource("id", id));
        audit(principal, "event.deleted", "historical_event", id, before, Map.of());
        return Map.of("id", id);
    }

    private void writeEvent(String id, Map<String, Object> body, boolean creating, UserPrincipal principal) {
        String title = requiredText(body, "title"), slug = requiredText(body, "slug"), level = text(body, "eventLevel", "atomic"), type = text(body, "eventType", "political"), status = text(body, "status", "draft");
        validateSlug(slug); validate("eventLevel", level, EVENT_LEVELS); validate("eventType", type, EVENT_TYPES); validate("status", status, EVENT_STATUSES);
        // Geography is pipeline-managed and read-only in the admin editor (C1):
        // admin create/update must not change geo_type/lat/lng/provinceNames.
        String geoType;
        BigDecimal lat;
        BigDecimal lng;
        List<String> provinceNames;
        List<String> historicalLocations;
        if (creating) {
            if (body.containsKey("geoType") || body.containsKey("lat") || body.containsKey("lng")
                    || body.containsKey("provinceNames") || body.containsKey("historicalLocations")) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; cannot be set on create");
            }
            geoType = EventGeoType.NO_LOCATION;
            lat = null;
            lng = null;
            provinceNames = List.of();
            historicalLocations = List.of();
        } else {
            Map<String, Object> existing = geographyOf(id);
            String existingGeoType = String.valueOf(existing.get("geoType"));
            BigDecimal existingLat = (BigDecimal) existing.get("lat");
            BigDecimal existingLng = (BigDecimal) existing.get("lng");
            List<String> existingProvinces = (List<String>) existing.get("provinceNames");
            List<String> existingHistorical = (List<String>) existing.get("historicalLocations");
            if (body.containsKey("geoType") && !String.valueOf(text(body, "geoType", null)).equals(existingGeoType)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; geoType cannot be changed");
            }
            if (body.containsKey("lat") && !Objects.equals(decimal(body.get("lat")), existingLat)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; lat cannot be changed");
            }
            if (body.containsKey("lng") && !Objects.equals(decimal(body.get("lng")), existingLng)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; lng cannot be changed");
            }
            if (body.containsKey("provinceNames") && !Objects.equals(stringList(body, "provinceNames"), existingProvinces)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; provinceNames cannot be changed");
            }
            if (body.containsKey("historicalLocations") && !Objects.equals(stringList(body, "historicalLocations"), existingHistorical)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEOGRAPHY_READ_ONLY", "Geography is pipeline-managed and read-only; historicalLocations cannot be changed");
            }
            geoType = existingGeoType;
            lat = existingLat;
            lng = existingLng;
            provinceNames = existingProvinces;
            historicalLocations = existingHistorical;
        }
        validate("geoType", geoType, GEO_TYPES);
        int startYear = requiredInt(body, "startYear");
        Integer endYear = nullableInt(body, "endYear");
        int effectiveEndYear = endYear == null ? startYear : endYear;
        if (endYear != null && endYear < startYear) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_YEAR_RANGE", "endYear must not be before startYear");
        String parentId = nullableText(body, "parentId"); String rootId = null; int hierarchyLevel = 0;
        if (StringUtils.hasText(parentId)) {
            List<Map<String, Object>> parent = jdbc.query("SELECT id, root_id, level FROM historical_events WHERE id = :id", new MapSqlParameterSource("id", parentId), (rs, row) -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", rs.getString("id"));
                item.put("rootId", rs.getString("root_id"));
                item.put("level", rs.getInt("level"));
                return item;
            });
            if (parent.isEmpty() || id.equals(parentId)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARENT", "Parent event is invalid");
            rootId = parent.getFirst().get("rootId") == null ? parentId : String.valueOf(parent.getFirst().get("rootId")); hierarchyLevel = ((Number) parent.getFirst().get("level")).intValue() + 1;
        }
        ObjectNode raw = creating ? objectMapper.createObjectNode() : rawNode(id); populateRaw(raw, id, body, title, slug, level, type, startYear, endYear, parentId, rootId, hierarchyLevel);
        String rawText = writeJson(raw), hash = hash(rawText);
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("id", id).addValue("slug", slug).addValue("title", title)
                .addValue("shortTitle", nullableText(body, "shortTitle")).addValue("eventLevel", level).addValue("eventType", type).addValue("eventSubtype", nullableText(body, "eventSubtype"))
                .addValue("startYear", startYear).addValue("endYear", endYear).addValue("effectiveEndYear", effectiveEndYear).addValue("displayDate", nullableText(body, "displayDate"))
                .addValue("datePrecision", nullableText(body, "datePrecision")).addValue("geoType", geoType).addValue("lat", lat).addValue("lng", lng)
                .addValue("provinceNames", writeJson(provinceNames)).addValue("historicalLocations", writeJson(historicalLocations))
                .addValue("parentId", parentId).addValue("rootId", rootId).addValue("level", hierarchyLevel).addValue("orderInParent", nullableInt(body, "orderInParent"))
                .addValue("cardSummary", nullableText(body, "cardSummary")).addValue("canonicalSummary", nullableText(body, "canonicalSummary")).addValue("detailedNarrative", nullableText(body, "detailedNarrative")).addValue("significance", nullableText(body, "significance"))
                .addValue("showOnHomepage", bool(body, "showOnHomepage", true)).addValue("showOnTimeline", bool(body, "showOnTimeline", true)).addValue("featured", bool(body, "featured", false)).addValue("status", status).addValue("contentHash", hash).addValue("rawJson", rawText);
        if (creating) {
            jdbc.update("INSERT INTO historical_events (id, slug, title, short_title, event_level, event_type, event_subtype, start_year, end_year, effective_end_year, display_date, date_precision, geo_type, lat, lng, province_names, historical_locations, parent_id, root_id, level, order_in_parent, card_summary, canonical_summary, detailed_narrative, significance, show_on_homepage, show_on_timeline, featured, status, content_hash, raw_json, published_at) VALUES (:id,:slug,:title,:shortTitle,:eventLevel,:eventType,:eventSubtype,:startYear,:endYear,:effectiveEndYear,:displayDate,:datePrecision,:geoType,:lat,:lng,CAST(:provinceNames AS JSON),CAST(:historicalLocations AS JSON),:parentId,:rootId,:level,:orderInParent,:cardSummary,:canonicalSummary,:detailedNarrative,:significance,:showOnHomepage,:showOnTimeline,:featured,:status,:contentHash,CAST(:rawJson AS JSON),CASE WHEN :status='published' THEN CURRENT_TIMESTAMP ELSE NULL END)", params);
            audit(principal, "event.created", "historical_event", id, Map.of(), Map.of("title", title, "status", status));
        } else {
            jdbc.update("UPDATE historical_events SET slug=:slug,title=:title,short_title=:shortTitle,event_level=:eventLevel,event_type=:eventType,event_subtype=:eventSubtype,start_year=:startYear,end_year=:endYear,effective_end_year=:effectiveEndYear,display_date=:displayDate,date_precision=:datePrecision,geo_type=:geoType,lat=:lat,lng=:lng,province_names=CAST(:provinceNames AS JSON),historical_locations=CAST(:historicalLocations AS JSON),parent_id=:parentId,root_id=:rootId,level=:level,order_in_parent=:orderInParent,card_summary=:cardSummary,canonical_summary=:canonicalSummary,detailed_narrative=:detailedNarrative,significance=:significance,show_on_homepage=:showOnHomepage,show_on_timeline=:showOnTimeline,featured=:featured,status=:status,content_hash=:contentHash,raw_json=CAST(:rawJson AS JSON),published_at=CASE WHEN :status='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END WHERE id=:id", params);
        }
    }

    private Map<String, Object> eventRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> item = new LinkedHashMap<>();
        for (String key : List.of("id", "slug", "title", "short_title", "event_level", "event_type", "event_subtype", "start_year", "end_year", "display_date", "date_precision", "geo_type", "lat", "lng", "parent_id", "root_id", "level", "order_in_parent", "card_summary", "canonical_summary", "detailed_narrative", "significance", "status")) item.put(camel(key), rs.getObject(key));
        item.put("provinceNames", readJson(rs.getString("province_names"))); item.put("historicalLocations", readJson(rs.getString("historical_locations")));
        item.put("showOnHomepage", rs.getBoolean("show_on_homepage")); item.put("showOnTimeline", rs.getBoolean("show_on_timeline")); item.put("featured", rs.getBoolean("featured")); return item;
    }

    private ObjectNode rawNode(String id) { try { String json = jdbc.queryForObject("SELECT raw_json FROM historical_events WHERE id=:id", new MapSqlParameterSource("id", id), String.class); JsonNode node = objectMapper.readTree(json); return node instanceof ObjectNode object ? object : objectMapper.createObjectNode(); } catch (Exception ignored) { return objectMapper.createObjectNode(); } }
    private void populateRaw(ObjectNode raw, String id, Map<String, Object> body, String title, String slug, String level, String type, int start, Integer end, String parent, String root, int hierarchyLevel) {
        raw.put("id", id); raw.put("slug", slug); raw.put("eventLevel", level); raw.with("titles").put("primary", title).put("short", text(body, "shortTitle", title)); raw.with("classification").put("eventType", type).put("eventSubtype", text(body, "eventSubtype", ""));
        ObjectNode chronology = raw.with("chronology"); chronology.with("start").put("year", start); if (end != null) chronology.with("end").put("year", end); chronology.put("displayDate", text(body, "displayDate", String.valueOf(start))); chronology.put("datePrecision", text(body, "datePrecision", "year"));
        raw.with("summary").put("cardSummary", text(body, "cardSummary", "")).put("homepageTitle", title).put("homepageSummary", text(body, "canonicalSummary", "")); raw.with("textbookContent").put("canonicalSummary", text(body, "canonicalSummary", "")).put("detailedNarrative", text(body, "detailedNarrative", "")).put("significance", text(body, "significance", ""));
        raw.with("hierarchy").put("parentId", parent == null ? "" : parent).put("rootId", root == null ? id : root).put("level", hierarchyLevel).put("orderInParent", nullableInt(body, "orderInParent")); raw.with("display").put("showOnHomepage", bool(body, "showOnHomepage", true)).put("showOnTimeline", bool(body, "showOnTimeline", true)).put("featured", bool(body, "featured", false));
    }
    private Map<String, Object> geographyOf(String id) {
        List<Map<String, Object>> rows = jdbc.query("""
                SELECT geo_type, lat, lng, province_names, historical_locations
                FROM historical_events WHERE id = :id
                """, new MapSqlParameterSource("id", id), (rs, row) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("geoType", rs.getString("geo_type"));
            item.put("lat", rs.getBigDecimal("lat"));
            item.put("lng", rs.getBigDecimal("lng"));
            item.put("provinceNames", readJson(rs.getString("province_names")));
            item.put("historicalLocations", readJson(rs.getString("historical_locations")));
            return item;
        });
        if (rows.isEmpty()) throw new NotFoundException("EVENT_NOT_FOUND", "Historical event not found");
        return rows.getFirst();
    }

    @SuppressWarnings("unchecked")
    private List<String> stringList(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (value == null) return List.of();
        if (value instanceof List<?> list) return (List<String>) list.stream().map(String::valueOf).toList();
        return List.of(String.valueOf(value));
    }

    private Map<String, Object> page(List<Map<String, Object>> items, int total, int limit, int offset) { return Map.of("items", items, "count", items.size(), "total", total, "limit", limit, "offset", offset); }
    private int count(String sql, MapSqlParameterSource params) { Integer value = jdbc.queryForObject(sql, params, Integer.class); return value == null ? 0 : value; }
    private UserEntity user(String id) { try { return userRepository.findById(UuidBytes.fromUuid(java.util.UUID.fromString(id))).orElseThrow(() -> new NotFoundException("USER_NOT_FOUND", "User not found")); } catch (IllegalArgumentException ex) { throw new NotFoundException("USER_NOT_FOUND", "User not found"); } }
    private boolean isActiveAdmin(UserEntity user) { return UserStatus.ACTIVE.matches(user.getStatus()) && "admin".equals(user.primaryRole()); }
    private int activeAdminCount() { return count("SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.code='admin'", new MapSqlParameterSource()); }
    private void audit(UserPrincipal principal, String action, String entityType, String entityId, Object before, Object after) { jdbc.update("INSERT INTO admin_audit_logs (user_id, action, entity_type, entity_id, before_json, after_json) VALUES (:userId,:action,:entityType,:entityId,CAST(:before AS JSON),CAST(:after AS JSON))", new MapSqlParameterSource().addValue("userId", principal.idBytes()).addValue("action", action).addValue("entityType", entityType).addValue("entityId", entityId).addValue("before", writeJson(before)).addValue("after", writeJson(after))); }
    private String requiredText(Map<String, Object> body, String key) { String value = nullableText(body, key); if (!StringUtils.hasText(value)) throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_" + key.toUpperCase(), key + " is required"); return value; }
    private String nullableText(Map<String, Object> body, String key) { Object value = body.get(key); return value == null || String.valueOf(value).isBlank() ? null : String.valueOf(value).trim(); }
    private String text(Map<String, Object> body, String key, String fallback) { String value = nullableText(body, key); return value == null ? fallback : value; }
    private int requiredInt(Map<String, Object> body, String key) { Integer value = nullableInt(body, key); if (value == null) throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_" + key.toUpperCase(), key + " is required"); return value; }
    private Integer nullableInt(Map<String, Object> body, String key) { Object value = body.get(key); if (value == null || String.valueOf(value).isBlank()) return null; try { return Integer.valueOf(String.valueOf(value)); } catch (NumberFormatException ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_" + key.toUpperCase(), key + " must be a number"); } }
    private BigDecimal decimal(Object value) { if (value == null || String.valueOf(value).isBlank()) return null; try { return new BigDecimal(String.valueOf(value)); } catch (NumberFormatException ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_COORDINATE", "Coordinates must be numeric"); } }
    private boolean bool(Map<String, Object> body, String key, boolean fallback) { Object value = body.get(key); return value == null ? fallback : Boolean.parseBoolean(String.valueOf(value)); }
    private void validate(String name, String value, Set<String> allowed) { if (!allowed.contains(value)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_" + name.toUpperCase(), name + " has unsupported value"); }
    private void validateSlug(String value) { if (!value.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SLUG", "slug must use lowercase letters, digits and hyphens"); }
    private ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN, "ADMIN_GUARDRAIL", message); }
    private String writeJson(Object value) { try { return objectMapper.writeValueAsString(value); } catch (Exception ex) { throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Could not serialize payload"); } }
    private Object readJson(String value) { try { return StringUtils.hasText(value) ? objectMapper.readValue(value, Object.class) : List.of(); } catch (Exception ex) { return List.of(); } }
    private String hash(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception ex) { throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "HASH_FAILED", "Could not hash content"); } }
    private String camel(String key) { StringBuilder result = new StringBuilder(); boolean upper = false; for (char c : key.toCharArray()) { if (c == '_') { upper = true; continue; } result.append(upper ? Character.toUpperCase(c) : c); upper = false; } return result.toString(); }
}
