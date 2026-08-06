package com.lichsuvn.backend.admin.infrastructure;

import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.application.AdminUserReadService;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminUserReadRepository {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final int MAX_ACTIVITY_TITLE = 200;
    private static final int MAX_AUDIT_TEXT = 180;
    private static final String ROLE_FACTS = """
            LEFT JOIN (
                SELECT ur.user_id,
                       MAX(CASE WHEN r.code='admin' THEN 1 ELSE 0 END) AS has_admin,
                       MAX(CASE WHEN r.code='teacher' THEN 1 ELSE 0 END) AS has_teacher,
                       MAX(CASE WHEN r.code='student' THEN 1 ELSE 0 END) AS has_student
                FROM user_roles ur
                JOIN roles r ON r.id=ur.role_id
                GROUP BY ur.user_id
            ) role_facts ON role_facts.user_id=u.id
            """;
    private static final String PRIMARY_ROLE = """
            CASE
              WHEN COALESCE(role_facts.has_admin,0)=1 THEN 'admin'
              WHEN COALESCE(role_facts.has_teacher,0)=1 THEN 'teacher'
              WHEN COALESCE(role_facts.has_student,0)=1 THEN 'student'
              ELSE NULL
            END
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaUrlPolicy mediaUrlPolicy;

    public AdminUserReadRepository(
            NamedParameterJdbcTemplate jdbc,
            MediaUrlPolicy mediaUrlPolicy
    ) {
        this.jdbc = jdbc;
        this.mediaUrlPolicy = mediaUrlPolicy;
    }

    public long count(AdminUserReadService.Query query) {
        SqlParts parts = sqlParts(query);
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users u " + ROLE_FACTS + parts.where(),
                parts.params(),
                Long.class
        );
        return total == null ? 0 : total;
    }

    public List<UserRow> findPage(AdminUserReadService.Query query) {
        SqlParts parts = sqlParts(query);
        parts.params().addValue("limit", query.limit()).addValue("offset", query.offset());
        String order = switch (query.sortBy()) {
            case "displayName" -> "u.full_name";
            case "email" -> "u.email";
            case "createdAt" -> "u.created_at";
            case "updatedAt" -> "u.updated_at";
            default -> throw new IllegalArgumentException("Unsupported validated user sort");
        };
        String direction = "asc".equals(query.sortDir()) ? "ASC" : "DESC";
        return jdbc.query("""
                SELECT BIN_TO_UUID(u.id) AS id,
                       u.full_name,
                       u.email,
                       u.status,
                       u.email_verified_at,
                       u.created_at,
                       u.updated_at,
                       COALESCE(role_facts.has_admin,0) AS has_admin,
                       COALESCE(role_facts.has_teacher,0) AS has_teacher,
                       COALESCE(role_facts.has_student,0) AS has_student
                FROM users u
                """ + ROLE_FACTS + parts.where()
                + " ORDER BY " + order + " " + direction + ", u.id " + direction
                + " LIMIT :limit OFFSET :offset", parts.params(), this::userRow);
    }

    public Map<String, Instant> findLastMeaningfulActivity(List<byte[]> userIds) {
        if (userIds.isEmpty()) return Map.of();
        Map<String, Instant> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT BIN_TO_UUID(activity.user_id) AS user_id,
                       MAX(activity.occurred_at) AS occurred_at
                FROM (
                    SELECT user_id, MAX(viewed_at) AS occurred_at
                    FROM event_view_logs
                    WHERE user_id IN (:userIds)
                    GROUP BY user_id
                    UNION ALL
                    SELECT user_id, MAX(submitted_at) AS occurred_at
                    FROM quiz_attempts
                    WHERE user_id IN (:userIds) AND status='submitted'
                    GROUP BY user_id
                    UNION ALL
                    SELECT user_id, MAX(submitted_at) AS occurred_at
                    FROM exam_v2_attempts
                    WHERE user_id IN (:userIds)
                    GROUP BY user_id
                ) activity
                GROUP BY activity.user_id
                """, new MapSqlParameterSource("userIds", userIds), rs -> {
            result.put(rs.getString("user_id"), instantNullable(rs, "occurred_at"));
        });
        return result;
    }

    public Optional<AccountRow> findAccount(byte[] userId) {
        return jdbc.query("""
                SELECT BIN_TO_UUID(u.id) AS id,
                       u.full_name,
                       u.email,
                       u.status,
                       u.email_verified_at,
                       u.grade,
                       u.school,
                       u.avatar_url,
                       u.created_at,
                       u.updated_at,
                       COALESCE(role_facts.has_admin,0) AS has_admin,
                       COALESCE(role_facts.has_teacher,0) AS has_teacher,
                       COALESCE(role_facts.has_student,0) AS has_student
                FROM users u
                """ + ROLE_FACTS + " WHERE u.id=:userId",
                new MapSqlParameterSource("userId", userId),
                (rs, row) -> accountRow(rs)).stream().findFirst();
    }

    public LearningRow findLearning(byte[] userId) {
        return jdbc.queryForObject("""
                SELECT
                  COALESCE((
                    SELECT lp.events_viewed
                    FROM learning_progress lp
                    WHERE lp.user_id=:userId AND lp.scope_type='overall' AND lp.scope_id=''
                    LIMIT 1
                  ),0) AS events_viewed,
                  COALESCE((
                    SELECT lp.total_minutes
                    FROM learning_progress lp
                    WHERE lp.user_id=:userId AND lp.scope_type='overall' AND lp.scope_id=''
                    LIMIT 1
                  ),0) AS total_minutes,
                  (
                    SELECT lp.last_activity_at
                    FROM learning_progress lp
                    WHERE lp.user_id=:userId AND lp.scope_type='overall' AND lp.scope_id=''
                    LIMIT 1
                  ) AS progress_at,
                  (SELECT COUNT(DISTINCT event_id) FROM event_view_logs WHERE user_id=:userId)
                    AS distinct_events_viewed,
                  (SELECT MAX(viewed_at) FROM event_view_logs WHERE user_id=:userId)
                    AS event_view_at,
                  (SELECT COUNT(*) FROM quiz_attempts
                    WHERE user_id=:userId AND status='submitted') AS quiz_count,
                  (SELECT AVG(score10) FROM quiz_attempts
                    WHERE user_id=:userId AND status='submitted') AS quiz_average,
                  (SELECT MAX(submitted_at) FROM quiz_attempts
                    WHERE user_id=:userId AND status='submitted') AS quiz_at,
                  (SELECT COUNT(*) FROM exam_v2_attempts WHERE user_id=:userId) AS exam_count,
                  (SELECT AVG(total_score) FROM exam_v2_attempts WHERE user_id=:userId)
                    AS exam_average,
                  (SELECT MAX(submitted_at) FROM exam_v2_attempts WHERE user_id=:userId)
                    AS exam_at
                """, new MapSqlParameterSource("userId", userId), (rs, row) -> new LearningRow(
                rs.getLong("events_viewed"),
                rs.getLong("distinct_events_viewed"),
                rs.getLong("total_minutes"),
                instantNullable(rs, "progress_at"),
                instantNullable(rs, "event_view_at"),
                rs.getLong("quiz_count"),
                rs.getBigDecimal("quiz_average"),
                instantNullable(rs, "quiz_at"),
                rs.getLong("exam_count"),
                rs.getBigDecimal("exam_average"),
                instantNullable(rs, "exam_at")
        ));
    }

    public List<AdminUserDtos.ActivityItem> findRecentActivity(byte[] userId) {
        return jdbc.query("""
                SELECT kind, occurred_at, title, score10
                FROM (
                    SELECT 'event_view' AS kind,
                           MAX(l.viewed_at) AS occurred_at,
                           COALESCE(e.title,l.event_id) AS title,
                           NULL AS score10,
                           CONCAT('event:',l.event_id,':',LPAD(HEX(MAX(l.id)),16,'0')) AS stable_id
                    FROM event_view_logs l
                    LEFT JOIN historical_events e ON e.id=l.event_id
                    WHERE l.user_id=:userId
                    GROUP BY l.event_id,e.title
                    UNION ALL
                    SELECT 'quiz_submitted',q.submitted_at,
                           COALESCE(NULLIF(q.topic,''),NULLIF(q.event_id,''),'Bài kiểm tra'),
                           q.score10,CONCAT('quiz:',HEX(q.id))
                    FROM quiz_attempts q
                    WHERE q.user_id=:userId AND q.status='submitted'
                    UNION ALL
                    SELECT 'exam_submitted',x.submitted_at,
                           COALESCE(NULLIF(x.title,''),NULLIF(x.exam_id,''),'Bài thi'),
                           x.total_score,CONCAT('exam:',HEX(x.id))
                    FROM exam_v2_attempts x
                    WHERE x.user_id=:userId
                ) activity
                ORDER BY occurred_at DESC, stable_id DESC, kind ASC
                LIMIT 10
                """, new MapSqlParameterSource("userId", userId), (rs, row) ->
                new AdminUserDtos.ActivityItem(
                        activityKind(rs.getString("kind")),
                        instant(rs, "occurred_at"),
                        safeLabel(rs.getString("title"), rs.getString("kind")),
                        rs.getBigDecimal("score10")
                ));
    }

    public List<AdminUserDtos.AuditEntry> findRecentAudit(byte[] userId, String userUuid) {
        return jdbc.query("""
                SELECT a.action,
                       CASE
                         WHEN a.user_id=:userId AND a.entity_type='user' AND a.entity_id=:userUuid
                           THEN 'both'
                         WHEN a.entity_type='user' AND a.entity_id=:userUuid THEN 'target'
                         ELSE 'actor'
                       END AS relation_name,
                       actor.full_name AS actor_name,
                       a.entity_type,
                       a.entity_id,
                       a.created_at
                FROM admin_audit_logs a
                LEFT JOIN users actor ON actor.id=a.user_id
                WHERE (a.entity_type='user' AND a.entity_id=:userUuid)
                   OR a.user_id=:userId
                ORDER BY a.created_at DESC,a.id DESC
                LIMIT 10
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("userUuid", userUuid), (rs, row) ->
                new AdminUserDtos.AuditEntry(
                        safeAuditText(rs.getString("action")),
                        auditRelation(rs.getString("relation_name")),
                        new AdminUserDtos.Actor(safeActor(rs.getString("actor_name"))),
                        safeAuditText(rs.getString("entity_type")),
                        safeAuditText(rs.getString("entity_id")),
                        instant(rs, "created_at")
                ));
    }

    private SqlParts sqlParts(AdminUserReadService.Query query) {
        List<String> filters = new ArrayList<>();
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (query.query() != null) {
            filters.add("(u.full_name LIKE :query ESCAPE '=' OR u.email LIKE :query ESCAPE '=')");
            params.addValue("query", "%" + escapeLike(query.query()) + "%");
        }
        if (query.role() != null) {
            filters.add("(" + PRIMARY_ROLE + ")=:role");
            params.addValue("role", query.role());
        }
        if (query.status() != null) {
            filters.add("u.status=:status");
            params.addValue("status", query.status());
        }
        if (query.verified() != null) {
            filters.add(query.verified() ? "u.email_verified_at IS NOT NULL" : "u.email_verified_at IS NULL");
        }
        return new SqlParts(filters.isEmpty() ? "" : " WHERE " + String.join(" AND ", filters), params);
    }

    private UserRow userRow(ResultSet rs, int row) throws SQLException {
        boolean admin = rs.getBoolean("has_admin");
        boolean teacher = rs.getBoolean("has_teacher");
        boolean student = rs.getBoolean("has_student");
        return new UserRow(
                rs.getString("id"),
                rs.getString("full_name"),
                rs.getString("email"),
                role(admin, teacher, student),
                roles(admin, teacher, student),
                status(rs.getString("status")),
                rs.getTimestamp("email_verified_at") != null,
                instant(rs, "created_at"),
                instant(rs, "updated_at")
        );
    }

    private AccountRow accountRow(ResultSet rs) throws SQLException {
        boolean admin = rs.getBoolean("has_admin");
        boolean teacher = rs.getBoolean("has_teacher");
        boolean student = rs.getBoolean("has_student");
        return new AccountRow(
                rs.getString("id"),
                rs.getString("full_name"),
                rs.getString("email"),
                role(admin, teacher, student),
                roles(admin, teacher, student),
                status(rs.getString("status")),
                instantNullable(rs, "email_verified_at"),
                grade(rs.getString("grade")),
                rs.getString("school"),
                mediaUrlPolicy.redactDisplayUrl(rs.getString("avatar_url")),
                instant(rs, "created_at"),
                instant(rs, "updated_at")
        );
    }

    private static AdminUserDtos.Role role(boolean admin, boolean teacher, boolean student) {
        if (admin) return AdminUserDtos.Role.ADMIN;
        if (teacher) return AdminUserDtos.Role.TEACHER;
        if (student) return AdminUserDtos.Role.STUDENT;
        return null;
    }

    private static List<AdminUserDtos.Role> roles(boolean admin, boolean teacher, boolean student) {
        List<AdminUserDtos.Role> result = new ArrayList<>(3);
        if (admin) result.add(AdminUserDtos.Role.ADMIN);
        if (teacher) result.add(AdminUserDtos.Role.TEACHER);
        if (student) result.add(AdminUserDtos.Role.STUDENT);
        return List.copyOf(result);
    }

    private static AdminUserDtos.Status status(String value) {
        return switch (value) {
            case "active" -> AdminUserDtos.Status.ACTIVE;
            case "pending" -> AdminUserDtos.Status.PENDING;
            case "disabled" -> AdminUserDtos.Status.DISABLED;
            case "deleted" -> AdminUserDtos.Status.DELETED;
            default -> throw new IllegalStateException("Unsupported user status in database");
        };
    }

    private static String grade(String value) {
        return value == null || List.of("10", "11", "12", "other").contains(value) ? value : null;
    }

    private static AdminUserDtos.ActivityKind activityKind(String value) {
        return switch (value) {
            case "event_view" -> AdminUserDtos.ActivityKind.EVENT_VIEW;
            case "quiz_submitted" -> AdminUserDtos.ActivityKind.QUIZ_SUBMITTED;
            case "exam_submitted" -> AdminUserDtos.ActivityKind.EXAM_SUBMITTED;
            default -> throw new IllegalStateException("Unsupported activity kind");
        };
    }

    private static AdminUserDtos.AuditRelation auditRelation(String value) {
        return switch (value) {
            case "target" -> AdminUserDtos.AuditRelation.TARGET;
            case "actor" -> AdminUserDtos.AuditRelation.ACTOR;
            case "both" -> AdminUserDtos.AuditRelation.BOTH;
            default -> throw new IllegalStateException("Unsupported audit relation");
        };
    }

    private static String safeLabel(String value, String kind) {
        String fallback = switch (kind) {
            case "event_view" -> "Sự kiện lịch sử";
            case "quiz_submitted" -> "Bài kiểm tra";
            default -> "Bài thi";
        };
        String safe = safeText(value, MAX_ACTIVITY_TITLE);
        return safe == null ? fallback : safe;
    }

    private static String safeActor(String value) {
        String safe = safeText(value, MAX_AUDIT_TEXT);
        return safe == null ? "Hệ thống" : safe;
    }

    private static String safeAuditText(String value) {
        return safeText(value, MAX_AUDIT_TEXT);
    }

    private static String safeText(String value, int maxLength) {
        if (!StringUtils.hasText(value)) return null;
        String normalized = value.trim();
        if (normalized.regionMatches(true, 0, "local:", 0, 6)
                || normalized.chars().anyMatch(Character::isISOControl)) return null;
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private static String escapeLike(String value) {
        return value.replace("=", "==")
                .replace("\\", "=\\")
                .replace("%", "=%")
                .replace("_", "=_");
    }

    private static Instant instant(ResultSet rs, String name) throws SQLException {
        Timestamp value = rs.getTimestamp(name);
        if (value == null) throw new IllegalStateException(name + " must not be null");
        return databaseInstant(value);
    }

    private static Instant instantNullable(ResultSet rs, String name) throws SQLException {
        Timestamp value = rs.getTimestamp(name);
        return value == null ? null : databaseInstant(value);
    }

    private static Instant databaseInstant(Timestamp value) {
        LocalDateTime local = value.toLocalDateTime();
        return local.atZone(DATABASE_ZONE).toInstant();
    }

    public record UserRow(
            String id,
            String displayName,
            String email,
            AdminUserDtos.Role primaryRole,
            List<AdminUserDtos.Role> roles,
            AdminUserDtos.Status status,
            boolean emailVerified,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record AccountRow(
            String id,
            String displayName,
            String email,
            AdminUserDtos.Role primaryRole,
            List<AdminUserDtos.Role> roles,
            AdminUserDtos.Status status,
            Instant emailVerifiedAt,
            String grade,
            String school,
            String avatarUrl,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record LearningRow(
            long eventsViewed,
            long distinctEventsViewed,
            long totalMinutes,
            Instant progressAt,
            Instant eventViewAt,
            long quizCount,
            BigDecimal quizAverage,
            Instant quizAt,
            long examCount,
            BigDecimal examAverage,
            Instant examAt
    ) {
    }

    private record SqlParts(String where, MapSqlParameterSource params) {
    }
}
