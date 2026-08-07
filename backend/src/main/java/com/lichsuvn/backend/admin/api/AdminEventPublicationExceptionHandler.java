package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.api.dto.AdminEventPublicationDtos;
import com.lichsuvn.backend.admin.application.EventPublishBlockedException;
import com.lichsuvn.backend.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

@RestControllerAdvice(assignableTypes = AdminController.class)
public class AdminEventPublicationExceptionHandler {

    @ExceptionHandler(EventPublishBlockedException.class)
    public ResponseEntity<ApiResponse<AdminEventPublicationDtos.BlockedError>> handleBlockedPublication(
            EventPublishBlockedException exception,
            HttpServletRequest request
    ) {
        var data = new AdminEventPublicationDtos.BlockedError(
                request.getRequestURI(), exception.getIssues());
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(
                        false,
                        exception.getCode(),
                        exception.getMessage(),
                        data,
                        Instant.now()));
    }
}
