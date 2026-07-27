package com.lichsuvn.backend.exam.ai.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionRequest;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionResponse;
import com.lichsuvn.backend.exam.ai.application.AiQuizGenerationService;
import com.lichsuvn.backend.exam.ai.application.PracticeQuizCompletionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/quiz")
public class PracticeQuizController {
    private final AiQuizGenerationService service;
    private final PracticeQuizCompletionService completionService;

    public PracticeQuizController(
            AiQuizGenerationService service,
            PracticeQuizCompletionService completionService
    ) {
        this.service = service;
        this.completionService = completionService;
    }

    @PostMapping("/generate")
    public ApiResponse<PracticeQuizGenerateResponse> generate(
            @Valid @RequestBody PracticeQuizGenerateRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(service.generatePractice(request, principal));
    }

    @PostMapping("/attempts")
    public ApiResponse<PracticeQuizCompletionResponse> recordCompletion(
            @Valid @RequestBody PracticeQuizCompletionRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(completionService.record(request, principal));
    }
}
