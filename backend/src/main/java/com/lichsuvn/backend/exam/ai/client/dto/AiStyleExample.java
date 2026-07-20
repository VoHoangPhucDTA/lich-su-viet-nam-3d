package com.lichsuvn.backend.exam.ai.client.dto;

import java.util.List;

public record AiStyleExample(
        String question,
        List<AiStyleOption> options,
        String correctOptionId,
        String explanation,
        String difficulty
) {
    public AiStyleExample {
        options = options == null ? List.of() : List.copyOf(options);
    }
}
