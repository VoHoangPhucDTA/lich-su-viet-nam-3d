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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
                .andExpect(jsonPath("$.code").value("AI_CANDIDATE_PUBLISH_FORBIDDEN"));
    }

    @Test
    void adminIsAllowed() throws Exception {
        when(service.publishTargets(nullable(com.lichsuvn.backend.auth.security.UserPrincipal.class))).thenReturn(List.of());
        mockMvc.perform(get("/api/exams/ai/candidates/publish-targets")
                        .with(user("admin").authorities(() -> "ROLE_admin", () -> "AI_CANDIDATE_PUBLISH")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void teacherCannotUsePublishPermissionEndpoint() throws Exception {
        mockMvc.perform(get("/api/exams/ai/candidates/publish-targets")
                        .with(user("teacher").authorities(() -> "ROLE_teacher", () -> "AI_CANDIDATE_VIEW", () -> "AI_CANDIDATE_REVIEW")))
                .andExpect(status().isForbidden());
    }

    @Test
    void teacherWithViewPermissionCanOpenQueue() throws Exception {
        mockMvc.perform(get("/api/exams/ai/candidates")
                        .with(user("teacher").authorities(() -> "ROLE_teacher", () -> "AI_CANDIDATE_VIEW")))
                .andExpect(status().isOk());
    }

    @Test
    void teacherCanReachRevisionCreateAndRemapButStudentCannot() throws Exception {
        var teacher = user("teacher").authorities(() -> "ROLE_teacher", () -> "AI_CANDIDATE_CREATE", () -> "AI_CANDIDATE_EDIT");
        mockMvc.perform(post("/api/exams/ai/candidates/00000000-0000-0000-0000-000000000000/revisions")
                        .with(teacher).contentType("application/json").content("{\"reason\":\"correct source\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/exams/ai/candidates/00000000-0000-0000-0000-000000000000/sources")
                        .with(teacher).contentType("application/json").content("""
                                {"version":1,"reason":"canonical correction","sources":[{"chunkId":"chunk-1","chunkHash":"%s"}]}
                                """.formatted("b".repeat(64))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/exams/ai/candidates/00000000-0000-0000-0000-000000000000/revisions")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .contentType("application/json").content("{\"reason\":\"no\"}"))
                .andExpect(status().isForbidden());
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {}
}
