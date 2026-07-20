package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.infrastructure.AiStyleExampleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.ByteBuffer;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiStyleExampleRepositoryTest {
    private JdbcTemplate jdbc;
    private AiStyleExampleRepository repository;
    private byte[] dataset;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:ai_styles_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""
        );
        jdbc = new JdbcTemplate(dataSource);
        repository = new AiStyleExampleRepository(new NamedParameterJdbcTemplate(dataSource));
        createSchema();
        dataset = id();
        jdbc.update("INSERT INTO exam_datasets(id,status) VALUES (?, 'ACTIVE')", dataset);
        jdbc.update("INSERT INTO exam_runtime_state(state_id,active_dataset_id) VALUES (1, ?)", dataset);
    }

    @Test
    void selectsOnlyActivePublicVerifiedMcqWithStableTopicThenDifficultyPriority() {
        byte[] verified = definition("VERIFIED", "PUBLIC");
        byte[] review = definition("REVIEW_REQUIRED", "PUBLIC");
        byte[] hidden = definition("VERIFIED", "HIDDEN");
        question(verified, "q-topic", "easy", "ASEAN", "mcq", true);
        question(verified, "q-difficulty", "medium", "Other", "mcq", true);
        question(review, "q-review", "medium", "ASEAN", "mcq", true);
        question(hidden, "q-hidden", "medium", "ASEAN", "mcq", true);
        question(verified, "q-tf", "medium", "ASEAN", "true_false", true);

        var result = repository.findEligible("ASEAN", "MEDIUM", 3);

        assertEquals(2, result.size());
        assertEquals("q-topic", result.get(0).publicQuestionId());
        assertEquals(2, result.get(0).selectionPriority());
        assertEquals("q-difficulty", result.get(1).publicQuestionId());
        assertEquals(3, result.get(1).selectionPriority());
        assertEquals(4, result.get(0).options().size());
        assertEquals(1, result.get(0).options().stream().filter(option -> option.correct()).count());
    }

    @Test
    void excludesQuestionWithoutExactlyFourOptionsAndOneCorrectAnswer() {
        byte[] verified = definition("VERIFIED", "PUBLIC");
        question(verified, "q-valid", "hard", "Topic", "mcq", true);
        question(verified, "q-three", "hard", "Topic", "mcq", false);

        var result = repository.findEligible("Topic", "HARD", 3);

        assertEquals(1, result.size());
        assertEquals("q-valid", result.getFirst().publicQuestionId());
    }

    private byte[] definition(String verification, String visibility) {
        byte[] definition = id();
        jdbc.update("INSERT INTO exam_definitions(id,dataset_id,visibility_status,verification_status) VALUES (?,?,?,?)",
                definition, dataset, visibility, verification);
        return definition;
    }

    private void question(byte[] definition, String publicId, String difficulty, String topic, String type, boolean fourOptions) {
        byte[] section = id();
        byte[] question = id();
        jdbc.update("INSERT INTO exam_sections(id,exam_definition_id) VALUES (?,?)", section, definition);
        jdbc.update("INSERT INTO exam_questions(id,dataset_id,exam_section_id,question_id,question_type,question_text,explanation,difficulty,raw_topic,has_image) VALUES (?,?,?,?,?,'Question?','Explanation',?,?,FALSE)",
                question, dataset, section, publicId, type, difficulty, topic);
        int count = fourOptions ? 4 : 3;
        for (int index = 0; index < count; index++) {
            String key = String.valueOf((char) ('A' + index));
            jdbc.update("INSERT INTO exam_mcq_options(question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (?,?,?,?,?)",
                    question, key, "Option " + key, index == 1, index + 1);
        }
    }

    private void createSchema() {
        jdbc.execute("CREATE TABLE exam_datasets(id BINARY(16) PRIMARY KEY, status VARCHAR(24) NOT NULL)");
        jdbc.execute("CREATE TABLE exam_runtime_state(state_id INT PRIMARY KEY, active_dataset_id BINARY(16))");
        jdbc.execute("CREATE TABLE exam_definitions(id BINARY(16) PRIMARY KEY, dataset_id BINARY(16), visibility_status VARCHAR(20), verification_status VARCHAR(24))");
        jdbc.execute("CREATE TABLE exam_sections(id BINARY(16) PRIMARY KEY, exam_definition_id BINARY(16))");
        jdbc.execute("CREATE TABLE exam_questions(id BINARY(16) PRIMARY KEY, dataset_id BINARY(16), exam_section_id BINARY(16), question_id VARCHAR(255), question_type VARCHAR(24), question_text VARCHAR(1000), explanation VARCHAR(1000), difficulty VARCHAR(24), raw_topic VARCHAR(500), has_image BOOLEAN)");
        jdbc.execute("CREATE TABLE exam_mcq_options(id BIGINT AUTO_INCREMENT PRIMARY KEY, question_internal_id BINARY(16), option_key VARCHAR(16), option_text VARCHAR(1000), is_correct BOOLEAN, order_in_question INT)");
        jdbc.execute("CREATE TABLE exam_topics(id BINARY(16) PRIMARY KEY, topic_slug VARCHAR(180), title VARCHAR(500))");
        jdbc.execute("CREATE TABLE exam_question_topics(question_internal_id BINARY(16), topic_id BINARY(16))");
    }

    private static byte[] id() {
        UUID value = UUID.randomUUID();
        return ByteBuffer.allocate(16).putLong(value.getMostSignificantBits()).putLong(value.getLeastSignificantBits()).array();
    }
}
