package com.lichsuvn.backend.exam.catalog.infrastructure;

import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogDetailResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogItemResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamTopicResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ExamCatalogRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public ExamCatalogRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ActiveDataset> findActiveDataset() {
        return jdbc.query("""
                        SELECT d.id, d.aggregate_hash
                        FROM exam_runtime_state r
                        JOIN exam_datasets d ON d.id = r.active_dataset_id
                        WHERE r.state_id = 1 AND d.status = 'ACTIVE'
                        """,
                Map.of(),
                (rs, rowNum) -> new ActiveDataset(rs.getBytes("id"), rs.getString("aggregate_hash")))
                .stream()
                .findFirst();
    }

    public List<ExamCatalogItemResponse> listExams(byte[] datasetId, boolean verifiedOnly) {
        String verificationFilter = verifiedOnly ? " AND e.verification_status = 'VERIFIED'" : "";
        return jdbc.query("""
                        SELECT e.exam_id, e.title, e.exam_year, e.source_detail, e.exam_format,
                               e.time_limit_minutes, e.total_score, e.mcq_count, e.tf_count,
                               e.verification_status, e.warnings_json
                        FROM exam_definitions e
                        WHERE e.dataset_id = :datasetId AND e.visibility_status = 'PUBLIC'
                        """ + verificationFilter + " ORDER BY e.exam_year DESC, e.title, e.exam_id",
                params().addValue("datasetId", datasetId),
                (rs, rowNum) -> new ExamCatalogItemResponse(
                        rs.getString("exam_id"),
                        rs.getString("title"),
                        (Integer) rs.getObject("exam_year"),
                        rs.getString("source_detail"),
                        rs.getString("exam_format"),
                        rs.getInt("time_limit_minutes"),
                        rs.getBigDecimal("total_score"),
                        rs.getInt("mcq_count") + rs.getInt("tf_count"),
                        rs.getInt("mcq_count"),
                        rs.getInt("tf_count"),
                        rs.getString("verification_status"),
                        hasJsonContent(rs.getString("warnings_json"))
                ));
    }

    public Optional<ExamDefinitionRow> findPublicExam(byte[] datasetId, String examId) {
        return jdbc.query("""
                        SELECT e.id, e.exam_id, e.title, e.exam_year, e.source_name, e.source_detail,
                               e.exam_code, e.exam_format, e.time_limit_minutes, e.total_score,
                               e.mcq_count, e.tf_count, e.verification_status, e.warnings_json
                        FROM exam_definitions e
                        WHERE e.dataset_id = :datasetId
                          AND e.exam_id = :examId
                          AND e.visibility_status = 'PUBLIC'
                        """,
                params().addValue("datasetId", datasetId).addValue("examId", examId),
                (rs, rowNum) -> new ExamDefinitionRow(
                        rs.getBytes("id"),
                        rs.getString("exam_id"),
                        rs.getString("title"),
                        (Integer) rs.getObject("exam_year"),
                        rs.getString("source_name"),
                        rs.getString("source_detail"),
                        rs.getString("exam_code"),
                        rs.getString("exam_format"),
                        rs.getInt("time_limit_minutes"),
                        rs.getBigDecimal("total_score"),
                        rs.getInt("mcq_count"),
                        rs.getInt("tf_count"),
                        rs.getString("verification_status"),
                        hasJsonContent(rs.getString("warnings_json"))
                )).stream().findFirst();
    }

    public List<ExamCatalogDetailResponse.SectionSummary> listSections(byte[] examDefinitionId) {
        return jdbc.query("""
                        SELECT section_id, section_type, title, order_in_exam, total_questions, max_score
                        FROM exam_sections
                        WHERE exam_definition_id = :examId
                        ORDER BY order_in_exam
                        """,
                params().addValue("examId", examDefinitionId),
                (rs, rowNum) -> new ExamCatalogDetailResponse.SectionSummary(
                        rs.getString("section_id"),
                        rs.getString("section_type"),
                        rs.getString("title"),
                        rs.getInt("order_in_exam"),
                        rs.getInt("total_questions"),
                        rs.getBigDecimal("max_score")
                ));
    }

    public List<ExamTopicResponse.TopicItem> listTopics(byte[] datasetId) {
        return jdbc.query("""
                        SELECT t.topic_slug, t.title, t.period_slug, t.period_title,
                               COUNT(DISTINCT q.id) AS question_count,
                               COUNT(DISTINCT CASE WHEN q.question_type = 'mcq' THEN q.id END) AS mcq_count,
                               COUNT(DISTINCT CASE WHEN q.question_type = 'true_false' THEN q.id END) AS tf_count,
                               COUNT(DISTINCT CASE WHEN q.difficulty = 'easy' THEN q.id END) AS easy_count,
                               COUNT(DISTINCT CASE WHEN q.difficulty = 'medium' THEN q.id END) AS medium_count,
                               COUNT(DISTINCT CASE WHEN q.difficulty = 'hard' THEN q.id END) AS hard_count,
                               COUNT(DISTINCT CASE WHEN q.cognitive_level = 'knowledge' THEN q.id END) AS knowledge_count,
                               COUNT(DISTINCT CASE WHEN q.cognitive_level = 'comprehension' THEN q.id END) AS comprehension_count,
                               COUNT(DISTINCT CASE WHEN q.cognitive_level = 'application' THEN q.id END) AS application_count
                        FROM exam_topics t
                        JOIN exam_question_topics qt ON qt.topic_id = t.id
                        JOIN exam_questions q ON q.id = qt.question_internal_id
                        JOIN exam_sections s ON s.id = q.exam_section_id
                        JOIN exam_definitions e ON e.id = s.exam_definition_id
                        WHERE t.dataset_id = :datasetId
                          AND q.dataset_id = :datasetId
                          AND e.dataset_id = :datasetId
                          AND e.visibility_status = 'PUBLIC'
                        GROUP BY t.id, t.topic_slug, t.title, t.period_slug, t.period_title, t.display_order
                        ORDER BY t.display_order
                        """,
                params().addValue("datasetId", datasetId),
                (rs, rowNum) -> new ExamTopicResponse.TopicItem(
                        rs.getString("topic_slug"),
                        rs.getString("title"),
                        rs.getString("period_slug"),
                        rs.getString("period_title"),
                        rs.getInt("question_count"),
                        rs.getInt("mcq_count"),
                        rs.getInt("tf_count"),
                        orderedMap(
                                "easy", rs.getInt("easy_count"),
                                "medium", rs.getInt("medium_count"),
                                "hard", rs.getInt("hard_count")
                        ),
                        orderedMap(
                                "knowledge", rs.getInt("knowledge_count"),
                                "comprehension", rs.getInt("comprehension_count"),
                                "application", rs.getInt("application_count")
                        )
                ));
    }

    public PreviewCounts preview(byte[] datasetId, PreviewFilter filter) {
        StringBuilder sql = new StringBuilder("""
                SELECT q.question_type, q.difficulty, q.cognitive_level, COUNT(DISTINCT q.id) AS item_count
                FROM exam_questions q
                JOIN exam_sections s ON s.id = q.exam_section_id
                JOIN exam_definitions e ON e.id = s.exam_definition_id
                """);
        MapSqlParameterSource parameters = params().addValue("datasetId", datasetId);
        if (!filter.scopeType().equals("all")) {
            sql.append(" JOIN exam_question_topics qt ON qt.question_internal_id = q.id JOIN exam_topics t ON t.id = qt.topic_id ");
        }
        sql.append("""
                WHERE q.dataset_id = :datasetId
                  AND e.dataset_id = :datasetId
                  AND e.visibility_status = 'PUBLIC'
                """);
        appendFilter(sql, parameters, "q.question_type", "questionType", filter.questionType());
        appendFilter(sql, parameters, "q.difficulty", "difficulty", filter.difficulty());
        appendFilter(sql, parameters, "q.cognitive_level", "cognitiveLevel", filter.cognitiveLevel());
        if (filter.scopeType().equals("topic")) {
            sql.append(" AND t.topic_slug = :scopeSlug ");
            parameters.addValue("scopeSlug", filter.scopeSlug());
        } else if (filter.scopeType().equals("period")) {
            sql.append(" AND t.period_slug = :scopeSlug ");
            parameters.addValue("scopeSlug", filter.scopeSlug());
        }
        sql.append(" GROUP BY q.question_type, q.difficulty, q.cognitive_level ");

        List<PreviewBucket> buckets = jdbc.query(sql.toString(), parameters, (rs, rowNum) -> new PreviewBucket(
                rs.getString("question_type"),
                rs.getString("difficulty"),
                rs.getString("cognitive_level"),
                rs.getInt("item_count")
        ));
        return PreviewCounts.from(buckets);
    }

    private void appendFilter(StringBuilder sql, MapSqlParameterSource parameters, String column, String name, String value) {
        if (!value.equals("all")) {
            sql.append(" AND ").append(column).append(" = :").append(name);
            parameters.addValue(name, value);
        }
    }

    private static Map<String, Integer> orderedMap(Object... values) {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) {
            result.put((String) values[index], (Integer) values[index + 1]);
        }
        return result;
    }

    private static boolean hasJsonContent(String json) {
        return json != null && !json.isBlank() && !json.equals("[]") && !json.equals("{}");
    }

    private MapSqlParameterSource params() {
        return new MapSqlParameterSource();
    }

    public record ActiveDataset(byte[] id, String aggregateHash) {
    }

    public record ExamDefinitionRow(
            byte[] id,
            String examId,
            String title,
            Integer year,
            String source,
            String sourceDetail,
            String examCode,
            String format,
            int timeLimitMinutes,
            java.math.BigDecimal totalScore,
            int mcqCount,
            int tfCount,
            String verificationStatus,
            boolean hasWarnings
    ) {
    }

    public record PreviewFilter(
            String questionType,
            String difficulty,
            String cognitiveLevel,
            String scopeType,
            String scopeSlug
    ) {
    }

    private record PreviewBucket(String questionType, String difficulty, String cognitiveLevel, int count) {
    }

    public record PreviewCounts(
            int total,
            Map<String, Integer> questionType,
            Map<String, Integer> difficulty,
            Map<String, Integer> cognitiveLevel
    ) {
        static PreviewCounts from(List<PreviewBucket> buckets) {
            Map<String, Integer> type = orderedMap("mcq", 0, "true_false", 0);
            Map<String, Integer> difficulty = orderedMap("easy", 0, "medium", 0, "hard", 0);
            Map<String, Integer> cognitive = orderedMap("knowledge", 0, "comprehension", 0, "application", 0);
            int total = 0;
            for (PreviewBucket bucket : buckets) {
                total += bucket.count();
                type.computeIfPresent(bucket.questionType(), (key, value) -> value + bucket.count());
                difficulty.computeIfPresent(bucket.difficulty(), (key, value) -> value + bucket.count());
                cognitive.computeIfPresent(bucket.cognitiveLevel(), (key, value) -> value + bucket.count());
            }
            return new PreviewCounts(total, type, difficulty, cognitive);
        }
    }
}
