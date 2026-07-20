package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateDtos;
import com.lichsuvn.backend.exam.ai.review.application.AiCandidateService;
import com.lichsuvn.backend.exam.ai.review.application.AiCandidateMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiCandidateRepository;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import com.lichsuvn.backend.exam.ai.client.AiProvenanceClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiCandidateServiceTest {
    private final AiGenerationReceiptRepository receipts = mock(AiGenerationReceiptRepository.class);
    private final AiCandidateRepository repository = mock(AiCandidateRepository.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final AiProvenanceClient provenance = mock(AiProvenanceClient.class);
    private AiCandidateService service;

    @BeforeEach
    void setUp() {
        when(transactions.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
        service = new AiCandidateService(receipts, repository, provenance, transactions,
                new AiCandidateMetrics(new SimpleMeterRegistry()));
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

    @Test
    void teacherCanViewButCannotPublish() {
        when(repository.list(null, null, null, null, null, null, null, null, null, 20, 0))
                .thenReturn(new AiCandidateDtos.Page(List.of(), 0, 20, 0));
        assertEquals(0, service.list(null, null, null, null, null, null, null, null, null, 20, 0, teacher()).total());
        ApiException error = assertThrows(ApiException.class, () -> service.publish(ID, publishRequest(1), teacher()));
        assertEquals("AI_CANDIDATE_PUBLISH_FORBIDDEN", error.getCode());
    }

    @Test
    void creatorCannotApproveWithoutExplicitAdminOverride() {
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.PENDING_REVIEW, 1));
        ApiException teacherError = assertThrows(ApiException.class, () -> service.approve(ID,
                new AiCandidateDtos.ApproveRequest(1L, null, false, null), teacher()));
        assertEquals("AI_CANDIDATE_REVIEW_FORBIDDEN", teacherError.getCode());

        ApiException adminMissingReason = assertThrows(ApiException.class, () -> service.approve(ID,
                new AiCandidateDtos.ApproveRequest(1L, null, true, " "), admin()));
        assertEquals("AI_CANDIDATE_INVALID_CONTENT", adminMissingReason.getCode());
    }

    @Test
    void anotherReviewerCanApproveAfterSuccessfulLiveValidation() {
        AiCandidateDtos.Detail detail = validDetail();
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.PENDING_REVIEW, 1));
        when(repository.detail(ID)).thenReturn(detail);
        when(provenance.validate(any(), any())).thenReturn(validProvenance());
        when(repository.transition(any(), eq(1L), eq(AiCandidateStatus.APPROVED), any(), any(), eq("APPROVED"), any()))
                .thenReturn(true);

        assertSame(detail, service.approve(ID, new AiCandidateDtos.ApproveRequest(1L, "checked", false, null), reviewer()));
        verify(repository).provenanceValidation(any(), eq(1L), eq("APPROVE"), eq("a".repeat(64)),
                eq("collection"), eq(1), eq(true), eq(List.of()), any(), any());
        verify(repository).transition(any(), eq(1L), eq(AiCandidateStatus.APPROVED), any(), eq("checked"), eq("APPROVED"), any());
    }

    @Test
    void explicitAdminSelfReviewOverrideHasSeparateAuditTrace() {
        AiCandidateDtos.Detail detail = validDetail();
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.PENDING_REVIEW, 1));
        when(repository.detail(ID)).thenReturn(detail);
        when(provenance.validate(any(), any())).thenReturn(validProvenance());
        when(repository.transition(any(), eq(1L), eq(AiCandidateStatus.APPROVED), any(), any(), eq("APPROVED"), any()))
                .thenReturn(true);

        service.approve(ID, new AiCandidateDtos.ApproveRequest(1L, null, true, "single-admin demo"), admin());
        verify(repository).selfReviewOverride(any(), any(), eq("single-admin demo"), any());
    }

    @Test
    void adminSelfReviewOverrideIsDeniedWhenAnotherReviewerExists() {
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.PENDING_REVIEW, 1));
        when(repository.hasOtherReviewer(any())).thenReturn(true);
        ApiException error = assertThrows(ApiException.class, () -> service.approve(ID,
                new AiCandidateDtos.ApproveRequest(1L, null, true, "not actually alone"), admin()));
        assertEquals("AI_CANDIDATE_REVIEW_FORBIDDEN", error.getCode());
        verify(provenance, never()).validate(any(), any());
    }

    @Test
    void provenanceFailureIsAuditedAndLeavesSubmitStatusUnchanged() {
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.DRAFT, 1));
        when(repository.detail(ID)).thenReturn(validDetail());
        when(provenance.validate(any(), any())).thenReturn(new AiProvenanceDtos.Response(false, true, true, true,
                List.of(new AiProvenanceDtos.SourceResult("chunk-1", null, false, false, false,
                        null, null, null, null, null, null, null)), List.of("SOURCE_MISSING")));

        ApiException error = assertThrows(ApiException.class,
                () -> service.submit(ID, new AiCandidateDtos.VersionRequest(1L, null), teacher()));
        assertEquals("AI_CANDIDATE_SOURCE_MISSING", error.getCode());
        verify(repository).provenanceValidation(any(), eq(1L), eq("SUBMIT"), any(), any(), eq(1), eq(false),
                eq(List.of("SOURCE_MISSING")), any(), any());
        verify(repository, never()).transition(any(), any(Long.class), any(), any(), any(), any(), any());
    }

    @Test
    void unavailableProvenanceFailsClosedAndIsAudited() {
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.DRAFT, 1));
        when(repository.detail(ID)).thenReturn(validDetail());
        when(provenance.validate(any(), any())).thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "AI_PROVENANCE_SERVICE_UNAVAILABLE", "AI provenance service is unavailable"));

        ApiException error = assertThrows(ApiException.class,
                () -> service.submit(ID, new AiCandidateDtos.VersionRequest(1L, null), teacher()));
        assertEquals("AI_PROVENANCE_SERVICE_UNAVAILABLE", error.getCode());
        verify(repository).provenanceValidation(any(), eq(1L), eq("SUBMIT"), any(), any(), eq(1), eq(false),
                eq(List.of("AI_PROVENANCE_SERVICE_UNAVAILABLE")), any(), any());
        verify(repository, never()).transition(any(), any(Long.class), any(), any(), any(), any(), any());
    }

    @Test
    void publishedHeadCreatesExactlyOneNumberedRevision() {
        byte[] official = bytes(2);
        AiCandidateRepository.Candidate parent = candidate(AiCandidateStatus.PUBLISHED, 4, "GENERATED", official, null, null, null);
        AiCandidateRepository.RevisionHead head = new AiCandidateRepository.RevisionHead(official, official, null, 2);
        AiCandidateRepository.OfficialSnapshot base = snapshot(official);
        AiCandidateDtos.Detail created = mock(AiCandidateDtos.Detail.class);
        when(repository.findForUpdate(ID)).thenReturn(parent);
        when(repository.lockRevisionHead(official)).thenReturn(head);
        when(repository.officialSnapshot(official)).thenReturn(base);
        when(repository.createRevision(eq(parent), eq(head), eq(base), eq("Sửa dữ kiện"), any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn("00000000-0000-0000-0000-000000000002");
        when(repository.detail("00000000-0000-0000-0000-000000000002")).thenReturn(created);

        assertSame(created, service.createRevision(ID, new AiCandidateDtos.RevisionCreateRequest("Sửa dữ kiện"), teacher()));
        verify(repository).createRevision(eq(parent), eq(head), eq(base), eq("Sửa dữ kiện"), any(), any());
    }

    @Test
    void secondOpenRevisionIsRejectedBeforeAnyCopy() {
        byte[] official = bytes(2);
        AiCandidateRepository.Candidate parent = candidate(AiCandidateStatus.PUBLISHED, 4, "GENERATED", official, null, null, null);
        when(repository.findForUpdate(ID)).thenReturn(parent);
        when(repository.lockRevisionHead(official)).thenReturn(new AiCandidateRepository.RevisionHead(official, official, bytes(3), 3));

        ApiException error = assertThrows(ApiException.class,
                () -> service.createRevision(ID, new AiCandidateDtos.RevisionCreateRequest("another"), admin()));
        assertEquals("AI_REVISION_ALREADY_OPEN", error.getCode());
        verify(repository, never()).createRevision(any(), any(), any(), any(), any(), any());
    }

    @Test
    void nonPublishedCandidateAndStudentCannotCreateRevision() {
        ApiException denied = assertThrows(ApiException.class,
                () -> service.createRevision(ID, new AiCandidateDtos.RevisionCreateRequest("reason"), student()));
        assertEquals("AI_CANDIDATE_FORBIDDEN", denied.getCode());
        when(repository.findForUpdate(ID)).thenReturn(candidate(AiCandidateStatus.APPROVED, 3));
        ApiException invalid = assertThrows(ApiException.class,
                () -> service.createRevision(ID, new AiCandidateDtos.RevisionCreateRequest("reason"), teacher()));
        assertEquals("AI_REVISION_INVALID_PARENT", invalid.getCode());
    }

    @Test
    void remapUsesOnlyCanonicalValidatedSourcesOnEditableRevision() {
        AiCandidateRepository.Candidate revision = candidate(AiCandidateStatus.DRAFT, 5, "REVISION", null, bytes(2), bytes(2), "c".repeat(64));
        when(repository.find(ID)).thenReturn(revision);
        when(repository.findForUpdate(ID)).thenReturn(revision);
        when(repository.revisionConflict(revision)).thenReturn(null);
        when(provenance.validate(any(), any())).thenReturn(validProvenance());
        when(repository.remapSources(eq(revision), eq(5L), any(), any(), eq("Đổi nguồn"), any())).thenReturn(true);
        AiCandidateDtos.Detail detail = validDetail();
        when(repository.detail(ID)).thenReturn(detail);

        assertSame(detail, service.remapSources(ID, new AiCandidateDtos.SourceRemapRequest(5L,
                List.of(new AiCandidateDtos.SourceIdentity("chunk-1", "b".repeat(64))), "Đổi nguồn"), admin()));
        verify(repository).provenanceValidation(eq(revision.id()), eq(5L), eq("REMAP"), any(), any(), eq(1), eq(true), eq(List.of()), any(), any());
        verify(repository).remapSources(eq(revision), eq(5L), any(), any(), eq("Đổi nguồn"), any());
    }

    @Test
    void duplicateOrApprovedSourceRemapIsRejectedWithoutCallingAiService() {
        AiCandidateRepository.Candidate draft = candidate(AiCandidateStatus.DRAFT, 5, "REVISION", null, bytes(2), bytes(2), "c".repeat(64));
        when(repository.find(ID)).thenReturn(draft);
        when(repository.revisionConflict(draft)).thenReturn(null);
        var duplicate = new AiCandidateDtos.SourceIdentity("chunk-1", "b".repeat(64));
        ApiException duplicateError = assertThrows(ApiException.class, () -> service.remapSources(ID,
                new AiCandidateDtos.SourceRemapRequest(5L, List.of(duplicate, duplicate), "reason"), teacher()));
        assertEquals("AI_CANDIDATE_PROVENANCE_INVALID", duplicateError.getCode());
        when(repository.find(ID)).thenReturn(candidate(AiCandidateStatus.APPROVED, 5, "REVISION", null, bytes(2), bytes(2), "c".repeat(64)));
        ApiException statusError = assertThrows(ApiException.class, () -> service.remapSources(ID,
                new AiCandidateDtos.SourceRemapRequest(5L, List.of(duplicate), "reason"), teacher()));
        assertEquals("AI_CANDIDATE_INVALID_STATUS", statusError.getCode());
        verify(provenance, never()).validate(any(), any());
    }

    @Test
    void staleRevisionBaseFailsClosedBeforeSubmit() {
        AiCandidateRepository.Candidate revision = candidate(AiCandidateStatus.DRAFT, 5, "REVISION", null, bytes(2), bytes(2), "c".repeat(64));
        when(repository.find(ID)).thenReturn(revision);
        when(repository.detail(ID)).thenReturn(validDetail());
        when(repository.revisionConflict(revision)).thenReturn("AI_REVISION_BASE_CHANGED");
        ApiException error = assertThrows(ApiException.class,
                () -> service.submit(ID, new AiCandidateDtos.VersionRequest(5L, null), teacher()));
        assertEquals("AI_REVISION_BASE_CHANGED", error.getCode());
        verify(repository).revisionBaseConflict(eq(revision), any(), eq("AI_REVISION_BASE_CHANGED"), any());
        verify(provenance, never()).validate(any(), any());
    }

    @Test
    void revisionPublishCreatesNewOfficialAndAdvancesRevisionChain() {
        byte[] baseId = bytes(2);
        byte[] newId = bytes(3);
        byte[] dataset = bytes(4), definition = bytes(5), section = bytes(6);
        AiCandidateRepository.Candidate revision = candidate(AiCandidateStatus.APPROVED, 7, "REVISION", null, baseId, baseId, "c".repeat(64));
        AiCandidateRepository.PublishTarget target = new AiCandidateRepository.PublishTarget(dataset, definition, section, "HIDDEN", "REVIEW_REQUIRED");
        AiCandidateRepository.OfficialSnapshot base = new AiCandidateRepository.OfficialSnapshot(baseId, dataset, definition, section,
                "c".repeat(64), "Base", "Base explanation", "MEDIUM", "Topic", validDetail().options());
        when(repository.find(ID)).thenReturn(revision);
        when(repository.detail(ID)).thenReturn(validDetail());
        when(repository.revisionConflict(revision)).thenReturn(null);
        when(provenance.validate(any(), any())).thenReturn(validProvenance());
        when(repository.findForUpdate(ID)).thenReturn(revision);
        when(repository.publishTarget(any(), any(), any())).thenReturn(target);
        when(repository.officialSnapshot(baseId)).thenReturn(base);
        when(repository.insertOfficial(revision, target)).thenReturn(newId);
        when(repository.markRevisionPublished(eq(revision), eq(7L), eq(newId), any(), org.mockito.ArgumentMatchers.anyString())).thenReturn(true);

        service.publish(ID, new AiCandidateDtos.PublishRequest(7L, UUID.nameUUIDFromBytes(dataset).toString(),
                UUID.nameUUIDFromBytes(definition).toString(), UUID.nameUUIDFromBytes(section).toString()), admin());
        verify(repository).insertOfficial(revision, target);
        verify(repository).markRevisionPublished(eq(revision), eq(7L), eq(newId), any(), any());
        verify(repository, never()).markPublished(any(), any(Long.class), any(), any(), any());
    }

    @Test
    void concurrentPublishLoserReturnsExistingReferenceWhenWinnerCommitsDuringRevalidation() {
        AiCandidateRepository.Candidate approved = candidate(AiCandidateStatus.APPROVED, 7);
        AiCandidateRepository.Candidate published = candidate(AiCandidateStatus.PUBLISHED, 8);
        AiCandidateDtos.Detail detail = validDetail();
        when(repository.find(ID)).thenReturn(approved, published);
        when(repository.detail(ID)).thenReturn(detail);
        when(provenance.validate(any(), any())).thenThrow(new ApiException(HttpStatus.BAD_GATEWAY,
                "AI_CANDIDATE_PROVENANCE_INVALID", "Concurrent validation response was unavailable"));

        assertSame(detail, service.publish(ID, publishRequest(7), admin()));
        verify(repository, never()).insertOfficial(any(), any());
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
        return candidate(status, version, "GENERATED", null, null, null, null);
    }

    private static AiCandidateRepository.Candidate candidate(AiCandidateStatus status, long version, String origin,
                                                               byte[] officialId, byte[] rootId, byte[] baseId, String baseHash) {
        byte[] id = new byte[16];
        return new AiCandidateRepository.Candidate(id, status, "Question", "Explanation", "MEDIUM",
                "Original", "Original explanation", "A", 12, 6, "Topic", "Query", 1,
                "request", "gemini-2.5-flash", "gemini-embedding-2", 768, "prompt-v1", "schema-v1",
                "a".repeat(64), "collection", "PASSED", "[]", "[]", id, null, null, null,
                LocalDateTime.now(), LocalDateTime.now(), null, null, null, null, null, officialId,
                false, null, version, origin, null, rootId, baseId, "REVISION".equals(origin) ? 2 : null,
                "REVISION".equals(origin) ? "reason" : null, baseHash, "Base", "Base explanation", "MEDIUM", "Topic");
    }

    private static AiCandidateRepository.OfficialSnapshot snapshot(byte[] official) {
        return new AiCandidateRepository.OfficialSnapshot(official, bytes(4), bytes(5), bytes(6), "c".repeat(64),
                "Base", "Base explanation", "MEDIUM", "Topic", validDetail().options());
    }

    private static byte[] bytes(int value) { byte[] result = new byte[16]; result[15] = (byte) value; return result; }

    private static AiCandidateDtos.Detail validDetail() {
        return new AiCandidateDtos.Detail(ID, AiCandidateStatus.PENDING_REVIEW, "Question", "Explanation", "MEDIUM",
                "Original", "Original explanation", "A", 12, 6, "Topic", "Query", 1, "request",
                "gemini-2.5-flash", "gemini-embedding-2", 768, "prompt-v1", "schema-v1", "a".repeat(64),
                "collection", "PASSED", List.of(), List.of(), ID, null, null, null, LocalDateTime.now(),
                LocalDateTime.now(), null, null, null, null, null, null, false, null, 1,
                List.of(new AiCandidateDtos.Option("A", "A", true, 1, "A"), new AiCandidateDtos.Option("B", "B", false, 2, "B"),
                        new AiCandidateDtos.Option("C", "C", false, 3, "C"), new AiCandidateDtos.Option("D", "D", false, 4, "D")),
                List.of(new AiCandidateDtos.Source("chunk-1", "doc", 12, 6, "Lesson", "Section", 1, 1, "b".repeat(64), 1)),
                new AiCandidateDtos.RevisionInfo("GENERATED", null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, List.of(), List.of()));
    }

    private static AiProvenanceDtos.Response validProvenance() {
        return new AiProvenanceDtos.Response(true, true, true, true,
                List.of(new AiProvenanceDtos.SourceResult("chunk-1", "b".repeat(64), true, true, false,
                        "doc", 12, 6, "Lesson", "Section", 1, 1)), List.of());
    }

    private static final String ID = "00000000-0000-0000-0000-000000000000";
    private static UserPrincipal admin() { return new UserPrincipal("admin", new byte[16], "admin@test", List.of("admin")); }
    private static UserPrincipal student() { return new UserPrincipal("student", new byte[16], "student@test", List.of("student")); }
    private static UserPrincipal teacher() { return new UserPrincipal("teacher", new byte[16], "teacher@test", List.of("teacher")); }
    private static UserPrincipal reviewer() { return new UserPrincipal("reviewer", new byte[] {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, "reviewer@test", List.of("teacher")); }
}
