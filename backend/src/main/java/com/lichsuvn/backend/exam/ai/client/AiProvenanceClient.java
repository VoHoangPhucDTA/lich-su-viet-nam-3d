package com.lichsuvn.backend.exam.ai.client;

import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;

public interface AiProvenanceClient {
    AiProvenanceDtos.Response validate(AiProvenanceDtos.Request request, String requestId);
    AiProvenanceDtos.SearchResponse search(AiProvenanceDtos.SearchRequest request, String requestId);
}
