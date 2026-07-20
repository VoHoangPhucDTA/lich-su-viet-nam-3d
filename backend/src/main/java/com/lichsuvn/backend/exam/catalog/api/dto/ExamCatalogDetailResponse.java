package com.lichsuvn.backend.exam.catalog.api.dto;

import java.math.BigDecimal;
import java.util.List;

public record ExamCatalogDetailResponse(
        String datasetVersion,
        String examId,
        String title,
        Integer year,
        String source,
        String sourceDetail,
        String examCode,
        String format,
        int timeLimitMinutes,
        BigDecimal totalScore,
        int totalQuestions,
        String verificationStatus,
        boolean hasWarnings,
        List<SectionSummary> sections
) {
    public record SectionSummary(
            String sectionId,
            String sectionType,
            String title,
            int order,
            int questionCount,
            BigDecimal maxScore
    ) {
    }
}
