package com.lichsuvn.backend.exam.dataset;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ExamDatasetImportServiceIntegrationTest {
    private NamedParameterJdbcTemplate jdbc;
    private ExamDatasetImportService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource dataSource = ExamH2TestDatabase.create();
        jdbc = new NamedParameterJdbcTemplate(dataSource);
        service = new ExamDatasetImportService(
                jdbc,
                JsonMapper.builder().build(),
                new ExamDatasetBundleLoader(),
                new DataSourceTransactionManager(dataSource)
        );
    }

    @Test
    void dryRunValidatesWithoutCreatingDataset() {
        ExamDatasetImportResult result = runCurrent(true);

        assertEquals("VALIDATED", result.status());
        assertEquals(0, count("exam_datasets"));
        assertEquals(1, count("exam_import_runs"));
        assertEquals("VALIDATED", jdbc.getJdbcTemplate().queryForObject(
                "SELECT status FROM exam_import_runs", String.class
        ));
    }

    @Test
    void stagesPromotesAndSkipsRepeatedAggregateHash() {
        ExamDatasetImportResult first = runCurrent(false);
        assertEquals("PROMOTED", first.status());
        assertEquals(38, count("exam_definitions"));
        assertEquals(76, count("exam_sections"));
        assertEquals(1064, count("exam_questions"));
        assertEquals(32, count("exam_topics"));
        assertEquals(1092, count("exam_question_topics"));
        assertEquals(0, datasetSectionMismatchCount());
        assertNotNull(activeDatasetId());

        ExamDatasetImportResult repeated = runCurrent(false);
        assertEquals("SKIPPED", repeated.status());
        assertEquals(1, count("exam_datasets"));
        assertEquals(2, count("exam_import_runs"));
    }

    @Test
    void promotionFailureKeepsValidatedDatasetAndFailedRunForRecovery() {
        jdbc.getJdbcTemplate().update("DELETE FROM exam_runtime_state WHERE state_id = 1");

        assertThrows(IllegalStateException.class, () -> runCurrent(false));

        assertEquals(1, count("exam_datasets"));
        assertEquals("VALIDATED", jdbc.getJdbcTemplate().queryForObject(
                "SELECT status FROM exam_datasets", String.class
        ));
        assertEquals("FAILED", jdbc.getJdbcTemplate().queryForObject(
                "SELECT status FROM exam_import_runs", String.class
        ));
        assertNotNull(jdbc.getJdbcTemplate().queryForObject(
                "SELECT dataset_id FROM exam_import_runs", (rs, rowNum) -> rs.getBytes(1)
        ));
    }

    @Test
    void finalSourceFailureDoesNotChangeActivePointer(@TempDir Path temporaryRoot) throws IOException {
        runCurrent(false);
        byte[] originalActive = activeDatasetId();
        copyDataset(repositoryRoot(), temporaryRoot);

        Path finalSource;
        try (var files = Files.list(temporaryRoot.resolve("data/exams"))) {
            finalSource = files
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .reduce((first, second) -> second)
                    .orElseThrow();
        }
        Files.writeString(finalSource, "{\"examId\":\"broken\",\"examId\":\"duplicate\"}");

        assertThrows(IllegalArgumentException.class, () -> service.run(
                temporaryRoot,
                temporaryRoot.resolve("data/exams"),
                temporaryRoot.resolve("frontend/public/data/exams"),
                false,
                "test"
        ));
        assertArrayEquals(originalActive, activeDatasetId());
        assertEquals(1, count("exam_datasets"));
    }

    @Test
    void questionIdIsUniqueWithinDatasetButReusableAcrossDatasets() {
        runCurrent(false);
        byte[] firstDataset = activeDatasetId();
        byte[] firstSection = jdbc.getJdbcTemplate().queryForObject(
                "SELECT id FROM exam_sections LIMIT 1", (rs, rowNum) -> rs.getBytes(1)
        );
        String publicQuestionId = jdbc.getJdbcTemplate().queryForObject(
                "SELECT question_id FROM exam_questions LIMIT 1", String.class
        );

        assertThrows(Exception.class, () -> insertQuestion(firstDataset, firstSection, publicQuestionId));

        byte[] secondDataset = randomId();
        byte[] secondExam = randomId();
        byte[] secondSection = randomId();
        jdbc.update("""
                INSERT INTO exam_datasets (
                    id, aggregate_hash, build_id, status, hash_schema_version, build_algorithm_version,
                    source_count, build_metadata_json
                ) VALUES (:id, :hash, 'test', 'STAGING', 1, 1, 1, '{}')
                """, params().addValue("id", secondDataset).addValue("hash", "f".repeat(64)));
        jdbc.update("""
                INSERT INTO exam_definitions (
                    id, dataset_id, exam_id, title, exam_format, time_limit_minutes, total_score,
                    source_file, content_hash, visibility_status, verification_status, mcq_count, tf_count
                ) VALUES (
                    :id, :datasetId, 'second-exam', 'Second', 'thpt_2025', 50, 10,
                    'second.json', :hash, 'PUBLIC', 'VERIFIED', 1, 0
                )
                """, params().addValue("id", secondExam).addValue("datasetId", secondDataset).addValue("hash", "e".repeat(64)));
        jdbc.update("""
                INSERT INTO exam_sections (
                    id, exam_definition_id, section_id, section_type, title, order_in_exam, total_questions
                ) VALUES (:id, :examId, 'phan-1', 'mcq', 'Part 1', 1, 1)
                """, params().addValue("id", secondSection).addValue("examId", secondExam));

        insertQuestion(secondDataset, secondSection, publicQuestionId);
        assertEquals(2, jdbc.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM exam_questions WHERE question_id = ?",
                Integer.class,
                publicQuestionId
        ));
    }

    private ExamDatasetImportResult runCurrent(boolean dryRun) {
        Path root = repositoryRoot();
        return service.run(
                root,
                root.resolve("data/exams"),
                root.resolve("frontend/public/data/exams"),
                dryRun,
                "test"
        );
    }

    private void insertQuestion(byte[] datasetId, byte[] sectionId, String publicQuestionId) {
        jdbc.update("""
                INSERT INTO exam_questions (
                    id, dataset_id, exam_section_id, question_id, order_in_section, order_in_exam,
                    question_type, question_text, difficulty, cognitive_level, raw_topic, content_hash
                ) VALUES (
                    :id, :datasetId, :sectionId, :questionId, 99, 99,
                    'mcq', 'Question', 'medium', 'knowledge', 'Topic', :hash
                )
                """, params()
                .addValue("id", randomId())
                .addValue("datasetId", datasetId)
                .addValue("sectionId", sectionId)
                .addValue("questionId", publicQuestionId)
                .addValue("hash", "d".repeat(64)));
    }

    private int datasetSectionMismatchCount() {
        return jdbc.getJdbcTemplate().queryForObject("""
                SELECT COUNT(*) FROM exam_questions q
                JOIN exam_sections s ON s.id = q.exam_section_id
                JOIN exam_definitions e ON e.id = s.exam_definition_id
                WHERE q.dataset_id <> e.dataset_id
                """, Integer.class);
    }

    private byte[] activeDatasetId() {
        return jdbc.getJdbcTemplate().queryForObject(
                "SELECT active_dataset_id FROM exam_runtime_state WHERE state_id = 1",
                (rs, rowNum) -> rs.getBytes(1)
        );
    }

    private int count(String table) {
        return jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private void copyDataset(Path sourceRoot, Path targetRoot) throws IOException {
        copyDirectory(sourceRoot.resolve("data/exams"), targetRoot.resolve("data/exams"));
        copyDirectory(
                sourceRoot.resolve("frontend/public/data/exams"),
                targetRoot.resolve("frontend/public/data/exams")
        );
    }

    private void copyDirectory(Path source, Path target) throws IOException {
        Files.createDirectories(target);
        try (var stream = Files.list(source)) {
            for (Path file : stream.filter(Files::isRegularFile).toList()) {
                Files.copy(file, target.resolve(file.getFileName()));
            }
        }
    }

    private byte[] randomId() {
        return UuidBytes.fromUuid(UUID.randomUUID());
    }

    private MapSqlParameterSource params() {
        return new MapSqlParameterSource();
    }

    private Path repositoryRoot() {
        return Path.of("..").toAbsolutePath().normalize();
    }
}
