package com.lichsuvn.backend.exam.ai;

import org.junit.jupiter.api.Test;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiQuestionReviewMigrationTest {
    @Test
    void createsIsolatedStagingWithLifecycleAuditAndUniquePublishLink() throws Exception {
        String migration = Files.readString(Path.of(
                "src/main/resources/db/migration/V35__ai_question_review_workflow.sql"));

        for (String table : new String[]{"ai_generation_receipts", "ai_question_candidates",
                "ai_question_candidate_options", "ai_question_candidate_sources",
                "ai_question_candidate_audit_events"}) {
            assertTrue(migration.contains("CREATE TABLE " + table), table);
        }
        assertTrue(migration.contains("UNIQUE (receipt_id, receipt_question_index)"));
        assertTrue(migration.contains("UNIQUE (official_question_id)"));
        assertTrue(migration.contains("idx_ai_candidates_status_created"));
        assertTrue(migration.contains("FOREIGN KEY (official_question_id) REFERENCES exam_questions (id)"));
        assertTrue(migration.contains("'PUBLISH_FAILED'"));
        assertFalse(migration.contains("ALTER TABLE exam_questions"));
        assertFalse(migration.contains("ALTER TABLE exam_definitions"));
    }

    @Test
    void appliesCleanlyToTemporaryQuestionBankDatabase() throws Exception {
        var dataSource = ExamH2TestDatabase.create();
        ExamH2TestDatabase.applyAiQuestionReviewSchema(dataSource);
        try (var connection = dataSource.getConnection()) {
            var tables = connection.getMetaData().getTables(null, null, "AI_QUESTION_CANDIDATES", null);
            assertTrue(tables.next());
        }
    }
}
