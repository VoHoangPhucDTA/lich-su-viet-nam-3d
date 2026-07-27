package com.lichsuvn.backend.progress.api;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.progress.api.dto.ProfileLearningSummaryDto;
import com.lichsuvn.backend.progress.application.ProgressService;
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

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProgressController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        ProfileLearningSummaryControllerTest.EnableSecurity.class
})
class ProfileLearningSummaryControllerTest {
    private static final String PATH = "/api/progress/me/learning-summary";

    @Autowired MockMvc mockMvc;
    @MockitoBean ProgressService progressService;
    @MockitoBean AuthService authService;

    @Test
    void rejectsAnonymousRequest() throws Exception {
        mockMvc.perform(get(PATH))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void returnsOnlyTheVersionedOwnerSummary() throws Exception {
        UserPrincipal owner = new UserPrincipal("owner", new byte[16], "private@example.test", List.of("student"));
        when(progressService.findMyLearningSummary(same(owner))).thenReturn(new ProfileLearningSummaryDto(
                1,
                Instant.parse("2026-07-27T03:00:00Z"),
                "Asia/Ho_Chi_Minh",
                9,
                3,
                125,
                4
        ));

        var token = new UsernamePasswordAuthenticationToken(
                owner,
                "n/a",
                List.of(new SimpleGrantedAuthority("ROLE_student"))
        );
        mockMvc.perform(get(PATH).with(authentication(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.schemaVersion").value(1))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.data.eventsViewed").value(9))
                .andExpect(jsonPath("$.data.quizzesCompleted").value(3))
                .andExpect(jsonPath("$.data.totalMinutes").value(125))
                .andExpect(jsonPath("$.data.streakDays").value(4))
                .andExpect(jsonPath("$.data.rankPercentile").doesNotExist())
                .andExpect(jsonPath("$.data.progressByGrade").doesNotExist());
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}
