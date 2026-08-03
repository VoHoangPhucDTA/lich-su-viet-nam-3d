package com.lichsuvn.backend.auth.security;

import com.lichsuvn.backend.auth.application.AuthService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JwtAuthenticationFilterCookieOnlyTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void bearerHeaderNeverAuthenticates() throws Exception {
        AuthService authService = mock(AuthService.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authService);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/dashboard");
        request.addHeader("Authorization", "Bearer legacy-token");

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        verifyNoInteractions(authService);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void httpOnlyCookieValueRemainsTheOnlyAccessCredential() throws Exception {
        AuthService authService = mock(AuthService.class);
        UserPrincipal principal = new UserPrincipal(
                "00000000-0000-0000-0000-000000000001",
                new byte[16],
                "admin@example.invalid",
                List.of("admin"));
        when(authService.principalFromAccessToken("cookie-token")).thenReturn(principal);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authService);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/dashboard");
        request.setCookies(new Cookie("access_token", "cookie-token"));

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        verify(authService).principalFromAccessToken("cookie-token");
        assertEquals(principal,
                SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    }
}
