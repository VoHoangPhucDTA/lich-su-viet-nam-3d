package com.lichsuvn.backend.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.api.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;

@Component
public class ApiAccessDeniedHandler implements AccessDeniedHandler {
    private final ObjectMapper objectMapper;

    public ApiAccessDeniedHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        boolean csrfFailure = accessDeniedException instanceof CsrfException;
        objectMapper.writeValue(
                response.getOutputStream(),
                SecurityErrorResponse.of(
                        csrfFailure ? "CSRF_TOKEN_INVALID" : "FORBIDDEN",
                        csrfFailure ? "CSRF token is missing or invalid" : "Access denied",
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
