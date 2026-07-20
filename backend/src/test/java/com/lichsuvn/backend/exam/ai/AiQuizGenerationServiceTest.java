package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizDifficulty;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.application.AiQuizGenerationService;
import com.lichsuvn.backend.exam.ai.application.AiQuizMetrics;
import com.lichsuvn.backend.exam.ai.application.AiStyleExampleService;
import com.lichsuvn.backend.exam.ai.client.AiQuizClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiQuizGenerationServiceTest {
    private final AiQuizClient client = mock(AiQuizClient.class);
    private final AiStyleExampleService styles = mock(AiStyleExampleService.class);
    private final AiQuizMetrics metrics = mock(AiQuizMetrics.class);
    private AiQuizGenerationService service;

    @BeforeEach
    void setUp() {
        service = new AiQuizGenerationService(client, styles, AiStyleExampleServiceTest.properties(3), metrics);
        when(styles.select(anyString(), anyString())).thenReturn(List.of());
    }

    @Test
    void mapsFullResponseAndPreservesManualReviewWarning() {
        when(client.generate(any(), anyString())).thenReturn(response(2, 2, "B", List.of("PROPER_NAME_EVIDENCE_WARNING")));

        var result = service.generate(request(2), principal());

        assertEquals(2, result.questions().size());
        assertFalse(result.generation().partial());
        assertEquals(List.of("PROPER_NAME_EVIDENCE_WARNING"), result.warnings());
        assertFalse(result.warnings().contains("FACTUAL_ERROR"));
        verify(metrics).success(false);
    }

    @Test
    void acceptsPartialWithoutCallingAgain() {
        when(client.generate(any(), anyString())).thenReturn(response(3, 1, "B", List.of("INSUFFICIENT_VALID_QUESTIONS")));

        var result = service.generate(request(3), principal());

        assertTrue(result.generation().partial());
        assertEquals(1, result.questions().size());
        verify(client).generate(any(), anyString());
        verify(metrics).success(true);
    }

    @Test
    void rejectsZeroQuestionsAndInvalidCorrectOption() {
        when(client.generate(any(), anyString())).thenReturn(response(1, 0, "B", List.of()));
        ApiException zero = assertThrows(ApiException.class, () -> service.generate(request(1), principal()));
        assertEquals("AI_INSUFFICIENT_CONTEXT", zero.getCode());

        when(client.generate(any(), anyString())).thenReturn(response(1, 1, "Z", List.of()));
        ApiException invalid = assertThrows(ApiException.class, () -> service.generate(request(1), principal()));
        assertEquals("AI_SERVICE_INVALID_RESPONSE", invalid.getCode());
    }

    @Test
    void rejectsMissingQuestionsAndUnknownSourceIds() {
        AiQuizGenerationResponse missing = new AiQuizGenerationResponse(null, List.of(),
                new AiQuizGenerationResponse.Metadata(1, 1, 1, "g", "e", "c", "p", "s", 0, 1.0), List.of());
        when(client.generate(any(), anyString())).thenReturn(missing);
        assertEquals("AI_SERVICE_INVALID_RESPONSE",
                assertThrows(ApiException.class, () -> service.generate(request(1), principal())).getCode());

        AiQuizGenerationResponse unknownSource = response(1, 1, "B", List.of());
        unknownSource = new AiQuizGenerationResponse(
                List.of(new AiQuizGenerationResponse.Question(
                        unknownSource.questions().getFirst().question(), unknownSource.questions().getFirst().options(), "B",
                        "Explanation", "MEDIUM", List.of("unknown-chunk"))),
                unknownSource.sources(), unknownSource.metadata(), unknownSource.warnings());
        when(client.generate(any(), anyString())).thenReturn(unknownSource);
        assertEquals("AI_SERVICE_INVALID_RESPONSE",
                assertThrows(ApiException.class, () -> service.generate(request(1), principal())).getCode());
    }

    @Test
    void disabledServiceDoesNotReadStylesOrCallAi() {
        AiServiceProperties disabled = new AiServiceProperties(false,
                AiStyleExampleServiceTest.properties(3).baseUrl(),
                AiStyleExampleServiceTest.properties(3).connectTimeout(),
                AiStyleExampleServiceTest.properties(3).readTimeout(),
                "/ai/quiz/generate", "/ai/health", 3);
        AiQuizGenerationService disabledService = new AiQuizGenerationService(client, styles, disabled, metrics);

        ApiException error = assertThrows(ApiException.class, () -> disabledService.generate(request(1), principal()));

        assertEquals("AI_SERVICE_DISABLED", error.getCode());
        verify(styles, never()).select(anyString(), anyString());
        verify(client, never()).generate(any(), anyString());
    }

    private static AiQuizGenerateRequest request(int count) {
        return new AiQuizGenerateRequest("Nguyên nhân thắng lợi", 12, 6, null, AiQuizDifficulty.MEDIUM, count, 5);
    }

    private static UserPrincipal principal() {
        return new UserPrincipal("user-1", new byte[16], "student@example.test", List.of("student"));
    }

    private static AiQuizGenerationResponse response(int requested, int generated, String correct, List<String> warnings) {
        List<AiQuizGenerationResponse.Question> questions = java.util.stream.IntStream.range(0, generated)
                .mapToObj(index -> new AiQuizGenerationResponse.Question(
                        "Question " + index,
                        List.of(
                                new AiQuizGenerationResponse.Option("A", "Option A"),
                                new AiQuizGenerationResponse.Option("B", "Option B"),
                                new AiQuizGenerationResponse.Option("C", "Option C"),
                                new AiQuizGenerationResponse.Option("D", "Option D")
                        ), correct, "Explanation", "MEDIUM", List.of("chunk-1")
                )).toList();
        return new AiQuizGenerationResponse(
                questions,
                List.of(new AiQuizGenerationResponse.Source("chunk-1", "doc-1", 12, 6, "Lesson", "Section", 1, 1)),
                new AiQuizGenerationResponse.Metadata(requested, generated, 1, "model", "embedding", "collection", "prompt", "schema", 0, 10.0),
                warnings
        );
    }
}
