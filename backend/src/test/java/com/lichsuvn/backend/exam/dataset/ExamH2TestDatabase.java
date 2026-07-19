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
            connection.createStatement().execute("CREATE TABLE users (id BINARY(16) PRIMARY KEY)");
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

    private static void executeMigration(javax.sql.DataSource dataSource, String file) throws Exception {
        String h2Sql = Files.readString(Path.of("src/main/resources/db/migration", file));
        h2Sql = h2Sql.replaceAll("(?i)\\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_[a-z0-9_]+;", ");");
        h2Sql = h2Sql.replaceAll("(?i) AFTER [a-z_]+", "");
        if (file.startsWith("V33__")) {
            h2Sql = h2Sql.replaceAll("(?i),\\s*ADD COLUMN", "; ALTER TABLE exam_v2_attempts ADD COLUMN");
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
