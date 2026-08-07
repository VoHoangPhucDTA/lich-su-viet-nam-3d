package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.exam.ai.api.PracticeQuizController;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionResponse;
import com.lichsuvn.backend.exam.ai.application.AiQuizGenerationService;
import com.lichsuvn.backend.exam.ai.application.PracticeQuizCompletionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PracticeQuizController.class)
@Import({SecurityConfig.class, JacksonConfig.class, GlobalExceptionHandler.class, ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class, PracticeQuizControllerTest.EnableSecurity.class})
class PracticeQuizControllerTest {
    @Autowired MockMvc mockMvc;
    @MockitoBean AiQuizGenerationService service;
    @MockitoBean PracticeQuizCompletionService completionService;
    @MockitoBean AuthService authService;

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(post("/api/quiz/generate")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void authenticatedRequestReturnsPracticeContractWithoutReceipt() throws Exception {
        when(service.generatePractice(any(), any())).thenReturn(response());

        mockMvc.perform(post("/api/quiz/generate")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions[0].options.length()").value(4))
                .andExpect(jsonPath("$.data.generation.partial").value(false))
                .andExpect(jsonPath("$.data.generationReceipt").doesNotExist());
    }

    @Test
    void rejectsBlankQueryInvalidDifficultyAndCount() throws Exception {
        mockMvc.perform(post("/api/quiz/generate")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":" ","difficulty":"UNKNOWN","count":11}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recordsAnAuthenticatedCompletionReceipt() throws Exception {
        when(completionService.record(any(), any())).thenReturn(
                new PracticeQuizCompletionResponse(
                        1,
                        "550e8400-e29b-41d4-a716-446655440000",
                        "recorded"
                )
        );

        mockMvc.perform(post("/api/quiz/attempts")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "clientSessionId":"session-123",
                                  "topic":"Cách mạng tháng Tám",
                                  "difficulty":"medium",
                                  "totalQuestions":5,
                                  "durationMs":90000
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.schemaVersion").value(1))
                .andExpect(jsonPath("$.data.status").value("recorded"));
    }

    @Test
    void rejectsInvalidCompletionMetadata() throws Exception {
        mockMvc.perform(post("/api/quiz/attempts")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "clientSessionId":"bad session id",
                                  "topic":" ",
                                  "difficulty":"unknown",
                                  "totalQuestions":0,
                                  "durationMs":-1
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private static String validRequest() {
        return """
                {"query":"Cách mạng tháng Tám năm 1945","difficulty":"MEDIUM","count":5}
                """;
    }

    private static PracticeQuizGenerateResponse response() {
        return new PracticeQuizGenerateResponse(
                List.of(new AiQuizGenerateResponse.Question("Q", List.of(
                        new AiQuizGenerateResponse.Option("A", "A"), new AiQuizGenerateResponse.Option("B", "B"),
                        new AiQuizGenerateResponse.Option("C", "C"), new AiQuizGenerateResponse.Option("D", "D")
                ), "B", "E", "MEDIUM", List.of("c1"))),
                List.of(new AiQuizGenerateResponse.Source("c1", "d1", 12, 6, "L", "S", 1, 1, "b".repeat(64))),
                List.of(), new AiQuizGenerateResponse.Generation(5, 5, false)
        );
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}
