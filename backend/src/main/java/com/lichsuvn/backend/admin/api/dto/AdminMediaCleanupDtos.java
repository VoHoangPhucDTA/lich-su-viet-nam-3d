package com.lichsuvn.backend.admin.api.dto;

import java.time.Instant;
import java.util.List;

public final class AdminMediaCleanupDtos {
    private AdminMediaCleanupDtos() {
    }

    public record Summary(long pending, long claimed, long failed, long completed) {
    }

    /**
     * Runtime snapshot of the cleanup worker. The Admin cleanup page renders
     * this so operators can confirm scheduling, storage, and last-tick health
     * without reading backend logs. The associated tick endpoint returns the
     * same shape so a manual drain reveals what the worker just did.
     *
     * <ul>
     *   <li>{@code enabled} - the scheduler is allowed to run (feature flag).</li>
     *   <li>{@code storageAvailable} - Cloudinary is reachable.</li>
     *   <li>{@code lastTickAt} - timestamp of the most recent tick (UTC instant).</li>
     *   <li>{@code overduePending} - PENDING tasks whose {@code next_attempt_at} is in the past.</li>
     *   <li>{@code intervalMs} - poll interval used by the scheduler.</li>
     *   <li>{@code lastClaimed}, {@code lastCompleted}, {@code lastFailed} - per-tick counters.</li>
     *   <li>{@code lastErrorCode} - the most recent error code if the tick did not finish cleanly.</li>
     * </ul>
     */
    public record Capability(
            boolean enabled,
            boolean storageAvailable,
            Instant lastTickAt,
            long overduePending,
            long intervalMs,
            long lastClaimed,
            long lastCompleted,
            long lastFailed,
            String lastErrorCode
    ) {
    }

    public record Page(List<Item> items, int count, long total, int limit, int offset) {
    }

    public record Item(
            long id,
            String provider,
            String publicId,
            String providerAssetId,
            String operation,
            String status,
            int attempts,
            Instant nextAttemptAt,
            Instant claimExpiresAt,
            String lastErrorCode,
            Instant createdAt,
            Instant updatedAt,
            Long mediaId,
            String eventId,
            String managedAssetId
    ) {
    }
}
