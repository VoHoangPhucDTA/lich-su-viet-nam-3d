package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateDtos;
import com.lichsuvn.backend.exam.ai.review.application.AiCandidateService;
import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiCandidateRepository;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiCandidateServiceTest {
    private final AiGenerationReceiptRepository receipts = mock(AiGenerationReceiptRepository.class);
    private final AiCandidateRepository repository = mock(AiCandidateRepository.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private AiCandidateService service;

    @BeforeEach
    void setUp() {
        service = new AiCandidateService(receipts, repository, transactions);
    }

    @Test
    void studentCannotReadReviewQueue() {
        ApiException error = assertThrows(ApiException.class, () -> service.list(
                null, null, null, null, null, null, null, null, null, 20, 0, student()));
        assertEquals("AI_CANDIDATE_FORBIDDEN", error.getCode());
        verify(repository, never()).list(null, null, null, null, null, null, null, null, null, 20, 0);
    }

    @Test
    void draftAndRejectedCannotPublish() {
        for (AiCandidateStatus status : List.of(AiCandidateStatus.DRAFT, AiCandidateStatus.REJECTED)) {
            when(repository.find(ID)).thenReturn(candidate(status, 2));
            ApiException error = assertThrows(ApiException.class,
                    () -> service.publish(ID, publishRequest(2), admin()));
            assertEquals("AI_CANDIDATE_INVALID_STATUS", error.getCode());
        }
        verify(repository, never()).insertOfficial(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void repeatedPublishIsIdempotent() {
        AiCandidateDtos.Detail detail = mock(AiCandidateDtos.Detail.class);
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.PUBLISHED, 4));
        when(repository.detail(ID)).thenReturn(detail);

        assertSame(detail, service.publish(ID, publishRequest(1), admin()));
        verify(repository, never()).insertOfficial(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void staleEditReturnsExplicitVersionConflict() {
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.DRAFT, 3));
        ApiException error = assertThrows(ApiException.class,
                () -> service.update(ID, updateRequest(2), admin()));
        assertEquals("AI_CANDIDATE_VERSION_CONFLICT", error.getCode());
        verify(repository, never()).updateContent(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
    }

    private static AiCandidateDtos.UpdateRequest updateRequest(long version) {
        return new AiCandidateDtos.UpdateRequest(version, "Question", "Explanation", "MEDIUM", 12, 6, "Topic",
                List.of(new AiCandidateDtos.OptionInput("A", "A", true), new AiCandidateDtos.OptionInput("B", "B", false),
                        new AiCandidateDtos.OptionInput("C", "C", false), new AiCandidateDtos.OptionInput("D", "D", false)), "note");
    }

    private static AiCandidateDtos.PublishRequest publishRequest(long version) {
        return new AiCandidateDtos.PublishRequest(version, UUID.randomUUID().toString(), UUID.randomUUID().toString(), UUID.randomUUID().toString());
    }

    private static AiCandidateRepository.Candidate candidate(AiCandidateStatus status, long version) {
        byte[] id = new byte[16];
        return new AiCandidateRepository.Candidate(id, status, "Question", "Explanation", "MEDIUM",
                "Original", "Original explanation", "A", 12, 6, "Topic", "Query", 1,
                "request", "gemini-2.5-flash", "gemini-embedding-2", 768, "prompt-v1", "schema-v1",
                "a".repeat(64), "collection", "PASSED", "[]", "[]", id, null, null, null,
                LocalDateTime.now(), LocalDateTime.now(), null, null, null, null, null, null, version);
    }

    private static final String ID = "00000000-0000-0000-0000-000000000000";
    private static UserPrincipal admin() { return new UserPrincipal("admin", new byte[16], "admin@test", List.of("admin")); }
    private static UserPrincipal student() { return new UserPrincipal("student", new byte[16], "student@test", List.of("student")); }
}
