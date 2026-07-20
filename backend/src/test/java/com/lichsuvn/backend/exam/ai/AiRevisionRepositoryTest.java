package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.review.infrastructure.AiCandidateRepository;
import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiRevisionRepositoryTest {
    @Test
    void revisionCopiesThreeSnapshotsAndClaimsDeterministicOpenNumberWithoutMutatingParent() throws Exception {
        var dataSource = ExamH2TestDatabase.create();
        ExamH2TestDatabase.applyAiQuestionReviewSchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionSecuritySchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionRevisionSchema(dataSource);
        JdbcTemplate sql = new JdbcTemplate(dataSource);
        NamedParameterJdbcTemplate named = new NamedParameterJdbcTemplate(dataSource);
        AiCandidateRepository repository = new AiCandidateRepository(named, new ObjectMapper());

        byte[] actor = id(1), dataset = id(2), definition = id(3), section = id(4), official = id(5), parentId = id(6);
        sql.update("INSERT INTO users (id) VALUES (?)", actor);
        sql.update("INSERT INTO exam_datasets (id,aggregate_hash,build_id,status,hash_schema_version,build_algorithm_version,source_count,build_metadata_json) VALUES (?,?,'build','ACTIVE',1,1,0,'{}')", dataset, "a".repeat(64));
        sql.update("""
                INSERT INTO exam_definitions
                (id,dataset_id,exam_id,title,exam_format,time_limit_minutes,total_score,source_file,content_hash,
                 visibility_status,verification_status,mcq_count,tf_count)
                VALUES (?,?,'ai-review','AI review','MCQ',15,10,'internal',?,'HIDDEN','REVIEW_REQUIRED',1,0)
                """, definition, dataset, "b".repeat(64));
        sql.update("INSERT INTO exam_sections (id,exam_definition_id,section_id,section_type,title,order_in_exam,total_questions) VALUES (?,?,'mcq','mcq','MCQ',1,1)", section, definition);
        sql.update("""
                INSERT INTO exam_questions
                (id,dataset_id,exam_section_id,question_id,order_in_section,order_in_exam,question_type,question_text,
                 explanation,difficulty,cognitive_level,raw_topic,has_image,content_hash)
                VALUES (?, ?, ?, 'official-v1', 1, 1, 'mcq', 'Official base?', 'Official explanation',
                        'medium', 'comprehension', 'Official topic', FALSE, ?)
                """, official, dataset, section, "c".repeat(64));
        for (int index = 0; index < 4; index++) {
            String key = String.valueOf((char) ('A' + index));
            sql.update("INSERT INTO exam_mcq_options (question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (?,?,?,?,?)",
                    official, key, "Official " + key, index == 1, index + 1);
        }
        sql.update("""
                INSERT INTO ai_question_candidates
                (id,status,question_type,question_text,explanation,difficulty,original_question_text,original_explanation,
                 original_correct_option_id,grade,lesson_number,topic,generation_query,requested_count,generation_request_id,
                 generation_model,embedding_model,embedding_dimension,prompt_version,schema_version,corpus_sha256,
                 collection_name,validation_status,validation_warnings_json,generation_warnings_json,created_by,
                 published_by,published_at,official_question_id,version,origin_type,root_official_question_id,
                 base_official_question_id,revision_number,base_content_hash,base_question_text,base_explanation,
                 base_difficulty,base_topic,created_at,updated_at)
                VALUES (?,'PUBLISHED','mcq','Parent edited?','Parent edited explanation','HARD','Original AI?','Original AI explanation',
                        'A',12,6,'Parent topic','query',1,'request','generation','embedding',768,'prompt','schema',?,
                        'collection','PASSED','[]','[]',?,?,?, ?,4,'GENERATED',?,?,1,?,'Parent edited?',
                        'Parent edited explanation','HARD','Parent topic',?,?)
                """, parentId, "d".repeat(64), actor, actor, LocalDateTime.now(), official, official, official,
                "c".repeat(64), LocalDateTime.now(), LocalDateTime.now());
        for (int index = 0; index < 4; index++) {
            String key = String.valueOf((char) ('A' + index));
            sql.update("INSERT INTO ai_question_candidate_options (candidate_id,option_id,option_text,is_correct,display_order,original_option_text,base_option_text,base_is_correct) VALUES (?,?,?,?,?,?,?,?)",
                    parentId, key, "Parent " + key, index == 0, index + 1, "Original " + key, "Parent " + key, index == 0);
        }
        sql.update("INSERT INTO ai_question_candidate_sources (candidate_id,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,chunk_hash,display_order) VALUES (?,'chunk-old','doc',12,6,'Lesson','Section',?,1)", parentId, "e".repeat(64));
        sql.update("INSERT INTO ai_question_revision_heads (root_official_question_id,head_official_question_id,next_revision_number) VALUES (?,?,2)", official, official);

        AiCandidateRepository.Candidate parent = repository.findForUpdate(uuid(parentId));
        AiCandidateRepository.RevisionHead head = repository.lockRevisionHead(official);
        String revisionId = repository.createRevision(parent, head, repository.officialSnapshot(official), "Correct official content", actor, "request-revision");
        byte[] revisionBytes = sql.queryForObject("SELECT open_candidate_id FROM ai_question_revision_heads WHERE root_official_question_id=?", byte[].class, official);

        assertNotEquals(uuid(parentId), revisionId);
        assertEquals("Parent edited?", sql.queryForObject("SELECT question_text FROM ai_question_candidates WHERE id=?", String.class, parentId));
        assertEquals("Original AI?", sql.queryForObject("SELECT original_question_text FROM ai_question_candidates WHERE id=?", String.class, revisionBytes));
        assertEquals("Official base?", sql.queryForObject("SELECT question_text FROM ai_question_candidates WHERE id=?", String.class, revisionBytes));
        assertEquals(2, sql.queryForObject("SELECT revision_number FROM ai_question_candidates WHERE id=?", Integer.class, revisionBytes));
        assertEquals("Original A", sql.queryForObject("SELECT original_option_text FROM ai_question_candidate_options WHERE candidate_id=? AND option_id='A'", String.class, revisionBytes));
        assertEquals("Official A", sql.queryForObject("SELECT base_option_text FROM ai_question_candidate_options WHERE candidate_id=? AND option_id='A'", String.class, revisionBytes));
        assertEquals("chunk-old", sql.queryForObject("SELECT chunk_id FROM ai_question_candidate_sources WHERE candidate_id=?", String.class, revisionBytes));
        assertEquals(revisionId, uuid(revisionBytes));
        assertEquals(3, sql.queryForObject("SELECT next_revision_number FROM ai_question_revision_heads WHERE root_official_question_id=?", Integer.class, official));
        assertEquals("REVISION_CREATED", sql.queryForObject("SELECT event_type FROM ai_question_candidate_audit_events WHERE candidate_id=?", String.class, revisionBytes));
        assertNull(sql.queryForObject("SELECT receipt_id FROM ai_question_candidates WHERE id=?", byte[].class, revisionBytes));

        AiCandidateRepository.Candidate draft = repository.findForUpdate(revisionId);
        assertTrue(repository.remapSources(draft, 0, List.of(new AiProvenanceDtos.SourceResult(
                "chunk-new", "f".repeat(64), true, true, false, "doc-2", 12, 6,
                "Lesson 6", "Section II", 37, 37)), actor, "Use canonical source", "request-remap"));
        assertEquals("chunk-old", sql.queryForObject("SELECT chunk_id FROM ai_question_candidate_sources WHERE candidate_id=?", String.class, parentId));
        assertEquals("chunk-new", sql.queryForObject("SELECT chunk_id FROM ai_question_candidate_sources WHERE candidate_id=?", String.class, revisionBytes));
        assertEquals("REVISION_SOURCE_REMAPPED", sql.queryForObject("SELECT event_type FROM ai_question_candidate_audit_events WHERE candidate_id=? ORDER BY id DESC LIMIT 1", String.class, revisionBytes));

        sql.update("UPDATE ai_question_candidates SET status='APPROVED' WHERE id=?", revisionBytes);
        AiCandidateRepository.Candidate approved = repository.findForUpdate(revisionId);
        AiCandidateRepository.PublishTarget target = new AiCandidateRepository.PublishTarget(dataset, definition, section, "HIDDEN", "REVIEW_REQUIRED");
        AiCandidateRepository faultingRepository = new AiCandidateRepository(named, new ObjectMapper(), (questionId, options) -> {
            for (int index = 0; index < options.size(); index++) {
                var option = options.get(index);
                named.update("INSERT INTO exam_mcq_options (question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (:id,:key,:text,:correct,:order)",
                        new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                                .addValue("id", questionId).addValue("key", option.id()).addValue("text", option.text())
                                .addValue("correct", option.correct()).addValue("order", option.displayOrder()));
                if (index == 1) throw new IllegalStateException("test fault after option B");
            }
        });
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));

        byte[] originalId = id(7);
        sql.update("""
                INSERT INTO ai_question_candidates
                (id,status,question_type,question_text,explanation,difficulty,original_question_text,original_explanation,
                 original_correct_option_id,grade,lesson_number,topic,generation_query,requested_count,generation_request_id,
                 generation_model,embedding_model,embedding_dimension,prompt_version,schema_version,corpus_sha256,
                 collection_name,validation_status,validation_warnings_json,generation_warnings_json,created_by,
                 version,origin_type,created_at,updated_at)
                VALUES (?,'APPROVED','mcq','Original candidate?','Original explanation','MEDIUM','Original candidate?',
                        'Original explanation','A',12,6,'Topic','query',1,'request-original','generation','embedding',768,
                        'prompt','schema',?,'collection','PASSED','[]','[]',?,0,'GENERATED',?,?)
                """, originalId, "d".repeat(64), actor, LocalDateTime.now(), LocalDateTime.now());
        for (int index = 0; index < 4; index++) {
            String key = String.valueOf((char) ('A' + index));
            sql.update("INSERT INTO ai_question_candidate_options (candidate_id,option_id,option_text,is_correct,display_order,original_option_text) VALUES (?,?,?,?,?,?)",
                    originalId, key, "Original candidate " + key, index == 0, index + 1, "Original candidate " + key);
        }
        sql.update("INSERT INTO ai_question_candidate_sources (candidate_id,chunk_id,document_id,grade,lesson_number,lesson_title,section_title,chunk_hash,display_order) VALUES (?,'chunk-original','doc',12,6,'Lesson','Section',?,1)", originalId, "e".repeat(64));
        AiCandidateRepository.Candidate approvedOriginal = repository.findForUpdate(uuid(originalId));
        assertThrows(IllegalStateException.class, () -> transaction.executeWithoutResult(status -> {
            byte[] failedOfficial = faultingRepository.insertOfficial(approvedOriginal, target);
            faultingRepository.markPublished(approvedOriginal, 0, failedOfficial, actor, "request-original-fault");
        }));
        assertEquals(1, sql.queryForObject("SELECT COUNT(*) FROM exam_questions", Integer.class));
        assertEquals(4, sql.queryForObject("SELECT COUNT(*) FROM exam_mcq_options", Integer.class));
        assertEquals("APPROVED", sql.queryForObject("SELECT status FROM ai_question_candidates WHERE id=?", String.class, originalId));
        assertNull(sql.queryForObject("SELECT official_question_id FROM ai_question_candidates WHERE id=?", byte[].class, originalId));
        assertEquals(0, sql.queryForObject("SELECT COUNT(*) FROM ai_question_official_revisions", Integer.class));

        assertThrows(IllegalStateException.class, () -> transaction.executeWithoutResult(status -> {
            byte[] failedOfficial = faultingRepository.insertOfficial(approved, target);
            faultingRepository.markRevisionPublished(approved, 1, failedOfficial, actor, "request-fault");
        }));
        assertEquals(1, sql.queryForObject("SELECT COUNT(*) FROM exam_questions", Integer.class));
        assertEquals(4, sql.queryForObject("SELECT COUNT(*) FROM exam_mcq_options", Integer.class));
        assertEquals("APPROVED", sql.queryForObject("SELECT status FROM ai_question_candidates WHERE id=?", String.class, revisionBytes));
        assertNull(sql.queryForObject("SELECT official_question_id FROM ai_question_candidates WHERE id=?", byte[].class, revisionBytes));
        assertEquals(0, sql.queryForObject("SELECT COUNT(*) FROM ai_question_official_revisions", Integer.class));
        assertEquals(uuid(official), uuid(sql.queryForObject("SELECT head_official_question_id FROM ai_question_revision_heads WHERE root_official_question_id=?", byte[].class, official)));
        assertEquals(uuid(revisionBytes), uuid(sql.queryForObject("SELECT open_candidate_id FROM ai_question_revision_heads WHERE root_official_question_id=?", byte[].class, official)));

        byte[] newOfficial = repository.insertOfficial(approved, target);
        assertTrue(repository.markRevisionPublished(approved, 1, newOfficial, actor, "request-publish"));
        assertEquals("Official base?", sql.queryForObject("SELECT question_text FROM exam_questions WHERE id=?", String.class, official));
        assertEquals("Official base?", sql.queryForObject("SELECT question_text FROM exam_questions WHERE id=?", String.class, newOfficial));
        assertEquals(4, sql.queryForObject("SELECT COUNT(*) FROM exam_mcq_options WHERE question_internal_id=?", Integer.class, newOfficial));
        assertEquals(1, sql.queryForObject("SELECT COUNT(*) FROM exam_mcq_options WHERE question_internal_id=? AND is_correct=TRUE", Integer.class, newOfficial));
        assertEquals(2, sql.queryForObject("SELECT revision_number FROM ai_question_official_revisions WHERE new_official_question_id=?", Integer.class, newOfficial));
        assertEquals("PUBLISHED", sql.queryForObject("SELECT status FROM ai_question_candidates WHERE id=?", String.class, revisionBytes));
        assertEquals(uuid(newOfficial), uuid(sql.queryForObject("SELECT head_official_question_id FROM ai_question_revision_heads WHERE root_official_question_id=?", byte[].class, official)));
        assertNull(sql.queryForObject("SELECT open_candidate_id FROM ai_question_revision_heads WHERE root_official_question_id=?", byte[].class, official));
        assertEquals("HIDDEN", sql.queryForObject("SELECT visibility_status FROM exam_definitions WHERE id=?", String.class, definition));
        assertEquals("REVIEW_REQUIRED", sql.queryForObject("SELECT verification_status FROM exam_definitions WHERE id=?", String.class, definition));
    }

    private static byte[] id(int value) { byte[] id = new byte[16]; Arrays.fill(id, (byte) value); return id; }
    private static String uuid(byte[] value) {
        var buffer = java.nio.ByteBuffer.wrap(value);
        return new java.util.UUID(buffer.getLong(), buffer.getLong()).toString();
    }
}
