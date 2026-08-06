package com.lichsuvn.backend.admin.infrastructure;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class AdminEventPublicationRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminEventPublicationRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<CurrentPublication> lockCurrent(String id) {
        List<CurrentPublication> rows = jdbc.query("""
                SELECT id, status, published_at, updated_at
                FROM historical_events
                WHERE id=:id
                FOR UPDATE
                """, new MapSqlParameterSource("id", id), (rs, row) ->
                new CurrentPublication(
                        rs.getString("id"),
                        rs.getString("status"),
                        local(rs.getTimestamp("published_at")),
                        local(rs.getTimestamp("updated_at"))));
        return rows.stream().findFirst();
    }

    public boolean update(
            String id,
            LocalDateTime expectedUpdatedAt,
            String targetStatus,
            boolean initializePublishedAt
    ) {
        return jdbc.update("""
                UPDATE historical_events
                SET status=:targetStatus,
                    published_at=CASE
                        WHEN :initializePublishedAt
                            THEN COALESCE(published_at, CURRENT_TIMESTAMP)
                        ELSE published_at
                    END,
                    updated_at=GREATEST(
                        CURRENT_TIMESTAMP(6),
                        updated_at + INTERVAL 1 MICROSECOND)
                WHERE id=:id AND updated_at=:expectedUpdatedAt
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("expectedUpdatedAt", expectedUpdatedAt)
                .addValue("targetStatus", targetStatus)
                .addValue("initializePublishedAt", initializePublishedAt)) == 1;
    }

    public LocalDateTime currentVersion(String id) {
        Timestamp value = jdbc.queryForObject(
                "SELECT updated_at FROM historical_events WHERE id=:id",
                new MapSqlParameterSource("id", id), Timestamp.class);
        return local(value);
    }

    private static LocalDateTime local(Timestamp value) {
        return value == null ? null : value.toLocalDateTime();
    }

    public record CurrentPublication(
            String id,
            String status,
            LocalDateTime publishedAt,
            LocalDateTime updatedAt
    ) {
    }
}
