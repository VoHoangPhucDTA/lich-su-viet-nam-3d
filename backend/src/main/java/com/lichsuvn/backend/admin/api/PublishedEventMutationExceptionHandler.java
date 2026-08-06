package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.admin.application.PublishedEventMutationBlockedException;
import com.lichsuvn.backend.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;

/**
 * Serializes {@link PublishedEventMutationBlockedException} raised from managed
 * image upload paths. The payload follows the {@code satisfied → unsatisfied}
 * classification: only requirement codes newly introduced by this mutation are
 * surfaced; pre-existing issues for the same code are intentionally suppressed
 * so the Admin UI can show only the change it has to react to.
 *
 * <p>The payload is intentionally kept bounded — section, machine code,
 * requirement label, reason and field names. Narrative text, secrets, the
 * event slug, and any raw payloads are never echoed back.
 */
@RestControllerAdvice(assignableTypes = AdminController.class)
public class PublishedEventMutationExceptionHandler {

    @ExceptionHandler(PublishedEventMutationBlockedException.class)
    public ResponseEntity<ApiResponse<AdminEventImageDtos.PublicationGuardBlocked>> handleBlocked(
            PublishedEventMutationBlockedException exception,
            HttpServletRequest request
    ) {
        AdminEventImageDtos.PublicationGuardBlocked payload =
                exception.toResponse("BECOMES_INVALID");
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(
                        false,
                        exception.getCode(),
                        exception.getMessage(),
                        payload,
                        Instant.now()));
    }
}
