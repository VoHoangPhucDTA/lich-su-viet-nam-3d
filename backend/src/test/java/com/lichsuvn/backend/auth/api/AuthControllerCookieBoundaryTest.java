package com.lichsuvn.backend.auth.api;

import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.application.AuthRateLimiter;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.application.AuthSession;
import com.lichsuvn.backend.auth.application.SocialAuthService;
import com.lichsuvn.backend.auth.application.VerifyEmailResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerCookieBoundaryTest {

    private AuthService authService;
    private SocialAuthService socialAuthService;
    private MockMvc mockMvc;
    private AuthSession session;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        socialAuthService = mock(SocialAuthService.class);
        AuthController controller = new AuthController(
                authService,
                mock(AuthRateLimiter.class),
                socialAuthService
        );
        ReflectionTestUtils.setField(controller, "cookieSecure", false);
        ReflectionTestUtils.setField(controller, "cookieSameSite", "Lax");
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        AuthUserDto user = new AuthUserDto(
                "user-1",
                "Admin User",
                "admin@example.test",
                "admin",
                List.of("admin"),
                List.of(),
                "other",
                null,
                null,
                Instant.parse("2026-01-01T00:00:00Z")
        );
        session = new AuthSession("opaque-access", "opaque-refresh", user);
    }

    @Test
    void loginIssuesHttpOnlyCookiesWithoutSerializingTokens() throws Exception {
        when(authService.login(any(LoginRequest.class))).thenReturn(session);

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("""
                                {"email":"admin@example.test","password":"password"}
                                """))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(jsonPath("$.data.user.id").value("user-1"))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist());
    }

    @Test
    void refreshUsesCookieAndReturnsOnlyTheUserContract() throws Exception {
        when(authService.refreshByToken("existing-refresh")).thenReturn(session);

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new jakarta.servlet.http.Cookie("refresh_token", "existing-refresh")))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(jsonPath("$.data.user.email").value("admin@example.test"))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist());
    }

    @Test
    void socialLoginUsesTheSameCookieOnlyResponseBoundary() throws Exception {
        when(socialAuthService.loginWithGoogle(anyString())).thenReturn(session);

        mockMvc.perform(post("/api/auth/oauth/google")
                        .contentType("application/json")
                        .content("""
                                {"provider":"google","token":"provider-token"}
                                """))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(jsonPath("$.data.user.role").value("admin"))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist());
    }

    @Test
    void verifiedEmailIssuesCookiesWithoutExposingTokens() throws Exception {
        when(authService.verifyEmail("verification-token"))
                .thenReturn(new VerifyEmailResult("verified", session));

        mockMvc.perform(get("/api/auth/verify-email")
                        .param("token", "verification-token"))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(jsonPath("$.data.auth.user.id").value("user-1"))
                .andExpect(jsonPath("$.data.auth.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.auth.refreshToken").doesNotExist());
    }
}
