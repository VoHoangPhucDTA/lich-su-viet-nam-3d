package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.domain.TtsAudioAsset;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import com.lichsuvn.backend.tts.domain.TtsAudioChunk;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioAssetRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioChunkRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsCloudinaryPath;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.atLeast;

class TtsAudioAssetWorkerTest {
    private final TtsAudioAssetRepository repository = mock(TtsAudioAssetRepository.class);
    private final TextToSpeechService provider = mock(TextToSpeechService.class);
    private final AudioStorageService storage = mock(AudioStorageService.class);
    private final TtsAudioAssetWorker worker = new TtsAudioAssetWorker(
            repository,
            provider,
            storage,
            3,
            2,
            300,
            3,
            0
    );

    @Test
    void claimSuccessCallsProviderOnceAndMarksReady() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1, 2, 3});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), eq("history_audio/narrations/cache-key"), eq("audio/mpeg")))
                .thenReturn(new AudioStorageService.StoredAudio("cloudinary", "pid", "https://res.cloudinary.com/x", "audio/mpeg", 3L, 1000L));
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(repository.markReady(eq("asset-1"), eq("token-1"), any())).thenReturn(true);

        worker.processPending("asset-1", "hello");

        verify(provider, times(1)).synthesize("hello", "hcm-diemmy", 1.0);
        verify(repository).markReady(eq("asset-1"), eq("token-1"), any());
    }

    @Test
    void uploadRetryUsesSameBytesAndDoesNotCallProviderAgain() throws Exception {
        byte[] audio = new byte[]{9, 8, 7};
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(audio);
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), eq("history_audio/narrations/cache-key"), eq("audio/mpeg")))
                .thenThrow(new RuntimeException("transient"))
                .thenReturn(new AudioStorageService.StoredAudio("cloudinary", "pid", "url", "audio/mpeg", 3L, null));
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);

        worker.processPending("asset-1", "hello");

        ArgumentCaptor<byte[]> bytesCaptor = ArgumentCaptor.forClass(byte[].class);
        verify(storage, times(2)).upload(bytesCaptor.capture(), eq("history_audio/narrations/cache-key"), eq("audio/mpeg"));
        assertArrayEquals(audio, bytesCaptor.getAllValues().get(0));
        assertArrayEquals(audio, bytesCaptor.getAllValues().get(1));
        verify(provider, times(1)).synthesize("hello", "hcm-diemmy", 1.0);
    }

    @Test
    void providerFailureMarksProviderError() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenThrow(new RuntimeException("provider down"));

        worker.processPending("asset-1", "hello");

        verify(repository).markFailed("asset-1", "token-1", TtsAudioAssetWorker.PROVIDER_SYNTHESIS_FAILED, "provider down");
        verify(storage, never()).upload(any(), any(), any());
    }

    @Test
    void providerEmptyBytesMarksProviderError() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[0]);

        worker.processPending("asset-1", "hello");

        verify(repository).markFailed("asset-1", "token-1", TtsAudioAssetWorker.PROVIDER_SYNTHESIS_FAILED, "TTS provider returned empty audio bytes");
        verify(storage, never()).upload(any(), any(), any());
    }

    @Test
    void storageFailureMarksStorageError() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), any(), any())).thenThrow(new RuntimeException("storage down"));

        worker.processPending("asset-1", "hello");

        verify(repository).markFailed(eq("asset-1"), eq("token-1"), eq(TtsAudioAssetWorker.STORAGE_UPLOAD_FAILED), any());
        verify(provider, times(1)).synthesize("hello", "hcm-diemmy", 1.0);
    }

    @Test
    void storageNullResponseMarksInvalidStorageResponse() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), any(), any())).thenReturn(null);

        worker.processPending("asset-1", "hello");

        verify(repository).markFailed("asset-1", "token-1", TtsAudioAssetWorker.STORAGE_RESPONSE_INVALID, "Audio storage returned no metadata");
        verify(repository, never()).markReady(any(), any(), any());
    }

    @Test
    void storageInvalidMetadataMarksInvalidStorageResponse() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), any(), any()))
                .thenReturn(new AudioStorageService.StoredAudio("cloudinary", "pid", "url", "audio/mpeg", 0L, null));

        worker.processPending("asset-1", "hello");

        verify(repository).markFailed("asset-1", "token-1", TtsAudioAssetWorker.STORAGE_RESPONSE_INVALID, "Audio storage returned invalid file size");
        verify(repository, never()).markReady(any(), any(), any());
    }

    @Test
    void claimLossDuringUploadLeaseStopsReadyUpdate() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(false);

        worker.processPending("asset-1", "hello");

        verify(storage, never()).upload(any(), any(), any());
        verify(repository, never()).markReady(any(), any(), any());
    }

    @Test
    void lostClaimBeforeUploadStopsWithoutReadyOrFailedUpdate() throws Exception {
        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3))).thenReturn(Optional.of(asset("token-1")));
        when(provider.synthesize("hello", "hcm-diemmy", 1.0)).thenReturn(new byte[]{1});
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(false);

        worker.processPending("asset-1", "hello");

        verify(storage, never()).upload(any(), any(), any());
        verify(repository, never()).markReady(any(), any(), any());
    }

    @Test
    void missingStorageDoesNotClaimOrCallProvider() throws Exception {
        when(storage.isConfigured()).thenReturn(false);

        worker.processPending("asset-1", "hello");

        verify(repository).markPendingFailed("asset-1", TtsAudioAssetWorker.STORAGE_NOT_CONFIGURED, "Audio storage is not configured");
        verify(repository, never()).claimPendingForSynthesis(any(), any(), any(Integer.class));
        verify(provider, never()).synthesize(any(), any(), any(Double.class));
    }

    @Test
    void longNarrationUsesChunkCacheBeforeAssembly() throws Exception {
        TtsAudioChunkRepository chunkRepository = mock(TtsAudioChunkRepository.class);
        NarrationChunker chunker = new NarrationChunker(50, 60, "v1");
        TtsChunkKeyBuilder keyBuilder = mock(TtsChunkKeyBuilder.class);
        AudioAssemblyService assembly = mock(AudioAssemblyService.class);
        TtsAudioAssetWorker longWorker = new TtsAudioAssetWorker(
                repository, provider, storage, 3, 2, 300, 3, 0,
                new TtsCloudinaryPath("history_audio", "narrations", "chunks"),
                chunkRepository, chunker, keyBuilder, assembly);
        String narration = String.join(" ", java.util.Collections.nCopies(500, "Vietnam"));

        when(storage.isConfigured()).thenReturn(true);
        when(repository.claimPendingForSynthesis(eq("asset-1"), any(), eq(3)))
                .thenReturn(Optional.of(asset("token-1")));
        when(repository.extendClaimLease(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(keyBuilder.build(any(), eq("hcm-diemmy"), eq("v1")))
                .thenAnswer(invocation -> new TtsChunkKeyBuilder.ChunkKeyData(
                        "canonical", "chunk-" + invocation.getArgument(0).hashCode(), "text-hash"));
        java.util.concurrent.atomic.AtomicInteger chunkNumber = new java.util.concurrent.atomic.AtomicInteger();
        when(chunkRepository.claimOrGet(any())).thenAnswer(invocation -> {
            int index = chunkNumber.getAndIncrement();
            return new TtsAudioChunkRepository.ClaimResult(
                    TtsAudioChunkRepository.ClaimKind.EXISTING_READY,
                    readyChunk("chunk-" + index, "https://audio.test/chunk-" + index));
        });
        when(chunkRepository.insertRelation(any(), any(), any(Integer.class))).thenReturn(true);
        when(storage.download(any())).thenReturn(new byte[]{1, 2, 3});
        when(assembly.isAvailable()).thenReturn(true);
        when(assembly.assemble(any())).thenReturn(new AudioAssemblyService.AssembledAudio(
                new byte[]{9, 8, 7}, "audio/mpeg", 1234));
        when(repository.markUploading(eq("asset-1"), eq("token-1"), any())).thenReturn(true);
        when(storage.upload(any(), eq("history_audio/narrations/cache-key"), eq("audio/mpeg")))
                .thenReturn(new AudioStorageService.StoredAudio("cloudinary", "parent", "https://audio.test/parent",
                        "audio/mpeg", 3L, 1234L));
        when(repository.markReady(eq("asset-1"), eq("token-1"), any())).thenReturn(true);

        longWorker.processPending("asset-1", narration);

        verify(chunkRepository, atLeast(2)).claimOrGet(any());
        verify(assembly).assemble(any());
        verify(provider, never()).synthesize(any(), any(), any(Double.class));
        verify(repository).markReady(eq("asset-1"), eq("token-1"), any());
    }

    private TtsAudioChunk readyChunk(String id, String url) {
        LocalDateTime now = LocalDateTime.now();
        return new TtsAudioChunk(id, id, "chunk", "hash", "viettel-ai", "hcm-diemmy",
                new BigDecimal("1.00"), "mp3", 3, false, "v1", "v1",
                TtsAudioAssetStatus.READY, null, null, 1, now, null, null,
                "cloudinary", id, url, "audio/mpeg", 3L, 600L, now, now);
    }

    private TtsAudioAsset asset(String token) {
        LocalDateTime now = LocalDateTime.now();
        return new TtsAudioAsset(
                "asset-1",
                "cache-key",
                "event-1",
                "text-hash",
                "viettel-ai",
                "hcm-diemmy",
                new BigDecimal("1.00"),
                "mp3",
                3,
                false,
                "v1",
                null,
                null,
                null,
                null,
                null,
                null,
                TtsAudioAssetStatus.SYNTHESIZING,
                token,
                now.plusMinutes(5),
                now,
                now,
                1,
                null,
                null,
                now.minusMinutes(1),
                now
        );
    }
}
