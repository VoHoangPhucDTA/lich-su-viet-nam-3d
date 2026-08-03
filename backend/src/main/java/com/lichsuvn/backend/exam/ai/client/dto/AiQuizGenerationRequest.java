package com.lichsuvn.backend.exam.ai.client.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiQuizGenerationRequest(
        String query,
        Integer grade,
        Integer lessonNumber,
        String documentId,
        String difficulty,
        Integer count,
        Integer topK,
        List<AiStyleExample> styleExamples,
        AiGenerationUseCase generationUseCase,
        String canarySubject
) {
    public AiQuizGenerationRequest {
        styleExamples = styleExamples == null ? List.of() : List.copyOf(styleExamples);
        generationUseCase = generationUseCase == null ? AiGenerationUseCase.OTHER_INTERNAL : generationUseCase;
        canarySubject = canarySubject == null || canarySubject.isBlank() ? null : canarySubject.trim();
    }

    public AiQuizGenerationRequest(
            String query,
            Integer grade,
            Integer lessonNumber,
            String documentId,
            String difficulty,
            Integer count,
            Integer topK,
            List<AiStyleExample> styleExamples
    ) {
        this(query, grade, lessonNumber, documentId, difficulty, count, topK, styleExamples,
                AiGenerationUseCase.OTHER_INTERNAL, null);
    }
}
