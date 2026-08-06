package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.infrastructure.AuthEmailTokenRepository;
import com.lichsuvn.backend.auth.infrastructure.RoleRepository;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.JwtClaims;
import com.lichsuvn.backend.auth.security.JwtService;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.storage.CloudinaryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceCredentialVersionTest {
    private UserRepository users;
    private JwtService jwt;
    private PasswordEncoder passwords;
    private AuthService service;
    private UUID userId;
    private UserEntity user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        jwt = mock(JwtService.class);
        passwords = mock(PasswordEncoder.class);
        service = new AuthService(
                users,
                mock(RoleRepository.class),
                mock(AuthEmailTokenRepository.class),
                passwords,
                jwt,
                mock(AuthTokenService.class),
                mock(PasswordPolicy.class),
                mock(EmailService.class),
                mock(CloudinaryService.class),
                "http://localhost:5173",
                10);
        userId = UUID.randomUUID();
        user = new UserEntity();
        user.setId(UuidBytes.fromUuid(userId));
        user.setEmail("user@example.test");
        user.setPasswordHash("hash");
        user.setStatus("active");
        when(users.findById(UuidBytes.fromUuid(userId))).thenReturn(Optional.of(user));
    }

    @Test
    void versionZeroCompatibilityAndMatchingVersionWorkForAccessAndRefresh() {
        user.setAuthVersion(0);
        when(jwt.parseAndValidate("legacy-access", "access")).thenReturn(claims("access", 0));
        when(jwt.parseAndValidate("legacy-refresh", "refresh")).thenReturn(claims("refresh", 0));
        assertEquals(userId.toString(), service.principalFromAccessToken("legacy-access").id());
        assertEquals(user.toDto(), service.refreshByToken("legacy-refresh").user());

        user.setAuthVersion(4);
        when(jwt.parseAndValidate("current-access", "access")).thenReturn(claims("access", 4));
        when(jwt.parseAndValidate("current-refresh", "refresh")).thenReturn(claims("refresh", 4));
        assertEquals(userId.toString(), service.principalFromAccessToken("current-access").id());
        assertEquals(user.toDto(), service.refreshByToken("current-refresh").user());
    }

    @Test
    void legacyOrStaleCredentialsFailAfterDatabaseVersionAdvances() {
        user.setAuthVersion(1);
        when(jwt.parseAndValidate("legacy-access", "access")).thenReturn(claims("access", 0));
        when(jwt.parseAndValidate("legacy-refresh", "refresh")).thenReturn(claims("refresh", 0));
        assertInvalid(() -> service.principalFromAccessToken("legacy-access"));
        assertInvalid(() -> service.refreshByToken("legacy-refresh"));

        user.setAuthVersion(2);
        when(jwt.parseAndValidate("stale-access", "access")).thenReturn(claims("access", 1));
        when(jwt.parseAndValidate("stale-refresh", "refresh")).thenReturn(claims("refresh", 1));
        assertInvalid(() -> service.principalFromAccessToken("stale-access"));
        assertInvalid(() -> service.refreshByToken("stale-refresh"));
    }

    @Test
    void adminSelfDeleteIsQuarantinedBeforeStorageOrStatusMutation() {
        user.setStatus("active");
        var principal = new com.lichsuvn.backend.auth.security.UserPrincipal(
                userId.toString(), user.getId(), user.getEmail(), List.of("admin"));
        ApiException error = assertThrows(ApiException.class, () -> service.deleteAccount(principal));
        assertEquals("ADMIN_SELF_MUTATION_FORBIDDEN", error.getCode());
        assertEquals("active", user.getStatus());
    }

    @Test
    void disableReactivateAndFreshLoginKeepOriginalCredentialsPermanentlyInvalid() {
        user.setAuthVersion(0);
        when(jwt.parseAndValidate("original-access", "access")).thenReturn(claims("access", 0));
        when(jwt.parseAndValidate("original-refresh", "refresh")).thenReturn(claims("refresh", 0));
        assertEquals(userId.toString(), service.principalFromAccessToken("original-access").id());

        user.setStatus("disabled");
        user.setAuthVersion(1);
        assertInvalid(() -> service.principalFromAccessToken("original-access"));
        assertInvalid(() -> service.refreshByToken("original-refresh"));

        user.setStatus("active");
        user.setAuthVersion(2);
        assertInvalid(() -> service.principalFromAccessToken("original-access"));
        assertInvalid(() -> service.refreshByToken("original-refresh"));

        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwords.matches("password", "hash")).thenReturn(true);
        service.login(new LoginRequest(user.getEmail(), "password"));
        verify(jwt).createAccessToken(
                userId.toString(), user.getEmail(), List.of(), 2);
        verify(jwt).createRefreshToken(
                userId.toString(), user.getEmail(), List.of(), 2);

        when(jwt.parseAndValidate("fresh-access", "access")).thenReturn(claims("access", 2));
        when(jwt.parseAndValidate("fresh-refresh", "refresh")).thenReturn(claims("refresh", 2));
        assertEquals(userId.toString(), service.principalFromAccessToken("fresh-access").id());
        assertEquals(user.toDto(), service.refreshByToken("fresh-refresh").user());
    }

    private JwtClaims claims(String type, long version) {
        return new JwtClaims(
                userId.toString(),
                user.getEmail(),
                List.of("student"),
                type,
                version,
                Instant.now().plusSeconds(300));
    }

    private void assertInvalid(org.junit.jupiter.api.function.Executable executable) {
        ApiException error = assertThrows(ApiException.class, executable);
        assertEquals("INVALID_TOKEN", error.getCode());
        assertTrue(error.getStatus().is4xxClientError());
    }
}
