package com.lichsuvn.backend.exam.ai.review.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateDtos;
import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiCandidateRepository;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.time.LocalDateTime;

@Service
public class AiCandidateService {
    private static final Set<String> DIFFICULTIES = Set.of("EASY", "MEDIUM", "HARD");
    private static final List<String> OPTION_IDS = List.of("A", "B", "C", "D");
    private final AiGenerationReceiptRepository receipts;
    private final AiCandidateRepository candidates;
    private final TransactionTemplate transaction;
    private final TransactionTemplate requiresNew;

    public AiCandidateService(AiGenerationReceiptRepository receipts, AiCandidateRepository candidates, PlatformTransactionManager manager) {
        this.receipts = receipts;
        this.candidates = candidates;
        this.transaction = new TransactionTemplate(manager);
        this.requiresNew = new TransactionTemplate(manager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public List<AiCandidateDtos.Detail> create(AiCandidateDtos.CreateRequest request, UserPrincipal principal) {
        requireAdmin(principal);
        AiGenerationReceiptRepository.Receipt receipt = receipts.findValid(request.generationReceiptId(), principal.idBytes());
        if (receipt == null) throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Generation receipt is invalid or expired");
        List<Integer> indexes = request.questionIndexes().stream().distinct().toList();
        if (indexes.size() != request.questionIndexes().size() || indexes.stream().anyMatch(index -> index < 0 || index >= receipt.response().questions().size())) {
            throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Question selection does not match generation receipt");
        }
        try {
            return transaction.execute(status -> indexes.stream()
                    .map(index -> candidates.detail(candidates.create(receipt, index, principal.idBytes(), requestId())))
                    .toList());
        } catch (DataIntegrityViolationException ex) {
            throw error(HttpStatus.CONFLICT, "AI_CANDIDATE_PROVENANCE_INVALID", "A selected generated question was already saved");
        }
    }

    public AiCandidateDtos.Page list(String status, String difficulty, Integer grade, Integer lessonNumber, String createdBy,
                                      String reviewedBy, String search, LocalDateTime createdFrom, LocalDateTime createdTo,
                                      Integer limit, Integer offset, UserPrincipal principal) {
        requireAdmin(principal);
        int safeLimit = limit == null ? 20 : Math.max(1, Math.min(100, limit));
        int safeOffset = offset == null ? 0 : Math.max(0, offset);
        if (status != null && !status.isBlank()) parseStatus(status);
        if (difficulty != null && !difficulty.isBlank() && !DIFFICULTIES.contains(difficulty)) invalidContent("Invalid difficulty filter");
        if (createdFrom != null && createdTo != null && createdFrom.isAfter(createdTo)) invalidContent("createdFrom must not be after createdTo");
        return candidates.list(status, difficulty, grade, lessonNumber, createdBy, reviewedBy, search,
                createdFrom, createdTo, safeLimit, safeOffset);
    }

    public AiCandidateDtos.Detail detail(String id, UserPrincipal principal) {
        requireAdmin(principal);
        AiCandidateDtos.Detail result = candidates.detail(id);
        if (result == null) notFound();
        return result;
    }

    public AiCandidateDtos.Detail update(String id, AiCandidateDtos.UpdateRequest request, UserPrincipal principal) {
        requireAdmin(principal);
        validateContent(request.questionText(), request.explanation(), request.difficulty(), request.grade(), request.lessonNumber(), request.options());
        AiCandidateRepository.Candidate current = current(id);
        requireVersion(current, request.version());
        if (current.status() != AiCandidateStatus.DRAFT && current.status() != AiCandidateStatus.REJECTED) invalidStatus("Only draft or rejected candidate can be edited");
        transaction.executeWithoutResult(status -> {
            if (!candidates.updateContent(current, request, principal.idBytes(), requestId())) versionConflict();
        });
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail submit(String id, AiCandidateDtos.VersionRequest request, UserPrincipal principal) {
        return transition(id, request.version(), request.note(), principal, Set.of(AiCandidateStatus.DRAFT, AiCandidateStatus.REJECTED), AiCandidateStatus.PENDING_REVIEW, "SUBMITTED");
    }

    public AiCandidateDtos.Detail approve(String id, AiCandidateDtos.VersionRequest request, UserPrincipal principal) {
        return transition(id, request.version(), request.note(), principal, Set.of(AiCandidateStatus.PENDING_REVIEW), AiCandidateStatus.APPROVED, "APPROVED");
    }

    public AiCandidateDtos.Detail reject(String id, AiCandidateDtos.RejectRequest request, UserPrincipal principal) {
        return transition(id, request.version(), request.reason(), principal, Set.of(AiCandidateStatus.PENDING_REVIEW), AiCandidateStatus.REJECTED, "REJECTED");
    }

    public AiCandidateDtos.Detail publish(String id, AiCandidateDtos.PublishRequest request, UserPrincipal principal) {
        requireAdmin(principal);
        AiCandidateRepository.Candidate before = current(id);
        if (before.status() == AiCandidateStatus.PUBLISHED) return candidates.detail(id);
        requireVersion(before, request.version());
        if (before.status() != AiCandidateStatus.APPROVED) invalidStatus("Only approved candidate can be published");
        validateStored(before.idString());
        String auditRequestId = requestId();
        try {
            transaction.executeWithoutResult(status -> {
                AiCandidateRepository.Candidate locked = candidates.findForUpdate(id);
                if (locked == null) notFound();
                requireVersion(locked, request.version());
                AiCandidateRepository.PublishTarget target = candidates.publishTarget(request.datasetId(), request.definitionId(), request.sectionId());
                if (target == null || !"HIDDEN".equals(target.visibility()) || !"REVIEW_REQUIRED".equals(target.verification())) {
                    throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_TARGET_INVALID", "Publish target must be a hidden review-required MCQ definition");
                }
                byte[] officialId = candidates.insertOfficial(locked, target);
                if (!candidates.markPublished(locked, request.version(), officialId, principal.idBytes(), auditRequestId)) versionConflict();
            });
        } catch (ApiException ex) {
            recordPublishFailure(before, principal, ex.getCode(), auditRequestId);
            throw ex;
        } catch (RuntimeException ex) {
            recordPublishFailure(before, principal, "AI_CANDIDATE_PUBLISH_FAILED", auditRequestId);
            throw error(HttpStatus.INTERNAL_SERVER_ERROR, "AI_CANDIDATE_PUBLISH_FAILED", "Candidate publish transaction failed");
        }
        return candidates.detail(id);
    }

    public List<AiCandidateDtos.AuditEvent> audit(String id, UserPrincipal principal) {
        requireAdmin(principal);
        current(id);
        return candidates.audit(id);
    }

    public List<AiCandidateDtos.PublishTarget> publishTargets(UserPrincipal principal) {
        requireAdmin(principal);
        return candidates.publishTargets();
    }

    private AiCandidateDtos.Detail transition(String id, long version, String note, UserPrincipal principal, Set<AiCandidateStatus> from,
                                               AiCandidateStatus target, String event) {
        requireAdmin(principal);
        AiCandidateRepository.Candidate current = current(id);
        requireVersion(current, version);
        if (!from.contains(current.status())) invalidStatus("Invalid candidate transition: " + current.status() + " -> " + target);
        validateStored(id);
        transaction.executeWithoutResult(status -> {
            if (!candidates.transition(current, version, target, principal.idBytes(), note, event, requestId())) versionConflict();
        });
        return candidates.detail(id);
    }

    private void validateStored(String id) {
        AiCandidateDtos.Detail value = candidates.detail(id);
        validateContent(value.questionText(), value.explanation(), value.difficulty(), value.grade(), value.lessonNumber(),
                value.options().stream().map(option -> new AiCandidateDtos.OptionInput(option.id(), option.text(), option.correct())).toList());
        if (value.sources().isEmpty() || blank(value.corpusSha256()) || blank(value.generationModel()) || blank(value.embeddingModel())
                || value.embeddingDimension() < 1 || blank(value.promptVersion()) || blank(value.schemaVersion())) {
            throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Candidate provenance is incomplete");
        }
    }

    private void validateContent(String question, String explanation, String difficulty, Integer grade, Integer lesson,
                                 List<AiCandidateDtos.OptionInput> options) {
        if (blank(question) || blank(explanation) || !DIFFICULTIES.contains(difficulty) || grade == null || !Set.of(10, 11, 12).contains(grade)
                || lesson != null && lesson < 1 || options == null || options.size() != 4) invalidContent("Candidate content is incomplete");
        List<String> ids = options.stream().map(AiCandidateDtos.OptionInput::id).toList();
        if (!OPTION_IDS.equals(ids) || new HashSet<>(ids).size() != 4 || options.stream().filter(AiCandidateDtos.OptionInput::correct).count() != 1
                || options.stream().anyMatch(option -> blank(option.text()))) invalidContent("Candidate must contain A-D and exactly one correct option");
    }

    private AiCandidateRepository.Candidate current(String id) {
        AiCandidateRepository.Candidate result = candidates.find(id);
        if (result == null) notFound();
        return result;
    }
    private void requireAdmin(UserPrincipal principal) {
        if (principal == null || principal.idBytes() == null || principal.idBytes().length != 16 || principal.roles() == null || !principal.roles().contains("admin")) {
            throw error(HttpStatus.FORBIDDEN, "AI_CANDIDATE_FORBIDDEN", "Admin role is required");
        }
    }
    private void requireVersion(AiCandidateRepository.Candidate value, long version) { if (value.version() != version) versionConflict(); }
    private AiCandidateStatus parseStatus(String value) { try { return AiCandidateStatus.valueOf(value); } catch (IllegalArgumentException ex) { throw invalidContent("Invalid candidate status"); } }
    private void notFound() { throw error(HttpStatus.NOT_FOUND, "AI_CANDIDATE_NOT_FOUND", "AI candidate not found"); }
    private void invalidStatus(String message) { throw error(HttpStatus.CONFLICT, "AI_CANDIDATE_INVALID_STATUS", message); }
    private ApiException invalidContent(String message) { throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_INVALID_CONTENT", message); }
    private void versionConflict() { throw error(HttpStatus.CONFLICT, "AI_CANDIDATE_VERSION_CONFLICT", "Candidate was changed by another reviewer"); }
    private ApiException error(HttpStatus status, String code, String message) { return new ApiException(status, code, message); }
    private boolean blank(String value) { return value == null || value.isBlank(); }
    private String requestId() { return UUID.randomUUID().toString(); }
    private void recordPublishFailure(AiCandidateRepository.Candidate candidate, UserPrincipal principal, String reason, String requestId) {
        try { requiresNew.executeWithoutResult(status -> candidates.publishFailed(candidate.id(), principal.idBytes(), reason, requestId)); }
        catch (RuntimeException ignored) { /* original publish error remains authoritative */ }
    }
}
