package com.lichsuvn.backend.progress.infrastructure;

import com.lichsuvn.backend.progress.domain.EventViewLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface EventViewLogRepository extends JpaRepository<EventViewLogEntity, Long> {
    @Query(value = """
            SELECT COUNT(*)
            FROM historical_events
            WHERE id = :eventId
              AND status = 'published'
            """, nativeQuery = true)
    int countPublishedEvent(@Param("eventId") String eventId);

    @Query(value = """
            SELECT l.event_id AS eventId,
                   e.slug AS slug,
                   e.title AS title,
                   e.display_date AS displayDate,
                   MAX(l.viewed_at) AS viewedAt
            FROM event_view_logs l
            JOIN historical_events e ON e.id = l.event_id
            WHERE l.user_id = :userId
              AND e.status = 'published'
            GROUP BY l.event_id, e.slug, e.title, e.display_date
            ORDER BY viewedAt DESC
            LIMIT 10
            """, nativeQuery = true)
    List<RecentEventViewProjection> findRecentEvents(@Param("userId") byte[] userId);

    @Query(value = """
            SELECT progress_percent, viewed_at
            FROM event_view_logs
            WHERE user_id = :userId
              AND event_id = :eventId
            ORDER BY viewed_at DESC
            LIMIT 1
            """, nativeQuery = true)
    Optional<LatestEventProgressProjection> findLatestProgress(
            @Param("userId") byte[] userId,
            @Param("eventId") String eventId
    );

    interface RecentEventViewProjection {
        String getEventId();

        String getSlug();

        String getTitle();

        String getDisplayDate();

        Instant getViewedAt();
    }

    interface LatestEventProgressProjection {
        Byte getProgressPercent();

        Instant getViewedAt();
    }
}
