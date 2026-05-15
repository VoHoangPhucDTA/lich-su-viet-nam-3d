package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.api.dto.AuthResponseDto;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.ForgotPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.api.dto.RefreshRequest;
import com.lichsuvn.backend.auth.api.dto.RegisterResponseDto;
import com.lichsuvn.backend.auth.api.dto.RegisterRequest;
import com.lichsuvn.backend.auth.api.dto.ResendVerificationRequest;
import com.lichsuvn.backend.auth.api.dto.ResetPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.VerifyEmailResponseDto;
import com.lichsuvn.backend.auth.domain.AuthEmailTokenEntity;
import com.lichsuvn.backend.auth.domain.RoleEntity;
import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.infrastructure.AuthEmailTokenRepository;
import com.lichsuvn.backend.auth.infrastructure.RoleRepository;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.JwtClaims;
import com.lichsuvn.backend.auth.security.JwtService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.MessageDto;
import com.lichsuvn.backend.common.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final Set<String> SUPPORTED_GRADES = Set.of("10", "11", "12", "other");
    private static final int MAX_FAILED_LOGINS = 5;
    private static final Duration ACCOUNT_LOCK_DURATION = Duration.ofMinutes(15);
    private static final Duration PASSWORD_RESET_TTL = Duration.ofMinutes(30);

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final AuthEmailTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthTokenService authTokenService;
    private final PasswordPolicy passwordPolicy;
    private final EmailService emailService;
    private final String frontendBaseUrl;
    private final Duration emailVerificationTtl;

    public AuthService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            AuthEmailTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthTokenService authTokenService,
            PasswordPolicy passwordPolicy,
            EmailService emailService,
            @Value("${app.frontend-base-url:https://localhost:5173}") String frontendBaseUrl,
            @Value("${app.auth.email-verification-minutes:10}") long emailVerificationMinutes) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authTokenService = authTokenService;
        this.passwordPolicy = passwordPolicy;
        this.emailService = emailService;
        this.frontendBaseUrl = normalizeFrontendBaseUrl(frontendBaseUrl);
        log.info("Auth email links will use frontend base URL={}", this.frontendBaseUrl);
        this.emailVerificationTtl = Duration.ofMinutes(emailVerificationMinutes);
    }

    @Transactional
    public RegisterResponseDto register(RegisterRequest request) {
        passwordPolicy.validate(request.password());
        String grade = normalizeGrade(request.grade());
        String email = normalizeEmail(request.email());
        userRepository.findByEmail(email).ifPresent(existing -> {
            // Bước 6A.2.1: AuthService.java: truy vấn kiểm tra Email tại MySQL
            if ("pending".equals(existing.getStatus())) {
                throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS_PENDING", "Email is registered but pending verification.");
            }
            // Bước 6A.2.3: AuthService.java: ném lỗi ApiException (400) cho AuthController.java
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS", "Email is already registered");
        });

        RoleEntity studentRole = roleRepository.findByCode("student")
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ROLE_SEED_MISSING",
                        "Student role seed is missing"));

        UserEntity user = new UserEntity();
        user.setId(UuidBytes.fromUuid(UUID.randomUUID()));
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(defaultFullName(email, request.fullName()));
        user.setGrade(grade);
        user.setSchool(StringUtils.hasText(request.school()) ? request.school().trim() : null);
        user.setStatus("pending");
        user.setRoles(Set.of(studentRole));

        // Bước 6A.1.5: AuthService.java: truy vấn kiểm tra và lưu User vào MySQL
        UserEntity saved = userRepository.save(user);
        String rawToken = createEmailToken(saved, "email_verification", emailVerificationTtl);
        String link = verificationLink(rawToken);
        // Bước 6A.1.7: AuthService.java: gửi email kích hoạt qua SMTP
        emailService.sendVerificationEmail(email, link, emailVerificationTtl.toMinutes());
        log.info("Registered pending student email={} userId={}", email, UuidBytes.toString(saved.getId()));
        // Bước 6A.1.8: AuthService.java: trả kết quả cho AuthController.java
        return toRegisterResponse(saved, link);
    }

    @Transactional
    public RegisterResponseDto resendVerification(ResendVerificationRequest request) {
        String email = normalizeEmail(request.email());
        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "VERIFICATION_UNAVAILABLE",
                        "Verification email cannot be resent"));
        if ("active".equals(user.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_VERIFIED", "Email is already verified");
        }
        if (!"pending".equals(user.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VERIFICATION_UNAVAILABLE",
                    "Verification email cannot be resent");
        }

        consumeOpenTokens(user, "email_verification");
        String rawToken = createEmailToken(user, "email_verification", emailVerificationTtl);
        String link = verificationLink(rawToken);
        emailService.sendVerificationEmail(email, link, emailVerificationTtl.toMinutes());
        return toRegisterResponse(user, link);
    }

    @Transactional
    public VerifyEmailResponseDto verifyEmail(String rawToken) {
        AuthEmailTokenEntity token = tokenRepository.findByTokenHashAndTokenType(
                authTokenService.hashToken(rawToken),
                "email_verification")
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AUTH_TOKEN",
                        "Invalid or expired token"));
        UserEntity user = token.getUser();
        if (token.getUsedAt() != null) {
            if ("active".equals(user.getStatus())) {
                return new VerifyEmailResponseDto("Email đã được xác minh trước đó.", null);
            }
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AUTH_TOKEN", "Invalid or expired token");
        }
        if (!token.getExpiresAt().isAfter(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AUTH_TOKEN", "Invalid or expired token");
        }
        user.setStatus("active");
        user.setEmailVerifiedAt(Instant.now());
        token.setUsedAt(Instant.now());
        return new VerifyEmailResponseDto("Xác minh email thành công. Bạn đã được đăng nhập tự động.",
                toAuthResponse(user));
    }

    @Transactional
    public AuthResponseDto login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        // Bước 6B.1.5: AuthService.java: truy vấn xác thực thông tin tại MySQL
        // Bước 6B.4.1: AuthService.java: truy vấn xác thực tại MySQL
        UserEntity user = userRepository.findByEmail(email)
                // Bước 6B.4.3: AuthService.java: ném lỗi ApiException (401) cho AuthController.java
                .orElseThrow(() -> invalidCredentials());

        Instant now = Instant.now();
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_LOCKED", "Account is temporarily locked");
        }
        if (!"active".equals(user.getStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "Please verify your email before logging in");
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            handleFailedLogin(user, now);
            throw invalidCredentials();
        }

        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        return toAuthResponse(user);
    }

    public AuthUserDto me(UserPrincipal principal) {
        return userRepository.findById(principal.idBytes())
                .filter(user -> "active".equals(user.getStatus()))
                .map(UserEntity::toDto)
                .orElseThrow(
                        () -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentication required"));
    }

    @Transactional
    public AuthResponseDto refresh(RefreshRequest request) {
        JwtClaims claims = jwtService.parseAndValidate(request.refreshToken(), "refresh");
        UserEntity user = userRepository.findById(UuidBytes.fromUuid(UUID.fromString(claims.subject())))
                .filter(item -> "active".equals(item.getStatus()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token"));
        return toAuthResponse(user);
    }

    public UserPrincipal principalFromAccessToken(String token) {
        JwtClaims claims = jwtService.parseAndValidate(token, "access");
        UserEntity user = userRepository.findById(UuidBytes.fromUuid(UUID.fromString(claims.subject())))
                .filter(item -> "active".equals(item.getStatus()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token"));
        return new UserPrincipal(
                UuidBytes.toString(user.getId()),
                user.getId(),
                user.getEmail(),
                roleCodes(user));
    }

    @Transactional
    public MessageDto forgotPassword(ForgotPasswordRequest request) {
        // Bước 6C.1.5: AuthService.java: kiểm tra sự tồn tại của email trong MySQL
        String email = normalizeEmail(request.email());
        userRepository.findByEmail(email).ifPresent(user -> {
            // Bước 6C.1.6: MySQL: trả về User Entity hợp lệ
            // Bước 6C.1.7: AuthService.java: tạo token và gửi email reset qua SMTP
            String rawToken = createEmailToken(user, "password_reset", PASSWORD_RESET_TTL);
            emailService.sendPasswordResetEmail(email, frontendBaseUrl + "/reset-password?token=" + rawToken);
        });
        // Bước 6C.1.8: AuthService.java: trả kết quả thành công cho AuthController.java
        return new MessageDto("Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.");
    }

    @Transactional
    public MessageDto resetPassword(ResetPasswordRequest request) {
        // Bước 6C.1.16: AuthService.java: xác thực token an toàn và mã hoá mật khẩu mới lưu vào MySQL
        passwordPolicy.validate(request.newPassword());
        AuthEmailTokenEntity token = findUsableToken(request.token(), "password_reset");
        UserEntity user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        // Bước 6C.1.17: MySQL: xác nhận cập nhật thành công và xóa token
        user.setFailedLoginCount(0);
        user.setLockedUntil(null);
        token.setUsedAt(Instant.now());
        // Bước 6C.1.18: AuthService.java: trả kết quả cho AuthController.java
        return new MessageDto("Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.");
    }

    private AuthResponseDto toAuthResponse(UserEntity user) {
        List<String> roles = roleCodes(user);
        String userIdStr = UuidBytes.toString(user.getId());
        // Bước 6B.1.7: AuthService.java: tạo JWT Token và trả về cho AuthController.java
        return new AuthResponseDto(
                jwtService.createAccessToken(userIdStr, user.getEmail(), roles),
                jwtService.createRefreshToken(userIdStr, user.getEmail(), roles),
                user.toDto()
        );
    }

    private List<String> roleCodes(UserEntity user) {
        return user.getRoles().stream().map(RoleEntity::getCode).sorted().toList();
    }

    private String createEmailToken(UserEntity user, String tokenType, Duration ttl) {
        String rawToken = authTokenService.newRawToken();
        AuthEmailTokenEntity token = new AuthEmailTokenEntity();
        token.setUser(user);
        token.setTokenHash(authTokenService.hashToken(rawToken));
        token.setTokenType(tokenType);
        token.setExpiresAt(Instant.now().plus(ttl));
        tokenRepository.save(token);
        return rawToken;
    }

    private void consumeOpenTokens(UserEntity user, String tokenType) {
        Instant now = Instant.now();
        tokenRepository.findByUserAndTokenTypeAndUsedAtIsNull(user, tokenType)
                .forEach(token -> token.setUsedAt(now));
    }

    private RegisterResponseDto toRegisterResponse(UserEntity user, String verificationLink) {
        Instant expiresAt = Instant.now().plus(emailVerificationTtl);
        return new RegisterResponseDto(
                user.toDto(),
                user.getEmail(),
                user.getStatus(),
                expiresAt,
                emailVerificationTtl.toSeconds(),
                "Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.",
                emailService.isMailEnabled() ? null : verificationLink);
    }

    private AuthEmailTokenEntity findUsableToken(String rawToken, String tokenType) {
        AuthEmailTokenEntity token = tokenRepository.findByTokenHashAndTokenType(
                authTokenService.hashToken(rawToken),
                tokenType)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AUTH_TOKEN",
                        "Invalid or expired token"));
        if (!token.isUsable(Instant.now())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AUTH_TOKEN", "Invalid or expired token");
        }
        return token;
    }

    private void handleFailedLogin(UserEntity user, Instant now) {
        int nextFailedCount = user.getFailedLoginCount() + 1;
        user.setFailedLoginCount(nextFailedCount);
        if (nextFailedCount >= MAX_FAILED_LOGINS) {
            user.setLockedUntil(now.plus(ACCOUNT_LOCK_DURATION));
        }
    }

    private String normalizeGrade(String grade) {
        if (!StringUtils.hasText(grade)) {
            return null;
        }
        String normalized = grade.trim();
        if (!SUPPORTED_GRADES.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_GRADE", "grade must be 10, 11, 12, or other");
        }
        return normalized;
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private String verificationLink(String rawToken) {
        return frontendBaseUrl + "/verify-email?token=" + rawToken;
    }

    private String normalizeFrontendBaseUrl(String value) {
        String normalized = StringUtils.hasText(value)
                ? value.trim().replaceAll("/+$", "")
                : "https://localhost:5173";
        if ("http://localhost:5173".equalsIgnoreCase(normalized)) {
            return "https://localhost:5173";
        }
        if ("http://127.0.0.1:5173".equalsIgnoreCase(normalized)) {
            return "https://127.0.0.1:5173";
        }
        return normalized;
    }

    private String defaultFullName(String email, String requestedFullName) {
        if (StringUtils.hasText(requestedFullName)) {
            return requestedFullName.trim();
        }
        int atIndex = email.indexOf('@');
        String localPart = atIndex > 0 ? email.substring(0, atIndex) : email;
        return StringUtils.hasText(localPart) ? localPart : "student";
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
}
