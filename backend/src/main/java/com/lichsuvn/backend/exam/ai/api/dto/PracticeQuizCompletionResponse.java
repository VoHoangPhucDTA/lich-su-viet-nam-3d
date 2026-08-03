package com.lichsuvn.backend.exam.ai.api.dto;

public record PracticeQuizCompletionResponse(
        int schemaVersion,
        String attemptId,
        String status
) {
}
