package com.lichsuvn.backend.exam.dataset;

import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewRequest;
import com.lichsuvn.backend.exam.catalog.application.ExamCatalogService;
import com.lichsuvn.backend.exam.catalog.infrastructure.ExamCatalogRepository;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamCatalogDatabaseIntegrationTest {
    private NamedParameterJdbcTemplate jdbc;
    private ExamCatalogService service;
    private JsonMapper mapper;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource dataSource = ExamH2TestDatabase.create();
        jdbc = new NamedParameterJdbcTemplate(dataSource);
        mapper = JsonMapper.builder().build();
        ExamDatasetImportService importer = new ExamDatasetImportService(
                jdbc,
                mapper,
                new ExamDatasetBundleLoader(),
                new DataSourceTransactionManager(dataSource)
        );
        Path root = Path.of("..").toAbsolutePath().normalize();
        importer.run(
                root,
                root.resolve("data/exams"),
                root.resolve("frontend/public/data/exams"),
                false,
                "test"
        );
        service = new ExamCatalogService(new ExamCatalogRepository(jdbc));
    }

    @Test
    void catalogViewsExposeOnlyPublicMetadata() throws Exception {
        String hiddenExamId = jdbc.getJdbcTemplate().queryForObject("""
                SELECT exam_id FROM exam_definitions
                WHERE verification_status = 'REVIEW_REQUIRED'
                LIMIT 1
                """, String.class);
        jdbc.getJdbcTemplate().update(
                "UPDATE exam_definitions SET visibility_status = 'HIDDEN' WHERE exam_id = ?",
                hiddenExamId
        );
        var verified = service.listExams(null);
        var reviewable = service.listExams("REVIEWABLE");
        int publicCount = jdbc.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM exam_definitions WHERE visibility_status = 'PUBLIC'",
                Integer.class
        );
        int hiddenCount = jdbc.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM exam_definitions WHERE visibility_status = 'HIDDEN'",
                Integer.class
        );

        assertEquals(23, verified.total());
        assertEquals(publicCount, reviewable.total());
        assertTrue(hiddenCount > 0);
        assertFalse(reviewable.items().stream().anyMatch(item -> item.examId().equals(hiddenExamId)));
        assertTrue(reviewable.items().stream().allMatch(item -> item.verificationStatus().equals("VERIFIED")
                || item.verificationStatus().equals("REVIEW_REQUIRED")));

        String payload = mapper.writeValueAsString(reviewable);
        assertNoQuestionLeakage(payload);
    }

    @Test
    void detailAndTopicsContainSummariesWithoutQuestionReferences() throws Exception {
        String examId = service.listExams(null).items().getFirst().examId();
        var detail = service.findExam(examId);
        var topics = service.listTopics();

        assertEquals(28, detail.totalQuestions());
        assertEquals(2, detail.sections().size());
        assertEquals(32, topics.total());
        assertTrue(topics.items().stream().allMatch(topic -> topic.questionCount() > 0));
        assertNoQuestionLeakage(mapper.writeValueAsString(detail));
        assertNoQuestionLeakage(mapper.writeValueAsString(topics));
    }

    @Test
    void customPreviewCountsServerSideFiltersWithoutReturningRefs() throws Exception {
        var all = service.preview(new CustomExamPreviewRequest(28, "all", "all", "all", "all", null));
        var topic = service.listTopics().items().stream()
                .filter(item -> item.mcqCount() > 0)
                .findFirst()
                .orElseThrow();
        var scoped = service.preview(new CustomExamPreviewRequest(
                10, "mcq", "all", "all", "topic", topic.slug()
        ));

        int publicQuestionCount = jdbc.getJdbcTemplate().queryForObject("""
                SELECT COUNT(*) FROM exam_questions q
                JOIN exam_sections s ON s.id = q.exam_section_id
                JOIN exam_definitions e ON e.id = s.exam_definition_id
                WHERE e.visibility_status = 'PUBLIC'
                """, Integer.class);
        assertEquals(publicQuestionCount, all.availableCount());
        assertEquals(topic.mcqCount(), scoped.availableCount());
        assertNoQuestionLeakage(mapper.writeValueAsString(all));
        assertNoQuestionLeakage(mapper.writeValueAsString(scoped));
    }

    private void assertNoQuestionLeakage(String payload) {
        assertFalse(payload.contains("questionId"));
        assertFalse(payload.contains("questionText"));
        assertFalse(payload.contains("correctOption"));
        assertFalse(payload.contains("isTrue"));
        assertFalse(payload.contains("explanation"));
        assertFalse(payload.contains("questionRefs"));
    }
}
