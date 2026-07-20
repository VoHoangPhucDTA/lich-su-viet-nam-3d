package com.lichsuvn.backend.exam.session.api.dto;

import tools.jackson.databind.JsonNode;

import java.util.List;

public record ExamSessionResponse(
        String sessionId,
        String anonymousSessionToken,
        String mode,
        String title,
        String datasetVersion,
        String examContentHash,
        String scoringVersion,
        long startedAtServer,
        Long deadlineAt,
        String status,
        List<SessionQuestion> questions,
        PracticeSummary practiceSummary,
        JsonNode anonymousResult
) {
    public record SessionQuestion(String questionInstanceId, String publicQuestionId, int position, JsonNode question, CheckedQuestionResult checkedResult) {
    }

    public record CheckedQuestionResult(JsonNode userAnswer, JsonNode correctAnswer, boolean correct, double points, String completionState, String explanation, int correctCount) {
    }

    public record PracticeSummary(int totalQuestions, int checkedQuestions, int correctQuestions, double points, int untouchedQuestions) {
    }
}
