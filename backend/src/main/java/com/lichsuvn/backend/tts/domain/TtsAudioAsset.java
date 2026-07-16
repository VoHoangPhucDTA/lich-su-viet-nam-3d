package com.lichsuvn.backend.tts.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TtsAudioAsset(
        String id,
        String cacheKey,
        String eventId,
        String textHash,
        String provider,
        String voice,
        BigDecimal synthesisSpeed,
        String audioFormat,
        int returnOption,
        boolean withoutFilter,
        String textProcessingVersion,
        String storageProvider,
        String storagePublicId,
        String audioUrl,
        String mimeType,
        Long fileSize,
        Long durationMs,
        TtsAudioAssetStatus status,
        String claimToken,
        LocalDateTime claimExpiresAt,
        LocalDateTime claimedAt,
        LocalDateTime lastAttemptAt,
        int attemptCount,
        String errorCode,
        String errorMessage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public boolean isReadyWithAudioUrl() {
        return status == TtsAudioAssetStatus.READY && audioUrl != null && !audioUrl.isBlank();
    }
}
