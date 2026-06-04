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

import java.io.IOException;

/**
 * Filter xác thực JWT cho mỗi HTTP request.
 *
 * Chiến lược đọc token (ưu tiên theo thứ tự):
 *  1. HttpOnly Cookie "access_token" — cơ chế chính trên môi trường Production.
 *     Browser tự động đính kèm cookie khi frontend gửi request với credentials: 'include'.
 *     Cookie không thể bị đọc bởi JavaScript → miễn dịch với XSS.
 *
 *  2. Authorization: Bearer <token> header — fallback cho môi trường Development
 *     hoặc các tool như Postman/curl khi không có cookie.
 *
 * Nếu cả hai đều không có → request vẫn được xử lý, nhưng không có authentication context.
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
                        principal.roles().stream()
                                .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
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
     * Ưu tiên đọc access_token từ HttpOnly Cookie (Production).
     * Fallback sang Authorization header (Development / Postman).
     */
    private String extractToken(HttpServletRequest request) {
        // --- Ưu tiên 1: HttpOnly Cookie ---
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

        // --- Fallback: Authorization header (dev/Postman) ---
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }

        return null;
    }
}
