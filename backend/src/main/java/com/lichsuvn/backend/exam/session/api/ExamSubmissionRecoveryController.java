package com.lichsuvn.backend.exam.session.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionSubmitResponse;
import com.lichsuvn.backend.exam.session.api.dto.RecoverExamSubmissionRequest;
import com.lichsuvn.backend.exam.session.application.ExamSessionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exam-submissions")
public class ExamSubmissionRecoveryController {
    private final ExamSessionService service;

    public ExamSubmissionRecoveryController(ExamSessionService service) { this.service = service; }

    @PostMapping("/recover")
    public ApiResponse<ExamSessionSubmitResponse> recover(@Valid @RequestBody RecoverExamSubmissionRequest request,
                                                            @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.recover(request, principal));
    }
}
