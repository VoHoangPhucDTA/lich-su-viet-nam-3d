package com.lichsuvn.backend.exam.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.exam.ai.api.AiQuizController;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.application.AiQuizGenerationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiQuizController.class)
@Import({SecurityConfig.class, JacksonConfig.class, GlobalExceptionHandler.class, ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class, AiQuizControllerTest.EnableSecurity.class})
class AiQuizControllerTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @MockitoBean AiQuizGenerationService service;
    @MockitoBean AuthService authService;

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(post("/api/exams/ai/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void authenticatedRequestUsesApiResponseWrapper() throws Exception {
        when(service.generate(any(), any())).thenReturn(response());
        mockMvc.perform(post("/api/exams/ai/generate")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.questions[0].options.length()").value(4))
                .andExpect(jsonPath("$.data.generation.partial").value(false));
    }

    @Test
    void publicValidationRejectsUnsupportedGradeAndCount() throws Exception {
        mockMvc.perform(post("/api/exams/ai/generate")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequest().replace("\"grade\":12", "\"grade\":9").replace("\"count\":1", "\"count\":11")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private static String validRequest() {
        return """
                {"query":"Nguyên nhân thắng lợi","grade":12,"lessonNumber":6,"difficulty":"MEDIUM","count":1,"topK":5}
                """;
    }

    private static AiQuizGenerateResponse response() {
        return new AiQuizGenerateResponse(
                List.of(new AiQuizGenerateResponse.Question("Q", List.of(
                        new AiQuizGenerateResponse.Option("A", "A"), new AiQuizGenerateResponse.Option("B", "B"),
                        new AiQuizGenerateResponse.Option("C", "C"), new AiQuizGenerateResponse.Option("D", "D")
                ), "B", "E", "MEDIUM", List.of("c1"))),
                List.of(new AiQuizGenerateResponse.Source("c1", "d1", 12, 6, "L", "S", 1, 1, "b".repeat(64))),
                List.of(), new AiQuizGenerateResponse.Generation(1, 1, false),
                new AiQuizGenerateResponse.GenerationReceipt("receipt-1", "2026-07-20T12:00:00")
        );
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}
