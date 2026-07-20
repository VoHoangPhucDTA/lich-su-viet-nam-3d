package com.lichsuvn.backend.exam.ai.domain;

import java.util.List;

public record StyleQuestionCandidate(
        String publicQuestionId,
        String question,
        String explanation,
        String difficulty,
        int selectionPriority,
        List<Option> options
) {
    public StyleQuestionCandidate {
        options = options == null ? List.of() : List.copyOf(options);
    }

    public record Option(String id, String text, boolean correct) {
    }
}
