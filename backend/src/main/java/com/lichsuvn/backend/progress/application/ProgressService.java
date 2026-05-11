package com.lichsuvn.backend.progress.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
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

@Service
public class ProgressService {
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

    @Transactional
    public EventViewResponse recordEventView(String eventId, EventViewRequest request, UserPrincipal principal) {
        // P1 scope: log raw view, then maintain only overall + per-event aggregate progress.
        if (eventViewLogRepository.countPublishedEvent(eventId) <= 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
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
