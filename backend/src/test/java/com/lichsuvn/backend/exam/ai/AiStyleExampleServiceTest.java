package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.application.AiStyleExampleService;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import com.lichsuvn.backend.exam.ai.domain.StyleQuestionCandidate;
import com.lichsuvn.backend.exam.ai.infrastructure.AiStyleExampleRepository;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiStyleExampleServiceTest {
    private final AiStyleExampleRepository repository = mock(AiStyleExampleRepository.class);

    @Test
    void mapsAtMostThreeSafeVerifiedCandidatesWithoutInternalIds() {
        AiStyleExampleService service = new AiStyleExampleService(repository, properties(3));
        when(repository.findEligible("ASEAN", "MEDIUM", 3)).thenReturn(List.of(
                candidate("q-internal-1", "medium", true),
                candidate("q-internal-2", "medium", true),
                candidate("q-internal-3", "medium", true),
                candidate("q-internal-4", "medium", true)
        ));

        var result = service.select("ASEAN", "MEDIUM");

        assertEquals(3, result.size());
        assertEquals(List.of("A", "B", "C", "D"), result.getFirst().options().stream().map(option -> option.id()).toList());
        assertEquals("B", result.getFirst().correctOptionId());
        assertEquals("MEDIUM", result.getFirst().difficulty());
        verify(repository).findEligible("ASEAN", "MEDIUM", 3);
    }

    @Test
    void rejectsStructurallyUnsafeCandidateAndAllowsZeroExamples() {
        AiStyleExampleService service = new AiStyleExampleService(repository, properties(3));
        when(repository.findEligible("topic", "HARD", 3)).thenReturn(List.of(candidate("bad", "hard", false)));
        assertTrue(service.select("topic", "HARD").isEmpty());

        AiStyleExampleService disabled = new AiStyleExampleService(repository, properties(0));
        assertTrue(disabled.select("topic", "HARD").isEmpty());
    }

    private static StyleQuestionCandidate candidate(String id, String difficulty, boolean valid) {
        List<StyleQuestionCandidate.Option> options = valid
                ? List.of(
                new StyleQuestionCandidate.Option("A", "A text", false),
                new StyleQuestionCandidate.Option("B", "B text", true),
                new StyleQuestionCandidate.Option("C", "C text", false),
                new StyleQuestionCandidate.Option("D", "D text", false))
                : List.of(new StyleQuestionCandidate.Option("A", "Only one", true));
        return new StyleQuestionCandidate(id, "Question?", "Explanation", difficulty, 1, options);
    }

    static AiServiceProperties properties(int maxStyles) {
        return new AiServiceProperties(true, URI.create("http://127.0.0.1:8001"), Duration.ofSeconds(5),
                Duration.ofSeconds(90), "/ai/quiz/generate", "/ai/health",
                "/ai/provenance/validate", "test-internal-token", maxStyles);
    }
}
