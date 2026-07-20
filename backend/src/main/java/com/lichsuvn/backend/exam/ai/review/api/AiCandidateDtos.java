package com.lichsuvn.backend.exam.ai.review.api;

import com.lichsuvn.backend.exam.ai.review.domain.AiCandidateStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class AiCandidateDtos {
    private AiCandidateDtos() {
    }

    public record CreateRequest(@NotBlank String generationReceiptId, @NotEmpty @Size(max = 10) List<@NotNull @Min(0) Integer> questionIndexes) {}
    public record UpdateRequest(
            @NotNull Long version,
            @NotBlank @Size(max = 5000) String questionText,
            @NotBlank @Size(max = 8000) String explanation,
            @NotBlank String difficulty,
            @NotNull Integer grade,
            @Min(1) Integer lessonNumber,
            @Size(max = 500) String topic,
            @Valid @Size(min = 4, max = 4) List<OptionInput> options,
            @Size(max = 2000) String reviewNote
    ) {}
    public record OptionInput(@NotBlank String id, @NotBlank @Size(max = 3000) String text, boolean correct) {}
    public record VersionRequest(@NotNull Long version, @Size(max = 2000) String note) {}
    public record RejectRequest(@NotNull Long version, @NotBlank @Size(max = 2000) String reason) {}
    public record PublishRequest(@NotNull Long version, @NotBlank String datasetId, @NotBlank String definitionId, @NotBlank String sectionId) {}

    public record Page(List<Summary> items, long total, int limit, int offset) {}
    public record Summary(
            String id, AiCandidateStatus status, String questionText, String difficulty,
            int grade, Integer lessonNumber, String topic, String createdBy, String reviewedBy,
            int warningCount, int sourceCount, long version, LocalDateTime createdAt, LocalDateTime updatedAt
    ) {}
    public record Detail(
            String id, AiCandidateStatus status, String questionText, String explanation, String difficulty,
            String originalQuestionText, String originalExplanation, String originalCorrectOptionId,
            int grade, Integer lessonNumber, String topic, String generationQuery, int requestedCount,
            String generationRequestId, String generationModel, String embeddingModel, int embeddingDimension,
            String promptVersion, String schemaVersion, String corpusSha256, String collectionName,
            String validationStatus, List<String> validationWarnings, List<String> generationWarnings,
            String createdBy, String submittedBy, String reviewedBy, String publishedBy,
            LocalDateTime createdAt, LocalDateTime updatedAt, LocalDateTime submittedAt,
            LocalDateTime reviewedAt, LocalDateTime publishedAt, String rejectionReason, String reviewNote,
            String officialQuestionId, long version, List<Option> options, List<Source> sources
    ) {}
    public record Option(String id, String text, boolean correct, int displayOrder, String originalText) {}
    public record Source(
            String chunkId, String documentId, Integer grade, Integer lessonNumber, String lessonTitle,
            String sectionTitle, Integer pageStart, Integer pageEnd, String chunkHash, int displayOrder
    ) {}
    public record AuditEvent(
            long id, String eventType, String actorId, String fromStatus, String toStatus,
            List<String> changedFields, String note, LocalDateTime createdAt, String requestId
    ) {}
    public record PublishTarget(String datasetId, String definitionId, String sectionId, String label) {}
}
