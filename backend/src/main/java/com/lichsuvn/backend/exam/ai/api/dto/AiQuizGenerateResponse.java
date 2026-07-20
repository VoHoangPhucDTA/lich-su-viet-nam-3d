package com.lichsuvn.backend.exam.ai.api.dto;

import java.util.List;

public record AiQuizGenerateResponse(
        List<Question> questions,
        List<Source> sources,
        List<String> warnings,
        Generation generation
) {
    public record Question(
            String question,
            List<Option> options,
            String correctOptionId,
            String explanation,
            String difficulty,
            List<String> sourceChunkIds
    ) {
    }

    public record Option(String id, String text) {
    }

    public record Source(
            String chunkId,
            String documentId,
            Integer grade,
            Integer lessonNumber,
            String lessonTitle,
            String sectionTitle,
            Integer pageStart,
            Integer pageEnd
    ) {
    }

    public record Generation(int requestedCount, int generatedCount, boolean partial) {
    }
}
