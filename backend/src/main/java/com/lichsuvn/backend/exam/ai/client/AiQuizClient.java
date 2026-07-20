package com.lichsuvn.backend.exam.ai.client;

import com.lichsuvn.backend.exam.ai.client.dto.AiHealthResponse;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationRequest;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;

public interface AiQuizClient {
    AiQuizGenerationResponse generate(AiQuizGenerationRequest request, String requestId);

    AiHealthResponse health(String requestId);
}
