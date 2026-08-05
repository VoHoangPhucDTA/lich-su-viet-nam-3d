package com.lichsuvn.backend.auth.security;

import com.lichsuvn.backend.auth.application.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import com.lichsuvn.backend.exam.ai.review.security.AiCandidateAuthorization;

import java.io.IOException;

/**
 * Filter xác thực JWT cho mỗi HTTP request.
 *
 * JWT access token chỉ được đọc từ HttpOnly Cookie "access_token".
 *
 *  1. HttpOnly Cookie "access_token" — cơ chế xác thực duy nhất.
 *     Browser tự động đính kèm cookie khi frontend gửi request với credentials: 'include'.
 *     Cookie không thể bị đọc bởi JavaScript → miễn dịch với XSS.
 * Nếu cookie không có → request vẫn được xử lý, nhưng không có authentication context.
 * Spring Security sẽ từ chối ở tầng authorize nếu endpoint yêu cầu authenticated().
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final AuthService authService;

    public JwtAuthenticationFilter(AuthService authService) {
        this.authService = authService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null) {
            try {
                // Xác thực token và tạo Spring Security authentication context
                UserPrincipal principal = authService.principalFromAccessToken(token);
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        principal,
                        null,
                        java.util.stream.Stream.concat(
                                principal.roles().stream().map(role -> "ROLE_" + role),
                                AiCandidateAuthorization.names(principal.roles()).stream())
                                .map(SimpleGrantedAuthority::new)
                                .toList()
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (RuntimeException ex) {
                // Token không hợp lệ hoặc hết hạn — xóa context để request tiếp tục vô danh
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Đọc access_token chỉ từ HttpOnly Cookie.
     */
    private String extractToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("access_token".equals(cookie.getName())) {
                    String value = cookie.getValue();
                    if (value != null && !value.isBlank()) {
                        return value;
                    }
                }
            }
        }

        return null;
    }
}
