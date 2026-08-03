package com.lichsuvn.backend.admin.api.dto;

import java.util.List;

public final class AdminEventImageDtos {
    private AdminEventImageDtos() {
    }

    /**
     * Read-only upload capability surfaced to the Admin UI so the picker can be
     * disabled before the user selects files instead of failing per item with a
     * generic 503. The storage bean (not a frontend flag) is the source of truth.
     */
    public record Capability(
            boolean enabled,
            boolean storageAvailable,
            boolean uploadReady,
            long maxFileBytes,
            int maxDimension,
            long maxPixels,
            int maxActiveReservations,
            List<String> allowedFormats
    ) {
    }

    public record UploadResponse(
            long mediaId,
            String updatedAt,
            AdminEventDtos.Detail event
    ) {
    }

    public record ReplacementResponse(
            long mediaId,
            String updatedAt,
            AdminEventDtos.Detail event
    ) {
    }

    /**
     * Bounded payload that accompanies a {@code PUBLISHED_EVENT_WOULD_BECOME_INVALID}
     * response on the managed image upload paths. Entries only carry the completion
     * issue code, section and field names — never narrative text, secrets, or raw
     * payloads — so the guard remains safe to publish over the API.
     */
    public record PublicationGuardViolation(
            String section,
            String code,
            String requirement,
            String reason,
            List<String> fields
    ) {
        public PublicationGuardViolation {
            fields = fields == null ? List.of() : List.copyOf(fields);
        }
    }

    /**
     * Envelope returned with a blocked mutation response so the Admin UI can surface
     * a friendly Vietnamese message and an expandable "Xem chi tiết" list. The list
     * follows the {@code satisfied -> unsatisfied} classification from the diff-based
     * guard: only requirement codes that were satisfied before and are unsatisfied
     * after the mutation are included.
     */
    public record PublicationGuardBlocked(
            String classification,
            int introducedCount,
            List<PublicationGuardViolation> violations
    ) {
        public PublicationGuardBlocked {
            violations = violations == null ? List.of() : List.copyOf(violations);
        }
    }
}
