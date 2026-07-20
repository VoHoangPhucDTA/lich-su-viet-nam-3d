package com.lichsuvn.backend.exam.ai.application;

import com.lichsuvn.backend.exam.ai.client.dto.AiStyleExample;
import com.lichsuvn.backend.exam.ai.client.dto.AiStyleOption;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import com.lichsuvn.backend.exam.ai.domain.StyleQuestionCandidate;
import com.lichsuvn.backend.exam.ai.infrastructure.AiStyleExampleRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AiStyleExampleService {
    private final AiStyleExampleRepository repository;
    private final AiServiceProperties properties;

    public AiStyleExampleService(AiStyleExampleRepository repository, AiServiceProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    public List<AiStyleExample> select(String topicHint, String difficulty) {
        int limit = properties.maxStyleExamples();
        if (limit == 0) return List.of();
        return repository.findEligible(topicHint, difficulty, limit).stream()
                .filter(AiStyleExampleService::isSafe)
                .limit(limit)
                .map(AiStyleExampleService::map)
                .toList();
    }

    private static boolean isSafe(StyleQuestionCandidate question) {
        return question.question() != null && !question.question().isBlank()
                && question.explanation() != null && !question.explanation().isBlank()
                && question.options().size() == 4
                && question.options().stream().filter(StyleQuestionCandidate.Option::correct).count() == 1
                && question.options().stream().allMatch(option -> option.text() != null && !option.text().isBlank())
                && question.options().stream().map(StyleQuestionCandidate.Option::id).toList()
                .equals(List.of("A", "B", "C", "D"));
    }

    private static AiStyleExample map(StyleQuestionCandidate question) {
        String correct = question.options().stream()
                .filter(StyleQuestionCandidate.Option::correct)
                .findFirst()
                .orElseThrow()
                .id();
        return new AiStyleExample(
                question.question().trim(),
                question.options().stream()
                        .map(option -> new AiStyleOption(option.id(), option.text().trim()))
                        .toList(),
                correct,
                question.explanation().trim(),
                question.difficulty().toUpperCase()
        );
    }
}
