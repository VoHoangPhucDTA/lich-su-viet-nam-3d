package com.lichsuvn.backend.exam.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ai_spring_smoke;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "app.jwt.secret=smoke-test-secret-at-least-32-characters",
        "app.tts.asset-flow-enabled=false"
})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_SPRING_AI_SMOKE", matches = "1")
class AiSpringFastApiSmokeTest {
    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void seedVerifiedStyleBank() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_datasets(id BINARY(16) PRIMARY KEY, status VARCHAR(24) NOT NULL)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_runtime_state(state_id INT PRIMARY KEY, active_dataset_id BINARY(16))");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_definitions(id BINARY(16) PRIMARY KEY, dataset_id BINARY(16), visibility_status VARCHAR(20), verification_status VARCHAR(24))");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_sections(id BINARY(16) PRIMARY KEY, exam_definition_id BINARY(16))");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_questions(id BINARY(16) PRIMARY KEY, dataset_id BINARY(16), exam_section_id BINARY(16), question_id VARCHAR(255), question_type VARCHAR(24), question_text VARCHAR(1000), explanation VARCHAR(1000), difficulty VARCHAR(24), raw_topic VARCHAR(500), has_image BOOLEAN)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_mcq_options(id BIGINT AUTO_INCREMENT PRIMARY KEY, question_internal_id BINARY(16), option_key VARCHAR(16), option_text VARCHAR(1000), is_correct BOOLEAN, order_in_question INT)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_topics(id BINARY(16) PRIMARY KEY, topic_slug VARCHAR(180), title VARCHAR(500))");
        jdbc.execute("CREATE TABLE IF NOT EXISTS exam_question_topics(question_internal_id BINARY(16), topic_id BINARY(16))");
        byte[] dataset = bytes(1);
        byte[] definition = bytes(2);
        byte[] section = bytes(3);
        byte[] question = bytes(4);
        jdbc.update("MERGE INTO exam_datasets KEY(id) VALUES (?, 'ACTIVE')", dataset);
        jdbc.update("MERGE INTO exam_runtime_state KEY(state_id) VALUES (1, ?)", dataset);
        jdbc.update("MERGE INTO exam_definitions KEY(id) VALUES (?, ?, 'PUBLIC', 'VERIFIED')", definition, dataset);
        jdbc.update("MERGE INTO exam_sections KEY(id) VALUES (?, ?)", section, definition);
        jdbc.update("MERGE INTO exam_questions KEY(id) VALUES (?, ?, ?, 'style-1', 'mcq', 'Theo tư liệu, nhận định nào đúng?', 'Đáp án phù hợp với tư liệu.', 'medium', 'Cách mạng tháng Tám', FALSE)", question, dataset, section);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM exam_mcq_options", Integer.class) == 0) {
            for (int index = 0; index < 4; index++) {
                String key = String.valueOf((char) ('A' + index));
                jdbc.update("INSERT INTO exam_mcq_options(question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (?,?,?,?,?)",
                        question, key, "Phương án " + key, index == 1, index + 1);
            }
        }
    }

    @Test
    void publicRouteGeneratesOneThenThreeWithoutPersistingQuestionBankRows() throws Exception {
        long questionsBefore = count("exam_questions");
        long optionsBefore = count("exam_mcq_options");

        smoke(1);
        smoke(3);

        org.junit.jupiter.api.Assertions.assertEquals(questionsBefore, count("exam_questions"));
        org.junit.jupiter.api.Assertions.assertEquals(optionsBefore, count("exam_mcq_options"));
    }

    private void smoke(int count) throws Exception {
        String body = """
                {"query":"Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945","grade":12,"lessonNumber":6,"difficulty":"MEDIUM","count":%d,"topK":5}
                """.formatted(count);
        mockMvc.perform(post("/api/exams/ai/generate")
                        .with(user("ai-smoke").authorities(() -> "ROLE_student"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.generation.requestedCount").value(count))
                .andExpect(jsonPath("$.data.generation.generatedCount").value(count))
                .andExpect(jsonPath("$.data.questions.length()").value(count))
                .andExpect(jsonPath("$.data.questions[0].options.length()").value(4))
                .andExpect(jsonPath("$.data.questions[0].sourceChunkIds[0]").isNotEmpty());
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }

    private static byte[] bytes(int suffix) {
        byte[] value = new byte[16];
        value[15] = (byte) suffix;
        return value;
    }
}
