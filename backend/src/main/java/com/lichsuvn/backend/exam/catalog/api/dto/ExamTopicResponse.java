package com.lichsuvn.backend.exam.catalog.api.dto;

import java.util.List;
import java.util.Map;

public record ExamTopicResponse(
        String datasetVersion,
        int total,
        List<TopicItem> items
) {
    public record TopicItem(
            String slug,
            String title,
            String periodSlug,
            String periodTitle,
            int questionCount,
            int mcqCount,
            int tfCount,
            Map<String, Integer> difficultyBreakdown,
            Map<String, Integer> cognitiveLevelBreakdown
    ) {
    }
}
