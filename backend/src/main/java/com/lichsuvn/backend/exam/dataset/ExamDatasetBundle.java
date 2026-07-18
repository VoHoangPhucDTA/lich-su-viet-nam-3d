package com.lichsuvn.backend.exam.dataset;

import tools.jackson.databind.JsonNode;

import java.nio.file.Path;
import java.util.List;

public record ExamDatasetBundle(
        Path repositoryRoot,
        JsonNode buildMetadata,
        String aggregateHash,
        String buildId,
        int hashSchemaVersion,
        int buildAlgorithmVersion,
        List<SourceExam> exams,
        JsonNode manifest,
        JsonNode topicIndex,
        JsonNode topicRawMapping,
        int sectionCount,
        int questionCount,
        int taggingCount
) {
    public record SourceExam(String relativePath, String contentHash, JsonNode value) {
    }
}
