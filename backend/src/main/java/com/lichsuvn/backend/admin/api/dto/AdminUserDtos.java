package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonValue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class AdminUserDtos {
    private AdminUserDtos() {
    }

    public record Page(List<ListItem> items, int count, long total, int limit, int offset) {
    }

    public record ListItem(
            String id,
            String displayName,
            String email,
            Role primaryRole,
            List<Role> roles,
            Status status,
            boolean emailVerified,
            Instant createdAt,
            Instant updatedAt,
            Instant lastMeaningfulActivityAt
    ) {
    }

    public record Detail(
            Account account,
            SessionTracking sessions,
            Learning learning,
            Activity activity,
            List<AuditEntry> recentAdminAudit
    ) {
    }

    public record Account(
            String id,
            String displayName,
            String email,
            Role primaryRole,
            List<Role> roles,
            Status status,
            boolean emailVerified,
            Instant emailVerifiedAt,
            String grade,
            String school,
            String avatarUrl,
            Instant createdAt,
            String updatedAt
    ) {
    }

    public record SessionTracking(
            TrackingMode trackingMode,
            boolean trackingAvailable,
            Long activeRefreshSessionCount
    ) {
    }

    public record Learning(
            Progress progress,
            AssessmentSummary quizzes,
            AssessmentSummary exams
    ) {
    }

    public record Progress(
            long eventsViewed,
            long distinctEventsViewed,
            long totalMinutes,
            Instant lastActivityAt
    ) {
    }

    public record AssessmentSummary(
            long submittedCount,
            BigDecimal averageScore10,
            Instant lastSubmittedAt
    ) {
    }

    public record Activity(
            Instant lastMeaningfulActivityAt,
            List<ActivityItem> recent
    ) {
    }

    public record ActivityItem(
            ActivityKind kind,
            Instant timestamp,
            String title,
            BigDecimal score10
    ) {
    }

    public record AuditEntry(
            String action,
            AuditRelation relation,
            Actor actor,
            String entityType,
            String entityId,
            Instant timestamp
    ) {
    }

    public record Actor(String displayName) {
    }

    public enum Role {
        STUDENT("student"),
        TEACHER("teacher"),
        ADMIN("admin");

        private final String value;

        Role(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }

    public enum Status {
        ACTIVE("active"),
        PENDING("pending"),
        DISABLED("disabled"),
        DELETED("deleted");

        private final String value;

        Status(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }

    public enum TrackingMode {
        STATELESS_JWT
    }

    public enum ActivityKind {
        EVENT_VIEW("event_view"),
        QUIZ_SUBMITTED("quiz_submitted"),
        EXAM_SUBMITTED("exam_submitted");

        private final String value;

        ActivityKind(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }

    public enum AuditRelation {
        TARGET("target"),
        ACTOR("actor"),
        BOTH("both");

        private final String value;

        AuditRelation(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }
}
