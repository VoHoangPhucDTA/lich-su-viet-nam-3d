package com.lichsuvn.backend.tts.api.dto;

public record TtsAudioAssetResponse(
        String status,
        String assetId,
        String eventId,
        String audioUrl,
        String voice,
        boolean cacheHit,
        boolean stale,
        boolean retryEligible,
        Integer retryAfterSeconds,
        String staleAfter,
        String errorCode,
        String message,
        Long durationMs
) {
}
