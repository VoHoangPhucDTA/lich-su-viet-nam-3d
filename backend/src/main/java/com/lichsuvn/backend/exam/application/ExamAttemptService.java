package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptDetailResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptListResponse;
import com.lichsuvn.backend.exam.api.dto.ExamAttemptSummaryResponse;
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

import java.time.Instant;

@Service
public class ExamAttemptService {
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;
    private final ExamAttemptRepository examAttemptRepository;
    private final ObjectMapper objectMapper;

    public ExamAttemptService(ExamAttemptRepository examAttemptRepository, ObjectMapper objectMapper) {
        this.examAttemptRepository = examAttemptRepository;
        this.objectMapper = objectMapper;
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
