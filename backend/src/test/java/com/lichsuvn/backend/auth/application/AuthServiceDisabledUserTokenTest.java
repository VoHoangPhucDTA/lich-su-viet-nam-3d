package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.domain.UserEntity;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthServiceDisabledUserTokenTest {

    private UserRepository userRepository;
    private JwtService jwtService;
    private AuthService authService;
    private UUID userId;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        jwtService = mock(JwtService.class);
        authService = new AuthService(
                userRepository,
                mock(RoleRepository.class),
                mock(AuthEmailTokenRepository.class),
                mock(PasswordEncoder.class),
                jwtService,
                mock(AuthTokenService.class),
                mock(PasswordPolicy.class),
                mock(EmailService.class),
                mock(CloudinaryService.class),
                "http://localhost:5173",
                10
        );

        userId = UUID.randomUUID();
        UserEntity disabledUser = new UserEntity();
        disabledUser.setId(UuidBytes.fromUuid(userId));
        disabledUser.setEmail("disabled@example.test");
        disabledUser.setStatus("disabled");
        when(userRepository.findById(UuidBytes.fromUuid(userId))).thenReturn(Optional.of(disabledUser));
    }

    @Test
    void disabledUserCannotContinueWithAnExistingAccessToken() {
        when(jwtService.parseAndValidate("existing-access", "access"))
                .thenReturn(claims("access"));

        ApiException error = assertThrows(ApiException.class, () ->
                authService.principalFromAccessToken("existing-access"));

        assertEquals("INVALID_TOKEN", error.getCode());
    }

    @Test
    void disabledUserCannotContinueWithAnExistingRefreshToken() {
        when(jwtService.parseAndValidate("existing-refresh", "refresh"))
                .thenReturn(claims("refresh"));

        ApiException error = assertThrows(ApiException.class, () ->
                authService.refreshByToken("existing-refresh"));

        assertEquals("INVALID_TOKEN", error.getCode());
    }

    private JwtClaims claims(String tokenType) {
        return new JwtClaims(
                userId.toString(),
                "disabled@example.test",
                List.of("student"),
                tokenType,
                Instant.now().plusSeconds(300)
        );
    }
}
