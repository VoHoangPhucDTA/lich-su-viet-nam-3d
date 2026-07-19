package com.lichsuvn.backend.tts.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TtsAudioChunk(
        String id, String chunkKey, String chunkText, String textHash,
        String provider, String voice, BigDecimal synthesisSpeed, String audioFormat,
        int returnOption, boolean withoutFilter, String textProcessingVersion,
        String chunkingVersion, TtsAudioAssetStatus status, String claimToken,
        LocalDateTime claimExpiresAt, int attemptCount, LocalDateTime lastAttemptAt,
        String errorCode, String errorMessage, String storageProvider,
        String storagePublicId, String audioUrl, String mimeType, Long fileSize,
        Long durationMs, LocalDateTime createdAt, LocalDateTime updatedAt) {

    public boolean isReadyWithAudioUrl() {
        return status == TtsAudioAssetStatus.READY && audioUrl != null && !audioUrl.isBlank();
    }
}
