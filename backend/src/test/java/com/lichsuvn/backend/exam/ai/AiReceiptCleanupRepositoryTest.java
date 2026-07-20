package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiReceiptCleanupRepositoryTest {
    @Test
    void deletesOnlyExpiredUnreferencedReceiptsPastRetentionInStableBatches() throws Exception {
        var dataSource = ExamH2TestDatabase.create();
        ExamH2TestDatabase.applyAiQuestionReviewSchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionSecuritySchema(dataSource);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        AiGenerationReceiptRepository repository = new AiGenerationReceiptRepository(
                new NamedParameterJdbcTemplate(dataSource), new ObjectMapper());
        byte[] user = id(99);
        jdbc.update("INSERT INTO users (id) VALUES (?)", user);
        LocalDateTime now = LocalDateTime.of(2026, 7, 20, 12, 0);

        byte[] active = receipt(jdbc, user, 1, now.minusHours(30), now.plusMinutes(1));
        byte[] withinRetention = receipt(jdbc, user, 2, now.minusHours(2), now.minusHours(1));
        byte[] oldA = receipt(jdbc, user, 3, now.minusHours(30), now.minusHours(29));
        byte[] oldB = receipt(jdbc, user, 4, now.minusHours(31), now.minusHours(30));
        byte[] referenced = receipt(jdbc, user, 5, now.minusHours(32), now.minusHours(31));
        candidate(jdbc, user, referenced);

        assertEquals(1, repository.deleteExpiredUnreferenced(now, now.minusHours(24), 1));
        assertEquals(1, repository.deleteExpiredUnreferenced(now, now.minusHours(24), 1));
        assertEquals(0, repository.deleteExpiredUnreferenced(now, now.minusHours(24), 1));
        assertEquals(1, count(jdbc, active));
        assertEquals(1, count(jdbc, withinRetention));
        assertEquals(0, count(jdbc, oldA));
        assertEquals(0, count(jdbc, oldB));
        assertEquals(1, count(jdbc, referenced));
    }

    private byte[] receipt(JdbcTemplate jdbc, byte[] user, int value, LocalDateTime created, LocalDateTime expires) {
        byte[] id = id(value);
        jdbc.update("""
                INSERT INTO ai_generation_receipts
                (id,user_id,request_id,generation_query,grade,difficulty,requested_count,response_json,generation_model,
                 embedding_model,embedding_dimension,prompt_version,schema_version,corpus_sha256,collection_name,
                 validation_status,warnings_json,expires_at,created_at)
                VALUES (?,?,?,?,12,'MEDIUM',1,'{}','generation','embedding',768,'prompt','schema',?,'collection','PASSED','[]',?,?)
                """, id, user, "request-" + value, "query", "a".repeat(64), expires, created);
        return id;
    }

    private void candidate(JdbcTemplate jdbc, byte[] user, byte[] receipt) {
        jdbc.update("""
                INSERT INTO ai_question_candidates
                (id,receipt_id,receipt_question_index,status,question_type,question_text,explanation,difficulty,
                 original_question_text,original_explanation,original_correct_option_id,grade,generation_query,
                 requested_count,generation_request_id,generation_model,embedding_model,embedding_dimension,
                 prompt_version,schema_version,corpus_sha256,collection_name,validation_status,
                 validation_warnings_json,generation_warnings_json,created_by,created_at,updated_at)
                VALUES (?,?,0,'DRAFT','mcq','question','explanation','MEDIUM','original','original explanation','A',12,
                        'query',1,'candidate-request','generation','embedding',768,'prompt','schema',?,'collection','PASSED','[]','[]',?,?,?)
                """, id(77), receipt, "a".repeat(64), user, LocalDateTime.now(), LocalDateTime.now());
    }

    private int count(JdbcTemplate jdbc, byte[] id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM ai_generation_receipts WHERE id=?", Integer.class, id);
    }

    private byte[] id(int value) {
        byte[] id = new byte[16];
        Arrays.fill(id, (byte) value);
        return id;
    }
}
