package com.lichsuvn.backend.exam.ai.review.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.review.api.AiCandidateDtos;
import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiCandidateRepository;
import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import com.lichsuvn.backend.exam.ai.review.security.AiCandidateAuthorization;
import com.lichsuvn.backend.exam.ai.review.security.AiCandidatePermission;
import com.lichsuvn.backend.exam.ai.client.AiProvenanceClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;
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
import java.util.Arrays;

@Service
public class AiCandidateService {
    private static final Set<String> DIFFICULTIES = Set.of("EASY", "MEDIUM", "HARD");
    private static final List<String> OPTION_IDS = List.of("A", "B", "C", "D");
    private final AiGenerationReceiptRepository receipts;
    private final AiCandidateRepository candidates;
    private final AiProvenanceClient provenance;
    private final AiCandidateMetrics metrics;
    private final TransactionTemplate transaction;
    private final TransactionTemplate requiresNew;

    public AiCandidateService(AiGenerationReceiptRepository receipts, AiCandidateRepository candidates,
                              AiProvenanceClient provenance, PlatformTransactionManager manager,
                              AiCandidateMetrics metrics) {
        this.receipts = receipts;
        this.candidates = candidates;
        this.provenance = provenance;
        this.metrics = metrics;
        this.transaction = new TransactionTemplate(manager);
        this.requiresNew = new TransactionTemplate(manager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public List<AiCandidateDtos.Detail> create(AiCandidateDtos.CreateRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_CREATE, principal, "AI_CANDIDATE_FORBIDDEN");
        AiGenerationReceiptRepository.Receipt receipt = receipts.findValid(request.generationReceiptId(), principal.idBytes());
        if (receipt == null) throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Generation receipt is invalid or expired");
        List<Integer> indexes = request.questionIndexes().stream().distinct().toList();
        if (indexes.size() != request.questionIndexes().size() || indexes.stream().anyMatch(index -> index < 0 || index >= receipt.response().questions().size())) {
            throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Question selection does not match generation receipt");
        }
        try {
            List<AiCandidateDtos.Detail> created = transaction.execute(status -> indexes.stream()
                    .map(index -> candidates.detail(candidates.create(receipt, index, principal.idBytes(), requestId())))
                    .toList());
            created.forEach(ignored -> metrics.lifecycle("create"));
            return created;
        } catch (DataIntegrityViolationException ex) {
            throw error(HttpStatus.CONFLICT, "AI_CANDIDATE_PROVENANCE_INVALID", "A selected generated question was already saved");
        }
    }

    public AiCandidateDtos.Page list(String status, String difficulty, Integer grade, Integer lessonNumber, String createdBy,
                                      String reviewedBy, String search, LocalDateTime createdFrom, LocalDateTime createdTo,
                                      Integer limit, Integer offset, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_VIEW, principal, "AI_CANDIDATE_FORBIDDEN");
        int safeLimit = limit == null ? 20 : Math.max(1, Math.min(100, limit));
        int safeOffset = offset == null ? 0 : Math.max(0, offset);
        if (status != null && !status.isBlank()) parseStatus(status);
        if (difficulty != null && !difficulty.isBlank() && !DIFFICULTIES.contains(difficulty)) invalidContent("Invalid difficulty filter");
        if (createdFrom != null && createdTo != null && createdFrom.isAfter(createdTo)) invalidContent("createdFrom must not be after createdTo");
        return candidates.list(status, difficulty, grade, lessonNumber, createdBy, reviewedBy, search,
                createdFrom, createdTo, safeLimit, safeOffset);
    }

    public AiCandidateDtos.Detail detail(String id, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_VIEW, principal, "AI_CANDIDATE_FORBIDDEN");
        AiCandidateDtos.Detail result = candidates.detail(id);
        if (result == null) notFound();
        return result;
    }

    public AiCandidateDtos.Detail update(String id, AiCandidateDtos.UpdateRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_EDIT, principal, "AI_CANDIDATE_FORBIDDEN");
        validateContent(request.questionText(), request.explanation(), request.difficulty(), request.grade(), request.lessonNumber(), request.options());
        AiCandidateRepository.Candidate current = current(id);
        requireVersion(current, request.version());
        if (current.status() != AiCandidateStatus.DRAFT && current.status() != AiCandidateStatus.REJECTED) invalidStatus("Only draft or rejected candidate can be edited");
        transaction.executeWithoutResult(status -> {
            if (!candidates.updateContent(current, request, principal.idBytes(), requestId())) versionConflict();
        });
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail createRevision(String id, AiCandidateDtos.RevisionCreateRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_CREATE, principal, "AI_CANDIDATE_FORBIDDEN");
        String createdId;
        try {
            createdId = transaction.execute(status -> {
                AiCandidateRepository.Candidate parent = candidates.findForUpdate(id);
                if (parent == null) notFound();
                if (parent.status() != AiCandidateStatus.PUBLISHED || parent.officialQuestionId() == null) {
                    throw error(HttpStatus.CONFLICT, "AI_REVISION_INVALID_PARENT", "Only a published candidate can be revised");
                }
                byte[] root = parent.rootOfficialQuestionId() == null ? parent.officialQuestionId() : parent.rootOfficialQuestionId();
                AiCandidateRepository.RevisionHead head = candidates.lockRevisionHead(root);
                if (head == null || !Arrays.equals(head.headOfficialId(), parent.officialQuestionId())) {
                    throw error(HttpStatus.CONFLICT, "AI_REVISION_HEAD_CONFLICT", "Create the revision from the current official head");
                }
                if (head.openCandidateId() != null) {
                    throw error(HttpStatus.CONFLICT, "AI_REVISION_ALREADY_OPEN", "An open revision already exists");
                }
                AiCandidateRepository.OfficialSnapshot base = candidates.officialSnapshot(parent.officialQuestionId());
                if (base == null || base.options().size() != 4) {
                    throw error(HttpStatus.CONFLICT, "AI_REVISION_BASE_CHANGED", "The official base snapshot is unavailable");
                }
                return candidates.createRevision(parent, head, base, request.reason(), principal.idBytes(), requestId());
            });
        } catch (IllegalStateException ex) {
            if (!"REVISION_HEAD_CLAIM_FAILED".equals(ex.getMessage())) throw ex;
            throw error(HttpStatus.CONFLICT, "AI_REVISION_ALREADY_OPEN", "A concurrent revision already claimed this official head");
        }
        metrics.revision("create");
        return candidates.detail(createdId);
    }

    public List<AiCandidateDtos.SourceSearchResult> sourceSearch(String id, AiCandidateDtos.SourceSearchRequest request,
                                                                 UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_EDIT, principal, "AI_CANDIDATE_FORBIDDEN");
        AiCandidateRepository.Candidate current = current(id);
        requireEditableRevision(current);
        AiProvenanceDtos.SearchResponse response = provenance.search(new AiProvenanceDtos.SearchRequest(
                request.query(), request.grade() == null ? current.grade() : request.grade(),
                request.lessonNumber() == null ? current.lessonNumber() : request.lessonNumber(), null,
                request.topK() == null ? 10 : request.topK()), requestId());
        if (response == null || response.results() == null) {
            throw error(HttpStatus.BAD_GATEWAY, "AI_SOURCE_SEARCH_UNAVAILABLE", "Canonical source search returned an invalid response");
        }
        return response.results().stream().filter(result -> !result.pendingReview() && result.excerpt() != null && result.excerpt().length() <= 600)
                .map(result -> new AiCandidateDtos.SourceSearchResult(result.chunkId(), result.chunkHash(), result.documentId(),
                        result.grade(), result.lessonNumber(), result.lessonTitle(), result.sectionTitle(), result.pageStart(),
                        result.pageEnd(), result.excerpt(), result.distance())).toList();
    }

    public AiCandidateDtos.Detail remapSources(String id, AiCandidateDtos.SourceRemapRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_EDIT, principal, "AI_CANDIDATE_FORBIDDEN");
        AiCandidateRepository.Candidate current = current(id);
        requireEditableRevision(current);
        requireVersion(current, request.version());
        validateRevisionBase(current, principal);
        if (request.sources().stream().map(AiCandidateDtos.SourceIdentity::chunkId).distinct().count() != request.sources().size()) {
            throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Duplicate source IDs are not allowed");
        }
        String validationRequestId = requestId();
        AiProvenanceDtos.Response response = provenance.validate(new AiProvenanceDtos.Request(
                current.corpusSha256(), current.collectionName(), current.embeddingModel(), current.embeddingDimension(),
                request.sources().stream().map(source -> new AiProvenanceDtos.Source(source.chunkId(), source.chunkHash())).toList()), validationRequestId);
        List<String> errors = response == null || response.errors() == null ? List.of("INVALID_RESPONSE") : response.errors();
        java.util.Map<String, String> requestedHashes = request.sources().stream().collect(java.util.stream.Collectors.toMap(
                AiCandidateDtos.SourceIdentity::chunkId, AiCandidateDtos.SourceIdentity::chunkHash, (left, right) -> left));
        boolean valid = response != null && response.valid() && response.sources() != null
                && response.sources().size() == request.sources().size()
                && response.sources().stream().allMatch(source -> source.exists() && source.hashMatches() && !source.pendingReview()
                && !blank(source.chunkHash()) && source.chunkHash().equals(requestedHashes.get(source.chunkId()))
                && !blank(source.documentId()) && source.grade() != null && source.lessonNumber() != null
                && !blank(source.lessonTitle()) && !blank(source.sectionTitle()));
        candidates.provenanceValidation(current.id(), current.version(), "REMAP", current.corpusSha256(), current.collectionName(),
                request.sources().size(), valid, errors, principal.idBytes(), validationRequestId);
        metrics.provenance("REMAP", valid);
        if (!valid) throw provenanceError(errors);
        transaction.executeWithoutResult(status -> {
            AiCandidateRepository.Candidate locked = candidates.findForUpdate(id);
            requireVersion(locked, request.version());
            requireEditableRevision(locked);
            validateRevisionBase(locked, principal);
            if (!candidates.remapSources(locked, request.version(), response.sources(), principal.idBytes(), request.reason(), requestId())) versionConflict();
        });
        metrics.revision("source_remap");
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail submit(String id, AiCandidateDtos.VersionRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_SUBMIT, principal, "AI_CANDIDATE_FORBIDDEN");
        AiCandidateRepository.Candidate current = prepareTransition(id, request.version(),
                Set.of(AiCandidateStatus.DRAFT, AiCandidateStatus.REJECTED), AiCandidateStatus.PENDING_REVIEW);
        validateRevisionBase(current, principal);
        revalidate(current, "SUBMIT", principal);
        transition(current, request.version(), request.note(), principal, AiCandidateStatus.PENDING_REVIEW, workflowEvent(current, "SUBMITTED"));
        metrics.lifecycle("submit");
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail approve(String id, AiCandidateDtos.ApproveRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_REVIEW, principal, "AI_CANDIDATE_REVIEW_FORBIDDEN");
        AiCandidateRepository.Candidate current = current(id);
        requireVersion(current, request.version());
        if (current.status() != AiCandidateStatus.PENDING_REVIEW) {
            invalidStatus("Invalid candidate transition: " + current.status() + " -> " + AiCandidateStatus.APPROVED);
        }
        boolean selfReview = Arrays.equals(current.createdBy(), principal.idBytes());
        if (selfReview && !request.selfReviewOverride()) {
            throw error(HttpStatus.FORBIDDEN, "AI_CANDIDATE_REVIEW_FORBIDDEN", "Creator cannot approve their own candidate without an explicit admin override");
        }
        if (request.selfReviewOverride()) {
            if (!selfReview || !AiCandidateAuthorization.isAdmin(principal)) {
                throw error(HttpStatus.FORBIDDEN, "AI_CANDIDATE_REVIEW_FORBIDDEN", "Self-review override is restricted to the admin creator");
            }
            if (blank(request.overrideReason())) invalidContent("Self-review override reason is required");
            if (candidates.hasOtherReviewer(principal.idBytes())) {
                throw error(HttpStatus.FORBIDDEN, "AI_CANDIDATE_REVIEW_FORBIDDEN", "A different active reviewer is available");
            }
        }
        validateStored(id);
        validateRevisionBase(current, principal);
        revalidate(current, "APPROVE", principal);
        String auditRequestId = requestId();
        transaction.executeWithoutResult(status -> {
            if (request.selfReviewOverride()) {
                candidates.selfReviewOverride(current.id(), principal.idBytes(), request.overrideReason().trim(), auditRequestId);
            }
            if (!candidates.transition(current, request.version(), AiCandidateStatus.APPROVED, principal.idBytes(),
                    request.note(), workflowEvent(current, "APPROVED"), auditRequestId)) versionConflict();
        });
        metrics.lifecycle("approve");
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail reject(String id, AiCandidateDtos.RejectRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_REVIEW, principal, "AI_CANDIDATE_REVIEW_FORBIDDEN");
        AiCandidateRepository.Candidate current = prepareTransition(id, request.version(),
                Set.of(AiCandidateStatus.PENDING_REVIEW), AiCandidateStatus.REJECTED);
        transition(current, request.version(), request.reason(), principal, AiCandidateStatus.REJECTED, workflowEvent(current, "REJECTED"));
        metrics.lifecycle("reject");
        return candidates.detail(id);
    }

    public AiCandidateDtos.Detail publish(String id, AiCandidateDtos.PublishRequest request, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_PUBLISH, principal, "AI_CANDIDATE_PUBLISH_FORBIDDEN");
        AiCandidateRepository.Candidate before = current(id);
        if (before.status() == AiCandidateStatus.PUBLISHED) return candidates.detail(id);
        requireVersion(before, request.version());
        if (before.status() != AiCandidateStatus.APPROVED) invalidStatus("Only approved candidate can be published");
        validateStored(before.idString());
        validateRevisionBase(before, principal);
        try {
            revalidate(before, "PUBLISH", principal);
        } catch (ApiException ex) {
            AiCandidateRepository.Candidate concurrent = current(id);
            if (concurrent.status() == AiCandidateStatus.PUBLISHED) {
                metrics.publishConflict();
                return candidates.detail(id);
            }
            throw ex;
        }
        String auditRequestId = requestId();
        try {
            transaction.executeWithoutResult(status -> {
                AiCandidateRepository.Candidate locked = candidates.findForUpdate(id);
                if (locked == null) notFound();
                requireVersion(locked, request.version());
                validateRevisionBase(locked, principal);
                AiCandidateRepository.PublishTarget target = candidates.publishTarget(request.datasetId(), request.definitionId(), request.sectionId());
                if (target == null || !"HIDDEN".equals(target.visibility()) || !"REVIEW_REQUIRED".equals(target.verification())) {
                    throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_TARGET_INVALID", "Publish target must be a hidden review-required MCQ definition");
                }
                if ("REVISION".equals(locked.originType())) {
                    AiCandidateRepository.OfficialSnapshot base = candidates.officialSnapshot(locked.baseOfficialQuestionId());
                    if (base == null || !Arrays.equals(base.datasetId(), target.datasetId())
                            || !Arrays.equals(base.definitionId(), target.definitionId()) || !Arrays.equals(base.sectionId(), target.sectionId())) {
                        throw error(HttpStatus.CONFLICT, "AI_REVISION_HEAD_CONFLICT", "Revision must publish into the immutable base target");
                    }
                }
                byte[] officialId = candidates.insertOfficial(locked, target);
                boolean published = "REVISION".equals(locked.originType())
                        ? candidates.markRevisionPublished(locked, request.version(), officialId, principal.idBytes(), auditRequestId)
                        : candidates.markPublished(locked, request.version(), officialId, principal.idBytes(), auditRequestId);
                if (!published) versionConflict();
            });
        } catch (ApiException ex) {
            if ("AI_CANDIDATE_VERSION_CONFLICT".equals(ex.getCode())) metrics.publishConflict();
            recordPublishFailure(before, principal, ex.getCode(), auditRequestId);
            throw ex;
        } catch (RuntimeException ex) {
            recordPublishFailure(before, principal, "AI_CANDIDATE_PUBLISH_FAILED", auditRequestId);
            throw error(HttpStatus.INTERNAL_SERVER_ERROR, "AI_CANDIDATE_PUBLISH_FAILED", "Candidate publish transaction failed");
        }
        metrics.lifecycle("publish");
        if ("REVISION".equals(before.originType())) metrics.revision("publish");
        return candidates.detail(id);
    }

    public List<AiCandidateDtos.AuditEvent> audit(String id, UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_AUDIT_VIEW, principal, "AI_CANDIDATE_FORBIDDEN");
        current(id);
        return candidates.audit(id);
    }

    public List<AiCandidateDtos.PublishTarget> publishTargets(UserPrincipal principal) {
        require(AiCandidatePermission.AI_CANDIDATE_PUBLISH, principal, "AI_CANDIDATE_PUBLISH_FORBIDDEN");
        return candidates.publishTargets();
    }

    private AiCandidateRepository.Candidate prepareTransition(String id, long version, Set<AiCandidateStatus> from,
                                                               AiCandidateStatus target) {
        AiCandidateRepository.Candidate current = current(id);
        requireVersion(current, version);
        if (!from.contains(current.status())) invalidStatus("Invalid candidate transition: " + current.status() + " -> " + target);
        validateStored(id);
        return current;
    }

    private void transition(AiCandidateRepository.Candidate current, long version, String note, UserPrincipal principal,
                            AiCandidateStatus target, String event) {
        transaction.executeWithoutResult(status -> {
            if (!candidates.transition(current, version, target, principal.idBytes(), note, event, requestId())) versionConflict();
        });
    }

    private void revalidate(AiCandidateRepository.Candidate current, String action, UserPrincipal principal) {
        AiCandidateDtos.Detail detail = candidates.detail(current.idString());
        String validationRequestId = requestId();
        List<AiProvenanceDtos.Source> sources = List.of();
        try {
            sources = detail.sources().stream().map(source -> {
                if (blank(source.chunkId()) || blank(source.chunkHash()) || source.chunkHash().length() != 64) {
                    throw error(HttpStatus.UNPROCESSABLE_ENTITY, "AI_CANDIDATE_PROVENANCE_INVALID", "Candidate source identity is incomplete");
                }
                return new AiProvenanceDtos.Source(source.chunkId(), source.chunkHash());
            }).toList();
            AiProvenanceDtos.Response response = provenance.validate(new AiProvenanceDtos.Request(
                    detail.corpusSha256(), detail.collectionName(), detail.embeddingModel(), detail.embeddingDimension(), sources),
                    validationRequestId);
            if (response == null || response.errors() == null || response.sources() == null
                    || response.sources().size() != sources.size()) {
                throw error(HttpStatus.BAD_GATEWAY, "AI_CANDIDATE_PROVENANCE_INVALID", "AI provenance service returned an invalid response");
            }
            List<String> errors = response.errors();
            candidates.provenanceValidation(current.id(), current.version(), action, detail.corpusSha256(),
                    detail.collectionName(), sources.size(), response.valid(), errors, principal.idBytes(), validationRequestId);
            if (!response.valid()) throw provenanceError(errors);
            metrics.provenance(action, true);
        } catch (ApiException ex) {
            if (!"AI_CANDIDATE_PROVENANCE_STALE".equals(ex.getCode())
                    && !"AI_CANDIDATE_SOURCE_MISSING".equals(ex.getCode())
                    && !"AI_CANDIDATE_SOURCE_CHANGED".equals(ex.getCode())
                    && !"AI_CANDIDATE_SOURCE_NOT_ELIGIBLE".equals(ex.getCode())) {
                try { candidates.provenanceValidation(current.id(), current.version(), action, detail.corpusSha256(),
                        detail.collectionName(), sources.size(), false, List.of(ex.getCode()), principal.idBytes(), validationRequestId); }
                catch (RuntimeException ignored) { /* preserve sanitized service failure */ }
            }
            metrics.provenance(action, false);
            throw ex;
        }
    }

    private ApiException provenanceError(List<String> errors) {
        if (errors.contains("SOURCE_MISSING")) return error(HttpStatus.CONFLICT, "AI_CANDIDATE_SOURCE_MISSING", "A candidate source no longer exists");
        if (errors.contains("SOURCE_CHANGED")) return error(HttpStatus.CONFLICT, "AI_CANDIDATE_SOURCE_CHANGED", "A candidate source has changed");
        if (errors.contains("SOURCE_NOT_ELIGIBLE")) return error(HttpStatus.CONFLICT, "AI_CANDIDATE_SOURCE_NOT_ELIGIBLE", "A candidate source is not production eligible");
        return error(HttpStatus.CONFLICT, "AI_CANDIDATE_PROVENANCE_STALE", "Candidate provenance no longer matches the active corpus");
    }

    private void requireEditableRevision(AiCandidateRepository.Candidate candidate) {
        if (!"REVISION".equals(candidate.originType())) {
            throw error(HttpStatus.CONFLICT, "AI_REVISION_REQUIRED", "Source remapping is available only for revision candidates");
        }
        if (candidate.status() != AiCandidateStatus.DRAFT && candidate.status() != AiCandidateStatus.REJECTED) {
            throw error(HttpStatus.CONFLICT, "AI_CANDIDATE_INVALID_STATUS", "Only draft or rejected revisions can remap sources");
        }
    }

    private void validateRevisionBase(AiCandidateRepository.Candidate candidate, UserPrincipal principal) {
        if (!"REVISION".equals(candidate.originType())) return;
        String conflict = candidates.revisionConflict(candidate);
        if (conflict == null) return;
        try { candidates.revisionBaseConflict(candidate, principal.idBytes(), conflict, requestId()); }
        catch (RuntimeException ignored) { /* preserve sanitized conflict */ }
        String message = "AI_REVISION_BASE_CHANGED".equals(conflict)
                ? "The official base content changed outside the revision workflow"
                : "The official revision head changed";
        throw error(HttpStatus.CONFLICT, conflict, message);
    }

    private String workflowEvent(AiCandidateRepository.Candidate candidate, String event) {
        return "REVISION".equals(candidate.originType()) ? "REVISION_" + event : event;
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
    private void require(AiCandidatePermission permission, UserPrincipal principal, String code) {
        if (!AiCandidateAuthorization.has(principal, permission)) {
            throw error(HttpStatus.FORBIDDEN, code, "Candidate permission is required: " + permission.name());
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
        try { requiresNew.executeWithoutResult(status -> candidates.publishFailed(candidate, principal.idBytes(), reason, requestId)); }
        catch (RuntimeException ignored) { /* original publish error remains authoritative */ }
    }
}
