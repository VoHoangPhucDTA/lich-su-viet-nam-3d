package com.lichsuvn.backend.exam.ai.client.dto;

public record AiHealthResponse(
        String status,
        String service,
        String environment,
        boolean chromaReady,
        boolean retrievalReady,
        boolean generationReady,
        boolean geminiConfigured
) {
}
