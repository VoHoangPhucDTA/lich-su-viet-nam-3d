package com.lichsuvn.backend.common.config;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.JwtAuthenticationFilter;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(AuthService authService) {
        return new JwtAuthenticationFilter(authService);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            ApiAuthenticationEntryPoint authenticationEntryPoint,
            ApiAccessDeniedHandler accessDeniedHandler
    ) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {
                })
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                )
                .authorizeHttpRequests(auth -> auth
                        // Event read APIs stay public for map/sidebar/detail exploration.
                        .requestMatchers(HttpMethod.GET, "/api/events", "/api/timeline").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/events/**").permitAll()
                        // Auth bootstrap endpoints must be public; /me and progress remain protected.
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/refresh").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/verify-email").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/forgot-password", "/api/auth/reset-password").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/resend-verification").permitAll()
                        // Social OAuth endpoints (P1: Google; P2: Facebook)
                        .requestMatchers(HttpMethod.POST, "/api/auth/oauth/**").permitAll()
                        .requestMatchers("/actuator/**").permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
