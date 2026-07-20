package com.lichsuvn.backend.exam.ai.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateResponse;
import com.lichsuvn.backend.exam.ai.client.AiQuizClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationRequest;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;
import com.lichsuvn.backend.exam.ai.client.dto.AiStyleExample;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class AiQuizGenerationService {
    private static final Logger log = LoggerFactory.getLogger(AiQuizGenerationService.class);
    private static final List<String> OPTION_IDS = List.of("A", "B", "C", "D");

    private final AiQuizClient client;
    private final AiStyleExampleService styleExamples;
    private final AiServiceProperties properties;
    private final AiQuizMetrics metrics;
    private final AiGenerationReceiptRepository receipts;

    public AiQuizGenerationService(
            AiQuizClient client,
            AiStyleExampleService styleExamples,
            AiServiceProperties properties,
            AiQuizMetrics metrics,
            AiGenerationReceiptRepository receipts
    ) {
        this.client = client;
        this.styleExamples = styleExamples;
        this.properties = properties;
        this.metrics = metrics;
        this.receipts = receipts;
    }

    public AiQuizGenerateResponse generate(AiQuizGenerateRequest request, UserPrincipal principal) {
        if (!properties.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_DISABLED", "AI quiz generation is disabled");
        }
        String requestId = UUID.randomUUID().toString();
        long started = System.nanoTime();
        metrics.request();
        try {
            List<AiStyleExample> selectedStyles = styleExamples.select(request.query(), request.difficulty().name());
            AiQuizGenerationResponse response = client.generate(new AiQuizGenerationRequest(
                    request.query().trim(), request.grade(), request.lessonNumber(), normalize(request.documentId()),
                    request.difficulty().name(), request.count(), request.topK(), selectedStyles
            ), requestId);
            AiQuizGenerateResponse mapped = validateAndMap(response, request.difficulty().name());
            AiGenerationReceiptRepository.Issued receipt;
            try {
                receipt = receipts.issue(request, response, principal, requestId);
            } catch (DataAccessException ex) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_GENERATION_RECEIPT_UNAVAILABLE",
                        "Generation receipt could not be created");
            }
            mapped = new AiQuizGenerateResponse(mapped.questions(), mapped.sources(), mapped.warnings(), mapped.generation(),
                    new AiQuizGenerateResponse.GenerationReceipt(receipt.id(), receipt.expiresAt().toString()));
            metrics.success(mapped.generation().partial());
            log.info(
                    "AI quiz generated requestId={} userId={} grade={} lessonNumber={} difficulty={} requestedCount={} styleExampleCount={} generatedCount={} partial={}",
                    requestId, principal == null ? "unknown" : principal.id(), request.grade(), request.lessonNumber(),
                    request.difficulty(), mapped.generation().requestedCount(), selectedStyles.size(),
                    mapped.generation().generatedCount(), mapped.generation().partial()
            );
            return mapped;
        } catch (ApiException ex) {
            metrics.failure(ex.getCode());
            log.warn("AI quiz generation failed requestId={} code={}", requestId, ex.getCode());
            throw ex;
        } catch (DataAccessException ex) {
            metrics.failure("AI_STYLE_EXAMPLES_UNAVAILABLE");
            log.warn("AI quiz generation failed requestId={} code=AI_STYLE_EXAMPLES_UNAVAILABLE", requestId);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_STYLE_EXAMPLES_UNAVAILABLE", "Verified style examples are unavailable");
        } catch (RuntimeException ex) {
            metrics.failure("AI_SERVICE_UNEXPECTED");
            throw ex;
        } finally {
            metrics.latency(System.nanoTime() - started);
        }
    }

    private static AiQuizGenerateResponse validateAndMap(AiQuizGenerationResponse response, String expectedDifficulty) {
        if (response == null || response.questions() == null || response.sources() == null
                || response.metadata() == null || response.warnings() == null) {
            throw invalid("AI Service response is missing required fields");
        }
        Integer requested = response.metadata().requestedCount();
        Integer generated = response.metadata().generatedCount();
        if (requested == null || generated == null || requested < 1 || generated < 0
                || generated > requested || generated != response.questions().size()
                || response.metadata().embeddingDimension() == null || response.metadata().embeddingDimension() < 1
                || blank(response.metadata().corpusSha256()) || response.metadata().corpusSha256().length() != 64) {
            throw invalid("AI Service response has inconsistent generation counts");
        }
        if (generated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "AI_INSUFFICIENT_CONTEXT", "AI Service returned no usable questions");
        }
        Set<String> sourceIds = new HashSet<>();
        for (AiQuizGenerationResponse.Source source : response.sources()) {
            if (source == null || blank(source.chunkId())) throw invalid("AI Service response contains an invalid source");
            sourceIds.add(source.chunkId());
        }
        List<AiQuizGenerateResponse.Question> questions = response.questions().stream()
                .map(question -> validateAndMapQuestion(question, sourceIds, expectedDifficulty))
                .toList();
        List<AiQuizGenerateResponse.Source> sources = response.sources().stream()
                .map(source -> new AiQuizGenerateResponse.Source(
                        source.chunkId(), source.documentId(), source.grade(), source.lessonNumber(),
                        source.lessonTitle(), source.sectionTitle(), source.pageStart(), source.pageEnd(), source.chunkHash()
                )).toList();
        return new AiQuizGenerateResponse(
                questions,
                sources,
                List.copyOf(response.warnings()),
                new AiQuizGenerateResponse.Generation(requested, generated, generated < requested),
                null
        );
    }

    private static AiQuizGenerateResponse.Question validateAndMapQuestion(
            AiQuizGenerationResponse.Question question,
            Set<String> availableSources,
            String expectedDifficulty
    ) {
        if (question == null || blank(question.question()) || blank(question.explanation())
                || question.options() == null || question.options().size() != 4
                || question.sourceChunkIds() == null || question.sourceChunkIds().isEmpty()
                || !expectedDifficulty.equals(question.difficulty())) {
            throw invalid("AI Service response contains an invalid question");
        }
        if (question.options().stream().anyMatch(option -> option == null || blank(option.text()))) {
            throw invalid("AI Service response contains an invalid option");
        }
        List<String> ids = question.options().stream().map(AiQuizGenerationResponse.Option::id).toList();
        if (!OPTION_IDS.equals(ids) || !ids.contains(question.correctOptionId())
                || new HashSet<>(question.sourceChunkIds()).size() != question.sourceChunkIds().size()
                || !availableSources.containsAll(question.sourceChunkIds())) {
            throw invalid("AI Service response violates the quiz contract");
        }
        return new AiQuizGenerateResponse.Question(
                question.question(),
                question.options().stream().map(option -> new AiQuizGenerateResponse.Option(option.id(), option.text())).toList(),
                question.correctOptionId(), question.explanation(), question.difficulty(),
                List.copyOf(question.sourceChunkIds())
        );
    }

    private static String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_INVALID_RESPONSE", message);
    }
}
