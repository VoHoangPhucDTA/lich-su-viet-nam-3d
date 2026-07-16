package com.lichsuvn.backend.exam.api.dto;

import java.util.List;

public record ExamAttemptListResponse(
        List<ExamAttemptSummaryResponse> items
) {
}
