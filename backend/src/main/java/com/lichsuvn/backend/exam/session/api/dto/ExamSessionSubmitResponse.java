package com.lichsuvn.backend.exam.session.api.dto;

import tools.jackson.databind.JsonNode;

public record ExamSessionSubmitResponse(String sessionId, String receiptStatus, String scoreAuthority, String timingAuthority, String submissionOrigin, JsonNode result) {
}
