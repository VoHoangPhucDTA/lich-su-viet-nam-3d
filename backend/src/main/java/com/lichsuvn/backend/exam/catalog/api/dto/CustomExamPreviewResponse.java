package com.lichsuvn.backend.exam.catalog.api.dto;

import java.util.List;
import java.util.Map;

public record CustomExamPreviewResponse(
        String datasetVersion,
        NormalizedConfig normalizedConfig,
        int availableCount,
        int selectedCount,
        boolean enoughQuestions,
        Breakdown breakdown,
        List<String> warnings
) {
    public record NormalizedConfig(
            int questionCount,
            String questionType,
            String difficulty,
            String cognitiveLevel,
            String scopeType,
            String scopeSlug
    ) {
    }

    public record Breakdown(
            Map<String, Integer> questionType,
            Map<String, Integer> difficulty,
            Map<String, Integer> cognitiveLevel
    ) {
    }
}
