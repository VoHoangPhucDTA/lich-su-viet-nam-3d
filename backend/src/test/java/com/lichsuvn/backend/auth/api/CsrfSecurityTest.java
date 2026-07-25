package com.lichsuvn.backend.auth.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.api.dto.RegisterRequest;
import com.lichsuvn.backend.auth.api.dto.RegisterResponseDto;
import com.lichsuvn.backend.auth.application.AuthRateLimiter;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.application.AuthSession;
import com.lichsuvn.backend.auth.application.SocialAuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        CsrfSecurityTest.EnableSecurity.class
})
@TestPropertySource(properties = {
        "app.allowed-origins=http://localhost:5173",
        "app.cookie.secure=false",
        "app.cookie.same-site=Lax"
})
class CsrfSecurityTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockitoBean
    AuthService authService;

    @MockitoBean
    AuthRateLimiter authRateLimiter;

    @MockitoBean
    SocialAuthService socialAuthService;

    @Test
    void anonymousAndAuthenticatedClientsCanBootstrapPersistedCsrfTokens() throws Exception {
        CsrfContract anonymous = csrf();
        assertNotNull(anonymous.cookie());

        MvcResult authenticatedResult = mockMvc.perform(get("/api/auth/csrf")
                        .cookie(anonymous.cookie())
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data", aMapWithSize(2)))
                .andExpect(jsonPath("$.data.token").isString())
                .andExpect(jsonPath("$.data.headerName").value("X-CSRF-TOKEN"))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist())
                .andReturn();

        CsrfContract authenticated = contract(authenticatedResult);
        assertNotEquals(anonymous.token(), authenticated.token());
        assertEquals(authenticated.token(), authenticated.cookie().getValue());
    }

    @Test
    void loginAndRegistrationRequireCsrfBeforeControllerLogic() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"email\":\"admin@example.test\",\"password\":\"password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        mockMvc.perform(post("/api/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"fullName":"Admin User","email":"admin@example.test",
                                 "password":"Password123!","confirmPassword":"Password123!"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        verifyNoInteractions(authService);
    }

    @Test
    void invalidCsrfIsRejectedBeforeControllerLogic() throws Exception {
        CsrfContract csrf = csrf();

        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), "wrong-token")
                        .contentType("application/json")
                        .content("{\"email\":\"admin@example.test\",\"password\":\"password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        verifyNoInteractions(authService);
    }

    @Test
    void validCsrfAllowsLoginAndRegistrationToReachControllers() throws Exception {
        AuthSession session = authSession();
        when(authService.login(any(LoginRequest.class))).thenReturn(session);
        when(authService.register(any(RegisterRequest.class))).thenReturn(new RegisterResponseDto(
                session.user(),
                session.user().email(),
                "pending_verification",
                Instant.parse("2026-01-01T00:10:00Z"),
                600,
                "registered",
                null
        ));

        CsrfContract loginCsrf = csrf();
        mockMvc.perform(post("/api/auth/login")
                        .cookie(loginCsrf.cookie())
                        .header(loginCsrf.headerName(), loginCsrf.token())
                        .contentType("application/json")
                        .content("{\"email\":\"admin@example.test\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("access_token", true))
                .andExpect(jsonPath("$.data.user.id").value("user-1"))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist());

        CsrfContract registerCsrf = csrf();
        mockMvc.perform(post("/api/auth/register")
                        .cookie(registerCsrf.cookie())
                        .header(registerCsrf.headerName(), registerCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"fullName":"Admin User","email":"admin@example.test",
                                 "password":"Password123!","confirmPassword":"Password123!"}
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void refreshLogoutAndProfileMutationRequireCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refresh_token", "refresh-token")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(post("/api/auth/me/update")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        verifyNoInteractions(authService);
    }

    @Test
    void validCsrfAllowsRefreshAndLogout() throws Exception {
        when(authService.refreshByToken("refresh-token")).thenReturn(authSession());

        CsrfContract refreshCsrf = csrf();
        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(refreshCsrf.cookie(), new Cookie("refresh_token", "refresh-token"))
                        .header(refreshCsrf.headerName(), refreshCsrf.token()))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(jsonPath("$.data.accessToken").doesNotExist())
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist());

        CsrfContract logoutCsrf = csrf();
        mockMvc.perform(post("/api/auth/logout")
                        .cookie(logoutCsrf.cookie())
                        .header(logoutCsrf.headerName(), logoutCsrf.token()))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("access_token", 0))
                .andExpect(cookie().maxAge("refresh_token", 0));
    }

    @Test
    void approvedCredentialedCorsAndPreflightAllowCsrfAndEventVersionHeaders() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-csrf-token"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Headers",
                        org.hamcrest.Matchers.containsStringIgnoringCase("x-csrf-token")));

        mockMvc.perform(get("/api/auth/csrf")
                        .header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));

        mockMvc.perform(options("/api/admin/events/event-1/media/41")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "DELETE")
                        .header("Access-Control-Request-Headers",
                                "x-csrf-token,x-event-version"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Headers",
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.containsStringIgnoringCase("x-csrf-token"),
                                org.hamcrest.Matchers.containsStringIgnoringCase("x-event-version"))));
    }

    @Test
    void unapprovedOriginReceivesNoCredentialedCorsPermission() throws Exception {
        mockMvc.perform(options("/api/admin/events/event-1/media/41")
                        .header("Origin", "https://unapproved.example")
                        .header("Access-Control-Request-Method", "DELETE")
                        .header("Access-Control-Request-Headers",
                                "x-csrf-token,x-event-version"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }

    @Test
    void wildcardOriginIsRejectedWhenCredentialsAreEnabled() {
        SecurityConfig config = new SecurityConfig();
        ReflectionTestUtils.setField(
                config,
                "allowedOriginsRaw",
                "http://localhost:5173, , *"
        );

        assertThrows(IllegalStateException.class, config::corsConfigurationSource);
    }

    private CsrfContract csrf() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(cookie().httpOnly("CSRF-TOKEN", true))
                .andExpect(cookie().path("CSRF-TOKEN", "/"))
                .andReturn();
        CsrfContract contract = contract(result);
        assertEquals(contract.token(), contract.cookie().getValue());
        return contract;
    }

    private CsrfContract contract(MvcResult result) throws Exception {
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
        Cookie effectiveCookie = Arrays.stream(result.getResponse().getCookies())
                .filter(cookie -> "CSRF-TOKEN".equals(cookie.getName()))
                .reduce((previous, current) -> current)
                .orElse(null);
        return new CsrfContract(
                data.get("token").asText(),
                data.get("headerName").asText(),
                effectiveCookie
        );
    }

    private AuthSession authSession() {
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
        return new AuthSession("access-token", "refresh-token", user);
    }

    private record CsrfContract(String token, String headerName, Cookie cookie) {
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}
