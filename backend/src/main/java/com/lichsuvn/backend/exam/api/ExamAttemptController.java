package com.lichsuvn.backend.exam.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptDetailResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptListResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptSummaryResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptUpsertRequest;
import com.lichsuvn.backend.exam.api.dto.ServerTimeResponse;
import com.lichsuvn.backend.exam.application.ExamAttemptService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
public class ExamAttemptController {
    private final ExamAttemptService examAttemptService;

    public ExamAttemptController(ExamAttemptService examAttemptService) {
        this.examAttemptService = examAttemptService;
    }

    @GetMapping("/time")
    public ApiResponse<ServerTimeResponse> serverTime() {
        Instant now = Instant.now();
        return ApiResponse.ok(new ServerTimeResponse(now.toEpochMilli(), now.toString()));
    }

    @PostMapping("/exams/attempts")
    public ApiResponse<ExamAttemptSummaryResponse> upsertAttempt(
            @Valid @RequestBody ExamAttemptUpsertRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(examAttemptService.upsertAttempt(request, principal));
    }

    @GetMapping("/exams/attempts")
    public ApiResponse<ExamAttemptListResponse> listAttempts(
            @RequestParam(required = false) Integer limit,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(examAttemptService.listAttempts(principal, limit));
    }

    @GetMapping("/exams/attempts/{sessionId}")
    public ApiResponse<ExamAttemptDetailResponse> findAttempt(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(examAttemptService.findAttempt(sessionId, principal));
    }
}
