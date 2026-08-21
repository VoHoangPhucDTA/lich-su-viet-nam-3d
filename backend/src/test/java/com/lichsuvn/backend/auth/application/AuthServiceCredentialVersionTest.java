package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.domain.AuthEmailTokenEntity;
import com.lichsuvn.backend.auth.api.dto.ChangePasswordRequest;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.api.dto.ResetPasswordRequest;
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
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

class AuthServiceCredentialVersionTest {
    private UserRepository users;
    private JwtService jwt;
    private PasswordEncoder passwords;
    private AuthEmailTokenRepository tokenRepository;
    private AuthTokenService authTokenService;
    private PasswordPolicy passwordPolicy;
    private AuthService service;
    private UUID userId;
    private UserEntity user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        jwt = mock(JwtService.class);
        passwords = mock(PasswordEncoder.class);
        tokenRepository = mock(AuthEmailTokenRepository.class);
        authTokenService = mock(AuthTokenService.class);
        passwordPolicy = mock(PasswordPolicy.class);
        service = new AuthService(
                users,
                mock(RoleRepository.class),
                tokenRepository,
                passwords,
                jwt,
                authTokenService,
                passwordPolicy,
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

    @Test
    void successfulChangePasswordBumpsVersionAndInvalidatesBothOldTokenTypes() {
        user.setAuthVersion(3);
        var principal = principal();
        when(passwords.matches("old-password", "hash")).thenReturn(true);
        when(passwords.matches("old-password", "new-hash")).thenReturn(false);
        when(passwords.matches("new-password", "new-hash")).thenReturn(true);
        when(passwords.encode("new-password")).thenReturn("new-hash");
        when(jwt.parseAndValidate("old-access", "access")).thenReturn(claims("access", 3));
        when(jwt.parseAndValidate("old-refresh", "refresh")).thenReturn(claims("refresh", 3));
        when(jwt.parseAndValidate("new-access", "access")).thenReturn(claims("access", 4));
        when(jwt.parseAndValidate("new-refresh", "refresh")).thenReturn(claims("refresh", 4));
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));

        assertDoesNotThrow(() ->
                service.changePassword(principal, new ChangePasswordRequest("old-password", "new-password")));

        assertEquals(4, user.getAuthVersion());
        assertInvalid(() -> service.principalFromAccessToken("old-access"));
        assertInvalid(() -> service.refreshByToken("old-refresh"));
        assertThrows(ApiException.class, () -> service.login(new LoginRequest(user.getEmail(), "old-password")));
        assertDoesNotThrow(() -> service.login(new LoginRequest(user.getEmail(), "new-password")));
        verify(jwt).createAccessToken(userId.toString(), user.getEmail(), List.of(), 4);
        verify(jwt).createRefreshToken(userId.toString(), user.getEmail(), List.of(), 4);
        assertDoesNotThrow(() -> service.principalFromAccessToken("new-access"));
        assertDoesNotThrow(() -> service.refreshByToken("new-refresh"));
    }

    @Test
    void successfulResetPasswordBumpsVersionInvalidatesTokensAndConsumesResetTokenOnce() {
        user.setAuthVersion(8);
        AuthEmailTokenEntity resetToken = usableResetToken();
        when(authTokenService.hashToken("reset-token")).thenReturn("reset-hash");
        when(tokenRepository.findByTokenHashAndTokenType("reset-hash", "password_reset"))
                .thenReturn(Optional.of(resetToken));
        when(passwords.encode("NewPassword123!")).thenReturn("new-reset-hash");
        when(passwords.matches("old-password", "new-reset-hash")).thenReturn(false);
        when(passwords.matches("NewPassword123!", "new-reset-hash")).thenReturn(true);
        when(jwt.parseAndValidate("old-access", "access")).thenReturn(claims("access", 8));
        when(jwt.parseAndValidate("old-refresh", "refresh")).thenReturn(claims("refresh", 8));
        when(jwt.parseAndValidate("new-access", "access")).thenReturn(claims("access", 9));
        when(jwt.parseAndValidate("new-refresh", "refresh")).thenReturn(claims("refresh", 9));
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));

        assertDoesNotThrow(() -> service.resetPassword(
                new ResetPasswordRequest("reset-token", "NewPassword123!")));

        assertEquals(9, user.getAuthVersion());
        assertTrue(resetToken.getUsedAt() != null);
        assertInvalid(() -> service.principalFromAccessToken("old-access"));
        assertInvalid(() -> service.refreshByToken("old-refresh"));
        assertThrows(ApiException.class, () -> service.login(new LoginRequest(user.getEmail(), "old-password")));
        assertDoesNotThrow(() -> service.login(new LoginRequest(user.getEmail(), "NewPassword123!")));
        verify(jwt).createAccessToken(userId.toString(), user.getEmail(), List.of(), 9);
        verify(jwt).createRefreshToken(userId.toString(), user.getEmail(), List.of(), 9);
        assertDoesNotThrow(() -> service.principalFromAccessToken("new-access"));
        assertDoesNotThrow(() -> service.refreshByToken("new-refresh"));

        assertThrows(ApiException.class, () -> service.resetPassword(
                new ResetPasswordRequest("reset-token", "AnotherPassword123!")));
        assertEquals(9, user.getAuthVersion());
        verify(passwords).encode("NewPassword123!");
        verify(passwords, never()).encode("AnotherPassword123!");
    }

    @Test
    void failedChangePasswordDoesNotBumpVersionForWrongPasswordOrPolicyFailure() {
        user.setAuthVersion(5);
        var principal = principal();
        when(passwords.matches("wrong-password", "hash")).thenReturn(false);
        assertThrows(ApiException.class, () ->
                service.changePassword(principal, new ChangePasswordRequest("wrong-password", "NewPassword123!")));
        assertEquals(5, user.getAuthVersion());

        when(passwords.matches("old-password", "hash")).thenReturn(true);
        doThrow(new ApiException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "WEAK_PASSWORD",
                "weak")).when(passwordPolicy).validate("weak");
        assertThrows(ApiException.class, () ->
                service.changePassword(principal, new ChangePasswordRequest("old-password", "weak")));
        assertEquals(5, user.getAuthVersion());
        verify(passwords, never()).encode("weak");
    }

    @Test
    void failedResetPasswordDoesNotBumpVersionForInvalidOrUsedToken() {
        user.setAuthVersion(6);
        when(authTokenService.hashToken("invalid-token")).thenReturn("invalid-hash");
        when(tokenRepository.findByTokenHashAndTokenType("invalid-hash", "password_reset"))
                .thenReturn(Optional.empty());
        assertThrows(ApiException.class, () -> service.resetPassword(
                new ResetPasswordRequest("invalid-token", "NewPassword123!")));
        assertEquals(6, user.getAuthVersion());

        AuthEmailTokenEntity expiredToken = usableResetToken();
        expiredToken.setExpiresAt(Instant.now().minusSeconds(1));
        when(authTokenService.hashToken("expired-token")).thenReturn("expired-hash");
        when(tokenRepository.findByTokenHashAndTokenType("expired-hash", "password_reset"))
                .thenReturn(Optional.of(expiredToken));
        assertThrows(ApiException.class, () -> service.resetPassword(
                new ResetPasswordRequest("expired-token", "NewPassword123!")));
        assertEquals(6, user.getAuthVersion());

        AuthEmailTokenEntity usedToken = usableResetToken();
        usedToken.setUsedAt(Instant.now().minusSeconds(1));
        when(authTokenService.hashToken("used-token")).thenReturn("used-hash");
        when(tokenRepository.findByTokenHashAndTokenType("used-hash", "password_reset"))
                .thenReturn(Optional.of(usedToken));
        assertThrows(ApiException.class, () -> service.resetPassword(
                new ResetPasswordRequest("used-token", "NewPassword123!")));
        assertEquals(6, user.getAuthVersion());
        verify(passwords, never()).encode("NewPassword123!");
    }

    private com.lichsuvn.backend.auth.security.UserPrincipal principal() {
        return new com.lichsuvn.backend.auth.security.UserPrincipal(
                userId.toString(), user.getId(), user.getEmail(), List.of("student"));
    }

    private AuthEmailTokenEntity usableResetToken() {
        AuthEmailTokenEntity token = new AuthEmailTokenEntity();
        token.setUser(user);
        token.setTokenType("password_reset");
        token.setExpiresAt(Instant.now().plusSeconds(300));
        return token;
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
