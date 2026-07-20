package com.lichsuvn.backend.exam.catalog.api.dto;

import java.math.BigDecimal;

public record ExamCatalogItemResponse(
        String examId,
        String title,
        Integer year,
        String sourceDetail,
        String format,
        int timeLimitMinutes,
        BigDecimal totalScore,
        int totalQuestions,
        int mcqCount,
        int tfCount,
        String verificationStatus,
        boolean hasWarnings
) {
}
