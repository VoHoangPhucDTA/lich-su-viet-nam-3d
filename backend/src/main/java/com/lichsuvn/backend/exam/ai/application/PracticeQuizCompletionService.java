package com.lichsuvn.backend.exam.ai.application;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionRequest;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionResponse;
import com.lichsuvn.backend.exam.ai.infrastructure.PracticeQuizAttemptRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class PracticeQuizCompletionService {
    private static final int SCHEMA_VERSION = 1;

    private final PracticeQuizAttemptRepository repository;
    private final ObjectMapper objectMapper;

    public PracticeQuizCompletionService(
            PracticeQuizAttemptRepository repository,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public PracticeQuizCompletionResponse record(
            PracticeQuizCompletionRequest request,
            UserPrincipal principal
    ) {
        byte[] userId = requireAuthenticatedUser(principal);
        UUID attemptUuid = deterministicAttemptId(userId, request.clientSessionId());
        String topic = request.topic().trim();
        String difficulty = request.difficulty().trim().toLowerCase(Locale.ROOT);

        Map<String, Object> safeConfig = new LinkedHashMap<>();
        safeConfig.put("schemaVersion", SCHEMA_VERSION);
        safeConfig.put("clientSessionId", request.clientSessionId());
        safeConfig.put("topic", topic);
        safeConfig.put("difficulty", difficulty);
        safeConfig.put("totalQuestions", request.totalQuestions());
        safeConfig.put("scoreAuthority", "CLIENT_NOT_STORED");
        safeConfig.put("timingAuthority", "CLIENT_UNVERIFIED");

        repository.recordCompletion(
                UuidBytes.fromUuid(attemptUuid),
                userId,
                topic,
                difficulty,
                request.totalQuestions(),
                request.durationMs(),
                json(safeConfig)
        );
        return new PracticeQuizCompletionResponse(
                SCHEMA_VERSION,
                attemptUuid.toString(),
                "recorded"
        );
    }

    private UUID deterministicAttemptId(byte[] userId, String clientSessionId) {
        String namespace = Base64.getEncoder().encodeToString(userId) + ":" + clientSessionId;
        return UUID.nameUUIDFromBytes(namespace.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] requireAuthenticatedUser(UserPrincipal principal) {
        if (principal == null || principal.idBytes() == null || principal.idBytes().length != 16) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "Authentication is required"
            );
        }
        return principal.idBytes();
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Cannot serialize quiz completion metadata", exception);
        }
    }
}
