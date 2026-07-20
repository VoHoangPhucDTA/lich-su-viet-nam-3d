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
        List<AiStyleExample> styleExamples
) {
    public AiQuizGenerationRequest {
        styleExamples = styleExamples == null ? List.of() : List.copyOf(styleExamples);
    }
}
