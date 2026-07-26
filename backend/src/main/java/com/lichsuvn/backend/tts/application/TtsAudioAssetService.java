package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetRequest;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetResponse;
import com.lichsuvn.backend.tts.domain.TtsAudioAsset;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetClaimResult;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioAssetRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;

@Service
public class TtsAudioAssetService {
    private static final int DEFAULT_RETRY_AFTER_SECONDS = 10;

    private final TtsEventNarrationRepository eventNarrationRepository;
    private final TtsAudioAssetRepository assetRepository;
    private final NarrationTextBuilder narrationTextBuilder;
    private final TtsCacheKeyBuilder cacheKeyBuilder;
    private final NarrationService narrationService;
    private final AudioStorageService audioStorageService;
    private final TtsAudioAssetWorker worker;
    private final TtsAssetWorkerSubmitter workerSubmitter;
    private final int pendingStaleMinutes;
    private final int retryDelayMinutes;
    private final int maxAttempts;

    public TtsAudioAssetService(
            TtsEventNarrationRepository eventNarrationRepository,
            TtsAudioAssetRepository assetRepository,
            NarrationTextBuilder narrationTextBuilder,
            TtsCacheKeyBuilder cacheKeyBuilder,
            NarrationService narrationService,
            AudioStorageService audioStorageService,
            TtsAudioAssetWorker worker,
            TtsAssetWorkerSubmitter workerSubmitter,
            @Value("${app.tts.asset-pending-stale-minutes:10}") int pendingStaleMinutes,
            @Value("${app.tts.asset-retry-delay-minutes:2}") int retryDelayMinutes,
            @Value("${app.tts.asset-max-attempts:3}") int maxAttempts
    ) {
        this.eventNarrationRepository = eventNarrationRepository;
        this.assetRepository = assetRepository;
        this.narrationTextBuilder = narrationTextBuilder;
        this.cacheKeyBuilder = cacheKeyBuilder;
        this.narrationService = narrationService;
        this.audioStorageService = audioStorageService;
        this.worker = worker;
        this.workerSubmitter = workerSubmitter;
        this.pendingStaleMinutes = pendingStaleMinutes;
        this.retryDelayMinutes = retryDelayMinutes;
        this.maxAttempts = maxAttempts;
    }

    public TtsAudioAssetResponse requestAsset(String eventId, TtsAudioAssetRequest request) {
        String voice = resolveVoice(request == null ? null : request.voice());
        if (!audioStorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_NOT_CONFIGURED", "Audio storage is not configured");
        }
        var event = eventNarrationRepository.findPublishedById(eventId)
                .orElseThrow(() -> new NotFoundException("EVENT_NOT_FOUND", "Historical event not found"));

        String narration = narrationTextBuilder.build(event);
        String normalizedText = narrationTextBuilder.normalizeForSynthesis(narration);
        if (normalizedText.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TTS_TEXT_EMPTY", "Narration text is empty");
        }
        var keyData = cacheKeyBuilder.build(event.id(), normalizedText, voice);
        TtsAudioAssetClaimResult result = assetRepository.claimPending(new TtsAudioAssetRepository.NewAssetCommand(
                keyData.cacheKey(),
                event.id(),
                keyData.textHash(),
                TtsCacheKeyBuilder.PROVIDER,
                voice,
                new BigDecimal(keyData.canonicalSpeed()),
                TtsCacheKeyBuilder.AUDIO_FORMAT,
                TtsCacheKeyBuilder.RETURN_OPTION,
                TtsCacheKeyBuilder.WITHOUT_FILTER,
                TtsCacheKeyBuilder.TEXT_PROCESSING_VERSION
        ));

        if (result.kind() == TtsAudioAssetClaimResult.Kind.CLAIMED_NEW) {
            submitPendingWorker(result.asset().id(), normalizedText);
        } else if (result.kind() == TtsAudioAssetClaimResult.Kind.EXISTING_FAILED
                && isRetryEligible(result.asset(), LocalDateTime.now())) {
            submitFailedRetryWorker(result.asset().id(), normalizedText);
        }

        return toResponse(result.asset(), result.kind() == TtsAudioAssetClaimResult.Kind.EXISTING_READY);
    }

    public TtsAudioAssetResponse getAsset(String assetId) {
        TtsAudioAsset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new NotFoundException("TTS_ASSET_NOT_FOUND", "TTS audio asset not found"));
        if (!eventNarrationRepository.isPublished(asset.eventId())) {
            throw new NotFoundException("TTS_ASSET_NOT_FOUND", "TTS audio asset not found");
        }
        return toResponse(asset, false);
    }

    private void submitPendingWorker(String assetId, String normalizedText) {
        try {
            workerSubmitter.submit(() -> worker.processPending(assetId, normalizedText));
        } catch (RejectedExecutionException ex) {
            assetRepository.markPendingFailed(assetId, "WORKER_SUBMISSION_FAILED", "TTS worker queue rejected the task");
        }
    }

    private void submitFailedRetryWorker(String assetId, String normalizedText) {
        try {
            workerSubmitter.submit(() -> worker.processFailedRetry(assetId, normalizedText));
        } catch (RejectedExecutionException ex) {
            assetRepository.findById(assetId)
                    .filter(asset -> asset.claimToken() != null)
                    .ifPresent(asset -> assetRepository.markFailed(
                            asset.id(),
                            asset.claimToken(),
                            "WORKER_SUBMISSION_FAILED",
                            "TTS worker queue rejected the retry task"
                    ));
        }
    }

    private String resolveVoice(String requestedVoice) {
        String voice = (requestedVoice == null || requestedVoice.isBlank())
                ? narrationService.getDefaultVoice()
                : requestedVoice.trim().toLowerCase();
        Set<String> allowed = Set.copyOf(narrationService.getAvailableVoices());
        if (!allowed.contains(voice)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TTS_VOICE", "Unsupported TTS voice");
        }
        return voice;
    }

    private TtsAudioAssetResponse toResponse(TtsAudioAsset asset, boolean cacheHit) {
        LocalDateTime now = LocalDateTime.now();
        if (asset.status() == TtsAudioAssetStatus.READY && !asset.isReadyWithAudioUrl()) {
            return new TtsAudioAssetResponse(
                    TtsAudioAssetStatus.FAILED.value(),
                    asset.id(),
                    asset.eventId(),
                    null,
                    asset.voice(),
                    false,
                    false,
                    false,
                    null,
                    null,
                    "ASSET_METADATA_INCOMPLETE",
                    "TTS audio asset is marked ready but has no audio URL",
                    asset.durationMs()
            );
        }

        boolean stale = isPendingStale(asset, now);
        boolean retryEligible = isRetryEligible(asset, now);
        Integer retryAfterSeconds = retryAfterSeconds(asset, now);
        String staleAfter = asset.status() == TtsAudioAssetStatus.PENDING && asset.updatedAt() != null
                ? asset.updatedAt().plusMinutes(pendingStaleMinutes).toString()
                : null;
        String errorCode = derivedErrorCode(asset, stale);

        return new TtsAudioAssetResponse(
                asset.status().value(),
                asset.id(),
                asset.eventId(),
                asset.audioUrl(),
                asset.voice(),
                cacheHit,
                stale,
                retryEligible,
                retryAfterSeconds,
                staleAfter,
                errorCode,
                asset.errorMessage(),
                asset.durationMs()
        );
    }

    private boolean isPendingStale(TtsAudioAsset asset, LocalDateTime now) {
        if (asset.status() != TtsAudioAssetStatus.PENDING
                && asset.status() != TtsAudioAssetStatus.SYNTHESIZING
                && asset.status() != TtsAudioAssetStatus.UPLOADING) {
            return false;
        }
        if (asset.attemptCount() >= maxAttempts) {
            return true;
        }
        if ((asset.status() == TtsAudioAssetStatus.SYNTHESIZING || asset.status() == TtsAudioAssetStatus.UPLOADING)
                && asset.claimExpiresAt() != null) {
            return asset.claimExpiresAt().isBefore(now);
        }
        return asset.updatedAt() != null && asset.updatedAt().plusMinutes(pendingStaleMinutes).isBefore(now);
    }

    private boolean isRetryEligible(TtsAudioAsset asset, LocalDateTime now) {
        return asset.status() == TtsAudioAssetStatus.FAILED
                && asset.attemptCount() < maxAttempts
                && asset.updatedAt() != null
                && asset.updatedAt().plusMinutes(retryDelayMinutes).isBefore(now);
    }

    private Integer retryAfterSeconds(TtsAudioAsset asset, LocalDateTime now) {
        if (asset.status() == TtsAudioAssetStatus.PENDING
                || asset.status() == TtsAudioAssetStatus.SYNTHESIZING
                || asset.status() == TtsAudioAssetStatus.UPLOADING) {
            return DEFAULT_RETRY_AFTER_SECONDS;
        }
        if (asset.status() == TtsAudioAssetStatus.FAILED
                && asset.attemptCount() < maxAttempts
                && asset.updatedAt() != null) {
            LocalDateTime retryAt = asset.updatedAt().plusMinutes(retryDelayMinutes);
            if (retryAt.isAfter(now)) {
                return Math.toIntExact(Math.max(1, Duration.between(now, retryAt).toSeconds()));
            }
        }
        return null;
    }

    private String derivedErrorCode(TtsAudioAsset asset, boolean stale) {
        if ((asset.status() == TtsAudioAssetStatus.PENDING
                || asset.status() == TtsAudioAssetStatus.SYNTHESIZING
                || asset.status() == TtsAudioAssetStatus.UPLOADING)
                && asset.attemptCount() >= maxAttempts) {
            return "MAX_ATTEMPTS_REACHED";
        }
        if ((asset.status() == TtsAudioAssetStatus.PENDING
                || asset.status() == TtsAudioAssetStatus.SYNTHESIZING
                || asset.status() == TtsAudioAssetStatus.UPLOADING)
                && stale) {
            return "PENDING_STALE";
        }
        return asset.errorCode();
    }
}
