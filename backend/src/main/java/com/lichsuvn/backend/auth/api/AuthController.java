package com.lichsuvn.backend.auth.api;

import com.lichsuvn.backend.auth.api.dto.AuthResponseDto;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;
import com.lichsuvn.backend.auth.api.dto.ForgotPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.LoginRequest;
import com.lichsuvn.backend.auth.api.dto.RegisterResponseDto;
import com.lichsuvn.backend.auth.api.dto.RegisterRequest;
import com.lichsuvn.backend.auth.api.dto.ResendVerificationRequest;
import com.lichsuvn.backend.auth.api.dto.ResetPasswordRequest;
import com.lichsuvn.backend.auth.api.dto.SocialLoginRequest;
import com.lichsuvn.backend.auth.api.dto.UpdateProfileRequest;
import com.lichsuvn.backend.auth.api.dto.VerifyEmailResponseDto;
import com.lichsuvn.backend.auth.application.AuthRateLimiter;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.application.SocialAuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.common.api.MessageDto;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AuthRateLimiter authRateLimiter;
    private final SocialAuthService socialAuthService;

    /**
     * APP_COOKIE_SECURE=true trên Production (Render, mọi traffic qua HTTPS).
     * APP_COOKIE_SECURE=false trên localhost vì backend chạy http://localhost:8080.
     * (Frontend chạy HTTPS qua Vite proxy, cookie được gửi qua proxy — không cần Secure flag)
     */
    @Value("${app.cookie.secure:false}")
    private boolean cookieSecure;

    /**
     * SameSite attribute của cookie.
     * Production (Render → Netlify/Vercel, khác domain): "None" (bắt buộc kèm Secure=true).
     * Development (localhost, cùng origin qua Vite proxy): "Lax" đủ làm việc.
     */
    @Value("${app.cookie.same-site:Lax}")
    private String cookieSameSite;

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
        // Bước 6A.1.4: AuthController.java: gọi AuthService.java (hàm register)
        // Bước 6A.2.4: AuthController.java: trả lỗi 400 cho authService.ts (xử lý bởi GlobalExceptionHandler nếu lỗi)
        authRateLimiter.check(rateKey(servletRequest, "register", request.email()));
        // Bước 6A.1.9: AuthController.java: trả HTTP 200 cho authService.ts
        return ApiResponse.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponseDto> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        // Bước 6B.1.4: AuthController.java: gọi AuthService.java (hàm login)
        authRateLimiter.check(rateKey(servletRequest, "login", request.email()));
        AuthResponseDto result = authService.login(request);
        // Bước 6B.1.8: AuthController.java: set HttpOnly Cookie và trả HTTP 200 kèm User info
        setAuthCookies(servletResponse, result);
        return ApiResponse.ok(result);
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
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        authRateLimiter.check(rateKey(servletRequest, "oauth-google", ""));
        AuthResponseDto result = socialAuthService.loginWithGoogle(request.token());
        // Bước 6B.2.11: AuthController.java: set HttpOnly Cookie và trả HTTP 200 kèm User info
        setAuthCookies(servletResponse, result);
        return ApiResponse.ok(result);
    }

    /**
     * Facebook OAuth — P2 social login.
     */
    @PostMapping("/oauth/facebook")
    public ApiResponse<AuthResponseDto> facebookOAuth(
            @Valid @RequestBody SocialLoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        authRateLimiter.check(rateKey(servletRequest, "oauth-facebook", ""));
        AuthResponseDto result = socialAuthService.loginWithFacebook(request.token());
        // Bước 6B.3.11: AuthController.java: set HttpOnly Cookie và trả HTTP 200 kèm User info
        setAuthCookies(servletResponse, result);
        return ApiResponse.ok(result);
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

    @PostMapping("/me/update")
    public ApiResponse<AuthUserDto> updateProfile(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return ApiResponse.ok(authService.updateProfile(principal, request));
    }

    /**
     * Làm mới Access Token bằng Refresh Token từ HttpOnly Cookie.
     *
     * Thiết kế: Frontend gửi POST không cần body (refresh_token nằm trong cookie path=/api/auth/refresh).
     * Backend đọc cookie, validate, rồi set cả 2 cookie mới trong response.
     * Không dùng @RequestBody nữa vì @NotBlank trên DTO sẽ reject body rỗng từ frontend.
     */
    @PostMapping("/refresh")
    public ApiResponse<AuthResponseDto> refresh(
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        // Đọc refresh_token từ HttpOnly Cookie (path=/api/auth/refresh)
        String refreshToken = extractCookieValue(servletRequest, "refresh_token");
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new com.lichsuvn.backend.common.exception.ApiException(
                    HttpStatus.UNAUTHORIZED, "MISSING_TOKEN", "Refresh token cookie is required");
        }
        // Làm mới cả hai cookie sau khi refresh token hợp lệ
        AuthResponseDto result = authService.refreshByToken(refreshToken);
        setAuthCookies(servletResponse, result);
        return ApiResponse.ok(result);
    }

    /**
     * Đăng xuất: xóa HttpOnly Cookie khỏi trình duyệt.
     * Frontend chỉ cần gọi POST /api/auth/logout — không cần gửi token.
     */
    @PostMapping("/logout")
    public ApiResponse<MessageDto> logout(HttpServletResponse servletResponse) {
        // Bước 6D.1.5: AuthController.java: gọi clearAuthCookies() — đặt maxAge=0 trên access_token (path=/)
        //              và refresh_token (path=/api/auth/refresh) để browser xóa ngay lập tức
        clearAuthCookies(servletResponse);
        // Bước 6D.1.6: AuthController.java: trả HTTP 200 kèm message "Đăng xuất thành công."
        return ApiResponse.ok(new MessageDto("Đăng xuất thành công."));
    }

    @PostMapping("/forgot-password")
    public ApiResponse<MessageDto> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request,
            HttpServletRequest servletRequest
    ) {
        // Bước 6C.1.4: AuthController.java: gọi AuthService.java (hàm requestPasswordReset/forgotPassword)
        authRateLimiter.check(rateKey(servletRequest, "forgot-password", request.email()));
        MessageDto result = authService.forgotPassword(request);
        // Bước 6C.1.9: AuthController.java: trả HTTP 200 cho authService.ts
        return ApiResponse.ok(result);
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
        // Bước 6C.1.15: AuthController.java: gọi AuthService.java (hàm resetPassword)
        authRateLimiter.check(rateKey(servletRequest, "reset-password", ""));
        MessageDto result = authService.resetPassword(request);
        // Bước 6C.1.19: AuthController.java: trả HTTP 200 cho authService.ts
        return ApiResponse.ok(result);
    }

    /**
     * Trích xuất giá trị cookie theo tên từ HttpServletRequest.
     * Trả null nếu cookie không tồn tại.
     */
    private String extractCookieValue(HttpServletRequest request, String cookieName) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private String rateKey(HttpServletRequest request, String action, String email) {
        String normalizedEmail = email == null ? "" : email.trim().toLowerCase();
        return action + ":" + request.getRemoteAddr() + ":" + normalizedEmail;
    }

    /**
     * Đặt HttpOnly Cookie cho access_token và refresh_token vào HTTP Response.
     *
     * Attributes:
     *  - HttpOnly: JavaScript không thể đọc cookie → chống XSS.
     *  - Secure: Chỉ gửi qua HTTPS (bật trên Production, tắt khi dev qua Vite proxy).
     *  - SameSite=None: Cho phép gửi cookie cross-origin (Netlify → Render).
     *               Bắt buộc kèm Secure=true khi SameSite=None.
     *  - SameSite=Lax: Dùng cho Development localhost (an toàn hơn, không cần HTTPS).
     *  - Path=/api/auth/refresh cho refresh_token: giới hạn phạm vi cookie,
     *               chỉ tự động gửi đến endpoint refresh, không lộ ra các route khác.
     */
    private void setAuthCookies(HttpServletResponse response, AuthResponseDto auth) {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", auth.accessToken())
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/")
                .maxAge(Duration.ofHours(1))
                .build();

        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", auth.refreshToken())
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/api/auth/refresh") // Giới hạn: chỉ gửi đến endpoint refresh
                .maxAge(Duration.ofDays(7))
                .build();

        response.addHeader("Set-Cookie", accessCookie.toString());
        response.addHeader("Set-Cookie", refreshCookie.toString());
    }

    /**
     * Xóa access_token và refresh_token cookie khỏi trình duyệt.
     * Dùng maxAge(0) để browser xóa cookie ngay lập tức.
     */
    private void clearAuthCookies(HttpServletResponse response) {
        ResponseCookie clearAccess = ResponseCookie.from("access_token", "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/")
                .maxAge(0)
                .build();

        ResponseCookie clearRefresh = ResponseCookie.from("refresh_token", "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/api/auth/refresh")
                .maxAge(0)
                .build();

        response.addHeader("Set-Cookie", clearAccess.toString());
        response.addHeader("Set-Cookie", clearRefresh.toString());
    }
}
