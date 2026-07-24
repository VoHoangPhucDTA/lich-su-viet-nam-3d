package com.lichsuvn.backend.admin.api.dto;

import java.time.Instant;
import java.util.List;

public final class AdminDashboardDtos {
    private AdminDashboardDtos() {
    }

    public record Dashboard(
            Metrics metrics,
            List<AttentionEvent> attention,
            List<AuditEntry> recentAudit
    ) {
    }

    public record Metrics(EventMetrics events, UserMetrics users) {
    }

    public record EventMetrics(
            long total,
            long published,
            long draft,
            long archived,
            long missingThumbnail,
            long missingActiveMedia,
            long missingOrInvalidMapData,
            long withCompletenessIssues
    ) {
    }

    public record UserMetrics(long activeTotal, long createdLast7Days) {
    }

    public record AttentionEvent(
            String id,
            String title,
            AdminEventDtos.Chronology chronology,
            String status,
            AdminEventDtos.Thumbnail thumbnail,
            AdminEventDtos.Completeness completeness,
            Instant updatedAt,
            String reasonCode,
            String recommendedFilter
    ) {
    }

    public record AuditEntry(
            ActorSummary actor,
            String action,
            String entityType,
            String entityId,
            Instant timestamp
    ) {
    }

    public record ActorSummary(String displayName) {
    }
}
