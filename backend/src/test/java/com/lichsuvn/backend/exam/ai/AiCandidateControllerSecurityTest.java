package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateController;
import com.lichsuvn.backend.exam.ai.review.application.AiCandidateService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiCandidateController.class)
@Import({SecurityConfig.class, JacksonConfig.class, GlobalExceptionHandler.class, ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class, AiCandidateControllerSecurityTest.EnableSecurity.class})
class AiCandidateControllerSecurityTest {
    @Autowired MockMvc mockMvc;
    @MockitoBean AiCandidateService service;
    @MockitoBean AuthService authService;

    @Test
    void anonymousIsDenied() throws Exception {
        mockMvc.perform(get("/api/exams/ai/candidates/publish-targets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void studentIsForbidden() throws Exception {
        mockMvc.perform(get("/api/exams/ai/candidates/publish-targets")
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void adminIsAllowed() throws Exception {
        when(service.publishTargets(nullable(com.lichsuvn.backend.auth.security.UserPrincipal.class))).thenReturn(List.of());
        mockMvc.perform(get("/api/exams/ai/candidates/publish-targets")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {}
}
