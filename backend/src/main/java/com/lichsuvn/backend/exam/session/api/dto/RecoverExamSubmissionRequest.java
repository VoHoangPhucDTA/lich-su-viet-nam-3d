package com.lichsuvn.backend.exam.session.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/** Recovery contains only verifiable identity, version and raw answers; never a client score. */
public record RecoverExamSubmissionRequest(
        @NotBlank String clientSubmissionId,
        String serverSessionId,
        String localSessionId,
        @NotBlank String mode,
        String datasetVersion,
        String examId,
        String examContentHash,
        String localSubmissionHash,
        @NotNull @Valid ClientTiming clientTiming,
        @NotEmpty List<@Valid QuestionRef> questionRefs,
        @NotEmpty List<SubmitExamSessionRequest.AnswerItem> answers
) {
    public record QuestionRef(String questionInstanceId, String publicQuestionId) {}
    public record ClientTiming(@NotNull Long startedAtClient, @NotNull Long submittedAtClient) {}
}
