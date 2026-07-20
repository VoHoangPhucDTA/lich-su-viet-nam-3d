package com.lichsuvn.backend.exam.ai.infrastructure;

import com.lichsuvn.backend.exam.ai.domain.StyleQuestionCandidate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
public class AiStyleExampleRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AiStyleExampleRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<StyleQuestionCandidate> findEligible(
            String topicHint,
            String difficulty,
            int limit
    ) {
        int candidateLimit = Math.max(limit, limit * 4);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("topicHint", topicHint == null ? "" : topicHint.trim())
                .addValue("difficulty", difficulty.toLowerCase())
                .addValue("candidateLimit", candidateLimit);
        List<Row> rows = jdbc.query("""
                WITH eligible AS (
                    SELECT q.id, q.question_id, q.question_text, q.explanation, q.difficulty,
                           CASE
                               WHEN (
                                   LOWER(TRIM(q.raw_topic)) = LOWER(TRIM(:topicHint))
                                   OR EXISTS (
                                       SELECT 1
                                       FROM exam_question_topics qt
                                       JOIN exam_topics t ON t.id = qt.topic_id
                                       WHERE qt.question_internal_id = q.id
                                         AND (LOWER(TRIM(t.topic_slug)) = LOWER(TRIM(:topicHint))
                                              OR LOWER(TRIM(t.title)) = LOWER(TRIM(:topicHint)))
                                   )
                               ) AND q.difficulty = :difficulty THEN 1
                               WHEN (
                                   LOWER(TRIM(q.raw_topic)) = LOWER(TRIM(:topicHint))
                                   OR EXISTS (
                                       SELECT 1
                                       FROM exam_question_topics qt
                                       JOIN exam_topics t ON t.id = qt.topic_id
                                       WHERE qt.question_internal_id = q.id
                                         AND (LOWER(TRIM(t.topic_slug)) = LOWER(TRIM(:topicHint))
                                              OR LOWER(TRIM(t.title)) = LOWER(TRIM(:topicHint)))
                                   )
                               ) THEN 2
                               WHEN q.difficulty = :difficulty THEN 3
                               ELSE 4
                           END AS selection_priority
                    FROM exam_runtime_state r
                    JOIN exam_datasets d ON d.id = r.active_dataset_id AND d.status = 'ACTIVE'
                    JOIN exam_questions q ON q.dataset_id = d.id
                    JOIN exam_sections s ON s.id = q.exam_section_id
                    JOIN exam_definitions e ON e.id = s.exam_definition_id AND e.dataset_id = d.id
                    WHERE r.state_id = 1
                      AND e.visibility_status = 'PUBLIC'
                      AND e.verification_status = 'VERIFIED'
                      AND q.question_type = 'mcq'
                      AND q.has_image = FALSE
                      AND TRIM(q.question_text) <> ''
                      AND TRIM(COALESCE(q.explanation, '')) <> ''
                      AND (SELECT COUNT(*) FROM exam_mcq_options o WHERE o.question_internal_id = q.id) = 4
                      AND (SELECT COUNT(*) FROM exam_mcq_options o WHERE o.question_internal_id = q.id AND o.is_correct = TRUE) = 1
                      AND (SELECT COUNT(DISTINCT o.option_key) FROM exam_mcq_options o
                           WHERE o.question_internal_id = q.id AND o.option_key IN ('A', 'B', 'C', 'D')) = 4
                      AND NOT EXISTS (
                          SELECT 1 FROM exam_mcq_options o
                          WHERE o.question_internal_id = q.id AND TRIM(o.option_text) = ''
                      )
                    ORDER BY selection_priority, q.question_id
                    LIMIT :candidateLimit
                )
                SELECT e.id, e.question_id, e.question_text, e.explanation, e.difficulty,
                       e.selection_priority, o.option_key, o.option_text, o.is_correct
                FROM eligible e
                JOIN exam_mcq_options o ON o.question_internal_id = e.id
                ORDER BY e.selection_priority, e.question_id, o.order_in_question
                """, parameters, (rs, rowNum) -> new Row(
                rs.getBytes("id"),
                rs.getString("question_id"),
                rs.getString("question_text"),
                rs.getString("explanation"),
                rs.getString("difficulty"),
                rs.getInt("selection_priority"),
                rs.getString("option_key"),
                rs.getString("option_text"),
                rs.getBoolean("is_correct")
        ));
        return group(rows);
    }

    private static List<StyleQuestionCandidate> group(List<Row> rows) {
        Map<String, Builder> grouped = new LinkedHashMap<>();
        for (Row row : rows) {
            String key = Base64.getEncoder().encodeToString(row.id());
            Builder builder = grouped.computeIfAbsent(key, ignored -> new Builder(row));
            builder.options.add(new StyleQuestionCandidate.Option(row.optionId(), row.optionText(), row.correct()));
        }
        return grouped.values().stream().map(Builder::build).toList();
    }

    private record Row(
            byte[] id,
            String publicQuestionId,
            String question,
            String explanation,
            String difficulty,
            int priority,
            String optionId,
            String optionText,
            boolean correct
    ) {
    }

    private static final class Builder {
        private final Row row;
        private final List<StyleQuestionCandidate.Option> options = new ArrayList<>();

        private Builder(Row row) {
            this.row = row;
        }

        private StyleQuestionCandidate build() {
            return new StyleQuestionCandidate(
                    row.publicQuestionId(), row.question(), row.explanation(),
                    row.difficulty(), row.priority(), options
            );
        }
    }
}
