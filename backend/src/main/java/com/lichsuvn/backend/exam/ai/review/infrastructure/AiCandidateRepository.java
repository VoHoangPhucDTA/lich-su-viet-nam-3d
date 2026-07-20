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
        jdbc.update("UPDATE ai_generation_receipts SET last_used_at=CURRENT_TIMESTAMP(6) WHERE id=:id",
                p().addValue("id", receipt.id()));
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
        List<AiCandidateDtos.Source> sources = sources(row.id());
        List<AiCandidateDtos.Source> baseSources = row.parentCandidateId() == null ? List.of() : sources(row.parentCandidateId());
        List<AiCandidateDtos.Option> baseOptions = jdbc.query("""
                SELECT option_id,base_option_text,base_is_correct,display_order,original_option_text
                FROM ai_question_candidate_options
                WHERE candidate_id=:id AND base_option_text IS NOT NULL ORDER BY display_order
                """, p().addValue("id", row.id()), (rs, n) -> new AiCandidateDtos.Option(
                rs.getString(1), rs.getString(2), rs.getBoolean(3), rs.getInt(4), rs.getString(5)));
        String openRevision = null;
        if (row.rootOfficialQuestionId() != null) {
            List<byte[]> open = jdbc.query("SELECT open_candidate_id FROM ai_question_revision_heads WHERE root_official_question_id=:root",
                    p().addValue("root", row.rootOfficialQuestionId()), (rs, n) -> rs.getBytes(1));
            if (!open.isEmpty()) openRevision = id(open.getFirst());
        }
        OfficialSnapshot baseOfficial = row.baseOfficialQuestionId() == null ? null : officialSnapshot(row.baseOfficialQuestionId());
        AiCandidateDtos.RevisionInfo revision = new AiCandidateDtos.RevisionInfo(
                row.originType(), id(row.parentCandidateId()), id(row.rootOfficialQuestionId()), id(row.baseOfficialQuestionId()),
                row.revisionNumber(), row.revisionReason(), row.baseContentHash(), row.baseQuestionText(),
                row.baseExplanation(), row.baseDifficulty(), row.baseTopic(), baseOfficial == null ? null : id(baseOfficial.datasetId()),
                baseOfficial == null ? null : id(baseOfficial.definitionId()), baseOfficial == null ? null : id(baseOfficial.sectionId()),
                openRevision, baseOptions, baseSources);
        return new AiCandidateDtos.Detail(
                row.idString(), row.status(), row.questionText(), row.explanation(), row.difficulty(),
                row.originalQuestionText(), row.originalExplanation(), row.originalCorrectOptionId(), row.grade(), row.lessonNumber(),
                row.topic(), row.generationQuery(), row.requestedCount(), row.generationRequestId(), row.generationModel(),
                row.embeddingModel(), row.embeddingDimension(), row.promptVersion(), row.schemaVersion(), row.corpusSha256(),
                row.collectionName(), row.validationStatus(), strings(row.validationWarningsJson()), strings(row.generationWarningsJson()),
                id(row.createdBy()), id(row.submittedBy()), id(row.reviewedBy()), id(row.publishedBy()), row.createdAt(), row.updatedAt(),
                row.submittedAt(), row.reviewedAt(), row.publishedAt(), row.rejectionReason(), row.reviewNote(), id(row.officialQuestionId()),
                row.selfReviewOverrideUsed(), row.selfReviewOverrideReason(), row.version(), options, sources, revision
        );
    }

    private List<AiCandidateDtos.Source> sources(byte[] candidateId) {
        return jdbc.query("""
                SELECT chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order
                FROM ai_question_candidate_sources WHERE candidate_id=:id ORDER BY display_order
                """, p().addValue("id", candidateId), (rs, n) -> new AiCandidateDtos.Source(
                rs.getString(1), rs.getString(2), integer(rs, 3), integer(rs, 4), rs.getString(5), rs.getString(6),
                integer(rs, 7), integer(rs, 8), rs.getString(9), rs.getInt(10)));
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
        var baseTextById = new java.util.HashMap<String, String>();
        var baseCorrectById = new java.util.HashMap<String, Boolean>();
        jdbc.queryForList("SELECT option_id,original_option_text,base_option_text,base_is_correct FROM ai_question_candidate_options WHERE candidate_id=:id",
                        p().addValue("id", current.id()))
                .forEach(row -> {
                    String key = (String) row.get("option_id");
                    originalById.put(key, (String) row.get("original_option_text"));
                    baseTextById.put(key, (String) row.get("base_option_text"));
                    Object rawCorrect = row.get("base_is_correct");
                    baseCorrectById.put(key, rawCorrect == null ? null
                            : rawCorrect instanceof Boolean value ? value
                            : ((Number) rawCorrect).intValue() != 0);
                });
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
            jdbc.update("INSERT INTO ai_question_candidate_options (candidate_id,option_id,option_text,is_correct,display_order,original_option_text,base_option_text,base_is_correct) VALUES (:id,:key,:text,:correct,:order,:original,:baseText,:baseCorrect)",
                    p().addValue("id", current.id()).addValue("key", option.id()).addValue("text", option.text().trim())
                            .addValue("correct", option.correct()).addValue("order", order).addValue("original", original)
                            .addValue("baseText", baseTextById.get(option.id())).addValue("baseCorrect", baseCorrectById.get(option.id())));
        }
        audit(current.id(), actor, "REVISION".equals(current.originType()) ? "REVISION_EDITED" : "EDITED",
                current.status().name(), current.status() == AiCandidateStatus.REJECTED ? "DRAFT" : current.status().name(),
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
        String contentHash = jdbc.queryForObject("SELECT content_hash FROM exam_questions WHERE id=:id",
                p().addValue("id", officialId), String.class);
        int updated = jdbc.update("""
                UPDATE ai_question_candidates SET status='PUBLISHED',official_question_id=:official,published_by=:actor,
                    published_at=CURRENT_TIMESTAMP(6),version=version+1,
                    root_official_question_id=CASE WHEN origin_type='GENERATED' THEN :official ELSE root_official_question_id END,
                    base_official_question_id=CASE WHEN origin_type='GENERATED' THEN :official ELSE base_official_question_id END,
                    revision_number=CASE WHEN origin_type='GENERATED' THEN 1 ELSE revision_number END,
                    base_content_hash=CASE WHEN origin_type='GENERATED' THEN :contentHash ELSE base_content_hash END,
                    base_question_text=CASE WHEN origin_type='GENERATED' THEN question_text ELSE base_question_text END,
                    base_explanation=CASE WHEN origin_type='GENERATED' THEN explanation ELSE base_explanation END,
                    base_difficulty=CASE WHEN origin_type='GENERATED' THEN difficulty ELSE base_difficulty END,
                    base_topic=CASE WHEN origin_type='GENERATED' THEN topic ELSE base_topic END
                WHERE id=:id AND version=:version AND status='APPROVED' AND official_question_id IS NULL
                """, p().addValue("official", officialId).addValue("actor", actor).addValue("id", candidate.id())
                .addValue("version", version).addValue("contentHash", contentHash));
        if (updated == 1) {
            jdbc.update("UPDATE ai_question_candidates SET base_content_hash=:hash WHERE id=:id AND origin_type='GENERATED'",
                    p().addValue("hash", contentHash).addValue("id", candidate.id()));
            jdbc.update("INSERT INTO ai_question_revision_heads (root_official_question_id,head_official_question_id,next_revision_number) VALUES (:official,:official,2)",
                    p().addValue("official", officialId));
            jdbc.update("INSERT INTO ai_question_official_revisions (root_official_question_id,previous_official_question_id,new_official_question_id,candidate_id,revision_number,created_by) VALUES (:official,NULL,:official,:candidate,1,:actor)",
                    p().addValue("official", officialId).addValue("candidate", candidate.id()).addValue("actor", actor));
            audit(candidate.id(), actor, "PUBLISHED", "APPROVED", "PUBLISHED", List.of("status", "officialQuestionId"), "Explicit publish to hidden review-required definition", requestId);
        }
        return updated == 1;
    }

    public RevisionHead lockRevisionHead(byte[] rootOfficialId) {
        List<RevisionHead> rows = jdbc.query("""
                SELECT root_official_question_id,head_official_question_id,open_candidate_id,next_revision_number
                FROM ai_question_revision_heads WHERE root_official_question_id=:root FOR UPDATE
                """, p().addValue("root", rootOfficialId), (rs, n) -> new RevisionHead(
                rs.getBytes(1), rs.getBytes(2), rs.getBytes(3), rs.getInt(4)));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public OfficialSnapshot officialSnapshot(byte[] officialId) {
        List<OfficialSnapshot> rows = jdbc.query("""
                SELECT q.id,q.dataset_id,s.exam_definition_id,q.exam_section_id,q.content_hash,q.question_text,
                       q.explanation,q.difficulty,q.raw_topic
                FROM exam_questions q JOIN exam_sections s ON s.id=q.exam_section_id WHERE q.id=:id
                """, p().addValue("id", officialId), (rs, n) -> new OfficialSnapshot(
                rs.getBytes(1), rs.getBytes(2), rs.getBytes(3), rs.getBytes(4), rs.getString(5), rs.getString(6),
                rs.getString(7), rs.getString(8).toUpperCase(Locale.ROOT), rs.getString(9), officialOptions(officialId)));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private List<AiCandidateDtos.Option> officialOptions(byte[] officialId) {
        return jdbc.query("SELECT option_key,option_text,is_correct,order_in_question FROM exam_mcq_options WHERE question_internal_id=:id ORDER BY order_in_question",
                p().addValue("id", officialId), (rs, n) -> new AiCandidateDtos.Option(
                        rs.getString(1), rs.getString(2), rs.getBoolean(3), rs.getInt(4), rs.getString(2)));
    }

    public String createRevision(Candidate parent, RevisionHead head, OfficialSnapshot base, String reason,
                                 byte[] actor, String requestId) {
        byte[] candidateId = randomId();
        jdbc.update("""
                INSERT INTO ai_question_candidates (
                    id,receipt_id,receipt_question_index,status,question_type,question_text,explanation,difficulty,
                    original_question_text,original_explanation,original_correct_option_id,grade,lesson_number,topic,
                    generation_query,requested_count,generation_request_id,generation_model,embedding_model,
                    embedding_dimension,prompt_version,schema_version,corpus_sha256,collection_name,validation_status,
                    validation_warnings_json,generation_warnings_json,created_by,origin_type,parent_candidate_id,
                    root_official_question_id,base_official_question_id,revision_number,revision_reason,base_content_hash,
                    base_question_text,base_explanation,base_difficulty,base_topic
                )
                SELECT :id,NULL,NULL,'DRAFT',question_type,:question,:explanation,:difficulty,
                    original_question_text,original_explanation,original_correct_option_id,grade,lesson_number,:topic,
                    generation_query,requested_count,generation_request_id,generation_model,embedding_model,
                    embedding_dimension,prompt_version,schema_version,corpus_sha256,collection_name,validation_status,
                    validation_warnings_json,generation_warnings_json,:actor,'REVISION',id,
                    :root,:baseOfficial,:revisionNumber,:reason,:baseHash,:question,:explanation,:difficulty,:topic
                FROM ai_question_candidates WHERE id=:parent
                """, p().addValue("id", candidateId).addValue("question", base.questionText())
                .addValue("explanation", base.explanation()).addValue("difficulty", base.difficulty()).addValue("topic", base.topic())
                .addValue("actor", actor).addValue("root", head.rootOfficialId()).addValue("baseOfficial", base.id())
                .addValue("revisionNumber", head.nextRevisionNumber()).addValue("reason", reason.trim())
                .addValue("baseHash", base.contentHash()).addValue("parent", parent.id()));
        java.util.Map<String, String> originals = new java.util.HashMap<>();
        jdbc.queryForList("SELECT option_id,original_option_text FROM ai_question_candidate_options WHERE candidate_id=:id",
                p().addValue("id", parent.id())).forEach(row -> originals.put((String) row.get("option_id"), (String) row.get("original_option_text")));
        for (AiCandidateDtos.Option option : base.options()) {
            jdbc.update("""
                    INSERT INTO ai_question_candidate_options
                    (candidate_id,option_id,option_text,is_correct,display_order,original_option_text,base_option_text,base_is_correct)
                    VALUES (:candidate,:key,:text,:correct,:order,:original,:text,:correct)
                    """, p().addValue("candidate", candidateId).addValue("key", option.id()).addValue("text", option.text())
                    .addValue("correct", option.correct()).addValue("order", option.displayOrder())
                    .addValue("original", originals.getOrDefault(option.id(), option.text())));
        }
        jdbc.update("""
                INSERT INTO ai_question_candidate_sources
                    (candidate_id,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order)
                SELECT :candidate,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order
                FROM ai_question_candidate_sources WHERE candidate_id=:parent
                """, p().addValue("candidate", candidateId).addValue("parent", parent.id()));
        int claimed = jdbc.update("""
                UPDATE ai_question_revision_heads SET open_candidate_id=:candidate,next_revision_number=next_revision_number+1
                WHERE root_official_question_id=:root AND head_official_question_id=:head AND open_candidate_id IS NULL
                """, p().addValue("candidate", candidateId).addValue("root", head.rootOfficialId()).addValue("head", head.headOfficialId()));
        if (claimed != 1) throw new IllegalStateException("REVISION_HEAD_CLAIM_FAILED");
        audit(candidateId, actor, "REVISION_CREATED", null, "DRAFT",
                List.of("parentCandidateId", "baseOfficialQuestionId", "revisionNumber", "revisionReason"), reason, requestId);
        return UuidBytes.toString(candidateId);
    }

    public String revisionConflict(Candidate revision) {
        if (!"REVISION".equals(revision.originType())) return null;
        RevisionHead head = lockRevisionHead(revision.rootOfficialQuestionId());
        if (head == null || !java.util.Arrays.equals(head.headOfficialId(), revision.baseOfficialQuestionId())) return "AI_REVISION_HEAD_CONFLICT";
        String currentHash = jdbc.queryForObject("SELECT content_hash FROM exam_questions WHERE id=:id",
                p().addValue("id", revision.baseOfficialQuestionId()), String.class);
        return revision.baseContentHash() != null && revision.baseContentHash().equals(currentHash)
                ? null : "AI_REVISION_BASE_CHANGED";
    }

    public void revisionBaseConflict(Candidate revision, byte[] actor, String code, String requestId) {
        audit(revision.id(), actor, "REVISION_BASE_CONFLICT", revision.status().name(), revision.status().name(),
                List.of("baseOfficialQuestionId", "baseContentHash"), code, requestId);
    }

    public boolean remapSources(Candidate revision, long version, List<com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos.SourceResult> sources,
                                byte[] actor, String reason, String requestId) {
        int updated = jdbc.update("UPDATE ai_question_candidates SET version=version+1,status=CASE WHEN status='REJECTED' THEN 'DRAFT' ELSE status END WHERE id=:id AND version=:version AND origin_type='REVISION' AND status IN ('DRAFT','REJECTED')",
                p().addValue("id", revision.id()).addValue("version", version));
        if (updated != 1) return false;
        jdbc.update("DELETE FROM ai_question_candidate_sources WHERE candidate_id=:id", p().addValue("id", revision.id()));
        int order = 0;
        for (var source : sources) {
            order++;
            jdbc.update("""
                    INSERT INTO ai_question_candidate_sources
                    (candidate_id,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,page_start,page_end,chunk_hash,display_order)
                    VALUES (:candidate,:chunk,:document,:grade,:lesson,:lessonTitle,:sectionTitle,:pageStart,:pageEnd,:hash,:order)
                    """, p().addValue("candidate", revision.id()).addValue("chunk", source.chunkId()).addValue("document", source.documentId())
                    .addValue("grade", source.grade()).addValue("lesson", source.lessonNumber()).addValue("lessonTitle", source.lessonTitle())
                    .addValue("sectionTitle", source.sectionTitle()).addValue("pageStart", source.pageStart()).addValue("pageEnd", source.pageEnd())
                    .addValue("hash", source.chunkHash()).addValue("order", order));
        }
        audit(revision.id(), actor, "REVISION_SOURCE_REMAPPED", revision.status().name(),
                revision.status() == AiCandidateStatus.REJECTED ? "DRAFT" : revision.status().name(), List.of("sources"), reason, requestId);
        return true;
    }

    public boolean markRevisionPublished(Candidate revision, long version, byte[] officialId, byte[] actor, String requestId) {
        int linked = jdbc.update("""
                INSERT INTO ai_question_official_revisions
                    (root_official_question_id,previous_official_question_id,new_official_question_id,candidate_id,revision_number,created_by)
                VALUES (:root,:previous,:newOfficial,:candidate,:revisionNumber,:actor)
                """, p().addValue("root", revision.rootOfficialQuestionId()).addValue("previous", revision.baseOfficialQuestionId())
                .addValue("newOfficial", officialId).addValue("candidate", revision.id())
                .addValue("revisionNumber", revision.revisionNumber()).addValue("actor", actor));
        if (linked != 1) return false;
        int head = jdbc.update("""
                UPDATE ai_question_revision_heads SET head_official_question_id=:newOfficial,open_candidate_id=NULL
                WHERE root_official_question_id=:root AND head_official_question_id=:previous AND open_candidate_id=:candidate
                """, p().addValue("newOfficial", officialId).addValue("root", revision.rootOfficialQuestionId())
                .addValue("previous", revision.baseOfficialQuestionId()).addValue("candidate", revision.id()));
        if (head != 1) return false;
        int updated = jdbc.update("""
                UPDATE ai_question_candidates SET status='PUBLISHED',official_question_id=:official,published_by=:actor,
                    published_at=CURRENT_TIMESTAMP(6),version=version+1
                WHERE id=:id AND version=:version AND status='APPROVED' AND origin_type='REVISION' AND official_question_id IS NULL
                """, p().addValue("official", officialId).addValue("actor", actor).addValue("id", revision.id()).addValue("version", version));
        if (updated == 1) audit(revision.id(), actor, "REVISION_PUBLISHED", "APPROVED", "PUBLISHED",
                List.of("status", "officialQuestionId"), "Published immutable official revision", requestId);
        return updated == 1;
    }

    public void publishFailed(Candidate candidate, byte[] actor, String note, String requestId) {
        audit(candidate.id(), actor, "REVISION".equals(candidate.originType()) ? "REVISION_PUBLISH_FAILED" : "PUBLISH_FAILED",
                "APPROVED", "APPROVED", List.of(), note, requestId);
    }

    public void selfReviewOverride(byte[] candidateId, byte[] actor, String reason, String requestId) {
        jdbc.update("UPDATE ai_question_candidates SET self_review_override_used=TRUE,self_review_override_reason=:reason WHERE id=:id",
                p().addValue("reason", reason).addValue("id", candidateId));
        audit(candidateId, actor, "SELF_REVIEW_OVERRIDE_USED", "PENDING_REVIEW", "PENDING_REVIEW",
                List.of("selfReviewOverride"), reason, requestId);
    }

    public boolean hasOtherReviewer(byte[] actor) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(DISTINCT u.id) FROM users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id
                WHERE u.id<>:actor AND u.status='active' AND r.code IN ('teacher','admin')
                """, p().addValue("actor", actor), Integer.class);
        return count != null && count > 0;
    }

    public void provenanceValidation(byte[] candidateId, long version, String action, String corpusSha,
                                     String collection, int sourceCount, boolean valid, List<String> errors,
                                     byte[] actor, String requestId) {
        jdbc.update("""
                INSERT INTO ai_candidate_provenance_validations
                    (candidate_id,candidate_version,validation_action,corpus_sha256,collection_name,source_count,valid,error_codes_json)
                VALUES (:candidate,:version,:action,:corpus,:collection,:sourceCount,:valid,:errors)
                """, p().addValue("candidate", candidateId).addValue("version", version).addValue("action", action)
                .addValue("corpus", corpusSha).addValue("collection", collection).addValue("sourceCount", sourceCount)
                .addValue("valid", valid).addValue("errors", json(errors)));
        audit(candidateId, actor, valid ? "PROVENANCE_VALIDATED" : "PROVENANCE_VALIDATION_FAILED", null, null,
                List.of("provenanceValidation"), errors.isEmpty() ? action : String.join(",", errors), requestId);
    }

    private Candidate candidate(ResultSet rs, int row) throws SQLException {
        return new Candidate(rs.getBytes("id"), AiCandidateStatus.valueOf(rs.getString("status")), rs.getString("question_text"), rs.getString("explanation"), rs.getString("difficulty"),
                rs.getString("original_question_text"), rs.getString("original_explanation"), rs.getString("original_correct_option_id"), rs.getInt("grade"), integer(rs, "lesson_number"),
                rs.getString("topic"), rs.getString("generation_query"), rs.getInt("requested_count"), rs.getString("generation_request_id"), rs.getString("generation_model"),
                rs.getString("embedding_model"), rs.getInt("embedding_dimension"), rs.getString("prompt_version"), rs.getString("schema_version"), rs.getString("corpus_sha256"),
                rs.getString("collection_name"), rs.getString("validation_status"), rs.getString("validation_warnings_json"), rs.getString("generation_warnings_json"),
                rs.getBytes("created_by"), rs.getBytes("submitted_by"), rs.getBytes("reviewed_by"), rs.getBytes("published_by"), rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime(), time(rs, "submitted_at"), time(rs, "reviewed_at"), time(rs, "published_at"), rs.getString("rejection_reason"),
                rs.getString("review_note"), rs.getBytes("official_question_id"), rs.getBoolean("self_review_override_used"),
                rs.getString("self_review_override_reason"), rs.getLong("version"), rs.getString("origin_type"),
                rs.getBytes("parent_candidate_id"), rs.getBytes("root_official_question_id"), rs.getBytes("base_official_question_id"),
                integer(rs, "revision_number"), rs.getString("revision_reason"), rs.getString("base_content_hash"),
                rs.getString("base_question_text"), rs.getString("base_explanation"), rs.getString("base_difficulty"), rs.getString("base_topic"));
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
            byte[] officialQuestionId, boolean selfReviewOverrideUsed, String selfReviewOverrideReason, long version,
            String originType, byte[] parentCandidateId, byte[] rootOfficialQuestionId, byte[] baseOfficialQuestionId,
            Integer revisionNumber, String revisionReason, String baseContentHash, String baseQuestionText,
            String baseExplanation, String baseDifficulty, String baseTopic
    ) { public String idString() { return UuidBytes.toString(id); } }
    public record PublishTarget(byte[] datasetId, byte[] definitionId, byte[] sectionId, String visibility, String verification) {}
    public record RevisionHead(byte[] rootOfficialId, byte[] headOfficialId, byte[] openCandidateId, int nextRevisionNumber) {}
    public record OfficialSnapshot(byte[] id, byte[] datasetId, byte[] definitionId, byte[] sectionId,
                                   String contentHash, String questionText, String explanation, String difficulty,
                                   String topic, List<AiCandidateDtos.Option> options) {}
}
