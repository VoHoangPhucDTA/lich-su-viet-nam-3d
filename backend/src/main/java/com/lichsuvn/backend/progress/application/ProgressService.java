package com.lichsuvn.backend.progress.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.progress.api.dto.EventProgressResponse;
import com.lichsuvn.backend.progress.api.dto.EventViewRequest;
import com.lichsuvn.backend.progress.api.dto.EventViewResponse;
import com.lichsuvn.backend.progress.api.dto.ProgressDto;
import com.lichsuvn.backend.progress.api.dto.RecentEventViewDto;
import com.lichsuvn.backend.progress.domain.EventViewLogEntity;
import com.lichsuvn.backend.progress.domain.LearningProgressEntity;
import com.lichsuvn.backend.progress.infrastructure.EventViewLogRepository;
import com.lichsuvn.backend.progress.infrastructure.LearningProgressRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ProgressService {
    private static final Logger log = LoggerFactory.getLogger(ProgressService.class);
    private static final Set<String> VIEW_SOURCES = Set.of("map", "detail", "search", "quiz", "exam");

    private final EventViewLogRepository eventViewLogRepository;
    private final LearningProgressRepository learningProgressRepository;

    public ProgressService(
            EventViewLogRepository eventViewLogRepository,
            LearningProgressRepository learningProgressRepository
    ) {
        this.eventViewLogRepository = eventViewLogRepository;
        this.learningProgressRepository = learningProgressRepository;
    }

    /**
     * Anonymous callers reach the controller because the security layer permits
     * POST /api/events/{id}/view (the reading-progress endpoint) plus the
     * GET /api/events/{id}/progress and GET /api/events paths. Their
     * {@link UserPrincipal} is either {@code null} or carries an empty
     * {@code idBytes} array — both shapes indicate "no real user" and must
     * NOT trigger BINARY(16) writes.
     */
    private static boolean isAnonymous(UserPrincipal principal) {
        return principal == null
                || principal.idBytes() == null
                || principal.idBytes().length == 0;
    }

    @Transactional
    public EventViewResponse recordEventView(String eventId, EventViewRequest request, UserPrincipal principal) {
        // P1 scope: log raw view, then maintain only overall + per-event aggregate progress.
        if (eventViewLogRepository.countPublishedEvent(eventId) <= 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
        }

        // Anonymous callers are accepted at the security layer so the frontend can record
        // views before login. We return zero aggregate stats and skip persistence to avoid
        // violating the NOT NULL BINARY(16) user_id column.
        if (isAnonymous(principal)) {
            log.debug("Skipped anonymous view for eventId={} source={}", eventId, request.source());
            return new EventViewResponse(eventId, 0, 0);
        }

        String source = normalizeSource(request.source());
        Integer durationSeconds = request.durationSeconds();
        int minutes = durationSeconds == null ? 0 : Math.max(0, durationSeconds / 60);

        EventViewLogEntity log = new EventViewLogEntity();
        log.setUserId(principal.idBytes());
        log.setEventId(eventId);
        log.setDurationSeconds(durationSeconds);
        log.setProgressPercent(request.progressPercent());
        log.setSource(source);
        log.setCreatedDate(LocalDate.now());
        eventViewLogRepository.save(log);

        learningProgressRepository.incrementProgress(principal.idBytes(), "overall", "", minutes);
        learningProgressRepository.incrementProgress(principal.idBytes(), "event", eventId, minutes);

        LearningProgressEntity overall = learningProgressRepository
                .findByUserIdAndScopeTypeAndScopeId(principal.idBytes(), "overall", "")
                .orElse(null);
        return new EventViewResponse(
                eventId,
                overall == null ? 0 : overall.getEventsViewed(),
                overall == null ? 0 : overall.getTotalMinutes()
        );
    }

    public EventProgressResponse findEventProgress(String eventId, UserPrincipal principal) {
        // Anonymous callers have no saved progress. Return a clean 0% response so the
        // frontend's setInitialProgress skip path stays the only branch triggered.
        if (isAnonymous(principal)) {
            return new EventProgressResponse(eventId, 0, null);
        }
        var projection = eventViewLogRepository
                .findLatestProgress(principal.idBytes(), eventId)
                .orElse(null);
        if (projection == null || projection.getProgressPercent() == null) {
            return new EventProgressResponse(eventId, 0, null);
        }
        return new EventProgressResponse(
                eventId,
                projection.getProgressPercent().intValue(),
                projection.getViewedAt()
        );
    }

    public ProgressDto findMyProgress(UserPrincipal principal) {
        LearningProgressEntity overall = learningProgressRepository
                .findByUserIdAndScopeTypeAndScopeId(principal.idBytes(), "overall", "")
                .orElse(null);
        return new ProgressDto(
                overall == null ? 0 : overall.getEventsViewed(),
                overall == null ? 0 : overall.getTotalMinutes(),
                overall == null ? null : overall.getLastActivityAt(),
                eventViewLogRepository.findRecentEvents(principal.idBytes())
                        .stream()
                        .map(item -> new RecentEventViewDto(
                                item.getEventId(),
                                item.getSlug(),
                                item.getTitle(),
                                item.getDisplayDate(),
                                item.getViewedAt()
                        ))
                        .toList()
        );
    }

    private String normalizeSource(String source) {
        // Keep source aligned with the event_view_logs enum from the existing migration.
        if (!StringUtils.hasText(source)) {
            return null;
        }
        String normalized = source.trim();
        if (!VIEW_SOURCES.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_VIEW_SOURCE", "source has unsupported value");
        }
        return normalized;
    }
}
