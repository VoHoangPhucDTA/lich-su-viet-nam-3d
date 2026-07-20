package com.lichsuvn.backend.exam.dataset;

public record ExamDatasetImportResult(
        String status,
        String aggregateHash,
        int examCount,
        int sectionCount,
        int questionCount,
        int topicCount,
        int taggingCount
) {
}
