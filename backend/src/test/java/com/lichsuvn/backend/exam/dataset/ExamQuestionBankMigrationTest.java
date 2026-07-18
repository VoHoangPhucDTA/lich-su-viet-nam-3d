package com.lichsuvn.backend.exam.dataset;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamQuestionBankMigrationTest {
    @Test
    void v14CreatesOnlyVersionedQuestionBankTablesAndRequiredConstraints() throws Exception {
        String migration = Files.readString(Path.of(
                "src/main/resources/db/migration/V14__versioned_exam_question_bank.sql"
        ));
        for (String table : ListHolder.TABLES) {
            assertTrue(migration.contains("CREATE TABLE " + table), table);
        }
        assertTrue(migration.contains("UNIQUE (dataset_id, question_id)"));
        assertTrue(migration.contains("UNIQUE (exam_definition_id, section_id)"));
        assertFalse(migration.contains("ALTER TABLE exam_v2_attempts"));
        assertFalse(migration.contains("CREATE TABLE exam_attempts"));
        assertFalse(migration.contains("CREATE TABLE exam_answers"));
    }

    private static final class ListHolder {
        private static final String[] TABLES = {
                "exam_datasets",
                "exam_import_runs",
                "exam_runtime_state",
                "exam_definitions",
                "exam_sections",
                "exam_questions",
                "exam_mcq_options",
                "exam_tf_statements",
                "exam_question_sources",
                "exam_topics",
                "exam_question_topics"
        };
    }
}
