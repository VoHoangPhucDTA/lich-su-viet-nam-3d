package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventPublicationDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventPublicationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class AdminEventPublicationService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();

    private final AdminEventPublicationRepository repository;
    private final AdminEventReadRepository readRepository;
    private final AdminEventMutationRepository auditRepository;
    private final EventCompletenessService completenessService;
    private final AdminEventReadService readService;
    private final ObjectMapper objectMapper;

    public AdminEventPublicationService(
            AdminEventPublicationRepository repository,
            AdminEventReadRepository readRepository,
            AdminEventMutationRepository auditRepository,
            EventCompletenessService completenessService,
            AdminEventReadService readService,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.readRepository = readRepository;
        this.auditRepository = auditRepository;
        this.completenessService = completenessService;
        this.readService = readService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AdminEventDtos.Detail update(
            String id,
            AdminEventPublicationDtos.Patch request,
            UserPrincipal principal
    ) {
        AdminEventPublicationRepository.CurrentPublication current = repository.lockCurrent(id)
                .orElseThrow(() -> error(
                        HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND",
                        "Historical event not found"));
        if (request == null) {
            throw error(HttpStatus.BAD_REQUEST, "INVALID_PUBLICATION_ACTION",
                    "Publication request is required");
        }
        LocalDateTime expected = parseVersion(request.expectedUpdatedAt());
        if (!Objects.equals(current.updatedAt(), expected)) {
            throw conflict();
        }

        Transition transition = transition(current.status(), request.action());
        if ("publish".equals(request.action())) {
            EventCompletenessFacts baseFacts = readRepository.findCompletenessFacts(id)
                    .orElseThrow(() -> new IllegalStateException(
                            "Locked event disappeared before completeness evaluation"));
            List<Integer> grades = readRepository.findGrades(List.of(id))
                    .getOrDefault(id, List.of());
            List<AdminEventDtos.CompletenessIssue> blockers = completenessService
                    .assess(baseFacts.withGrades(grades))
                    .completeness()
                    .issues()
                    .stream()
                    .filter(issue -> "ERROR".equals(issue.severity()))
                    .toList();
            if (!blockers.isEmpty()) {
                throw new EventPublishBlockedException(blockers);
            }
        }

        boolean initializePublishedAt =
                "publish".equals(request.action()) && current.publishedAt() == null;
        if (!repository.update(id, expected, transition.targetStatus(), initializePublishedAt)) {
            throw conflict();
        }
        String resultingVersion = formatVersion(repository.currentVersion(id));
        auditRepository.audit(
                principal == null ? null : principal.idBytes(),
                transition.auditAction(),
                id,
                json(Map.of(
                        "previousStatus", current.status(),
                        "expectedVersion", request.expectedUpdatedAt())),
                json(Map.of(
                        "newStatus", transition.targetStatus(),
                        "resultingVersion", resultingVersion,
                        "publishedTimestampBehavior",
                        initializePublishedAt ? "initialized" : "preserved")));
        return readService.findEvent(id);
    }

    private Transition transition(String currentStatus, String requestedAction) {
        if (requestedAction == null || !List.of(
                "publish", "unpublish", "archive", "restore").contains(requestedAction)) {
            throw error(HttpStatus.BAD_REQUEST, "INVALID_PUBLICATION_ACTION",
                    "Publication action is unsupported");
        }
        String target = switch (requestedAction) {
            case "publish" -> "published";
            case "unpublish", "restore" -> "draft";
            case "archive" -> "archived";
            default -> throw new IllegalStateException("Validated action was not mapped");
        };
        if (Objects.equals(currentStatus, target)) {
            throw error(HttpStatus.CONFLICT, "EVENT_ALREADY_IN_STATUS",
                    "Event already has the requested publication status");
        }
        boolean allowed = switch (currentStatus + ":" + requestedAction) {
            case "draft:publish", "draft:archive", "published:unpublish",
                    "published:archive", "archived:restore" -> true;
            default -> false;
        };
        if (!allowed) {
            throw error(HttpStatus.CONFLICT, "INVALID_EVENT_STATUS_TRANSITION",
                    "Publication action is not allowed from the current status");
        }
        String auditAction = switch (requestedAction) {
            case "publish" -> "event.published";
            case "unpublish" -> "event.unpublished";
            case "archive" -> "event.archived";
            case "restore" -> "event.restored";
            default -> throw new IllegalStateException("Validated action was not mapped");
        };
        return new Transition(target, auditAction);
    }

    private LocalDateTime parseVersion(String value) {
        try {
            if (value == null || !value.matches(
                    "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")) {
                throw invalidVersion();
            }
            return LocalDateTime.ofInstant(
                    Instant.from(VERSION_FORMATTER.parse(value)), DATABASE_ZONE);
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidVersion();
        }
    }

    private String formatVersion(LocalDateTime value) {
        return VERSION_FORMATTER.format(value.atZone(DATABASE_ZONE).toInstant());
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot serialize bounded audit metadata", exception);
        }
    }

    private ApiException invalidVersion() {
        return error(HttpStatus.BAD_REQUEST, "INVALID_EXPECTED_VERSION",
                "expectedUpdatedAt must be an opaque six-digit UTC version");
    }

    private ApiException conflict() {
        return error(HttpStatus.CONFLICT, "EVENT_UPDATE_CONFLICT",
                "The event changed after it was loaded");
    }

    private static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message);
    }

    private record Transition(String targetStatus, String auditAction) {
    }
}
