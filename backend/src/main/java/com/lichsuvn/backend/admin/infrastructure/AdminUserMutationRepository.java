package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AdminUserMutationRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public AdminUserMutationRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public boolean tryRemoveActiveAdmin() {
        int updated = jdbc.update("""
                UPDATE admin_mutation_guards
                SET active_admin_count=(
                        SELECT COUNT(DISTINCT u.id)
                        FROM users u
                        JOIN user_roles ur ON ur.user_id=u.id
                        JOIN roles r ON r.id=ur.role_id
                        WHERE u.status='active' AND r.code='admin'
                    ) - 1,
                    revision=revision + 1
                WHERE guard_key='last_active_admin'
                  AND (
                        SELECT COUNT(DISTINCT u.id)
                        FROM users u
                        JOIN user_roles ur ON ur.user_id=u.id
                        JOIN roles r ON r.id=ur.role_id
                        WHERE u.status='active' AND r.code='admin'
                    ) > 1
                """, new MapSqlParameterSource());
        if (updated == 1) {
            return true;
        }
        requireLastActiveAdminGuard();
        return false;
    }

    public void addActiveAdmin() {
        int updated = jdbc.update("""
                UPDATE admin_mutation_guards
                SET active_admin_count=(
                        SELECT COUNT(DISTINCT u.id)
                        FROM users u
                        JOIN user_roles ur ON ur.user_id=u.id
                        JOIN roles r ON r.id=ur.role_id
                        WHERE u.status='active' AND r.code='admin'
                    ) + 1,
                    revision=revision + 1
                WHERE guard_key='last_active_admin'
                """, new MapSqlParameterSource());
        if (updated != 1) {
            requireLastActiveAdminGuard();
            throw new IllegalStateException("Last active administrator guard update did not affect one row");
        }
    }

    private void requireLastActiveAdminGuard() {
        List<Long> counts = jdbc.query("""
                SELECT active_admin_count
                FROM admin_mutation_guards
                WHERE guard_key='last_active_admin'
                FOR UPDATE
                """, new MapSqlParameterSource(), (rs, row) -> rs.getLong("active_admin_count"));
        if (counts.size() != 1) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "ADMIN_MUTATION_GUARD_MISSING",
                    "The last active administrator guard is missing or inconsistent");
        }
    }

    public Optional<LockedUser> lockUser(byte[] userId) {
        return jdbc.query("""
                SELECT status, updated_at, auth_version
                FROM users
                WHERE id=:userId
                FOR UPDATE
                """, new MapSqlParameterSource("userId", userId), (rs, row) -> new LockedUser(
                userId.clone(),
                rs.getString("status"),
                rs.getTimestamp("updated_at").toLocalDateTime(),
                rs.getLong("auth_version")
        )).stream().findFirst();
    }

    public List<RoleRow> lockUserRoles(byte[] userId) {
        return jdbc.query("""
                SELECT r.id, r.code
                FROM user_roles ur
                JOIN roles r ON r.id=ur.role_id
                WHERE ur.user_id=:userId
                ORDER BY r.id ASC, r.code ASC
                FOR UPDATE
                """, new MapSqlParameterSource("userId", userId), (rs, row) ->
                new RoleRow(rs.getLong("id"), rs.getString("code")));
    }

    public Map<String, Long> supportedRoleIds() {
        Map<String, Long> result = new LinkedHashMap<>();
        List<RoleRow> rows = jdbc.query("""
                SELECT id, code
                FROM roles
                WHERE code IN ('admin','teacher','student')
                ORDER BY id ASC, code ASC
                """, new MapSqlParameterSource(), (rs, row) ->
                new RoleRow(rs.getLong("id"), rs.getString("code")));
        rows.forEach(role -> result.put(role.code(), role.id()));
        return Map.copyOf(result);
    }

    public boolean claimVersion(byte[] userId, LocalDateTime expectedUpdatedAt) {
        return jdbc.update("""
                UPDATE users
                SET updated_at=GREATEST(
                        CURRENT_TIMESTAMP(6),
                        updated_at + INTERVAL 1 MICROSECOND),
                    auth_version=auth_version + 1
                WHERE id=:userId
                  AND updated_at=:expectedUpdatedAt
                  AND auth_version < 9223372036854775807
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("expectedUpdatedAt", expectedUpdatedAt)) == 1;
    }

    public boolean claimVersionAndStatus(
            byte[] userId,
            LocalDateTime expectedUpdatedAt,
            String nextStatus
    ) {
        return jdbc.update("""
                UPDATE users
                SET status=:status,
                    updated_at=GREATEST(
                        CURRENT_TIMESTAMP(6),
                        updated_at + INTERVAL 1 MICROSECOND),
                    auth_version=auth_version + 1
                WHERE id=:userId
                  AND updated_at=:expectedUpdatedAt
                  AND auth_version < 9223372036854775807
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("expectedUpdatedAt", expectedUpdatedAt)
                .addValue("status", nextStatus)) == 1;
    }

    public void replaceRoles(byte[] userId, List<String> canonicalRoles, Map<String, Long> roleIds) {
        jdbc.update("DELETE FROM user_roles WHERE user_id=:userId",
                new MapSqlParameterSource("userId", userId));
        for (String role : canonicalRoles) {
            Long roleId = roleIds.get(role);
            if (roleId == null) {
                throw new ApiException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "ROLE_SEED_MISSING",
                        "A required role seed is missing");
            }
            jdbc.update("""
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES (:userId, :roleId)
                    """, new MapSqlParameterSource()
                    .addValue("userId", userId)
                    .addValue("roleId", roleId));
        }
    }

    public LocalDateTime currentVersion(byte[] userId) {
        Timestamp timestamp = jdbc.queryForObject("""
                SELECT updated_at
                FROM users
                WHERE id=:userId
                """, new MapSqlParameterSource("userId", userId), Timestamp.class);
        if (timestamp == null) {
            throw new ApiException(
                    HttpStatus.CONFLICT, "USER_UPDATE_CONFLICT", "User version changed");
        }
        return timestamp.toLocalDateTime();
    }

    public void audit(
            UserPrincipal principal,
            String action,
            String targetId,
            Map<String, Object> before,
            Map<String, Object> after
    ) {
        jdbc.update("""
                INSERT INTO admin_audit_logs
                    (user_id, action, entity_type, entity_id, before_json, after_json)
                VALUES
                    (:actorId, :action, 'user', :targetId,
                     CAST(:beforeJson AS JSON), CAST(:afterJson AS JSON))
                """, new MapSqlParameterSource()
                .addValue("actorId", principal.idBytes())
                .addValue("action", action)
                .addValue("targetId", targetId)
                .addValue("beforeJson", json(before))
                .addValue("afterJson", json(after)));
    }

    private String json(Map<String, Object> value) {
        return AdminAuditMetadataPolicy.requireBoundedObject(objectMapper, value);
    }

    public record RoleRow(long id, String code) {
    }

    public record LockedUser(
            byte[] id,
            String status,
            LocalDateTime updatedAt,
            long authVersion
    ) {
        public String idString() {
            return UuidBytes.toString(id);
        }
    }
}
