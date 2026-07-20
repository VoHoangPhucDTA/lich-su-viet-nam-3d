package com.lichsuvn.backend.exam.dataset;

import org.h2.jdbcx.JdbcDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.UUID;

public final class ExamH2TestDatabase {
    private ExamH2TestDatabase() {
    }

    public static JdbcDataSource create() throws Exception {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:exam-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");
        applyGoal2Schema(dataSource);
        return dataSource;
    }

    public static void applyGoal2Schema(javax.sql.DataSource dataSource) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().execute("CREATE TABLE users (id BINARY(16) PRIMARY KEY, status VARCHAR(20) NOT NULL DEFAULT 'active')");
            connection.createStatement().execute("CREATE TABLE roles (id BIGINT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL)");
            connection.createStatement().execute("INSERT INTO roles (code,name) VALUES ('student','Student'),('admin','Admin')");
        }
        executeMigration(dataSource, "V13__exam_v2_attempts.sql");
        executeMigration(dataSource, "V31__versioned_exam_question_bank.sql");
        executeMigration(dataSource, "V32__exam_sessions_and_submission_receipts.sql");
        executeMigration(dataSource, "V33__exam_v2_attempt_snapshot_authority.sql");
    }

    /** Keeps the Goal 1 catalog HTTP fixture focused on the question-bank schema. */
    public static void applyQuestionBankSchema(javax.sql.DataSource dataSource) throws Exception {
        executeMigration(dataSource, "V31__versioned_exam_question_bank.sql");
    }

    public static void applyAiQuestionReviewSchema(javax.sql.DataSource dataSource) throws Exception {
        executeMigration(dataSource, "V35__ai_question_review_workflow.sql");
    }

    public static void applyAiQuestionSecuritySchema(javax.sql.DataSource dataSource) throws Exception {
        executeMigration(dataSource, "V36__ai_candidate_security_provenance_retention.sql");
    }

    public static void applyAiQuestionRevisionSchema(javax.sql.DataSource dataSource) throws Exception {
        executeMigration(dataSource, "V37__ai_question_revision_workflow.sql");
    }

    private static void executeMigration(javax.sql.DataSource dataSource, String file) throws Exception {
        String h2Sql = Files.readString(Path.of("src/main/resources/db/migration", file));
        h2Sql = h2Sql.replaceAll("(?i)\\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_[a-z0-9_]+;", ");");
        h2Sql = h2Sql.replaceAll("(?i) AFTER [a-z_]+", "");
        if (file.startsWith("V33__")) {
            h2Sql = h2Sql.replaceAll("(?i),\\s*ADD COLUMN", "; ALTER TABLE exam_v2_attempts ADD COLUMN");
        }
        if (file.startsWith("V36__")) {
            // V35 CHECK constraints are deliberately anonymous/no-op in H2 tests, so
            // there is no named MySQL CHECK constraint for V36 to remove.
            h2Sql = h2Sql.replaceAll(
                    "(?is)ALTER TABLE ai_question_candidate_audit_events\\s+DROP CHECK chk_ai_candidate_audit_type\\s*;",
                    ""
            );
        }
        if (file.startsWith("V37__")) {
            h2Sql = h2Sql.replaceFirst(
                    "(?is)ALTER TABLE ai_question_candidates\\s+MODIFY COLUMN receipt_id BINARY\\(16\\) NULL,\\s+MODIFY COLUMN receipt_question_index INT NULL;",
                    "ALTER TABLE ai_question_candidates ALTER COLUMN receipt_id DROP NOT NULL; " +
                            "ALTER TABLE ai_question_candidates ALTER COLUMN receipt_question_index DROP NOT NULL;"
            );
            h2Sql = h2Sql.replaceAll(
                    "(?is)ALTER TABLE ai_question_candidate_audit_events\\s+DROP CHECK chk_ai_candidate_audit_type\\s*;",
                    ""
            );
            h2Sql = h2Sql.replaceAll(
                    "(?is)ALTER TABLE ai_candidate_provenance_validations\\s+DROP CHECK chk_ai_provenance_action\\s*;",
                    ""
            );
        }
        h2Sql = neutralizeChecks(h2Sql);
        try (Connection connection = dataSource.getConnection()) {
            for (String statement : h2Sql.split(";")) if (!statement.isBlank()) connection.createStatement().execute(statement);
        }
    }

    private static String neutralizeChecks(String sql) {
        StringBuilder result = new StringBuilder(sql);
        int searchFrom = 0;
        while (true) {
            int constraintStart = result.indexOf("CONSTRAINT chk_", searchFrom);
            if (constraintStart < 0) {
                return result.toString();
            }
            int checkStart = result.indexOf("CHECK", constraintStart);
            int open = result.indexOf("(", checkStart);
            int depth = 0;
            int close = -1;
            for (int index = open; index < result.length(); index++) {
                char character = result.charAt(index);
                if (character == '(') {
                    depth++;
                } else if (character == ')' && --depth == 0) {
                    close = index;
                    break;
                }
            }
            if (checkStart < 0 || open < 0 || close < 0) {
                throw new IllegalStateException("Cannot normalize question-bank CHECK constraint for H2 test");
            }
            result.replace(constraintStart, close + 1, "CHECK (1 = 1)");
            searchFrom = constraintStart + 13;
        }
    }
}
