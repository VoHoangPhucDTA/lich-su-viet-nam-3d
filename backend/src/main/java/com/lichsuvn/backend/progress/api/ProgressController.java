package com.lichsuvn.backend.progress.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.progress.api.dto.EventViewRequest;
import com.lichsuvn.backend.progress.api.dto.EventViewResponse;
import com.lichsuvn.backend.progress.api.dto.ProgressDto;
import com.lichsuvn.backend.progress.application.ProgressService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ProgressController {
    private final ProgressService progressService;

    public ProgressController(ProgressService progressService) {
        this.progressService = progressService;
    }

    // Called by map/detail flows after an authenticated user views an event.
    @PostMapping("/events/{eventId}/view")
    public ApiResponse<EventViewResponse> recordEventView(
            @PathVariable String eventId,
            @Valid @RequestBody EventViewRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(progressService.recordEventView(eventId, request, principal));
    }

    // Lightweight progress summary for the current authenticated user.
    @GetMapping("/progress/me")
    public ApiResponse<ProgressDto> findMyProgress(@AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(progressService.findMyProgress(principal));
    }
}
