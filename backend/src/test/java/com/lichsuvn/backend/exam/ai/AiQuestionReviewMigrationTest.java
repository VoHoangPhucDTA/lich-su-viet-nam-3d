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

    @Test
    void goal13MigrationAddsTeacherValidationAndRetentionWithoutAssigningUsers() throws Exception {
        String migration = Files.readString(Path.of(
                "src/main/resources/db/migration/V36__ai_candidate_security_provenance_retention.sql"));
        assertTrue(migration.contains("SELECT 'teacher'"));
        assertFalse(migration.contains("INSERT INTO user_roles"));
        assertTrue(migration.contains("ai_candidate_provenance_validations"));
        assertTrue(migration.contains("SELF_REVIEW_OVERRIDE_USED"));
        assertTrue(migration.contains("idx_ai_generation_receipts_cleanup"));

        var dataSource = ExamH2TestDatabase.create();
        ExamH2TestDatabase.applyAiQuestionReviewSchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionSecuritySchema(dataSource);
        try (var connection = dataSource.getConnection()) {
            var tables = connection.getMetaData().getTables(null, null, "AI_CANDIDATE_PROVENANCE_VALIDATIONS", null);
            assertTrue(tables.next());
        }
    }

    @Test
    void goal13cMigrationAddsImmutableRevisionChainAndNullableReceiptForRevisions() throws Exception {
        String migration = Files.readString(Path.of(
                "src/main/resources/db/migration/V37__ai_question_revision_workflow.sql"));
        assertTrue(migration.contains("ai_question_revision_heads"));
        assertTrue(migration.contains("ai_question_official_revisions"));
        assertTrue(migration.contains("uq_ai_candidate_root_revision"));
        assertTrue(migration.contains("REVISION_SOURCE_REMAPPED"));
        assertFalse(migration.contains("UPDATE exam_questions"));

        var dataSource = ExamH2TestDatabase.create();
        ExamH2TestDatabase.applyAiQuestionReviewSchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionSecuritySchema(dataSource);
        ExamH2TestDatabase.applyAiQuestionRevisionSchema(dataSource);
        try (var connection = dataSource.getConnection()) {
            assertTrue(connection.getMetaData().getTables(null, null, "AI_QUESTION_REVISION_HEADS", null).next());
            assertTrue(connection.getMetaData().getTables(null, null, "AI_QUESTION_OFFICIAL_REVISIONS", null).next());
        }
    }
}
