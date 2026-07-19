package com.lichsuvn.backend.exam.session.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.session.api.dto.CheckQuestionRequest;
import com.lichsuvn.backend.exam.session.api.dto.CreateExamSessionRequest;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionResponse;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionSubmitResponse;
import com.lichsuvn.backend.exam.session.api.dto.SubmitExamSessionRequest;
import com.lichsuvn.backend.exam.session.application.ExamSessionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exam-sessions")
public class ExamSessionController {
    private final ExamSessionService service;

    public ExamSessionController(ExamSessionService service) { this.service = service; }

    @PostMapping
    public ApiResponse<ExamSessionResponse> create(@Valid @RequestBody CreateExamSessionRequest request, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.create(request, principal));
    }

    @GetMapping("/{sessionId}")
    public ApiResponse<ExamSessionResponse> resume(@PathVariable String sessionId, @RequestHeader(value = "X-Exam-Session-Token", required = false) String token, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.resume(sessionId, token, principal));
    }

    @PostMapping("/{sessionId}/questions/{questionInstanceId}/check")
    public ApiResponse<ExamSessionResponse.CheckedQuestionResult> check(@PathVariable String sessionId, @PathVariable String questionInstanceId, @Valid @RequestBody CheckQuestionRequest request, @RequestHeader(value = "X-Exam-Session-Token", required = false) String token, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.check(sessionId, questionInstanceId, request, token, principal));
    }

    @PostMapping("/{sessionId}/complete")
    public ApiResponse<ExamSessionResponse.PracticeSummary> complete(@PathVariable String sessionId, @RequestHeader(value = "X-Exam-Session-Token", required = false) String token, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.complete(sessionId, token, principal));
    }

    @PostMapping("/{sessionId}/submit")
    public ApiResponse<ExamSessionSubmitResponse> submit(@PathVariable String sessionId, @Valid @RequestBody SubmitExamSessionRequest request, @RequestHeader(value = "X-Exam-Session-Token", required = false) String token, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.submit(sessionId, request, token, principal));
    }
}
