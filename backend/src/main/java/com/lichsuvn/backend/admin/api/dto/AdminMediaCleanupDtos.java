package com.lichsuvn.backend.admin.api.dto;

import java.time.Instant;
import java.util.List;

public final class AdminMediaCleanupDtos {
    private AdminMediaCleanupDtos() {
    }

    public record Summary(long pending, long claimed, long failed, long completed) {
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
