package com.lichsuvn.backend.auth.api;

import com.lichsuvn.backend.auth.api.dto.AuthResponseDto;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.ForgotPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.api.dto.RefreshRequest;
import com.lichsuvn.backend.auth.api.dto.RegisterResponseDto;
import com.lichsuvn.backend.auth.api.dto.RegisterRequest;
import com.lichsuvn.backend.auth.api.dto.ResendVerificationRequest;
import com.lichsuvn.backend.auth.api.dto.ResetPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.SocialLoginRequest;
import com.lichsuvn.backend.auth.api.dto.VerifyEmailResponseDto;
import com.lichsuvn.backend.auth.application.AuthRateLimiter;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.application.SocialAuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.common.api.MessageDto;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AuthRateLimiter authRateLimiter;
    private final SocialAuthService socialAuthService;

    public AuthController(AuthService authService, AuthRateLimiter authRateLimiter,
                          SocialAuthService socialAuthService) {
        this.authService = authService;
        this.authRateLimiter = authRateLimiter;
        this.socialAuthService = socialAuthService;
    }

    // Public entrypoints return the same ApiResponse envelope used by event APIs.
    @PostMapping("/register")
    public ApiResponse<RegisterResponseDto> register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "register", request.email()));
        return ApiResponse.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponseDto> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "login", request.email()));
        return ApiResponse.ok(authService.login(request));
    }

    /**
     * Google OAuth — P1 social login.
     * Frontend sends ONLY the id_token from Google Identity Services SDK.
     * Backend verifies it independently against Google tokeninfo API.
     * Login matrix: C1 new user | C2 email merge | C3 already linked | C4 reject invalid.
     */
    @PostMapping("/oauth/google")
    public ApiResponse<AuthResponseDto> googleOAuth(
            @Valid @RequestBody SocialLoginRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "oauth-google", ""));
        return ApiResponse.ok(socialAuthService.loginWithGoogle(request.token()));
    }

    /**
     * Facebook OAuth — P2 social login.
     * Frontend sends the short-lived user access_token from Facebook Login JS SDK.
     * Backend verifies it against Meta debug_token endpoint (2-step: verify then fetch profile).
     * Login matrix: C1 new user | C2 email merge (with pending->active) | C3 already linked |
     *               C4 no email (SOCIAL_EMAIL_REQUIRED) | C5 invalid token (INVALID_SOCIAL_TOKEN).
     */
    @PostMapping("/oauth/facebook")
    public ApiResponse<AuthResponseDto> facebookOAuth(
            @Valid @RequestBody SocialLoginRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "oauth-facebook", ""));
        return ApiResponse.ok(socialAuthService.loginWithFacebook(request.token()));
    }

    @GetMapping("/verify-email")
    public ApiResponse<VerifyEmailResponseDto> verifyEmail(@RequestParam String token) {
        return ApiResponse.ok(authService.verifyEmail(token));
    }

    // From this point on, SecurityConfig requires a valid bearer access token.
    @GetMapping("/me")
    public ApiResponse<AuthUserDto> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(authService.me(principal));
    }

    @PostMapping("/refresh")
    public ApiResponse<AuthResponseDto> refresh(@Valid @RequestBody RefreshRequest request) {
        return ApiResponse.ok(authService.refresh(request));
    }

    @PostMapping("/forgot-password")
    public ApiResponse<MessageDto> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "forgot-password", request.email()));
        return ApiResponse.ok(authService.forgotPassword(request));
    }

    @PostMapping("/resend-verification")
    public ApiResponse<RegisterResponseDto> resendVerification(
            @Valid @RequestBody ResendVerificationRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "resend-verification", request.email()));
        return ApiResponse.ok(authService.resendVerification(request));
    }

    @PostMapping("/reset-password")
    public ApiResponse<MessageDto> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request,
            HttpServletRequest servletRequest
    ) {
        authRateLimiter.check(rateKey(servletRequest, "reset-password", ""));
        return ApiResponse.ok(authService.resetPassword(request));
    }

    private String rateKey(HttpServletRequest request, String action, String email) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        return action + ":" + request.getRemoteAddr() + ":" + normalizedEmail;
    }
}
