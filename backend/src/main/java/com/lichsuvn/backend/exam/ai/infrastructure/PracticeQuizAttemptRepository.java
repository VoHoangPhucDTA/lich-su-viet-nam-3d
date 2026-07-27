package com.lichsuvn.backend.exam.ai.infrastructure;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PracticeQuizAttemptRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public PracticeQuizAttemptRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void recordCompletion(
            byte[] attemptId,
            byte[] userId,
            String topic,
            String difficulty,
            int totalQuestions,
            int durationMs,
            String configJson
    ) {
        jdbc.update("""
                INSERT INTO quiz_attempts (
                    id, user_id, source, source_mode, status, topic, difficulty,
                    config_json, questions_json, total_questions, duration_ms,
                    started_at, submitted_at
                ) VALUES (
                    :attemptId, :userId, 'rag', 'ai-practice', 'submitted', :topic, :difficulty,
                    :configJson, '[]', :totalQuestions, :durationMs,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON DUPLICATE KEY UPDATE id = id
                """, new MapSqlParameterSource()
                .addValue("attemptId", attemptId)
                .addValue("userId", userId)
                .addValue("topic", topic)
                .addValue("difficulty", difficulty)
                .addValue("configJson", configJson)
                .addValue("totalQuestions", totalQuestions)
                .addValue("durationMs", durationMs));
    }
}
