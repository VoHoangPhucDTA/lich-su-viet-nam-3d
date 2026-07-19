package com.lichsuvn.backend.exam.dataset;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ExamDatasetImportService {
    private static final Pattern COMBINING_MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+", Pattern.CASE_INSENSITIVE);
    private static final List<PeriodRule> PERIOD_RULES = List.of(
            new PeriodRule("lich-su-viet-nam-truoc-1858", "Lich su Viet Nam truoc 1858", List.of("co trung dai", "phong kien", "bac thuoc", "tay son", "dai viet")),
            new PeriodRule("viet-nam-1858-1918", "Viet Nam 1858-1918", List.of("1858", "1918", "yeu nuoc dau the ky", "phan boi chau", "phan chau trinh")),
            new PeriodRule("viet-nam-1919-1945", "Viet Nam 1919-1945", List.of("1919", "1930", "1939", "1945", "nguyen ai quoc", "dang cong san", "cach mang thang tam")),
            new PeriodRule("viet-nam-1945-1954", "Viet Nam 1945-1954", List.of("1945-1946", "1945 1946", "1945-1954", "1945 1954", "chong phap")),
            new PeriodRule("viet-nam-1954-1975", "Viet Nam 1954-1975", List.of("1954-1975", "1954 1975", "chong my", "mien bac", "mien nam")),
            new PeriodRule("viet-nam-sau-1975", "Viet Nam sau 1975", List.of("sau 1975", "1975-1986", "1975 1986", "doi moi", "1986", "bien dao", "doi ngoai")),
            new PeriodRule("lich-su-the-gioi-khu-vuc", "Lich su the gioi / khu vuc", List.of("the gioi", "chien tranh lanh", "asean", "dong nam a", "lien xo", "trung quoc", "lien hop quoc", "nhat ban", "tay au", "toan cau"))
    );
    private static final PeriodRule OTHER_PERIOD = new PeriodRule("chu-de-khac", "Chu de khac", List.of());

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ExamDatasetBundleLoader loader;
    private final TransactionTemplate transaction;
    private final TransactionTemplate requiresNew;

    public ExamDatasetImportService(
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper,
            ExamDatasetBundleLoader loader,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.loader = loader;
        this.transaction = new TransactionTemplate(transactionManager);
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public ExamDatasetImportResult run(
            Path repositoryRoot,
            Path sourceDirectory,
            Path artifactDirectory,
            boolean dryRun,
            String sourceCommit
    ) {
        ExamDatasetBundle bundle = loader.load(repositoryRoot, sourceDirectory, artifactDirectory);
        validateContent(bundle);
        byte[] runId = uuidBytes();
        createRun(runId, bundle.aggregateHash(), dryRun, sourceCommit);
        byte[] targetDatasetId = null;

        try {
            byte[] existingDataset = findDatasetByHash(bundle.aggregateHash());
            if (existingDataset != null) {
                finishRun(runId, existingDataset, "SKIPPED", bundle, null);
                return result("SKIPPED", bundle);
            }
            if (dryRun) {
                finishRun(runId, null, "VALIDATED", bundle, null);
                return result("VALIDATED", bundle);
            }

            targetDatasetId = uuidBytes();
            byte[] datasetId = targetDatasetId;
            transaction.executeWithoutResult(status -> stageDataset(datasetId, bundle));
            requiresNew.executeWithoutResult(status -> promoteDataset(datasetId));
            finishRun(runId, datasetId, "PROMOTED", bundle, null);
            return result("PROMOTED", bundle);
        } catch (RuntimeException ex) {
            finishRun(runId, targetDatasetId, "FAILED", bundle, ex.getMessage());
            throw ex;
        }
    }

    private void validateContent(ExamDatasetBundle bundle) {
        Set<String> sourcePaths = new HashSet<>();
        for (ExamDatasetBundle.SourceExam source : bundle.exams()) {
            if (!sourcePaths.add(source.relativePath())) {
                throw new IllegalArgumentException("Duplicate source path: " + source.relativePath());
            }
            JsonNode exam = source.value();
            requiredText(exam, "examId");
            JsonNode sections = exam.path("sections");
            Set<String> sectionIds = new HashSet<>();
            int sectionOrder = 0;
            for (JsonNode section : sections) {
                sectionOrder++;
                String sectionId = requiredText(section, "sectionId");
                if (!sectionIds.add(sectionId)) {
                    throw new IllegalArgumentException("Duplicate sectionId within exam: " + sectionId);
                }
                String sectionType = requiredText(section, "sectionType");
                if (!Set.of("mcq", "true_false").contains(sectionType)) {
                    throw new IllegalArgumentException("Unsupported section type: " + sectionType);
                }
                int localOrder = 0;
                for (JsonNode question : section.path("questions")) {
                    localOrder++;
                    String questionId = requiredText(question, "id");
                    String questionType = requiredText(question, "questionType");
                    if (!sectionType.equals(questionType)) {
                        throw new IllegalArgumentException(questionId + ": question type does not match section");
                    }
                    requiredText(question, "questionText");
                    requiredText(question, "difficulty");
                    requiredText(question, "cognitiveLevel");
                    if (questionType.equals("mcq")) {
                        validateMcq(question, questionId);
                    } else {
                        validateTrueFalse(question, questionId);
                    }
                }
                if (section.path("totalQuestions").asInt(-1) != localOrder) {
                    throw new IllegalArgumentException("Section totalQuestions mismatch: " + sectionId);
                }
            }
            if (sectionOrder == 0) {
                throw new IllegalArgumentException("Exam has no sections: " + requiredText(exam, "examId"));
            }
        }
    }

    private void validateMcq(JsonNode question, String questionId) {
        JsonNode options = question.path("options");
        String correct = requiredText(question, "correctOptionId");
        Set<String> keys = new HashSet<>();
        int correctCount = 0;
        if (!options.isArray() || options.isEmpty()) {
            throw new IllegalArgumentException(questionId + ": MCQ options are required");
        }
        for (JsonNode option : options) {
            String key = requiredText(option, "id");
            requiredText(option, "text");
            if (!keys.add(key)) {
                throw new IllegalArgumentException(questionId + ": duplicate option key " + key);
            }
            if (key.equals(correct)) {
                correctCount++;
            }
        }
        if (correctCount != 1) {
            throw new IllegalArgumentException(questionId + ": correctOptionId must match exactly one option");
        }
    }

    private void validateTrueFalse(JsonNode question, String questionId) {
        JsonNode statements = question.path("statements");
        Set<String> keys = new HashSet<>();
        if (!statements.isArray() || statements.isEmpty()) {
            throw new IllegalArgumentException(questionId + ": true/false statements are required");
        }
        for (JsonNode statement : statements) {
            String key = requiredText(statement, "id");
            requiredText(statement, "text");
            if (!statement.path("isTrue").isBoolean()) {
                throw new IllegalArgumentException(questionId + ": statement isTrue must be boolean");
            }
            if (!keys.add(key)) {
                throw new IllegalArgumentException(questionId + ": duplicate statement key " + key);
            }
        }
    }

    private void stageDataset(byte[] datasetId, ExamDatasetBundle bundle) {
        jdbc.update("""
                INSERT INTO exam_datasets (
                    id, aggregate_hash, build_id, status, hash_schema_version, build_algorithm_version,
                    source_count, exam_count, section_count, question_count, topic_count, tagging_count,
                    build_metadata_json
                ) VALUES (
                    :id, :hash, :buildId, 'STAGING', :hashSchema, :buildAlgorithm,
                    :sourceCount, :examCount, :sectionCount, :questionCount, :topicCount, :taggingCount,
                    :metadata
                )
                """, params()
                .addValue("id", datasetId)
                .addValue("hash", bundle.aggregateHash())
                .addValue("buildId", bundle.buildId())
                .addValue("hashSchema", bundle.hashSchemaVersion())
                .addValue("buildAlgorithm", bundle.buildAlgorithmVersion())
                .addValue("sourceCount", bundle.exams().size())
                .addValue("examCount", bundle.exams().size())
                .addValue("sectionCount", bundle.sectionCount())
                .addValue("questionCount", bundle.questionCount())
                .addValue("topicCount", bundle.topicIndex().size())
                .addValue("taggingCount", bundle.taggingCount())
                .addValue("metadata", writeJson(bundle.buildMetadata())));

        Map<String, JsonNode> manifestByExam = new HashMap<>();
        for (JsonNode entry : bundle.manifest()) {
            manifestByExam.put(requiredText(entry, "examId"), entry);
        }
        Map<String, byte[]> questionIds = new HashMap<>();
        Map<String, String> rawTopics = new HashMap<>();
        Map<String, String> questionExamIds = new HashMap<>();

        for (ExamDatasetBundle.SourceExam source : bundle.exams()) {
            insertExam(datasetId, source, manifestByExam, questionIds, rawTopics, questionExamIds);
        }
        insertTopics(datasetId, bundle, questionIds, rawTopics, questionExamIds);
        auditStagedDataset(datasetId, bundle);
        jdbc.update("UPDATE exam_datasets SET status = 'VALIDATED', validated_at = CURRENT_TIMESTAMP(6) WHERE id = :id",
                params().addValue("id", datasetId));
    }

    private void insertExam(
            byte[] datasetId,
            ExamDatasetBundle.SourceExam source,
            Map<String, JsonNode> manifestByExam,
            Map<String, byte[]> questionIds,
            Map<String, String> rawTopics,
            Map<String, String> questionExamIds
    ) {
        JsonNode exam = source.value();
        String examId = requiredText(exam, "examId");
        JsonNode manifest = manifestByExam.get(examId);
        if (manifest == null) {
            throw new IllegalArgumentException("Manifest entry is missing for " + examId);
        }
        String fileName = requiredText(manifest, "fileName");
        if (!source.relativePath().endsWith("/" + fileName)) {
            throw new IllegalArgumentException("Manifest fileName mismatch for " + examId);
        }
        boolean structural = manifest.path("structuralPassed").asBoolean(false);
        boolean verified = structural
                && manifest.path("crossSourcePassed").asBoolean(false)
                && !manifest.path("hasContentSuspicion").asBoolean(true);
        byte[] examInternalId = uuidBytes();
        JsonNode warnings = exam.path("warnings");

        jdbc.update("""
                INSERT INTO exam_definitions (
                    id, dataset_id, exam_id, title, exam_year, source_name, source_detail, exam_code,
                    exam_format, time_limit_minutes, total_score, source_file, content_hash,
                    visibility_status, verification_status, warnings_json, mcq_count, tf_count
                ) VALUES (
                    :id, :datasetId, :examId, :title, :year, :sourceName, :sourceDetail, :examCode,
                    :format, :timeLimit, :totalScore, :sourceFile, :contentHash,
                    :visibility, :verification, :warnings, :mcqCount, :tfCount
                )
                """, params()
                .addValue("id", examInternalId)
                .addValue("datasetId", datasetId)
                .addValue("examId", examId)
                .addValue("title", textOrDefault(exam, "title", examId))
                .addValue("year", nullableInt(exam.path("year")))
                .addValue("sourceName", nullableText(exam, "source"))
                .addValue("sourceDetail", nullableText(exam, "sourceDetail"))
                .addValue("examCode", nullableText(exam, "examCode"))
                .addValue("format", textOrDefault(exam, "format", "unknown"))
                .addValue("timeLimit", exam.path("timeLimitMinutes").asInt(50))
                .addValue("totalScore", exam.path("totalScore").decimalValue())
                .addValue("sourceFile", source.relativePath())
                .addValue("contentHash", source.contentHash())
                .addValue("visibility", structural ? "PUBLIC" : "HIDDEN")
                .addValue("verification", verified ? "VERIFIED" : "REVIEW_REQUIRED")
                .addValue("warnings", warnings.isMissingNode() ? null : writeJson(warnings))
                .addValue("mcqCount", manifest.path("mcqCount").asInt())
                .addValue("tfCount", manifest.path("tfCount").asInt()));

        int sectionOrder = 0;
        for (JsonNode section : exam.path("sections")) {
            sectionOrder++;
            byte[] sectionInternalId = uuidBytes();
            String sectionId = requiredText(section, "sectionId");
            JsonNode scoring = section.has("scoringRule") ? section.path("scoringRule") : section.path("scorePerQuestion");
            jdbc.update("""
                    INSERT INTO exam_sections (
                        id, exam_definition_id, section_id, section_type, title, order_in_exam,
                        total_questions, max_score, scoring_config_json
                    ) VALUES (
                        :id, :examId, :sectionId, :type, :title, :sectionOrder,
                        :totalQuestions, :maxScore, :scoring
                    )
                    """, params()
                    .addValue("id", sectionInternalId)
                    .addValue("examId", examInternalId)
                    .addValue("sectionId", sectionId)
                    .addValue("type", requiredText(section, "sectionType"))
                    .addValue("title", textOrDefault(section, "title", sectionId))
                    .addValue("sectionOrder", sectionOrder)
                    .addValue("totalQuestions", section.path("totalQuestions").asInt())
                    .addValue("maxScore", section.path("maxScore").isNumber() ? section.path("maxScore").decimalValue() : null)
                    .addValue("scoring", scoring.isMissingNode() ? null : writeJson(scoring)));

            int localOrder = 0;
            for (JsonNode question : section.path("questions")) {
                localOrder++;
                insertQuestion(datasetId, sectionInternalId, examId, question, localOrder, questionIds, rawTopics, questionExamIds);
            }
        }
    }

    private void insertQuestion(
            byte[] datasetId,
            byte[] sectionInternalId,
            String examId,
            JsonNode question,
            int localOrder,
            Map<String, byte[]> questionIds,
            Map<String, String> rawTopics,
            Map<String, String> questionExamIds
    ) {
        byte[] questionInternalId = uuidBytes();
        String questionId = requiredText(question, "id");
        String questionType = requiredText(question, "questionType");
        String rawTopic = textOrDefault(question, "topic", "Khac / Chua phan loai");
        questionIds.put(questionId, questionInternalId);
        rawTopics.put(questionId, rawTopic);
        questionExamIds.put(questionId, examId);

        jdbc.update("""
                INSERT INTO exam_questions (
                    id, dataset_id, exam_section_id, question_id, order_in_section, order_in_exam,
                    question_type, question_text, explanation, difficulty, cognitive_level,
                    raw_topic, has_image, content_hash
                ) VALUES (
                    :id, :datasetId, :sectionId, :questionId, :localOrder, :examOrder,
                    :type, :text, :explanation, :difficulty, :cognitive,
                    :rawTopic, :hasImage, :contentHash
                )
                """, params()
                .addValue("id", questionInternalId)
                .addValue("datasetId", datasetId)
                .addValue("sectionId", sectionInternalId)
                .addValue("questionId", questionId)
                .addValue("localOrder", localOrder)
                .addValue("examOrder", question.path("orderInExam").asInt())
                .addValue("type", questionType)
                .addValue("text", requiredText(question, "questionText"))
                .addValue("explanation", nullableText(question, "explanation"))
                .addValue("difficulty", requiredText(question, "difficulty"))
                .addValue("cognitive", requiredText(question, "cognitiveLevel"))
                .addValue("rawTopic", rawTopic)
                .addValue("hasImage", question.path("hasImage").asBoolean(false))
                .addValue("contentHash", ExamDatasetHashing.canonicalSha256(question)));

        if (questionType.equals("mcq")) {
            String correct = requiredText(question, "correctOptionId");
            int order = 0;
            for (JsonNode option : question.path("options")) {
                order++;
                jdbc.update("""
                        INSERT INTO exam_mcq_options (
                            question_internal_id, option_key, option_text, is_correct, order_in_question
                        ) VALUES (:questionId, :optionKey, :optionText, :correct, :itemOrder)
                        """, params()
                        .addValue("questionId", questionInternalId)
                        .addValue("optionKey", requiredText(option, "id"))
                        .addValue("optionText", requiredText(option, "text"))
                        .addValue("correct", correct.equals(requiredText(option, "id")))
                        .addValue("itemOrder", order));
            }
        } else {
            int order = 0;
            for (JsonNode statement : question.path("statements")) {
                order++;
                jdbc.update("""
                        INSERT INTO exam_tf_statements (
                            question_internal_id, statement_key, statement_text, is_true, order_in_question
                        ) VALUES (:questionId, :statementKey, :statementText, :truth, :itemOrder)
                        """, params()
                        .addValue("questionId", questionInternalId)
                        .addValue("statementKey", requiredText(statement, "id"))
                        .addValue("statementText", requiredText(statement, "text"))
                        .addValue("truth", statement.path("isTrue").asBoolean())
                        .addValue("itemOrder", order));
            }
        }

        int sourceOrder = 0;
        for (JsonNode source : question.path("sourceRefs")) {
            sourceOrder++;
            jdbc.update("""
                    INSERT INTO exam_question_sources (
                        question_internal_id, source_title, source_location, order_in_question
                    ) VALUES (:questionId, :title, :location, :itemOrder)
                    """, params()
                    .addValue("questionId", questionInternalId)
                    .addValue("title", requiredText(source, "title"))
                    .addValue("location", nullableText(source, "location"))
                    .addValue("itemOrder", sourceOrder));
        }
    }

    private void insertTopics(
            byte[] datasetId,
            ExamDatasetBundle bundle,
            Map<String, byte[]> questionIds,
            Map<String, String> rawTopics,
            Map<String, String> questionExamIds
    ) {
        Map<String, byte[]> topicIds = new LinkedHashMap<>();
        Set<String> slugs = new HashSet<>();
        int displayOrder = 0;
        for (var property : bundle.topicIndex().properties()) {
            displayOrder++;
            String title = property.getKey();
            String slug = slugify(title);
            if (!slugs.add(slug)) {
                throw new IllegalArgumentException("Topic slug collision: " + slug);
            }
            PeriodRule period = periodFor(title);
            byte[] topicId = uuidBytes();
            topicIds.put(title, topicId);
            jdbc.update("""
                    INSERT INTO exam_topics (
                        id, dataset_id, topic_slug, title, period_slug, period_title, display_order
                    ) VALUES (:id, :datasetId, :slug, :title, :periodSlug, :periodTitle, :displayOrder)
                    """, params()
                    .addValue("id", topicId)
                    .addValue("datasetId", datasetId)
                    .addValue("slug", slug)
                    .addValue("title", title)
                    .addValue("periodSlug", period.slug())
                    .addValue("periodTitle", period.title())
                    .addValue("displayOrder", displayOrder));
        }

        for (var property : bundle.topicIndex().properties()) {
            String topicTitle = property.getKey();
            JsonNode allowedRawTopics = bundle.topicRawMapping().path(topicTitle).path("rawTopics");
            Set<String> allowed = new HashSet<>();
            for (JsonNode raw : allowedRawTopics) {
                allowed.add(raw.asText());
            }
            for (JsonNode ref : property.getValue()) {
                String questionId = requiredText(ref, "questionId");
                String examId = requiredText(ref, "examId");
                if (!examId.equals(questionExamIds.get(questionId))) {
                    throw new IllegalArgumentException("Dataset-section ownership mismatch for " + questionId);
                }
                String rawTopic = rawTopics.get(questionId);
                if (!allowed.contains(rawTopic)) {
                    throw new IllegalArgumentException("Raw topic mapping mismatch for " + questionId + " and " + topicTitle);
                }
                jdbc.update("""
                        INSERT INTO exam_question_topics (question_internal_id, topic_id, raw_topic)
                        VALUES (:questionId, :topicId, :rawTopic)
                        """, params()
                        .addValue("questionId", questionIds.get(questionId))
                        .addValue("topicId", topicIds.get(topicTitle))
                        .addValue("rawTopic", rawTopic));
            }
        }
    }

    private void auditStagedDataset(byte[] datasetId, ExamDatasetBundle bundle) {
        assertCount("exam_definitions", datasetId, bundle.exams().size());
        assertCount("exam_questions", datasetId, bundle.questionCount());
        assertCount("exam_topics", datasetId, bundle.topicIndex().size());
        Integer sectionCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM exam_sections s
                JOIN exam_definitions e ON e.id = s.exam_definition_id
                WHERE e.dataset_id = :datasetId
                """, params().addValue("datasetId", datasetId), Integer.class);
        Integer taggingCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM exam_question_topics qt
                JOIN exam_questions q ON q.id = qt.question_internal_id
                WHERE q.dataset_id = :datasetId
                """, params().addValue("datasetId", datasetId), Integer.class);
        Integer mismatchCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM exam_questions q
                JOIN exam_sections s ON s.id = q.exam_section_id
                JOIN exam_definitions e ON e.id = s.exam_definition_id
                WHERE q.dataset_id = :datasetId AND e.dataset_id <> q.dataset_id
                """, params().addValue("datasetId", datasetId), Integer.class);
        if (sectionCount == null || sectionCount != bundle.sectionCount()) {
            throw new IllegalStateException("Staged section count audit failed");
        }
        if (taggingCount == null || taggingCount != bundle.taggingCount()) {
            throw new IllegalStateException("Staged topic tagging count audit failed");
        }
        if (mismatchCount == null || mismatchCount != 0) {
            throw new IllegalStateException("Dataset-section ownership audit failed");
        }
    }

    private void assertCount(String table, byte[] datasetId, int expected) {
        Integer actual = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE dataset_id = :datasetId",
                params().addValue("datasetId", datasetId),
                Integer.class
        );
        if (actual == null || actual != expected) {
            throw new IllegalStateException(table + " count audit failed: expected " + expected + ", got " + actual);
        }
    }

    private void promoteDataset(byte[] datasetId) {
        List<byte[]> current = jdbc.query(
                "SELECT active_dataset_id FROM exam_runtime_state WHERE state_id = 1 FOR UPDATE",
                Map.of(),
                (rs, rowNum) -> rs.getBytes(1)
        );
        if (current.isEmpty()) {
            throw new IllegalStateException("exam_runtime_state singleton is missing");
        }
        byte[] previous = current.getFirst();
        if (previous != null) {
            jdbc.update("UPDATE exam_datasets SET status = 'SUPERSEDED' WHERE id = :id AND status = 'ACTIVE'",
                    params().addValue("id", previous));
        }
        int activated = jdbc.update("""
                UPDATE exam_datasets
                SET status = 'ACTIVE', promoted_at = CURRENT_TIMESTAMP(6)
                WHERE id = :id AND status = 'VALIDATED'
                """, params().addValue("id", datasetId));
        if (activated != 1) {
            throw new IllegalStateException("Validated dataset was not available for promotion");
        }
        jdbc.update("UPDATE exam_runtime_state SET active_dataset_id = :id WHERE state_id = 1",
                params().addValue("id", datasetId));
    }

    private byte[] findDatasetByHash(String aggregateHash) {
        List<byte[]> ids = jdbc.query(
                "SELECT id FROM exam_datasets WHERE aggregate_hash = :hash LIMIT 1",
                params().addValue("hash", aggregateHash),
                (rs, rowNum) -> rs.getBytes(1)
        );
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private void createRun(byte[] runId, String hash, boolean dryRun, String sourceCommit) {
        requiresNew.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO exam_import_runs (
                    id, aggregate_hash, run_mode, status, source_commit, started_at
                ) VALUES (:id, :hash, :mode, 'RUNNING', :sourceCommit, :startedAt)
                """, params()
                .addValue("id", runId)
                .addValue("hash", hash)
                .addValue("mode", dryRun ? "DRY_RUN" : "IMPORT")
                .addValue("sourceCommit", blankToNull(sourceCommit))
                .addValue("startedAt", LocalDateTime.now())));
    }

    private void finishRun(byte[] runId, byte[] datasetId, String status, ExamDatasetBundle bundle, String error) {
        requiresNew.executeWithoutResult(tx -> jdbc.update("""
                UPDATE exam_import_runs
                SET dataset_id = :datasetId, status = :status,
                    exam_count = :examCount, section_count = :sectionCount,
                    question_count = :questionCount, topic_count = :topicCount,
                    tagging_count = :taggingCount, error_count = :errorCount,
                    report_json = :report, finished_at = CURRENT_TIMESTAMP(6)
                WHERE id = :id
                """, params()
                .addValue("id", runId)
                .addValue("datasetId", datasetId)
                .addValue("status", status)
                .addValue("examCount", bundle.exams().size())
                .addValue("sectionCount", bundle.sectionCount())
                .addValue("questionCount", bundle.questionCount())
                .addValue("topicCount", bundle.topicIndex().size())
                .addValue("taggingCount", bundle.taggingCount())
                .addValue("errorCount", error == null ? 0 : 1)
                .addValue("report", writeJson(Map.of(
                        "aggregateHash", bundle.aggregateHash(),
                        "status", status,
                        "error", error == null ? "" : error
                )))));
    }

    private ExamDatasetImportResult result(String status, ExamDatasetBundle bundle) {
        return new ExamDatasetImportResult(
                status,
                bundle.aggregateHash(),
                bundle.exams().size(),
                bundle.sectionCount(),
                bundle.questionCount(),
                bundle.topicIndex().size(),
                bundle.taggingCount()
        );
    }

    private PeriodRule periodFor(String topic) {
        String normalized = normalize(topic).replace('-', ' ');
        for (PeriodRule rule : PERIOD_RULES) {
            if (rule.keywords().stream().anyMatch(normalized::contains)) {
                return rule;
            }
        }
        return OTHER_PERIOD;
    }

    private String slugify(String text) {
        String slug = NON_SLUG.matcher(normalize(text)).replaceAll("-").replaceAll("(^-+|-+$)", "");
        return slug.isBlank() ? OTHER_PERIOD.slug() : slug;
    }

    private String normalize(String text) {
        String normalized = COMBINING_MARKS.matcher(Normalizer.normalize(text, Normalizer.Form.NFD)).replaceAll("");
        return normalized.toLowerCase(Locale.ROOT).replace('đ', 'd');
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isString() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Missing non-empty text field: " + field);
        }
        return value.asText();
    }

    private String nullableText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isString() && !value.asText().isBlank() ? value.asText() : null;
    }

    private String textOrDefault(JsonNode node, String field, String fallback) {
        String value = nullableText(node, field);
        return value == null ? fallback : value;
    }

    private Integer nullableInt(JsonNode node) {
        return node.isIntegralNumber() ? node.asInt() : null;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException ex) {
            throw new IllegalStateException("Cannot serialize exam import audit data", ex);
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private byte[] uuidBytes() {
        return UuidBytes.fromUuid(UUID.randomUUID());
    }

    private MapSqlParameterSource params() {
        return new MapSqlParameterSource();
    }

    private record PeriodRule(String slug, String title, List<String> keywords) {
    }
}
