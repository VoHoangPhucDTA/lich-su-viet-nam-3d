package com.lichsuvn.backend.exam.ai.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.application.AiQuizGenerationService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exams/ai")
public class AiQuizController {
    private final AiQuizGenerationService service;

    public AiQuizController(AiQuizGenerationService service) {
        this.service = service;
    }

    @PostMapping("/generate")
    public ApiResponse<AiQuizGenerateResponse> generate(
            @Valid @RequestBody AiQuizGenerateRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(service.generate(request, principal));
    }
}
