package com.lichsuvn.backend.admin.infrastructure;

import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.event.infrastructure.PublicMapDataSanitizer;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

@Repository
public class AdminDashboardReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminDashboardReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public AdminDashboardDtos.UserMetrics findUserMetrics() {
        return jdbc.queryForObject("""
                SELECT
                  SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_total,
                  SUM(CASE WHEN created_at>=DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY) THEN 1 ELSE 0 END)
                    AS created_last_7_days
                FROM users
                """, new MapSqlParameterSource(), (rs, row) -> new AdminDashboardDtos.UserMetrics(
                rs.getLong("active_total"), rs.getLong("created_last_7_days")
        ));
    }

    public List<AdminDashboardDtos.AuditEntry> findRecentAudit(int limit) {
        return jdbc.query("""
                SELECT a.action, a.entity_type, a.entity_id, a.created_at, u.full_name
                FROM admin_audit_logs a
                LEFT JOIN users u ON u.id=a.user_id
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT :limit
                """, new MapSqlParameterSource("limit", limit), (rs, row) ->
                new AdminDashboardDtos.AuditEntry(
                        new AdminDashboardDtos.ActorSummary(safeActor(rs.getString("full_name"))),
                        safeText(rs.getString("action")),
                        safeText(rs.getString("entity_type")),
                        safeText(rs.getString("entity_id")),
                        instant(rs.getTimestamp("created_at"))
                ));
    }

    private static String safeActor(String value) {
        String safe = safeText(value);
        return safe == null ? "Hệ thống" : safe;
    }

    private static String safeText(String value) {
        return !StringUtils.hasText(value) || PublicMapDataSanitizer.isLocal(value)
                ? null : value.trim();
    }

    private static Instant instant(java.sql.Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
