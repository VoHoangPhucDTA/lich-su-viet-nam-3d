package com.lichsuvn.backend.exam.ai.client.dto;

import java.util.List;

public final class AiProvenanceDtos {
    private AiProvenanceDtos() {}

    public record Request(String corpusSha256, String collectionName, String embeddingModel,
                          int embeddingDimension, List<Source> sources) {}
    public record Source(String chunkId, String chunkHash) {}
    public record Response(boolean valid, boolean corpusMatches, boolean collectionMatches,
                           boolean embeddingContractMatches, List<SourceResult> sources, List<String> errors) {}
    public record SourceResult(String chunkId, String chunkHash, boolean exists, boolean hashMatches, boolean pendingReview,
                               String documentId, Integer grade, Integer lessonNumber, String lessonTitle,
                               String sectionTitle, Integer pageStart, Integer pageEnd) {}
    public record SearchRequest(String query, Integer grade, Integer lessonNumber, String documentId, int topK) {}
    public record SearchResponse(List<SearchResult> results) {}
    public record SearchResult(String chunkId, String chunkHash, String documentId, int grade, int lessonNumber,
                               String lessonTitle, String sectionTitle, Integer pageStart, Integer pageEnd,
                               String excerpt, double distance, boolean pendingReview) {}
}
