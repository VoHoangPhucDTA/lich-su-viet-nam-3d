package com.lichsuvn.backend.exam.session.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import tools.jackson.databind.JsonNode;

import java.util.List;

public record SubmitExamSessionRequest(
        @NotBlank String clientSubmissionId,
        @NotEmpty List<@Valid AnswerItem> answers
) {
    public record AnswerItem(String questionInstanceId, String questionType, JsonNode selected) {
    }
}
