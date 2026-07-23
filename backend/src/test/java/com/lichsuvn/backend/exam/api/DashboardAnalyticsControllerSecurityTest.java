package com.lichsuvn.backend.exam.api;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsAggregator;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsConfiguration;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsService;
import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser;
import com.lichsuvn.backend.exam.infrastructure.ExamAttemptRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DashboardAnalyticsController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        DashboardAnalyticsService.class,
        DashboardSnapshotV2Parser.class,
        DashboardAnalyticsAggregator.class,
        DashboardAnalyticsConfiguration.class,
        DashboardAnalyticsControllerSecurityTest.EnableSecurity.class
})
class DashboardAnalyticsControllerSecurityTest {
    private static final String PATH = "/api/exams/dashboard-analytics";
    private static final Set<String> FORBIDDEN_KEYS = Set.of(
            "userAnswer", "correctAnswer", "explanation", "resultJson",
            "answers", "questionSnapshots", "rawSnapshot"
    );

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean ExamAttemptRepository repository;
    @MockitoBean AuthService authService;

    @Test
    void anonymousIsUnauthorized() throws Exception {
        mockMvc.perform(get(PATH))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void invalidRangeAndRecentLimitsReturnBadRequest() throws Exception {
        UserPrincipal owner = principal((byte) 1);
        mockMvc.perform(get(PATH).param("range", "14d").with(auth(owner)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DASHBOARD_RANGE"));
        mockMvc.perform(get(PATH).param("recentLimit", "0").with(auth(owner)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECENT_LIMIT"));
        mockMvc.perform(get(PATH).param("recentLimit", "11").with(auth(owner)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECENT_LIMIT"));
    }

    @Test
    void authenticatedEmptyResponseUsesExactVersionedContract() throws Exception {
        UserPrincipal owner = principal((byte) 2);
        mockMvc.perform(get(PATH).with(auth(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.schemaVersion").value(1))
                .andExpect(jsonPath("$.data.scope.policyVersion").value("dashboard-v1"))
                .andExpect(jsonPath("$.data.scope.timezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.data.summary.totalAttempts").value(0));
    }

    @Test
    void authenticatedOwnerGetsOnlyOwnerScopedProjectionAndNoRawKeys() throws Exception {
        UserPrincipal owner = principal((byte) 3);
        ExamAttemptRepository.DashboardAttemptView row = row();
        when(repository.countDashboardAttempts(
                argThat(value -> Arrays.equals(value, owner.idBytes())), any(), any(), any()
        )).thenReturn(1L);
        when(repository.findDashboardAttempts(
                argThat(value -> Arrays.equals(value, owner.idBytes())), any(), any(), any(), any()
        )).thenReturn(List.of(row));

        MvcResult result = mockMvc.perform(get(PATH).with(auth(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.totalAttempts").value(1))
                .andExpect(jsonPath("$.data.recentAttempts[0].attemptId").value("owner-attempt"))
                .andReturn();

        JsonNode root = mapper.readTree(result.getResponse().getContentAsString());
        assertNoForbiddenKeys(root);
        var ownerCaptor = org.mockito.ArgumentCaptor.forClass(byte[].class);
        verify(repository).findDashboardAttempts(ownerCaptor.capture(), any(), any(), any(), any());
        assertArrayEquals(owner.idBytes(), ownerCaptor.getValue());
    }

    private ExamAttemptRepository.DashboardAttemptView row() {
        ExamAttemptRepository.DashboardAttemptView row = mock(ExamAttemptRepository.DashboardAttemptView.class);
        when(row.getSessionId()).thenReturn("owner-attempt");
        when(row.getMode()).thenReturn("TIMED_ORIGINAL");
        when(row.getTitle()).thenReturn("Owner attempt");
        when(row.getTotalScore()).thenReturn(BigDecimal.valueOf(8));
        when(row.getMcqScore()).thenReturn(BigDecimal.ZERO);
        when(row.getTfScore()).thenReturn(BigDecimal.ZERO);
        when(row.getTotalQuestions()).thenReturn(1);
        when(row.getDurationSeconds()).thenReturn(60);
        when(row.getSubmittedAt()).thenReturn(Instant.parse("2026-07-20T00:00:00Z"));
        when(row.getCreatedAt()).thenReturn(Instant.parse("2026-07-20T00:00:00Z"));
        when(row.getSnapshotSchemaVersion()).thenReturn(1);
        when(row.getScoreAuthority()).thenReturn("BACKEND");
        when(row.getTimingAuthority()).thenReturn("SERVER");
        when(row.getSubmissionOrigin()).thenReturn("SERVER_ON_TIME");
        when(row.getScoringVersion()).thenReturn("v1");
        when(row.getDatasetVersion()).thenReturn("dataset");
        when(row.getResultJson()).thenReturn("{}");
        return row;
    }

    private UserPrincipal principal(byte marker) {
        byte[] id = new byte[16];
        Arrays.fill(id, marker);
        return new UserPrincipal("principal-" + marker, id, "not-returned@example.invalid", List.of("student"));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor auth(UserPrincipal principal) {
        var authentication = new UsernamePasswordAuthenticationToken(
                principal,
                "n/a",
                List.of(new SimpleGrantedAuthority("ROLE_student"))
        );
        return authentication(authentication);
    }

    private void assertNoForbiddenKeys(JsonNode node) {
        if (node.isObject()) {
            for (var property : node.properties()) {
                assertFalse(FORBIDDEN_KEYS.contains(property.getKey()), property.getKey());
                assertNoForbiddenKeys(property.getValue());
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) assertNoForbiddenKeys(item);
        }
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {}
}
