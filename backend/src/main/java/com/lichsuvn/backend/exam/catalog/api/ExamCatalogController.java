package com.lichsuvn.backend.exam.catalog.api;

import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewRequest;
import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogDetailResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogListResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamTopicResponse;
import com.lichsuvn.backend.exam.catalog.application.ExamCatalogService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exams")
public class ExamCatalogController {
    private final ExamCatalogService service;

    public ExamCatalogController(ExamCatalogService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<ExamCatalogListResponse> list(@RequestParam(required = false) String view) {
        return ApiResponse.ok(service.listExams(view));
    }

    @GetMapping("/topics")
    public ApiResponse<ExamTopicResponse> topics() {
        return ApiResponse.ok(service.listTopics());
    }

    @PostMapping("/custom/preview")
    public ApiResponse<CustomExamPreviewResponse> preview(@Valid @RequestBody CustomExamPreviewRequest request) {
        return ApiResponse.ok(service.preview(request));
    }

    @GetMapping("/{examId}")
    public ApiResponse<ExamCatalogDetailResponse> detail(@PathVariable String examId) {
        return ApiResponse.ok(service.findExam(examId));
    }
}
