package com.lichsuvn.backend.exam.session.api.dto;

import tools.jackson.databind.JsonNode;

public record CheckQuestionRequest(String questionType, JsonNode selected) {
}
