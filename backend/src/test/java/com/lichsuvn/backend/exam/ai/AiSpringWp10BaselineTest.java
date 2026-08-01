package com.lichsuvn.backend.exam.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WP10/WP11 bounded Spring-to-FastAPI benchmark. This is diagnostic-only and
 * is not part of the production test suite unless explicitly selected.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ai_wp10_baseline;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "app.jwt.secret=wp10-test-secret-at-least-32-characters",
        "app.tts.asset-flow-enabled=false"
})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_SPRING_WP11_BENCHMARK", matches = "1")
class AiSpringWp10BaselineTest {
    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

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
        jdbc.update("MERGE INTO exam_questions KEY(id) VALUES (?, ?, ?, 'wp10-style-1', 'mcq', 'Theo tu lieu, nhan dinh nao dung?', 'Giai thich phu hop voi tu lieu.', 'medium', 'Hiện Thực Lịch Sử Và Nhận Thức Lị', FALSE)", question, dataset, section);
        if (jdbc.queryForObject("SELECT COUNT(*) FROM exam_mcq_options", Integer.class) == 0) {
            for (int index = 0; index < 4; index++) {
                String key = String.valueOf((char) ('A' + index));
                jdbc.update("INSERT INTO exam_mcq_options(question_internal_id,option_key,option_text,is_correct,order_in_question) VALUES (?,?,?,?,?)",
                        question, key, "Phuong an " + key, index == 1, index + 1);
            }
        }
    }

    @Test
    void recordsSixBoundedSpringPracticeRequests() throws Exception {
        runCase("B1", "Hiện Thực Lịch Sử Và Nhận Thức Lị");
        runCase("B2", "Hiện Thực Lịch Sử Và Nhận Thức Lị");
        runCase("B3", "Hiện Thực Lịch Sử Và Nhận Thức Lị");
        runCase("B4", "Hiện Thực Lịch Sử Và Nhận Thức Lị");
        runCase("C1", "Tri Thức Lịch Sử Và Cuộc Sống");
        runCase("C2", "Tri Thức Lịch Sử Và Cuộc Sống");
    }

    private void runCase(String caseId, String query) throws Exception {
        long started = System.nanoTime();
        var result = mockMvc.perform(post("/api/quiz/generate")
                        .with(user("wp10-student").authorities(() -> "ROLE_student"))
                        .header("X-Request-ID", "wp10-" + caseId + "-20260729")
                        .contentType("application/json")
                        .content("{\"query\":\"" + query + "\",\"difficulty\":\"MEDIUM\",\"count\":5}"))
                .andExpect(status().isOk())
                .andReturn();
        long totalMs = (System.nanoTime() - started) / 1_000_000;
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        JsonNode generation = data.path("generation");
        System.out.printf("WP11_SPRING_BENCHMARK case=%s status=%d totalMs=%d questionCount=%d generatedCount=%d partial=%s%n",
                caseId, result.getResponse().getStatus(), totalMs, data.path("questions").size(),
                generation.path("generatedCount").asInt(), generation.path("partial").asBoolean());
    }

    private static byte[] bytes(int suffix) {
        byte[] value = new byte[16];
        value[15] = (byte) suffix;
        return value;
    }
}
