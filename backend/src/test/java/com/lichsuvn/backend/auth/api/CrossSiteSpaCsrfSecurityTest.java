package com.lichsuvn.backend.auth.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.application.AuthRateLimiter;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.application.AuthSession;
import com.lichsuvn.backend.auth.application.SocialAuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.tts.api.NarrationController;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetResponse;
import com.lichsuvn.backend.tts.application.NarrationService;
import com.lichsuvn.backend.tts.application.TtsAudioAssetService;
import com.lichsuvn.backend.tts.application.TtsJobManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reproduces the production failure seen from
 * {@code https://relaxed-torte-7d1eca.netlify.app} calling
 * {@code https://lich-su-viet-nam-3d.onrender.com}: two different sites.
 *
 * <p>The SPA's {@code fetch()} carries the {@code X-CSRF-TOKEN} header, but the
 * {@code CSRF-TOKEN} cookie is only attached when the browser considers the
 * cookie's SameSite attribute compatible with a cross-site request. This test
 * runs the real filter chain with a cross-site allowed origin and asserts both
 * halves of the contract: the cookie is issued {@code SameSite=None; Secure},
 * and a request that reaches the server without it is rejected with
 * {@code CSRF_TOKEN_INVALID} (the exact production error) instead of silently
 * passing.</p>
 */
@WebMvcTest({AuthController.class, NarrationController.class})
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        CrossSiteSpaCsrfSecurityTest.EnableSecurity.class
})
@TestPropertySource(properties = {
        "app.allowed-origins=https://relaxed-torte-7d1eca.netlify.app",
        "app.tts.asset-flow-enabled=true"
})
class CrossSiteSpaCsrfSecurityTest {

    private static final String NETLIFY_ORIGIN = "https://relaxed-torte-7d1eca.netlify.app";

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

    @MockitoBean
    TtsJobManager jobManager;

    @MockitoBean
    NarrationService narrationService;

    @MockitoBean
    TtsAudioAssetService audioAssetService;

    @Test
    void csrfBootstrapIssuesCrossSiteCookieWithMatchingToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(cookie().httpOnly("CSRF-TOKEN", true))
                .andExpect(cookie().path("CSRF-TOKEN", "/"))
                // Without these two attributes the browser never attaches the
                // cookie to a Netlify → Render request, and every POST fails.
                .andExpect(cookie().secure("CSRF-TOKEN", true))
                .andExpect(cookie().sameSite("CSRF-TOKEN", "None"))
                .andExpect(jsonPath("$.data.headerName").value("X-CSRF-TOKEN"))
                .andReturn();

        Cookie cookie = csrfCookie(result);
        String token = objectMapper
                .readTree(result.getResponse().getContentAsString())
                .at("/data/token").asText();
        assertEquals(token, cookie.getValue());
    }

    @Test
    void loginIsRejectedWithoutTheCrossSiteCookieAndSucceedsWithIt() throws Exception {
        // Cookie withheld (SameSite/Secure mismatch) → the production 403.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@example.test\",\"password\":\"password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        // Cookie attached → the request reaches the controller.
        when(authService.login(any(LoginRequest.class))).thenReturn(authSession());
        CsrfContract csrf = csrf();

        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@example.test\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(cookie().secure("access_token", true))
                .andExpect(cookie().sameSite("access_token", "None"))
                .andExpect(cookie().secure("refresh_token", true))
                .andExpect(cookie().sameSite("refresh_token", "None"))
                .andExpect(jsonPath("$.data.user.id").value("user-1"));
    }

    @Test
    void narrationMutationRequiresCsrfWhileNarrationReadStaysSafe() throws Exception {
        // The narration ("Nghe tường thuật") button posts here. Without the
        // cross-site cookie this is the failing production request.
        mockMvc.perform(post("/api/tts/events/event-1/audio")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voice\":\"hcm-diemmy\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        when(audioAssetService.requestAsset(eq("event-1"), any()))
                .thenReturn(pendingAsset());
        CsrfContract csrf = csrf();

        mockMvc.perform(post("/api/tts/events/event-1/audio")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voice\":\"hcm-diemmy\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.status").value("pending"));

        // Reading a narration asset is a safe method: no CSRF bootstrap needed.
        when(audioAssetService.getAsset("asset-1")).thenReturn(pendingAsset());
        mockMvc.perform(get("/api/tts/audio-assets/asset-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assetId").value("asset-1"));
    }

    @Test
    void approvedNetlifyOriginGetsCredentialedPreflightAndSimpleRequests() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", NETLIFY_ORIGIN)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-csrf-token"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", NETLIFY_ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Headers",
                        containsStringIgnoringCase("x-csrf-token")));

        mockMvc.perform(get("/api/auth/csrf").header("Origin", NETLIFY_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", NETLIFY_ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void unapprovedOriginGetsNoCredentialedCorsPermission() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-csrf-token"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }

    private CsrfContract csrf() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(cookie().httpOnly("CSRF-TOKEN", true))
                .andReturn();
        String token = objectMapper
                .readTree(result.getResponse().getContentAsString())
                .at("/data/token").asText();
        Cookie cookie = csrfCookie(result);
        assertNotNull(cookie);
        assertEquals(token, cookie.getValue());
        return new CsrfContract(token, "X-CSRF-TOKEN", cookie);
    }

    private Cookie csrfCookie(MvcResult result) {
        for (Cookie cookie : result.getResponse().getCookies()) {
            if ("CSRF-TOKEN".equals(cookie.getName())) {
                return cookie;
            }
        }
        throw new AssertionError("CSRF-TOKEN cookie was not issued");
    }

    private TtsAudioAssetResponse pendingAsset() {
        return new TtsAudioAssetResponse(
                "pending",
                "asset-1",
                "event-1",
                null,
                "hcm-diemmy",
                false,
                false,
                false,
                null,
                null,
                null,
                "Đang tạo âm thanh tường thuật",
                null
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
