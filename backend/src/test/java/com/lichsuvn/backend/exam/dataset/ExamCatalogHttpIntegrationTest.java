package com.lichsuvn.backend.exam.dataset;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import javax.sql.DataSource;
import java.nio.file.Path;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:catalog-http;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.hikari.connection-init-sql=",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "app.jwt.secret=test-only-secret-that-is-long-enough-for-hmac-signing"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ExamCatalogHttpIntegrationTest {
    @Autowired
    private WebApplicationContext context;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private ExamDatasetImportService importer;

    private MockMvc mockMvc;
    private String verifiedExamId;

    @BeforeAll
    void setUpDatabase() throws Exception {
        ExamH2TestDatabase.applyQuestionBankSchema(dataSource);
        Path root = Path.of("..").toAbsolutePath().normalize();
        importer.run(
                root,
                root.resolve("data/exams"),
                root.resolve("frontend/public/data/exams"),
                false,
                "test"
        );
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        verifiedExamId = com.jayway.jsonpath.JsonPath.read(
                mockMvc.perform(get("/api/exams"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "$.data.items[0].examId"
        );
    }

    @Test
    void anonymousCatalogEndpointsReturnMetadataOnly() throws Exception {
        String listPayload = mockMvc.perform(get("/api/exams"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(23))
                .andReturn().getResponse().getContentAsString();
        assertNoLeakage(listPayload);

        String detailPayload = mockMvc.perform(get("/api/exams/{examId}", verifiedExamId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalQuestions").value(28))
                .andReturn().getResponse().getContentAsString();
        assertNoLeakage(detailPayload);

        String topicsPayload = mockMvc.perform(get("/api/exams/topics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(32))
                .andReturn().getResponse().getContentAsString();
        assertNoLeakage(topicsPayload);

        String previewPayload = mockMvc.perform(post("/api/exams/custom/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "questionCount": 10,
                                  "questionType": "mcq",
                                  "difficulty": "all",
                                  "cognitiveLevel": "all",
                                  "scopeType": "all"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.selectedCount").value(10))
                .andReturn().getResponse().getContentAsString();
        assertNoLeakage(previewPayload);
    }

    @Test
    void legacyAttemptHistoryRemainsAuthenticated() throws Exception {
        mockMvc.perform(get("/api/exams/attempts"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }

    private void assertNoLeakage(String payload) {
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("questionId"));
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("questionText"));
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("correctOption"));
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("isTrue"));
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("explanation"));
        org.junit.jupiter.api.Assertions.assertFalse(payload.contains("questionRefs"));
    }
}
