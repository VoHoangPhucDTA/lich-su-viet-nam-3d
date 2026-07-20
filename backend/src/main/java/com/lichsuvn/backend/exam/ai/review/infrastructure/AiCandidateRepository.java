package com.lichsuvn.backend.exam.ai.review.infrastructure;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateDtos;
import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Repository
public class AiCandidateRepository {
    private static final List<String> OPTION_IDS = List.of("A", "B", "C", "D");
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public AiCandidateRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public String create(AiGenerationReceiptRepository.Receipt receipt, int questionIndex, byte[] actorId, String auditRequestId) {
        AiQuizGenerationResponse.Question question = receipt.response().questions().get(questionIndex);
        byte[] candidateId = randomId();
        jdbc.update("""
                INSERT INTO ai_question_candidates (
                    id,receipt_id,receipt_question_index,status,question_type,question_text,explanation,difficulty,
                    original_question_text,original_explanation,original_correct_option_id,grade,lesson_number,topic,
                    generation_query,requested_count,generation_request_id,generation_model,embedding_model,
                    embedding_dimension,prompt_version,schema_version,corpus_sha256,collection_name,validation_status,
                    validation_warnings_json,generation_warnings_json,created_by
                ) VALUES (
                    :id,:receiptId,:questionIndex,'DRAFT','mcq',:question,:explanation,:difficulty,
                    :question,:explanation,:correct,:grade,:lesson,:topic,:query,:requested,:requestId,:generationModel,
                    :embeddingModel,:embeddingDimension,:promptVersion,:schemaVersion,:corpusSha,:collectionName,
                    :validationStatus,:validationWarnings,:generationWarnings,:actor
                )
                """, p().addValue("id", candidateId).addValue("receiptId", receipt.id()).addValue("questionIndex", questionIndex)
                .addValue("question", question.question()).addValue("explanation", question.explanation())
                .addValue("difficulty", question.difficulty()).addValue("correct", question.correctOptionId())
                .addValue("grade", receipt.grade()).addValue("lesson", receipt.lessonNumber()).addValue("topic", receipt.query())
                .addValue("query", receipt.query()).addValue("requested", receipt.requestedCount()).addValue("requestId", receipt.requestId())
                .addValue("generationModel", receipt.generationModel()).addValue("embeddingModel", receipt.embeddingModel())
                .addValue("embeddingDimension", receipt.embeddingDimension()).addValue("promptVersion", receipt.promptVersion())
                .addValue("schemaVersion", receipt.schemaVersion()).addValue("corpusSha", receipt.corpusSha256())
                .addValue("collectionName", receipt.collectionName()).addValue("validationStatus", receipt.validationStatus())
                .addValue("validationWarnings", json(receipt.warnings())).addValue("generationWarnings", json(receipt.response().warnings()))
                .addValue("actor", actorId));
        int order = 0;
        for (AiQuizGenerationResponse.Option option : question.options()) {
            order++;
            jdbc.update("""
                    INSERT INTO ai_question_candidate_options
                    (candidate_id,option_id,option_text,is_correct,display_order,original_option_text)
                    VALUES (:candidate,:id,:text,:correct,:order,:text)
                    """, p().addValue("candidate", candidateId).addValue("id", option.id()).addValue("text", option.text())
                    .addValue("correct", option.id().equals(question.correctOptionId())).addValue("order", order));
        }
        int sourceOrder = 0;
        for (String sourceId : question.sourceChunkIds()) {
            AiQuizGenerationResponse.Source source = receipt.response().sources().stream()
                    .filter(item -> item.chunkId().equals(sourceId)).findFirst().orElseThrow();
            sourceOrder++;
            jdbc.update("""
                    INSERT INTO ai_question_candidate_sources
                    (candidate_id,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order)
                    VALUES (:candidate,:chunk,:document,:grade,:lesson,:lessonTitle,:sectionTitle,:pageStart,:pageEnd,:chunkHash,:order)
                    """, p().addValue("candidate", candidateId).addValue("chunk", source.chunkId()).addValue("document", source.documentId())
                    .addValue("grade", source.grade()).addValue("lesson", source.lessonNumber()).addValue("lessonTitle", source.lessonTitle())
                    .addValue("sectionTitle", source.sectionTitle()).addValue("pageStart", source.pageStart()).addValue("pageEnd", source.pageEnd())
                    .addValue("chunkHash", source.chunkHash()).addValue("order", sourceOrder));
        }
        audit(candidateId, actorId, "CREATED", null, "DRAFT", List.of(), "Created from server generation receipt", auditRequestId);
        return UuidBytes.toString(candidateId);
    }

    public Candidate find(String id) {
        List<Candidate> rows = jdbc.query("SELECT * FROM ai_question_candidates WHERE id=:id", p().addValue("id", uuid(id)), this::candidate);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Candidate findForUpdate(String id) {
        List<Candidate> rows = jdbc.query("SELECT * FROM ai_question_candidates WHERE id=:id FOR UPDATE",
                p().addValue("id", uuid(id)), this::candidate);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public AiCandidateDtos.Detail detail(String id) {
        Candidate row = find(id);
        if (row == null) return null;
        List<AiCandidateDtos.Option> options = jdbc.query("""
                SELECT option_id,option_text,is_correct,display_order,original_option_text
                FROM ai_question_candidate_options WHERE candidate_id=:id ORDER BY display_order
                """, p().addValue("id", row.id()), (rs, n) -> new AiCandidateDtos.Option(rs.getString(1), rs.getString(2), rs.getBoolean(3), rs.getInt(4), rs.getString(5)));
        List<AiCandidateDtos.Source> sources = jdbc.query("""
                SELECT chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order
                FROM ai_question_candidate_sources WHERE candidate_id=:id ORDER BY display_order
                """, p().addValue("id", row.id()), (rs, n) -> new AiCandidateDtos.Source(
                rs.getString(1), rs.getString(2), integer(rs, 3), integer(rs, 4), rs.getString(5), rs.getString(6),
                integer(rs, 7), integer(rs, 8), rs.getString(9), rs.getInt(10)));
        return new AiCandidateDtos.Detail(
                row.idString(), row.status(), row.questionText(), row.explanation(), row.difficulty(),
                row.originalQuestionText(), row.originalExplanation(), row.originalCorrectOptionId(), row.grade(), row.lessonNumber(),
                row.topic(), row.generationQuery(), row.requestedCount(), row.generationRequestId(), row.generationModel(),
                row.embeddingModel(), row.embeddingDimension(), row.promptVersion(), row.schemaVersion(), row.corpusSha256(),
                row.collectionName(), row.validationStatus(), strings(row.validationWarningsJson()), strings(row.generationWarningsJson()),
                id(row.createdBy()), id(row.submittedBy()), id(row.reviewedBy()), id(row.publishedBy()), row.createdAt(), row.updatedAt(),
                row.submittedAt(), row.reviewedAt(), row.publishedAt(), row.rejectionReason(), row.reviewNote(), id(row.officialQuestionId()),
                row.version(), options, sources
        );
    }

    public AiCandidateDtos.Page list(String status, String difficulty, Integer grade, Integer lesson, String createdBy,
                                      String reviewedBy, String search, LocalDateTime createdFrom, LocalDateTime createdTo,
                                      int limit, int offset) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        MapSqlParameterSource params = p().addValue("limit", limit).addValue("offset", offset);
        filter(where, params, "status", status, "c.status=:status");
        filter(where, params, "difficulty", difficulty, "c.difficulty=:difficulty");
        if (grade != null) { where.append(" AND c.grade=:grade"); params.addValue("grade", grade); }
        if (lesson != null) { where.append(" AND c.lesson_number=:lesson"); params.addValue("lesson", lesson); }
        if (createdBy != null && !createdBy.isBlank()) { where.append(" AND c.created_by=:createdBy"); params.addValue("createdBy", uuid(createdBy)); }
        if (reviewedBy != null && !reviewedBy.isBlank()) { where.append(" AND c.reviewed_by=:reviewedBy"); params.addValue("reviewedBy", uuid(reviewedBy)); }
        if (createdFrom != null) { where.append(" AND c.created_at>=:createdFrom"); params.addValue("createdFrom", createdFrom); }
        if (createdTo != null) { where.append(" AND c.created_at<=:createdTo"); params.addValue("createdTo", createdTo); }
        if (search != null && !search.isBlank()) { where.append(" AND (LOWER(c.question_text) LIKE :search OR LOWER(c.generation_query) LIKE :search)"); params.addValue("search", "%" + search.trim().toLowerCase(Locale.ROOT) + "%"); }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM ai_question_candidates c" + where, params, Long.class);
        List<AiCandidateDtos.Summary> items = jdbc.query("""
                SELECT c.id,c.status,c.question_text,c.difficulty,c.grade,c.lesson_number,c.topic,c.created_by,c.reviewed_by,
                       c.version,c.created_at,c.updated_at,
                       (SELECT COUNT(*) FROM ai_question_candidate_sources s WHERE s.candidate_id=c.id) source_count,
                       c.generation_warnings_json
                FROM ai_question_candidates c
                """ + where + " ORDER BY c.created_at DESC,c.id DESC LIMIT :limit OFFSET :offset", params, (rs, n) -> new AiCandidateDtos.Summary(
                id(rs.getBytes("id")), AiCandidateStatus.valueOf(rs.getString("status")), rs.getString("question_text"), rs.getString("difficulty"),
                rs.getInt("grade"), integer(rs, "lesson_number"), rs.getString("topic"), id(rs.getBytes("created_by")), id(rs.getBytes("reviewed_by")),
                strings(rs.getString("generation_warnings_json")).size(), rs.getInt("source_count"), rs.getLong("version"),
                rs.getTimestamp("created_at").toLocalDateTime(), rs.getTimestamp("updated_at").toLocalDateTime()));
        return new AiCandidateDtos.Page(items, total == null ? 0 : total, limit, offset);
    }

    public boolean updateContent(Candidate current, AiCandidateDtos.UpdateRequest request, byte[] actor, String requestId) {
        var originalById = new java.util.HashMap<String, String>();
        jdbc.queryForList("SELECT option_id,original_option_text FROM ai_question_candidate_options WHERE candidate_id=:id",
                        p().addValue("id", current.id()))
                .forEach(row -> originalById.put((String) row.get("option_id"), (String) row.get("original_option_text")));
        int updated = jdbc.update("""
                UPDATE ai_question_candidates SET question_text=:question,explanation=:explanation,difficulty=:difficulty,
                    grade=:grade,lesson_number=:lesson,topic=:topic,review_note=:note,rejection_reason=NULL,
                    status=CASE WHEN status='REJECTED' THEN 'DRAFT' ELSE status END,version=version+1
                WHERE id=:id AND version=:version AND status IN ('DRAFT','REJECTED')
                """, p().addValue("question", request.questionText().trim()).addValue("explanation", request.explanation().trim())
                .addValue("difficulty", request.difficulty()).addValue("grade", request.grade()).addValue("lesson", request.lessonNumber())
                .addValue("topic", trim(request.topic())).addValue("note", trim(request.reviewNote())).addValue("id", current.id()).addValue("version", request.version()));
        if (updated == 0) return false;
        jdbc.update("DELETE FROM ai_question_candidate_options WHERE candidate_id=:id", p().addValue("id", current.id()));
        int order = 0;
        for (AiCandidateDtos.OptionInput option : request.options()) {
            order++;
            String original = originalById.getOrDefault(option.id(), option.text());
            jdbc.update("INSERT INTO ai_question_candidate_options (candidate_id,option_id,option_text,is_correct,display_order,original_option_text) VALUES (:id,:key,:text,:correct,:order,:original)",
                    p().addValue("id", current.id()).addValue("key", option.id()).addValue("text", option.text().trim()).addValue("correct", option.correct()).addValue("order", order).addValue("original", original));
        }
        audit(current.id(), actor, "EDITED", current.status().name(), current.status() == AiCandidateStatus.REJECTED ? "DRAFT" : current.status().name(),
                List.of("questionText", "explanation", "difficulty", "grade", "lessonNumber", "topic", "options", "reviewNote"), trim(request.reviewNote()), requestId);
        return true;
    }

    public boolean transition(Candidate current, long version, AiCandidateStatus target, byte[] actor, String note, String event, String requestId) {
        String timestamps = switch (target) {
            case PENDING_REVIEW -> ",submitted_by=:actor,submitted_at=CURRENT_TIMESTAMP(6)";
            case APPROVED, REJECTED -> ",reviewed_by=:actor,reviewed_at=CURRENT_TIMESTAMP(6)";
            default -> "";
        };
        String rejection = target == AiCandidateStatus.REJECTED ? ",rejection_reason=:note" : target == AiCandidateStatus.PENDING_REVIEW ? ",rejection_reason=NULL" : "";
        int updated = jdbc.update("UPDATE ai_question_candidates SET status=:target,review_note=:note,version=version+1" + timestamps + rejection + " WHERE id=:id AND version=:version",
                p().addValue("target", target.name()).addValue("note", trim(note)).addValue("actor", actor).addValue("id", current.id()).addValue("version", version));
        if (updated == 1) audit(current.id(), actor, event, current.status().name(), target.name(), List.of("status"), trim(note), requestId);
        return updated == 1;
    }

    public List<AiCandidateDtos.AuditEvent> audit(String id) {
        return jdbc.query("""
                SELECT id,event_type,actor_id,from_status,to_status,changed_fields_json,note,created_at,request_id
                FROM ai_question_candidate_audit_events WHERE candidate_id=:id ORDER BY created_at,id
                """, p().addValue("id", uuid(id)), (rs, n) -> new AiCandidateDtos.AuditEvent(rs.getLong(1), rs.getString(2), id(rs.getBytes(3)),
                rs.getString(4), rs.getString(5), strings(rs.getString(6)), rs.getString(7), rs.getTimestamp(8).toLocalDateTime(), rs.getString(9)));
    }

    public PublishTarget publishTarget(String datasetId, String definitionId, String sectionId) {
        List<PublishTarget> rows = jdbc.query("""
                SELECT d.id dataset_id,e.id definition_id,s.id section_id,e.visibility_status,e.verification_status
                FROM exam_datasets d JOIN exam_definitions e ON e.dataset_id=d.id JOIN exam_sections s ON s.exam_definition_id=e.id
                WHERE d.id=:dataset AND e.id=:definition AND s.id=:section AND s.section_type='mcq'
                  AND d.status IN ('VALIDATED','ACTIVE')
                FOR UPDATE
                """, p().addValue("dataset", uuid(datasetId)).addValue("definition", uuid(definitionId)).addValue("section", uuid(sectionId)),
                (rs, n) -> new PublishTarget(rs.getBytes(1), rs.getBytes(2), rs.getBytes(3), rs.getString(4), rs.getString(5)));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<AiCandidateDtos.PublishTarget> publishTargets() {
        return jdbc.query("""
                SELECT d.id dataset_id,e.id definition_id,s.id section_id,e.title,s.title section_title
                FROM exam_datasets d JOIN exam_definitions e ON e.dataset_id=d.id JOIN exam_sections s ON s.exam_definition_id=e.id
                WHERE d.status IN ('VALIDATED','ACTIVE') AND e.visibility_status='HIDDEN'
                  AND e.verification_status='REVIEW_REQUIRED' AND s.section_type='mcq'
                ORDER BY e.title,s.order_in_exam
                """, p(), (rs, n) -> new AiCandidateDtos.PublishTarget(id(rs.getBytes(1)), id(rs.getBytes(2)), id(rs.getBytes(3)), rs.getString(4) + " — " + rs.getString(5)));
    }

    public byte[] insertOfficial(Candidate candidate, PublishTarget target) {
        byte[] questionId = randomId();
        Integer sectionOrder = jdbc.queryForObject("SELECT COALESCE(MAX(order_in_section),0)+1 FROM exam_questions WHERE exam_section_id=:id", p().addValue("id", target.sectionId()), Integer.class);
        Integer examOrder = jdbc.queryForObject("SELECT COALESCE(MAX(q.order_in_exam),0)+1 FROM exam_questions q JOIN exam_sections s ON s.id=q.exam_section_id WHERE s.exam_definition_id=:id", p().addValue("id", target.definitionId()), Integer.class);
        String publicId = "ai-" + candidate.idString();
        jdbc.update("""
                INSERT INTO exam_questions (id,dataset_id,exam_section_id,question_id,order_in_section,order_in_exam,question_type,
                    question_text,explanation,difficulty,cognitive_level,raw_topic,has_image,content_hash)
                VALUES (:id,:dataset,:section,:publicId,:sectionOrder,:examOrder,'mcq',:question,:explanation,:difficulty,
                    'comprehension',:topic,FALSE,:hash)
                """, p().addValue("id", questionId).addValue("dataset", target.datasetId()).addValue("section", target.sectionId())
                .addValue("publicId", publicId).addValue("sectionOrder", sectionOrder).addValue("examOrder", examOrder)
                .addValue("question", candidate.questionText()).addValue("explanation", candidate.explanation())
                .addValue("difficulty", candidate.difficulty().toLowerCase(Locale.ROOT)).addValue("topic", candidate.topic() == null ? candidate.generationQuery() : candidate.topic())
                .addValue("hash", sha256(candidate.questionText() + "\n" + candidate.explanation())));
        List<AiCandidateDtos.Option> options = detail(candidate.idString()).options();
        for (AiCandidateDtos.Option option : options) jdbc.update("INSERT INTO exam_mcq_options (question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (:id,:key,:text,:correct,:order)",
                p().addValue("id", questionId).addValue("key", option.id()).addValue("text", option.text()).addValue("correct", option.correct()).addValue("order", option.displayOrder()));
        List<AiCandidateDtos.Source> sources = detail(candidate.idString()).sources();
        int order = 0;
        for (AiCandidateDtos.Source source : sources) {
            order++;
            String title = source.lessonTitle() == null ? "SGK Lịch sử lớp " + (source.grade() == null ? candidate.grade() : source.grade()) : source.lessonTitle();
            String location = source.sectionTitle();
            if (source.pageStart() != null) location = (location == null ? "" : location + ", ") + "trang " + source.pageStart() + (source.pageEnd() != null && !source.pageEnd().equals(source.pageStart()) ? "-" + source.pageEnd() : "");
            jdbc.update("INSERT INTO exam_question_sources (question_internal_id,source_title,source_location,order_in_question) VALUES (:id,:title,:location,:order)",
                    p().addValue("id", questionId).addValue("title", title).addValue("location", location).addValue("order", order));
        }
        jdbc.update("UPDATE exam_sections SET total_questions=total_questions+1 WHERE id=:id", p().addValue("id", target.sectionId()));
        jdbc.update("UPDATE exam_definitions SET mcq_count=mcq_count+1 WHERE id=:id", p().addValue("id", target.definitionId()));
        return questionId;
    }

    public boolean markPublished(Candidate candidate, long version, byte[] officialId, byte[] actor, String requestId) {
        int updated = jdbc.update("""
                UPDATE ai_question_candidates SET status='PUBLISHED',official_question_id=:official,published_by=:actor,
                    published_at=CURRENT_TIMESTAMP(6),version=version+1 WHERE id=:id AND version=:version AND status='APPROVED' AND official_question_id IS NULL
                """, p().addValue("official", officialId).addValue("actor", actor).addValue("id", candidate.id()).addValue("version", version));
        if (updated == 1) audit(candidate.id(), actor, "PUBLISHED", "APPROVED", "PUBLISHED", List.of("status", "officialQuestionId"), "Explicit publish to hidden review-required definition", requestId);
        return updated == 1;
    }

    public void publishFailed(byte[] candidateId, byte[] actor, String note, String requestId) {
        audit(candidateId, actor, "PUBLISH_FAILED", "APPROVED", "APPROVED", List.of(), note, requestId);
    }

    private Candidate candidate(ResultSet rs, int row) throws SQLException {
        return new Candidate(rs.getBytes("id"), AiCandidateStatus.valueOf(rs.getString("status")), rs.getString("question_text"), rs.getString("explanation"), rs.getString("difficulty"),
                rs.getString("original_question_text"), rs.getString("original_explanation"), rs.getString("original_correct_option_id"), rs.getInt("grade"), integer(rs, "lesson_number"),
                rs.getString("topic"), rs.getString("generation_query"), rs.getInt("requested_count"), rs.getString("generation_request_id"), rs.getString("generation_model"),
                rs.getString("embedding_model"), rs.getInt("embedding_dimension"), rs.getString("prompt_version"), rs.getString("schema_version"), rs.getString("corpus_sha256"),
                rs.getString("collection_name"), rs.getString("validation_status"), rs.getString("validation_warnings_json"), rs.getString("generation_warnings_json"),
                rs.getBytes("created_by"), rs.getBytes("submitted_by"), rs.getBytes("reviewed_by"), rs.getBytes("published_by"), rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime(), time(rs, "submitted_at"), time(rs, "reviewed_at"), time(rs, "published_at"), rs.getString("rejection_reason"),
                rs.getString("review_note"), rs.getBytes("official_question_id"), rs.getLong("version"));
    }

    private void audit(byte[] candidate, byte[] actor, String event, String from, String to, List<String> fields, String note, String requestId) {
        jdbc.update("INSERT INTO ai_question_candidate_audit_events (candidate_id,event_type,actor_id,from_status,to_status,changed_fields_json,note,request_id) VALUES (:candidate,:event,:actor,:fromStatus,:toStatus,:fields,:note,:requestId)",
                p().addValue("candidate", candidate).addValue("event", event).addValue("actor", actor).addValue("fromStatus", from).addValue("toStatus", to)
                        .addValue("fields", json(fields)).addValue("note", trim(note)).addValue("requestId", requestId));
    }
    private void filter(StringBuilder where, MapSqlParameterSource p, String name, String value, String sql) { if (value != null && !value.isBlank()) { where.append(" AND ").append(sql); p.addValue(name, value); } }
    private MapSqlParameterSource p() { return new MapSqlParameterSource(); }
    private byte[] randomId() { return UuidBytes.fromUuid(UUID.randomUUID()); }
    private byte[] uuid(String value) { try { return UuidBytes.fromUuid(UUID.fromString(value)); } catch (RuntimeException ex) { return new byte[16]; } }
    private String id(byte[] value) { return value == null ? null : UuidBytes.toString(value); }
    private Integer integer(ResultSet rs, int index) throws SQLException { int value = rs.getInt(index); return rs.wasNull() ? null : value; }
    private Integer integer(ResultSet rs, String name) throws SQLException { int value = rs.getInt(name); return rs.wasNull() ? null : value; }
    private LocalDateTime time(ResultSet rs, String name) throws SQLException { var value = rs.getTimestamp(name); return value == null ? null : value.toLocalDateTime(); }
    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String json(Object value) { try { return objectMapper.writeValueAsString(value); } catch (JacksonException ex) { throw new IllegalStateException("Cannot serialize candidate audit", ex); } }
    @SuppressWarnings("unchecked") private List<String> strings(String value) { try { return value == null ? List.of() : objectMapper.readValue(value, List.class); } catch (JacksonException ex) { return List.of(); } }
    private String sha256(String value) { try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch (Exception ex) { throw new IllegalStateException(ex); } }

    public record Candidate(
            byte[] id, AiCandidateStatus status, String questionText, String explanation, String difficulty,
            String originalQuestionText, String originalExplanation, String originalCorrectOptionId,
            int grade, Integer lessonNumber, String topic, String generationQuery, int requestedCount,
            String generationRequestId, String generationModel, String embeddingModel, int embeddingDimension,
            String promptVersion, String schemaVersion, String corpusSha256, String collectionName,
            String validationStatus, String validationWarningsJson, String generationWarningsJson,
            byte[] createdBy, byte[] submittedBy, byte[] reviewedBy, byte[] publishedBy,
            LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime submittedAt,
            LocalDateTime reviewedAt, LocalDateTime publishedAt, String rejectionReason, String reviewNote,
            byte[] officialQuestionId, long version
    ) { public String idString() { return UuidBytes.toString(id); } }
    public record PublishTarget(byte[] datasetId, byte[] definitionId, byte[] sectionId, String visibility, String verification) {}
}
