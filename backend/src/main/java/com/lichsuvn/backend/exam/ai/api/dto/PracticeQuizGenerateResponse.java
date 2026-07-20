package com.lichsuvn.backend.exam.ai.api.dto;

import java.util.List;

public record PracticeQuizGenerateResponse(
        List<AiQuizGenerateResponse.Question> questions,
        List<AiQuizGenerateResponse.Source> sources,
        List<String> warnings,
        AiQuizGenerateResponse.Generation generation
) {
    public static PracticeQuizGenerateResponse from(AiQuizGenerateResponse response) {
        return new PracticeQuizGenerateResponse(
                response.questions(), response.sources(), response.warnings(), response.generation()
        );
    }
}
