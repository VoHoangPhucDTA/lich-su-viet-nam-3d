package com.lichsuvn.backend.exam.ai.client.dto;

import java.util.List;

public record AiQuizGenerationResponse(
        List<Question> questions,
        List<Source> sources,
        Metadata metadata,
        List<String> warnings
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
            Integer pageEnd,
            String chunkHash
    ) {
    }

    public record Metadata(
            Integer requestedCount,
            Integer generatedCount,
            Integer retrievedChunkCount,
            String generationModel,
            String embeddingModel,
            Integer embeddingDimension,
            String corpusSha256,
            String collectionName,
            String promptVersion,
            String schemaVersion,
            Integer repairAttempts,
            Double latencyMs
    ) {
    }
}
