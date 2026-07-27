package com.lichsuvn.backend.common.config;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.JwtAuthenticationFilter;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /**
     * Danh sách domain frontend được phép gửi request có cookie (credentials).
     * Dev:  http://localhost:5173
     * Prod: https://lichsuvn.netlify.app,https://lichsuvn.vercel.app
     * Đặt biến môi trường APP_ALLOWED_ORIGINS khi deploy lên Render.
     */
    @Value("${app.allowed-origins:http://localhost:5173,http://127.0.0.1:5173}")
    private String allowedOriginsRaw;

    @Value("${app.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${app.cookie.same-site:Lax}")
    private String cookieSameSite;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(AuthService authService) {
        return new JwtAuthenticationFilter(authService);
    }

    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = new CookieCsrfTokenRepository();
        repository.setCookieName("CSRF-TOKEN");
        repository.setHeaderName("X-CSRF-TOKEN");
        repository.setCookiePath("/");
        repository.setCookieCustomizer(cookie -> cookie
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite));
        return repository;
    }

    /**
     * CORS configuration — bắt buộc để HttpOnly Cookie hoạt động cross-origin.
     *
     * Tại sao cần allowCredentials(true)?
     *   Browser chỉ gửi cookie (SameSite=None) lên cross-origin request khi server
     *   phản hồi với header: Access-Control-Allow-Credentials: true.
     *   Đồng thời phải dùng allowedOrigins cụ thể (không được dùng "*").
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        // Parse danh sách domain từ env var (có thể là nhiều domain cách nhau bởi dấu phẩy)
        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        if (origins.contains("*")) {
            throw new IllegalStateException(
                    "app.allowed-origins must contain explicit origins when credentials are enabled"
            );
        }
        config.setAllowedOrigins(origins);

        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(Arrays.asList(
                "Content-Type",
                "Accept",
                "X-Exam-Session-Token",
                "X-CSRF-TOKEN",
                "X-Event-Version"
        ));

        // allowCredentials(true) = cho phép browser gửi/nhận HttpOnly Cookie cross-origin.
        // KHÔNG thể kết hợp với allowedOrigins("*") — phải dùng danh sách origin cụ thể.
        config.setAllowCredentials(true);
        config.setMaxAge(3600L); // Cache pre-flight OPTIONS trong 1 giờ

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            CorsConfigurationSource corsConfigurationSource,
            CsrfTokenRepository csrfTokenRepository,
            ApiAuthenticationEntryPoint authenticationEntryPoint,
            ApiAccessDeniedHandler accessDeniedHandler
    ) throws Exception {
        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        // JWT authentication is reconstructed on every stateless request.
                        // Do not treat each request as a fresh login and discard the SPA token.
                        // Login/logout flows rotate the token explicitly through /api/auth/csrf.
                        .sessionAuthenticationStrategy(new NullAuthenticatedSessionStrategy()))
                // Khai báo cors với bean corsConfigurationSource đã định nghĩa ở trên
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/admin/**").hasAuthority("ROLE_admin")
                        .requestMatchers(HttpMethod.GET, "/api/time").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/events", "/api/timeline").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/events/**").permitAll()
                        // Keep legacy attempt history authenticated before exposing public catalog routes.
                        .requestMatchers("/api/exams/attempts/**").authenticated()
                        .requestMatchers("/api/exams/ai/candidates/**", "/api/exams/ai/candidates").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/exams/ai/generate").authenticated()
                        .requestMatchers("/api/exam-submissions/recover").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/exams", "/api/exams/topics", "/api/exams/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/exams/custom/preview").permitAll()
                        .requestMatchers("/api/exam-sessions/**").permitAll()
                        // Reading-progress endpoints must allow anonymous callers so the frontend
                        // can record and restore progress before login. The service layer no-ops
                        // persistence for anonymous users and returns empty stats.
                        .requestMatchers(HttpMethod.POST, "/api/events/*/view").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf", "/api/auth/verify-email").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/refresh").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/forgot-password", "/api/auth/reset-password").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/resend-verification").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/oauth/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                        .requestMatchers("/api/tts/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/actuator/**").denyAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
