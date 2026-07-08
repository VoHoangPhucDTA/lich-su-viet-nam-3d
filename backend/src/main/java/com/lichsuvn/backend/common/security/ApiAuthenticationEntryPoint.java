package com.lichsuvn.backend.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.api.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;

@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {
    private final ObjectMapper objectMapper;

    public ApiAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException
    ) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(
                response.getOutputStream(),
                SecurityErrorResponse.of(
                        "UNAUTHENTICATED",
                        "Authentication required",
                        ApiError.of(request.getRequestURI())
                )
        );
    }

    private record SecurityErrorResponse(
            boolean success,
            String code,
            String message,
            ApiError data,
            String timestamp
    ) {
        static SecurityErrorResponse of(String code, String message, ApiError data) {
            return new SecurityErrorResponse(false, code, message, data, Instant.now().toString());
        }
    }
}
