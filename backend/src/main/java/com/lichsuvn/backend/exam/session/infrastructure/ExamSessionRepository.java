package com.lichsuvn.backend.exam.session.infrastructure;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ExamSessionRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public ExamSessionRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<DatasetRow> findActiveDataset() {
        return jdbc.query("""
                        SELECT d.id, d.aggregate_hash
                        FROM exam_runtime_state r JOIN exam_datasets d ON d.id = r.active_dataset_id
                        WHERE r.state_id = 1 AND d.status = 'ACTIVE'
                        """, Map.of(), (rs, n) -> new DatasetRow(rs.getBytes(1), rs.getString(2))).stream().findFirst();
    }

    /** Historical datasets remain queryable for version-aware local recovery. */
    public Optional<DatasetRow> findDatasetByVersion(String version) {
        return jdbc.query("SELECT id, aggregate_hash FROM exam_datasets WHERE aggregate_hash=:version",
                p().addValue("version", version), (rs, n) -> new DatasetRow(rs.getBytes(1), rs.getString(2))).stream().findFirst();
    }

    public Optional<ExamRow> findPublicExam(byte[] datasetId, String examId) {
        return jdbc.query("""
                        SELECT id, exam_id, title, time_limit_minutes, content_hash, total_score
                        FROM exam_definitions WHERE dataset_id=:datasetId AND exam_id=:examId AND visibility_status='PUBLIC'
                        """, p().addValue("datasetId", datasetId).addValue("examId", examId),
                (rs, n) -> new ExamRow(rs.getBytes("id"), rs.getString("exam_id"), rs.getString("title"), rs.getInt("time_limit_minutes"), rs.getString("content_hash"), rs.getDouble("total_score"))).stream().findFirst();
    }

    public List<QuestionRow> questionsForExam(byte[] datasetId, byte[] examId) {
        return queryQuestions("""
                WHERE q.dataset_id=:datasetId AND s.exam_definition_id=:examId
                ORDER BY q.order_in_exam
                """, p().addValue("datasetId", datasetId).addValue("examId", examId));
    }

    public List<QuestionRow> questionsForFilter(byte[] datasetId, Filter filter) {
        String join = filter.scopeType().equals("all") ? "" : " JOIN exam_question_topics qt ON qt.question_internal_id=q.id JOIN exam_topics t ON t.id=qt.topic_id ";
        StringBuilder where = new StringBuilder(" WHERE q.dataset_id=:datasetId AND e.dataset_id=:datasetId AND e.visibility_status='PUBLIC'");
        MapSqlParameterSource params = p().addValue("datasetId", datasetId);
        addFilter(where, params, "q.question_type", "type", filter.questionType());
        addFilter(where, params, "q.difficulty", "difficulty", filter.difficulty());
        addFilter(where, params, "q.cognitive_level", "cognitive", filter.cognitiveLevel());
        if (filter.scopeType().equals("topic")) {
            where.append(" AND t.topic_slug=:scopeSlug"); params.addValue("scopeSlug", filter.scopeSlug());
        } else if (filter.scopeType().equals("period")) {
            where.append(" AND t.period_slug=:scopeSlug"); params.addValue("scopeSlug", filter.scopeSlug());
        }
        return queryQuestions(join + where + " ORDER BY q.question_id", params);
    }

    public List<QuestionRow> questionsForPublicIds(byte[] datasetId, List<String> publicIds) {
        if (publicIds.isEmpty()) return List.of();
        List<QuestionRow> rows = queryQuestions(" WHERE q.dataset_id=:datasetId AND e.dataset_id=:datasetId AND e.visibility_status='PUBLIC' AND q.question_id IN (:ids)",
                p().addValue("datasetId", datasetId).addValue("ids", publicIds));
        Map<String, QuestionRow> byPublicId = new java.util.HashMap<>();
        for (QuestionRow row : rows) byPublicId.put(row.publicId(), row);
        return publicIds.stream().map(byPublicId::get).filter(java.util.Objects::nonNull).toList();
    }

    public Optional<String> findAttemptResult(byte[] userId, String sessionId) {
        return jdbc.query("SELECT result_json FROM exam_v2_attempts WHERE user_id=:userId AND session_id=:sessionId",
                p().addValue("userId", userId).addValue("sessionId", sessionId), (rs, n) -> rs.getString(1)).stream().findFirst();
    }

    public Optional<String> findAttemptResult(byte[] attemptId) {
        return jdbc.query("SELECT result_json FROM exam_v2_attempts WHERE id=:id", p().addValue("id", attemptId), (rs, n) -> rs.getString(1)).stream().findFirst();
    }

    private List<QuestionRow> queryQuestions(String tail, MapSqlParameterSource parameters) {
        return jdbc.query("""
                        SELECT q.id, q.question_id, q.question_type, q.question_text, q.explanation, q.difficulty, q.cognitive_level,
                               s.section_id, s.section_type, s.max_score, s.total_questions, s.scoring_config_json
                        FROM exam_questions q JOIN exam_sections s ON s.id=q.exam_section_id
                        JOIN exam_definitions e ON e.id=s.exam_definition_id
                        """ + tail, parameters, (rs, n) -> new QuestionRow(
                rs.getBytes("id"), rs.getString("question_id"), rs.getString("question_type"), rs.getString("question_text"),
                rs.getString("explanation"), rs.getString("difficulty"), rs.getString("cognitive_level"), rs.getString("section_id"),
                rs.getString("section_type"), rs.getDouble("max_score"), rs.getInt("total_questions"), rs.getString("scoring_config_json")));
    }

    public List<OptionRow> options(byte[] questionId) {
        return jdbc.query("SELECT option_key, option_text, is_correct FROM exam_mcq_options WHERE question_internal_id=:id ORDER BY order_in_question",
                p().addValue("id", questionId), (rs, n) -> new OptionRow(rs.getString(1), rs.getString(2), rs.getBoolean(3)));
    }

    public List<StatementRow> statements(byte[] questionId) {
        return jdbc.query("SELECT statement_key, statement_text, is_true FROM exam_tf_statements WHERE question_internal_id=:id ORDER BY order_in_question",
                p().addValue("id", questionId), (rs, n) -> new StatementRow(rs.getString(1), rs.getString(2), rs.getBoolean(3)));
    }

    public List<SourceRow> sources(byte[] questionId) {
        return jdbc.query("SELECT source_title, source_location FROM exam_question_sources WHERE question_internal_id=:id ORDER BY order_in_question",
                p().addValue("id", questionId), (rs, n) -> new SourceRow(rs.getString(1), rs.getString(2)));
    }

    public List<TopicRow> topics(byte[] questionId) {
        return jdbc.query("""
                        SELECT t.topic_slug, t.title, t.period_slug, t.period_title FROM exam_question_topics qt
                        JOIN exam_topics t ON t.id=qt.topic_id WHERE qt.question_internal_id=:id ORDER BY t.display_order
                        """, p().addValue("id", questionId), (rs, n) -> new TopicRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)));
    }

    public QuestionMaterials loadQuestionMaterials(List<QuestionRow> questions) {
        if (questions.isEmpty()) return new QuestionMaterials(Map.of());

        List<byte[]> ids = questions.stream().map(QuestionRow::id).toList();
        Map<String, QuestionMaterialBuilder> builders = new HashMap<>();
        for (QuestionRow question : questions) builders.put(questionKey(question.id()), new QuestionMaterialBuilder());

        jdbc.query("""
                        SELECT question_internal_id, option_key, option_text, is_correct
                        FROM exam_mcq_options
                        WHERE question_internal_id IN (:ids)
                        ORDER BY question_internal_id, order_in_question
                        """, p().addValue("ids", ids), (rs, n) -> new MaterialOptionRow(
                rs.getBytes("question_internal_id"), new OptionRow(rs.getString("option_key"), rs.getString("option_text"), rs.getBoolean("is_correct"))))
                .forEach(row -> builder(builders, row.questionId()).options.add(row.option()));

        jdbc.query("""
                        SELECT question_internal_id, statement_key, statement_text, is_true
                        FROM exam_tf_statements
                        WHERE question_internal_id IN (:ids)
                        ORDER BY question_internal_id, order_in_question
                        """, p().addValue("ids", ids), (rs, n) -> new MaterialStatementRow(
                rs.getBytes("question_internal_id"), new StatementRow(rs.getString("statement_key"), rs.getString("statement_text"), rs.getBoolean("is_true"))))
                .forEach(row -> builder(builders, row.questionId()).statements.add(row.statement()));

        jdbc.query("""
                        SELECT question_internal_id, source_title, source_location
                        FROM exam_question_sources
                        WHERE question_internal_id IN (:ids)
                        ORDER BY question_internal_id, order_in_question
                        """, p().addValue("ids", ids), (rs, n) -> new MaterialSourceRow(
                rs.getBytes("question_internal_id"), new SourceRow(rs.getString("source_title"), rs.getString("source_location"))))
                .forEach(row -> builder(builders, row.questionId()).sources.add(row.source()));

        jdbc.query("""
                        SELECT qt.question_internal_id, t.topic_slug, t.title, t.period_slug, t.period_title
                        FROM exam_question_topics qt
                        JOIN exam_topics t ON t.id=qt.topic_id
                        WHERE qt.question_internal_id IN (:ids)
                        ORDER BY qt.question_internal_id, t.display_order
                        """, p().addValue("ids", ids), (rs, n) -> new MaterialTopicRow(
                rs.getBytes("question_internal_id"), new TopicRow(rs.getString("topic_slug"), rs.getString("title"), rs.getString("period_slug"), rs.getString("period_title"))))
                .forEach(row -> builder(builders, row.questionId()).topics.add(row.topic()));

        Map<String, QuestionMaterial> materials = new HashMap<>();
        builders.forEach((key, value) -> materials.put(key, value.build()));
        return new QuestionMaterials(Map.copyOf(materials));
    }

    public void insertSession(SessionRow row) {
        jdbc.update("""
                INSERT INTO exam_sessions (id,public_session_id,user_id,anonymous_token_hash,source_dataset_id,dataset_version,mode,title,exam_id,exam_content_hash,config_json,scoring_version,started_at_server,deadline_at,submit_grace_seconds,status)
                VALUES (:id,:publicId,:userId,:tokenHash,:datasetId,:version,:mode,:title,:examId,:contentHash,:config,:scoring,:started,:deadline,:grace,:status)
                """, p().addValue("id", row.id()).addValue("publicId", row.publicId()).addValue("userId", row.userId()).addValue("tokenHash", row.tokenHash())
                .addValue("datasetId", row.datasetId()).addValue("version", row.datasetVersion()).addValue("mode", row.mode()).addValue("title", row.title())
                .addValue("examId", row.examId()).addValue("contentHash", row.contentHash()).addValue("config", row.configJson()).addValue("scoring", row.scoringVersion())
                .addValue("started", row.startedAt()).addValue("deadline", row.deadlineAt()).addValue("grace", row.graceSeconds()).addValue("status", row.status()));
    }

    public void insertSessionQuestion(SessionQuestionRow row) {
        jdbc.update("""
                INSERT INTO exam_session_questions (id,session_id,public_question_instance_id,source_question_id,public_question_id,position_in_session,section_id,section_type,safe_snapshot_json,answer_key_snapshot_json)
                VALUES (:id,:sessionId,:instance,:sourceId,:publicId,:position,:sectionId,:sectionType,:safe,:answerKey)
                """, p().addValue("id", row.id()).addValue("sessionId", row.sessionId()).addValue("instance", row.instanceId()).addValue("sourceId", row.sourceQuestionId())
                .addValue("publicId", row.publicQuestionId()).addValue("position", row.position()).addValue("sectionId", row.sectionId()).addValue("sectionType", row.sectionType())
                .addValue("safe", row.safeJson()).addValue("answerKey", row.answerKeyJson()));
    }

    public void insertSessionQuestions(List<SessionQuestionRow> rows) {
        if (rows.isEmpty()) return;
        MapSqlParameterSource[] batch = rows.stream().map(row -> p()
                .addValue("id", row.id()).addValue("sessionId", row.sessionId()).addValue("instance", row.instanceId()).addValue("sourceId", row.sourceQuestionId())
                .addValue("publicId", row.publicQuestionId()).addValue("position", row.position()).addValue("sectionId", row.sectionId()).addValue("sectionType", row.sectionType())
                .addValue("safe", row.safeJson()).addValue("answerKey", row.answerKeyJson())).toArray(MapSqlParameterSource[]::new);
        jdbc.batchUpdate("""
                INSERT INTO exam_session_questions (id,session_id,public_question_instance_id,source_question_id,public_question_id,position_in_session,section_id,section_type,safe_snapshot_json,answer_key_snapshot_json)
                VALUES (:id,:sessionId,:instance,:sourceId,:publicId,:position,:sectionId,:sectionType,:safe,:answerKey)
                """, batch);
    }

    public Optional<SessionRow> findSession(String publicId) { return querySession(publicId, false); }
    public Optional<SessionRow> lockSession(String publicId) { return querySession(publicId, true); }

    private Optional<SessionRow> querySession(String publicId, boolean lock) {
        String suffix = lock ? " FOR UPDATE" : "";
        return jdbc.query("""
                        SELECT id,public_session_id,user_id,anonymous_token_hash,source_dataset_id,dataset_version,mode,title,exam_id,exam_content_hash,config_json,scoring_version,started_at_server,deadline_at,submit_grace_seconds,status,result_json,completed_at,submitted_at_server
                        FROM exam_sessions WHERE public_session_id=:id
                        """ + suffix, p().addValue("id", publicId), (rs, n) -> new SessionRow(
                rs.getBytes("id"), rs.getString("public_session_id"), rs.getBytes("user_id"), rs.getString("anonymous_token_hash"), rs.getBytes("source_dataset_id"), rs.getString("dataset_version"), rs.getString("mode"), rs.getString("title"), rs.getString("exam_id"), rs.getString("exam_content_hash"), rs.getString("config_json"), rs.getString("scoring_version"), rs.getTimestamp("started_at_server").toInstant(), timestamp(rs, "deadline_at"), rs.getInt("submit_grace_seconds"), rs.getString("status"), rs.getString("result_json"), timestamp(rs, "completed_at"), timestamp(rs, "submitted_at_server"))).stream().findFirst();
    }

    public List<SessionQuestionRow> listSessionQuestions(byte[] sessionId) {
        return jdbc.query("""
                        SELECT id,session_id,public_question_instance_id,source_question_id,public_question_id,position_in_session,section_id,section_type,safe_snapshot_json,answer_key_snapshot_json,practice_answer_json,checked_result_json,checked_at
                        FROM exam_session_questions WHERE session_id=:id ORDER BY position_in_session
                        """, p().addValue("id", sessionId), (rs, n) -> new SessionQuestionRow(rs.getBytes("id"), rs.getBytes("session_id"), rs.getString("public_question_instance_id"), rs.getBytes("source_question_id"), rs.getString("public_question_id"), rs.getInt("position_in_session"), rs.getString("section_id"), rs.getString("section_type"), rs.getString("safe_snapshot_json"), rs.getString("answer_key_snapshot_json"), rs.getString("practice_answer_json"), rs.getString("checked_result_json"), timestamp(rs, "checked_at")));
    }

    public Optional<SessionQuestionRow> lockSessionQuestion(byte[] sessionId, String instanceId) {
        return jdbc.query("""
                        SELECT id,session_id,public_question_instance_id,source_question_id,public_question_id,position_in_session,section_id,section_type,safe_snapshot_json,answer_key_snapshot_json,practice_answer_json,checked_result_json,checked_at
                        FROM exam_session_questions WHERE session_id=:sessionId AND public_question_instance_id=:instance FOR UPDATE
                        """, p().addValue("sessionId", sessionId).addValue("instance", instanceId), (rs,n) -> new SessionQuestionRow(rs.getBytes("id"),rs.getBytes("session_id"),rs.getString("public_question_instance_id"),rs.getBytes("source_question_id"),rs.getString("public_question_id"),rs.getInt("position_in_session"),rs.getString("section_id"),rs.getString("section_type"),rs.getString("safe_snapshot_json"),rs.getString("answer_key_snapshot_json"),rs.getString("practice_answer_json"),rs.getString("checked_result_json"),timestamp(rs,"checked_at"))).stream().findFirst();
    }

    public void saveCheckedQuestion(byte[] id, String answerJson, String resultJson) { jdbc.update("UPDATE exam_session_questions SET practice_answer_json=:answer, checked_result_json=:result, checked_at=CURRENT_TIMESTAMP(6) WHERE id=:id", p().addValue("id",id).addValue("answer",answerJson).addValue("result",resultJson)); }
    public void completeSessionIfAllQuestionsChecked(byte[] sessionId) {
        jdbc.update("""
                UPDATE exam_sessions
                SET status='COMPLETED', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP(6))
                WHERE id=:id AND status='IN_PROGRESS'
                  AND NOT EXISTS (
                    SELECT 1 FROM exam_session_questions
                    WHERE session_id=:id AND checked_result_json IS NULL
                  )
                """, p().addValue("id", sessionId));
    }
    public void completeSession(byte[] id) { jdbc.update("UPDATE exam_sessions SET status='COMPLETED', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP(6)) WHERE id=:id", p().addValue("id",id)); }
    public void submitSession(byte[] id, String resultJson) { jdbc.update("UPDATE exam_sessions SET status='SUBMITTED', result_json=:result, submitted_at_server=CURRENT_TIMESTAMP(6) WHERE id=:id", p().addValue("id",id).addValue("result",resultJson)); }

    public Optional<ReceiptRow> findReceiptByClientId(String clientId) { return queryReceipt("WHERE client_submission_id=:value", p().addValue("value",clientId)); }
    public Optional<ReceiptRow> findSuccessReceipt(byte[] sessionId) { return queryReceipt("WHERE session_id=:value AND success_slot=1", p().addValue("value",sessionId)); }
    private Optional<ReceiptRow> queryReceipt(String where, MapSqlParameterSource values) { return jdbc.query("SELECT id,session_id,user_id,client_submission_id,submission_hash,status,error_code,attempt_id,success_slot FROM exam_submission_receipts " + where, values, (rs,n)->new ReceiptRow(rs.getBytes("id"),rs.getBytes("session_id"),rs.getBytes("user_id"),rs.getString("client_submission_id"),rs.getString("submission_hash"),rs.getString("status"),rs.getString("error_code"),rs.getBytes("attempt_id"),(Integer)rs.getObject("success_slot"))).stream().findFirst(); }
    public void insertReceipt(ReceiptRow row) { jdbc.update("INSERT INTO exam_submission_receipts (id,session_id,user_id,client_submission_id,submission_hash,status,error_code,attempt_id,success_slot) VALUES (:id,:session,:user,:client,:hash,:status,:error,:attempt,:slot)", p().addValue("id",row.id()).addValue("session",row.sessionId()).addValue("user",row.userId()).addValue("client",row.clientSubmissionId()).addValue("hash",row.submissionHash()).addValue("status",row.status()).addValue("error",row.errorCode()).addValue("attempt",row.attemptId()).addValue("slot",row.successSlot())); }
    public void updateReceipt(byte[] id, String status, String error, byte[] attemptId, Integer successSlot) { jdbc.update("UPDATE exam_submission_receipts SET status=:status,error_code=:error,attempt_id=:attempt,success_slot=:slot,completed_at=CASE WHEN :status IN ('SUCCESS','SUPERSEDED','FAILED_PERMANENT','FAILED_RETRYABLE') THEN CURRENT_TIMESTAMP(6) ELSE completed_at END WHERE id=:id", p().addValue("id",id).addValue("status",status).addValue("error",error).addValue("attempt",attemptId).addValue("slot",successSlot)); }
    public void insertAttempt(AttemptRow a) { jdbc.update("""
                INSERT INTO exam_v2_attempts (id,user_id,session_id,mode,exam_id,title,is_custom,source_exam_ids_json,question_refs_json,question_snapshots_json,answers_json,config_json,result_json,snapshot_schema_version,score_authority,timing_authority,submission_origin,scoring_version,dataset_version,exam_content_hash,total_questions,total_score,mcq_score,tf_score,duration_seconds,submitted_at)
                VALUES (:id,:user,:session,:mode,:exam,:title,:custom,:sourceExamIds,:refs,:snapshots,:answers,:config,:result,2,:scoreAuthority,:timingAuthority,:origin,:scoring,:dataset,:content,:total,:score,:mcq,:tf,:duration,:submitted)
                """, p().addValue("id",a.id()).addValue("user",a.userId()).addValue("session",a.sessionId()).addValue("mode",a.mode()).addValue("exam",a.examId()).addValue("title",a.title()).addValue("custom",a.custom()).addValue("sourceExamIds",a.sourceExamIdsJson()).addValue("refs",a.refsJson()).addValue("snapshots",null).addValue("answers",a.answersJson()).addValue("config",a.configJson()).addValue("result",a.resultJson()).addValue("scoreAuthority",a.scoreAuthority()).addValue("timingAuthority",a.timingAuthority()).addValue("origin",a.submissionOrigin()).addValue("scoring",a.scoringVersion()).addValue("dataset",a.datasetVersion()).addValue("content",a.contentHash()).addValue("total",a.totalQuestions()).addValue("score",a.totalScore()).addValue("mcq",a.mcqScore()).addValue("tf",a.tfScore()).addValue("duration",a.durationSeconds()).addValue("submitted",a.submittedAt())); }

    private void addFilter(StringBuilder where, MapSqlParameterSource p, String column, String name, String value) { if (!"all".equals(value)) { where.append(" AND ").append(column).append("=:").append(name); p.addValue(name,value); } }
    private static Instant timestamp(java.sql.ResultSet rs, String name) throws java.sql.SQLException { var value=rs.getTimestamp(name); return value == null ? null : value.toInstant(); }
    private static MapSqlParameterSource p() { return new MapSqlParameterSource(); }
    private static String questionKey(byte[] id) { return Base64.getEncoder().encodeToString(id); }
    private static QuestionMaterialBuilder builder(Map<String, QuestionMaterialBuilder> builders, byte[] id) {
        QuestionMaterialBuilder value = builders.get(questionKey(id));
        if (value == null) throw new IllegalStateException("Question material does not belong to the requested question set");
        return value;
    }

    public record DatasetRow(byte[] id, String version) {}
    public record ExamRow(byte[] id,String examId,String title,int durationMinutes,String contentHash,double totalScore) {}
    public record Filter(String questionType,String difficulty,String cognitiveLevel,String scopeType,String scopeSlug) {}
    public record QuestionRow(byte[] id,String publicId,String type,String text,String explanation,String difficulty,String cognitiveLevel,String sectionId,String sectionType,double sectionMaxScore,int sectionQuestionCount,String scoringConfigJson) {}
    public record OptionRow(String key,String text,boolean correct) {}
    public record StatementRow(String key,String text,boolean truth) {}
    public record SourceRow(String title,String location) {}
    public record TopicRow(String slug,String title,String periodSlug,String periodTitle) {}
    public record QuestionMaterial(List<OptionRow> options,List<StatementRow> statements,List<SourceRow> sources,List<TopicRow> topics) {}
    public static final class QuestionMaterials {
        private final Map<String, QuestionMaterial> byQuestion;

        private QuestionMaterials(Map<String, QuestionMaterial> byQuestion) { this.byQuestion = byQuestion; }

        public QuestionMaterial forQuestion(byte[] questionId) {
            return byQuestion.getOrDefault(questionKey(questionId), new QuestionMaterial(List.of(), List.of(), List.of(), List.of()));
        }
    }
    private static final class QuestionMaterialBuilder {
        private final List<OptionRow> options = new ArrayList<>();
        private final List<StatementRow> statements = new ArrayList<>();
        private final List<SourceRow> sources = new ArrayList<>();
        private final List<TopicRow> topics = new ArrayList<>();

        private QuestionMaterial build() { return new QuestionMaterial(List.copyOf(options), List.copyOf(statements), List.copyOf(sources), List.copyOf(topics)); }
    }
    private record MaterialOptionRow(byte[] questionId, OptionRow option) {}
    private record MaterialStatementRow(byte[] questionId, StatementRow statement) {}
    private record MaterialSourceRow(byte[] questionId, SourceRow source) {}
    private record MaterialTopicRow(byte[] questionId, TopicRow topic) {}
    public record SessionRow(byte[] id,String publicId,byte[] userId,String tokenHash,byte[] datasetId,String datasetVersion,String mode,String title,String examId,String contentHash,String configJson,String scoringVersion,Instant startedAt,Instant deadlineAt,int graceSeconds,String status,String resultJson,Instant completedAt,Instant submittedAt) {}
    public record SessionQuestionRow(byte[] id,byte[] sessionId,String instanceId,byte[] sourceQuestionId,String publicQuestionId,int position,String sectionId,String sectionType,String safeJson,String answerKeyJson,String practiceAnswerJson,String checkedResultJson,Instant checkedAt) {}
    public record ReceiptRow(byte[] id,byte[] sessionId,byte[] userId,String clientSubmissionId,String submissionHash,String status,String errorCode,byte[] attemptId,Integer successSlot) {}
    public record AttemptRow(byte[] id,byte[] userId,String sessionId,String mode,String examId,String title,boolean custom,String sourceExamIdsJson,String refsJson,String answersJson,String configJson,String resultJson,String scoreAuthority,String timingAuthority,String submissionOrigin,String scoringVersion,String datasetVersion,String contentHash,int totalQuestions,double totalScore,double mcqScore,double tfScore,int durationSeconds,Instant submittedAt) {}
}
