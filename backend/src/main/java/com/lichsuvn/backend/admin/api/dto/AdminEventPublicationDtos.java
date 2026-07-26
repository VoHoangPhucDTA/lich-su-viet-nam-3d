package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;

import java.util.List;

public final class AdminEventPublicationDtos {
    private AdminEventPublicationDtos() {
    }

    public static final class Patch {
        private String expectedUpdatedAt;
        private String action;

        public Patch() {
        }

        public Patch(String expectedUpdatedAt, String action) {
            this.expectedUpdatedAt = expectedUpdatedAt;
            this.action = action;
        }

        public String expectedUpdatedAt() {
            return expectedUpdatedAt;
        }

        public void setExpectedUpdatedAt(String expectedUpdatedAt) {
            this.expectedUpdatedAt = expectedUpdatedAt;
        }

        public String action() {
            return action;
        }

        public void setAction(String action) {
            this.action = action;
        }

        @JsonAnySetter
        public void rejectUnsupported(String name, Object ignored) {
            throw new IllegalArgumentException("Unsupported JSON property: " + name);
        }
    }

    public record BlockedError(
            String path,
            List<AdminEventDtos.CompletenessIssue> issues
    ) {
        public BlockedError {
            issues = List.copyOf(issues);
        }
    }
}
