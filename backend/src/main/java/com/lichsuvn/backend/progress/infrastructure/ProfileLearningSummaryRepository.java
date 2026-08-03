package com.lichsuvn.backend.progress.infrastructure;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public class ProfileLearningSummaryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public ProfileLearningSummaryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Totals findTotals(byte[] userId) {
        MapSqlParameterSource parameters = new MapSqlParameterSource("userId", userId);
        return jdbc.queryForObject("""
                SELECT
                    (SELECT COUNT(DISTINCT event_id)
                     FROM event_view_logs
                     WHERE user_id = :userId) AS events_viewed,
                    (SELECT COUNT(*)
                     FROM quiz_attempts
                     WHERE user_id = :userId
                       AND status = 'submitted'
                       AND submitted_at IS NOT NULL) AS quizzes_completed,
                    (SELECT COALESCE(SUM(duration_seconds), 0)
                     FROM exam_v2_attempts
                     WHERE user_id = :userId
                       AND mode IN ('TIMED_ORIGINAL', 'CUSTOM_MOCK')
                       AND submitted_at IS NOT NULL
                       AND duration_seconds IS NOT NULL
                       AND duration_seconds >= 0
                       AND total_score BETWEEN 0 AND 10
                       AND TRIM(session_id) <> ''
                       AND (
                           (score_authority = 'BACKEND'
                            AND timing_authority = 'SERVER'
                            AND submission_origin = 'SERVER_ON_TIME')
                           OR (score_authority = 'BACKEND'
                               AND timing_authority = 'CLIENT_UNVERIFIED'
                               AND submission_origin IN ('SERVER_ISSUED_LATE', 'CLIENT_FALLBACK'))
                           OR score_authority = 'FRONTEND_LEGACY'
                           OR (score_authority IS NULL
                               AND (snapshot_schema_version IS NULL OR snapshot_schema_version <> 2))
                       )) AS total_duration_seconds
                """, parameters, (rs, rowNum) -> new Totals(
                rs.getLong("events_viewed"),
                rs.getLong("quizzes_completed"),
                rs.getLong("total_duration_seconds")
        ));
    }

    public List<LocalDate> findActivityDates(byte[] userId) {
        return jdbc.query("""
                SELECT DISTINCT DATE(activity_at) AS activity_date
                FROM (
                    SELECT viewed_at AS activity_at
                    FROM event_view_logs
                    WHERE user_id = :userId
                    UNION ALL
                    SELECT submitted_at AS activity_at
                    FROM quiz_attempts
                    WHERE user_id = :userId
                      AND status = 'submitted'
                      AND submitted_at IS NOT NULL
                    UNION ALL
                    SELECT submitted_at AS activity_at
                    FROM exam_v2_attempts
                    WHERE user_id = :userId
                      AND mode IN ('TIMED_ORIGINAL', 'CUSTOM_MOCK')
                      AND submitted_at IS NOT NULL
                ) activities
                WHERE activity_at IS NOT NULL
                GROUP BY DATE(activity_at)
                ORDER BY activity_date DESC
                """, new MapSqlParameterSource("userId", userId),
                (rs, rowNum) -> rs.getObject("activity_date", LocalDate.class));
    }

    public record Totals(long eventsViewed, long quizzesCompleted, long totalDurationSeconds) {
    }
}
