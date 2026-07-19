package com.lichsuvn.backend.tts.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetRequest;
import com.lichsuvn.backend.tts.domain.TtsAudioAsset;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetClaimResult;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioAssetRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository.EventNarrationData;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.RejectedExecutionException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TtsAudioAssetServiceTest {
    private final TtsEventNarrationRepository eventRepository = mock(TtsEventNarrationRepository.class);
    private final TtsAudioAssetRepository assetRepository = mock(TtsAudioAssetRepository.class);
    private final NarrationService narrationService = mock(NarrationService.class);
    private final AudioStorageService audioStorageService = mock(AudioStorageService.class);
    private final TtsAudioAssetWorker worker = mock(TtsAudioAssetWorker.class);
    private final TtsAssetWorkerSubmitter workerSubmitter = mock(TtsAssetWorkerSubmitter.class);
    private final TtsAudioAssetService service = new TtsAudioAssetService(
            eventRepository,
            assetRepository,
            new NarrationTextBuilder(),
            new TtsCacheKeyBuilder(new ObjectMapper()),
            narrationService,
            audioStorageService,
            worker,
            workerSubmitter,
            10,
            2,
            3
    );

    @Test
    void invalidVoiceIsRejectedBeforeClaim() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));

        assertThrows(ApiException.class, () -> service.requestAsset("event-1", new TtsAudioAssetRequest("bad-voice")));

        verify(eventRepository, never()).findPublishedById(any());
        verify(assetRepository, never()).claimPending(any());
    }

    @Test
    void missingEventIsRejectedBeforeInsert() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(audioStorageService.isConfigured()).thenReturn(true);
        when(eventRepository.findPublishedById("missing")).thenReturn(Optional.empty());

        assertThrows(NotFoundException.class, () -> service.requestAsset("missing", new TtsAudioAssetRequest("hcm-diemmy")));

        verify(assetRepository, never()).claimPending(any());
    }

    @Test
    void missingStorageRejectsBeforeInsert() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(audioStorageService.isConfigured()).thenReturn(false);

        ApiException error = assertThrows(ApiException.class,
                () -> service.requestAsset("event-1", new TtsAudioAssetRequest("hcm-diemmy")));

        assertEquals("STORAGE_NOT_CONFIGURED", error.getCode());
        verify(eventRepository, never()).findPublishedById(any());
        verify(assetRepository, never()).claimPending(any());
    }

    @Test
    void longNarrationCreatesParentAssetForChunkWorker() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(narrationService.getMaxChunkLength()).thenReturn(5);
        when(audioStorageService.isConfigured()).thenReturn(true);
        when(eventRepository.findPublishedById("event-1")).thenReturn(Optional.of(event()));

        when(assetRepository.claimPending(any())).thenReturn(new TtsAudioAssetClaimResult(
                TtsAudioAssetClaimResult.Kind.CLAIMED_NEW,
                asset(TtsAudioAssetStatus.PENDING, 0, LocalDateTime.now(), null, null)));

        var response = service.requestAsset("event-1", new TtsAudioAssetRequest("hcm-diemmy"));

        assertEquals("pending", response.status());
        verify(assetRepository).claimPending(any());
    }

    @Test
    void readyAssetWithoutAudioUrlReturnsMetadataIncomplete() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(narrationService.getMaxChunkLength()).thenReturn(2000);
        when(audioStorageService.isConfigured()).thenReturn(true);
        when(eventRepository.findPublishedById("event-1")).thenReturn(Optional.of(event()));
        TtsAudioAsset readyWithoutUrl = asset(TtsAudioAssetStatus.READY, 1, LocalDateTime.now(), null, null);
        when(assetRepository.claimPending(any())).thenReturn(new TtsAudioAssetClaimResult(
                TtsAudioAssetClaimResult.Kind.EXISTING_READY,
                readyWithoutUrl
        ));

        var response = service.requestAsset("event-1", new TtsAudioAssetRequest("hcm-diemmy"));

        assertEquals("failed", response.status());
        assertEquals("ASSET_METADATA_INCOMPLETE", response.errorCode());
    }

    @Test
    void newClaimSubmitsWorker() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(narrationService.getMaxChunkLength()).thenReturn(2000);
        when(audioStorageService.isConfigured()).thenReturn(true);
        when(eventRepository.findPublishedById("event-1")).thenReturn(Optional.of(event()));
        when(assetRepository.claimPending(any())).thenReturn(new TtsAudioAssetClaimResult(
                TtsAudioAssetClaimResult.Kind.CLAIMED_NEW,
                asset(TtsAudioAssetStatus.PENDING, 0, LocalDateTime.now(), null, null)
        ));

        var response = service.requestAsset("event-1", new TtsAudioAssetRequest("hcm-diemmy"));

        assertEquals("pending", response.status());
        verify(workerSubmitter).submit(any());
    }

    @Test
    void executorRejectMarksPendingFailed() {
        when(narrationService.getDefaultVoice()).thenReturn("hcm-diemmy");
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy"));
        when(narrationService.getMaxChunkLength()).thenReturn(2000);
        when(audioStorageService.isConfigured()).thenReturn(true);
        when(eventRepository.findPublishedById("event-1")).thenReturn(Optional.of(event()));
        when(assetRepository.claimPending(any())).thenReturn(new TtsAudioAssetClaimResult(
                TtsAudioAssetClaimResult.Kind.CLAIMED_NEW,
                asset(TtsAudioAssetStatus.PENDING, 0, LocalDateTime.now(), null, null)
        ));
        org.mockito.Mockito.doThrow(new RejectedExecutionException("full"))
                .when(workerSubmitter).submit(any());

        service.requestAsset("event-1", new TtsAudioAssetRequest("hcm-diemmy"));

        verify(assetRepository).markPendingFailed("asset-1", "WORKER_SUBMISSION_FAILED", "TTS worker queue rejected the task");
    }

    @Test
    void failedAssetReportsRetryEligibleWithoutMutation() {
        TtsAudioAsset failed = asset(TtsAudioAssetStatus.FAILED, 1, LocalDateTime.now().minusMinutes(5), null, "PROVIDER_FAILED");
        when(assetRepository.findById("asset-1")).thenReturn(Optional.of(failed));

        var response = service.getAsset("asset-1");

        assertEquals("failed", response.status());
        assertTrue(response.retryEligible());
        assertEquals("PROVIDER_FAILED", response.errorCode());
        verify(assetRepository).findById("asset-1");
    }

    @Test
    void getAssetNotFoundThrows404() {
        when(assetRepository.findById("missing")).thenReturn(Optional.empty());

        assertThrows(NotFoundException.class, () -> service.getAsset("missing"));
    }

    private EventNarrationData event() {
        return new EventNarrationData(
                "event-1",
                "Sự kiện",
                null,
                "1945",
                List.of(),
                "Tóm tắt",
                "Tổng quan",
                null,
                null
        );
    }

    private TtsAudioAsset asset(
            TtsAudioAssetStatus status,
            int attemptCount,
            LocalDateTime updatedAt,
            String audioUrl,
            String errorCode
    ) {
        return new TtsAudioAsset(
                "asset-1",
                "cache",
                "event-1",
                "textHash",
                "viettel-ai",
                "hcm-diemmy",
                new BigDecimal("1.00"),
                "mp3",
                3,
                false,
                "v1",
                null,
                null,
                audioUrl,
                null,
                null,
                null,
                status,
                null,
                null,
                null,
                null,
                attemptCount,
                errorCode,
                null,
                updatedAt.minusMinutes(1),
                updatedAt
        );
    }
}
