package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptDetailResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptListResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptSummaryResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptUpsertRequest;
import com.lichsuvn.backend.exam.domain.ExamAttemptEntity;
import com.lichsuvn.backend.exam.infrastructure.ExamAttemptRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
public class ExamAttemptService {
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;
    private static final Set<String> ALLOWED_MODES = Set.of(
            "thi_thu",
            "custom_mock",
            "luyen_tap",
            "on_chu_de",
            "custom_practice"
    );

    private final ExamAttemptRepository examAttemptRepository;
    private final ObjectMapper objectMapper;

    public ExamAttemptService(ExamAttemptRepository examAttemptRepository, ObjectMapper objectMapper) {
        this.examAttemptRepository = examAttemptRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ExamAttemptSummaryResponse upsertAttempt(ExamAttemptUpsertRequest request, UserPrincipal principal) {
        byte[] userId = requireUser(principal);
        validateRequest(request);

        ExamAttemptEntity entity = examAttemptRepository
                .findByUserIdAndSessionId(userId, request.sessionId().trim())
                .orElseGet(() -> {
                    ExamAttemptEntity created = new ExamAttemptEntity();
                    created.setId(UuidBytes.fromUuid(UUID.randomUUID()));
                    created.setUserId(userId);
                    created.setSessionId(request.sessionId().trim());
                    return created;
                });

        if ("BACKEND".equals(entity.getScoreAuthority())) {
            throw new ApiException(HttpStatus.CONFLICT, "BACKEND_ATTEMPT_IMMUTABLE", "A backend-scored attempt cannot be overwritten by the legacy endpoint");
        }

        entity.setMode(request.mode().trim());
        entity.setExamId(trimToNull(request.examId()));
        entity.setTitle(trimToNull(request.title()));
        entity.setCustom(Boolean.TRUE.equals(request.isCustom()) || "custom_mock".equals(request.mode()));
        entity.setSourceExamIdsJson(writeJsonOrNull(request.sourceExamIds()));
        entity.setQuestionRefsJson(writeJsonOrNull(request.questionRefs()));
        entity.setQuestionSnapshotsJson(writeJsonOrNull(request.questionSnapshots()));
        entity.setAnswersJson(writeJsonOrNull(request.answers()));
        entity.setConfigJson(writeJsonOrNull(request.config()));
        entity.setResultJson(writeJsonRequired(request.result(), "result"));
        entity.setTotalQuestions(request.totalQuestions());
        entity.setTotalScore(request.totalScore());
        entity.setMcqScore(request.mcqScore());
        entity.setTfScore(request.tfScore());
        entity.setDurationSeconds(request.durationSeconds());
        entity.setSubmittedAt(Instant.ofEpochMilli(request.submittedAt()));

        return toSummary(examAttemptRepository.save(entity));
    }

    @Transactional(readOnly = true)
    public ExamAttemptListResponse listAttempts(UserPrincipal principal, Integer limit) {
        byte[] userId = requireUser(principal);
        int safeLimit = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        var items = examAttemptRepository
                .findByUserIdOrderBySubmittedAtDescCreatedAtDesc(userId, PageRequest.of(0, safeLimit))
                .stream()
                .map(this::toSummary)
                .toList();
        return new ExamAttemptListResponse(items);
    }

    @Transactional(readOnly = true)
    public ExamAttemptDetailResponse findAttempt(String sessionId, UserPrincipal principal) {
        byte[] userId = requireUser(principal);
        if (!StringUtils.hasText(sessionId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SESSION_ID", "sessionId is required");
        }
        ExamAttemptEntity entity = examAttemptRepository
                .findByUserIdAndSessionId(userId, sessionId.trim())
                .orElseThrow(() -> new NotFoundException("EXAM_ATTEMPT_NOT_FOUND", "Exam attempt not found"));
        return toDetail(entity);
    }

    private byte[] requireUser(UserPrincipal principal) {
        if (principal == null || principal.idBytes() == null || principal.idBytes().length != 16) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication is required");
        }
        return principal.idBytes();
    }

    private void validateRequest(ExamAttemptUpsertRequest request) {
        String mode = request.mode() == null ? "" : request.mode().trim();
        if (!ALLOWED_MODES.contains(mode)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXAM_MODE", "mode has unsupported value");
        }
        if (request.result() == null || request.result().isNull() || request.result().isMissingNode()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXAM_RESULT", "result is required");
        }
        if ((request.result().isObject() || request.result().isArray()) && request.result().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXAM_RESULT", "result must not be empty");
        }
        if (request.totalQuestions() == null || request.totalQuestions() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TOTAL_QUESTIONS", "totalQuestions must be greater than 0");
        }
        validateScore(request.totalScore(), "totalScore");
        validateOptionalNonNegative(request.mcqScore(), "mcqScore");
        validateOptionalNonNegative(request.tfScore(), "tfScore");
        if (request.durationSeconds() != null && request.durationSeconds() < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DURATION", "durationSeconds must be non-negative");
        }
        if (request.submittedAt() == null || request.submittedAt() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMITTED_AT", "submittedAt must be a valid epoch milliseconds timestamp");
        }
        if (!Boolean.TRUE.equals(request.isCustom()) && "thi_thu".equals(mode) && !StringUtils.hasText(request.examId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_EXAM_ID", "examId is required for full exam attempts");
        }
    }

    private void validateScore(BigDecimal value, String field) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0 || value.compareTo(BigDecimal.TEN) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE", field + " must be between 0 and 10");
        }
    }

    private void validateOptionalNonNegative(BigDecimal value, String field) {
        if (value != null && value.compareTo(BigDecimal.ZERO) < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SCORE", field + " must be non-negative");
        }
    }

    private String writeJsonRequired(JsonNode node, String field) {
        String json = writeJsonOrNull(node);
        if (json == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JSON", field + " is required");
        }
        return json;
    }

    private String writeJsonOrNull(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JacksonException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Request contains invalid JSON");
        }
    }

    private JsonNode readJsonOrNull(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return objectMapper.readTree(raw);
        } catch (JacksonException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORED_JSON_INVALID", "Stored attempt JSON is invalid");
        }
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private long toEpochMillis(Instant instant) {
        return instant == null ? 0L : instant.toEpochMilli();
    }

    private ExamAttemptSummaryResponse toSummary(ExamAttemptEntity entity) {
        return new ExamAttemptSummaryResponse(
                entity.getSessionId(),
                entity.getMode(),
                entity.getExamId(),
                entity.getTitle(),
                entity.isCustom(),
                entity.getTotalQuestions(),
                entity.getTotalScore(),
                entity.getDurationSeconds(),
                toEpochMillis(entity.getSubmittedAt()),
                entity.getScoreAuthority(),
                entity.getTimingAuthority(),
                entity.getSubmissionOrigin(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }

    private ExamAttemptDetailResponse toDetail(ExamAttemptEntity entity) {
        return new ExamAttemptDetailResponse(
                entity.getSessionId(),
                entity.getMode(),
                entity.getExamId(),
                entity.getTitle(),
                entity.isCustom(),
                readJsonOrNull(entity.getSourceExamIdsJson()),
                readJsonOrNull(entity.getQuestionRefsJson()),
                readJsonOrNull(entity.getQuestionSnapshotsJson()),
                readJsonOrNull(entity.getAnswersJson()),
                readJsonOrNull(entity.getConfigJson()),
                readJsonOrNull(entity.getResultJson()),
                entity.getTotalQuestions(),
                entity.getTotalScore(),
                entity.getMcqScore(),
                entity.getTfScore(),
                entity.getDurationSeconds(),
                toEpochMillis(entity.getSubmittedAt()),
                entity.getScoreAuthority(),
                entity.getTimingAuthority(),
                entity.getSubmissionOrigin(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
