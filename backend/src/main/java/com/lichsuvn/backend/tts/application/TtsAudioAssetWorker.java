package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.domain.TtsAudioAsset;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import com.lichsuvn.backend.tts.domain.TtsAudioChunk;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioAssetRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsAudioChunkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class TtsAudioAssetWorker {
    public static final String STORAGE_NOT_CONFIGURED = "STORAGE_NOT_CONFIGURED";
    public static final String PROVIDER_SYNTHESIS_FAILED = "PROVIDER_SYNTHESIS_FAILED";
    public static final String STORAGE_UPLOAD_FAILED = "STORAGE_UPLOAD_FAILED";
    public static final String STORAGE_RESPONSE_INVALID = "STORAGE_RESPONSE_INVALID";
    public static final String CLAIM_LOST = "CLAIM_LOST";

    private static final Logger log = LoggerFactory.getLogger(TtsAudioAssetWorker.class);
    private static final String MIME_TYPE_MP3 = "audio/mpeg";

    private final TtsAudioAssetRepository assetRepository;
    private final TextToSpeechService textToSpeechService;
    private final AudioStorageService audioStorageService;
    private final int maxAttempts;
    private final int retryDelayMinutes;
    private final int claimLeaseSeconds;
    private final int uploadMaxAttempts;
    private final long uploadBackoffMillis;
    private final com.lichsuvn.backend.tts.infrastructure.TtsCloudinaryPath cloudinaryPath;
    private final TtsAudioChunkRepository chunkRepository;
    private final NarrationChunker chunker;
    private final TtsChunkKeyBuilder chunkKeyBuilder;
    private final AudioAssemblyService assemblyService;

    @Autowired
    public TtsAudioAssetWorker(
            TtsAudioAssetRepository assetRepository,
            TextToSpeechService textToSpeechService,
            AudioStorageService audioStorageService,
            @Value("${app.tts.asset-max-attempts:3}") int maxAttempts,
            @Value("${app.tts.asset-retry-delay-minutes:2}") int retryDelayMinutes,
            @Value("${app.tts.asset-claim-lease-seconds:300}") int claimLeaseSeconds,
            @Value("${app.tts.asset-upload-max-attempts:3}") int uploadMaxAttempts,
            @Value("${app.tts.asset-upload-backoff-ms:250}") long uploadBackoffMillis,
            com.lichsuvn.backend.tts.infrastructure.TtsCloudinaryPath cloudinaryPath,
            TtsAudioChunkRepository chunkRepository,
            NarrationChunker chunker,
            TtsChunkKeyBuilder chunkKeyBuilder,
            AudioAssemblyService assemblyService
    ) {
        this.assetRepository = assetRepository;
        this.textToSpeechService = textToSpeechService;
        this.audioStorageService = audioStorageService;
        this.maxAttempts = maxAttempts;
        this.retryDelayMinutes = retryDelayMinutes;
        this.claimLeaseSeconds = claimLeaseSeconds;
        this.uploadMaxAttempts = uploadMaxAttempts;
        this.uploadBackoffMillis = uploadBackoffMillis;
        this.cloudinaryPath = cloudinaryPath;
        this.chunkRepository = chunkRepository;
        this.chunker = chunker;
        this.chunkKeyBuilder = chunkKeyBuilder;
        this.assemblyService = assemblyService;
    }

    /** Compatibility constructor for focused unit tests and existing callers. */
    public TtsAudioAssetWorker(
            TtsAudioAssetRepository assetRepository,
            TextToSpeechService textToSpeechService,
            AudioStorageService audioStorageService,
            int maxAttempts,
            int retryDelayMinutes,
            int claimLeaseSeconds,
            int uploadMaxAttempts,
            long uploadBackoffMillis
    ) {
        this(assetRepository, textToSpeechService, audioStorageService, maxAttempts, retryDelayMinutes,
                claimLeaseSeconds, uploadMaxAttempts, uploadBackoffMillis,
                new com.lichsuvn.backend.tts.infrastructure.TtsCloudinaryPath("history_audio", "narrations", "chunks"),
                null, null, null, null);
    }

    public void processPending(String assetId, String normalizedText) {
        if (!audioStorageService.isConfigured()) {
            assetRepository.markPendingFailed(assetId, STORAGE_NOT_CONFIGURED, "Audio storage is not configured");
            return;
        }
        assetRepository.claimPendingForSynthesis(assetId, leaseUntil(), maxAttempts)
                .ifPresent(asset -> processClaimed(asset, normalizedText));
    }

    public void processFailedRetry(String assetId, String normalizedText) {
        if (!audioStorageService.isConfigured()) {
            assetRepository.markPendingFailed(assetId, STORAGE_NOT_CONFIGURED, "Audio storage is not configured");
            return;
        }
        assetRepository.claimFailedForSynthesis(assetId, LocalDateTime.now().minusMinutes(retryDelayMinutes), leaseUntil(), maxAttempts)
                .ifPresent(asset -> processClaimed(asset, normalizedText));
    }

    public void processStale(String assetId, String normalizedText) {
        if (!audioStorageService.isConfigured()) {
            return;
        }
        assetRepository.claimStaleForSynthesis(assetId, LocalDateTime.now(), leaseUntil(), maxAttempts)
                .ifPresent(asset -> processClaimed(asset, normalizedText));
    }

    private void processClaimed(TtsAudioAsset asset, String normalizedText) {
        if (normalizedText.length() <= 2000 || chunkRepository == null) {
            synthesizeAndUpload(asset, normalizedText);
            return;
        }
        assembleLongNarration(asset, normalizedText);
    }

    private void synthesizeAndUpload(TtsAudioAsset asset, String normalizedText) {
        String claimToken = asset.claimToken();
        try {
            byte[] audioBytes = textToSpeechService.synthesize(
                    normalizedText,
                    asset.voice(),
                    asset.synthesisSpeed().doubleValue()
            );
            if (audioBytes == null || audioBytes.length == 0) {
                throw new ProviderSynthesisException("TTS provider returned empty audio bytes");
            }

            if (!assetRepository.markUploading(asset.id(), claimToken, leaseUntil())) {
                log.warn("Lost TTS asset claim before upload: assetId={}", asset.id());
                return;
            }

            AudioStorageService.StoredAudio storedAudio = uploadWithRetry(
                    audioBytes, asset, cloudinaryPath.buildNarrationPublicId(asset.cacheKey()));
            validateStoredAudio(storedAudio);
            if (!assetRepository.extendClaimLease(asset.id(), claimToken, leaseUntil())) {
                log.warn("Lost TTS asset claim before ready lease extension: assetId={}", asset.id());
                return;
            }
            boolean ready = assetRepository.markReady(asset.id(), claimToken, new TtsAudioAssetRepository.StoredAudioCommand(
                    storedAudio.storageProvider(),
                    storedAudio.storagePublicId(),
                    storedAudio.audioUrl(),
                    storedAudio.mimeType(),
                    storedAudio.fileSize(),
                    storedAudio.durationMs()
            ));
            if (!ready) {
                log.warn("Lost TTS asset claim before ready update: assetId={}", asset.id());
            }
        } catch (Exception ex) {
            String code = errorCode(ex);
            boolean failed = assetRepository.markFailed(asset.id(), claimToken, code, safeMessage(ex));
            if (!failed) {
                log.warn("Lost TTS asset claim before failed update: assetId={}, errorCode={}", asset.id(), code);
            }
        }
    }

    private void assembleLongNarration(TtsAudioAsset asset, String normalizedText) {
        String token = asset.claimToken();
        try {
            if (!assemblyService.isAvailable()) {
                throw new AssemblyException("FFmpeg and ffprobe are not available");
            }
            List<String> textChunks = chunker.chunk(normalizedText);
            List<AudioAssemblyService.AudioChunkInput> audioChunks = new ArrayList<>();
            for (int index = 0; index < textChunks.size(); index++) {
                if (!assetRepository.extendClaimLease(asset.id(), token, leaseUntil())) {
                    throw new ClaimLostException("Parent asset claim lost while processing chunks");
                }
                String text = textChunks.get(index);
                TtsChunkKeyBuilder.ChunkKeyData key = chunkKeyBuilder.build(text, asset.voice(), chunker.version());
                TtsAudioChunkRepository.ClaimResult result = chunkRepository.claimOrGet(
                        new TtsAudioChunkRepository.NewChunkCommand(key.chunkKey(), text, key.textHash(),
                                asset.provider(), asset.voice(), asset.synthesisSpeed(), asset.audioFormat(),
                                asset.returnOption(), asset.withoutFilter(), asset.textProcessingVersion(), chunker.version()));
                chunkRepository.insertRelation(asset.id(), result.chunk().id(), index);
                TtsAudioChunk chunk = ensureChunkReady(result.chunk());
                audioChunks.add(new AudioAssemblyService.AudioChunkInput(index, audioStorageService.download(chunk.audioUrl())));
            }
            AudioAssemblyService.AssembledAudio assembled = assemblyService.assemble(audioChunks);
            if (!assetRepository.markUploading(asset.id(), token, leaseUntil())) {
                throw new ClaimLostException("Parent asset claim lost before final upload");
            }
            AudioStorageService.StoredAudio stored = uploadWithRetry(
                    assembled.audioBytes(), asset, cloudinaryPath.buildNarrationPublicId(asset.cacheKey()));
            validateStoredAudio(stored);
            if (!assetRepository.markReady(asset.id(), token, new TtsAudioAssetRepository.StoredAudioCommand(
                    stored.storageProvider(), stored.storagePublicId(), stored.audioUrl(), stored.mimeType(),
                    stored.fileSize(), assembled.durationMs()))) {
                throw new ClaimLostException("Parent asset claim lost before ready update");
            }
        } catch (Exception ex) {
            String code = ex instanceof AssemblyException ? "FFMPEG_ASSEMBLY_FAILED"
                    : ex instanceof StorageUploadException ? STORAGE_UPLOAD_FAILED
                    : errorCode(ex);
            assetRepository.markFailed(asset.id(), token, code, safeMessage(ex));
        }
    }

    private TtsAudioChunk ensureChunkReady(TtsAudioChunk chunk) throws Exception {
        TtsAudioChunk current = chunk;
        for (int wait = 0; wait < 50; wait++) {
            if (current.status() == TtsAudioAssetStatus.READY && current.isReadyWithAudioUrl()) return current;
            if (current.status() == TtsAudioAssetStatus.FAILED) {
                var retry = chunkRepository.claimFailedForSynthesis(current.id(),
                        LocalDateTime.now().minusMinutes(retryDelayMinutes), leaseUntil(), maxAttempts);
                if (retry.isPresent()) {
                    current = retry.get();
                    break;
                }
                throw new ChunkProcessingException("Chunk synthesis failed: " + current.errorCode());
            }
            if ((current.status() == TtsAudioAssetStatus.SYNTHESIZING || current.status() == TtsAudioAssetStatus.UPLOADING)
                    && current.claimExpiresAt() != null && current.claimExpiresAt().isBefore(LocalDateTime.now())) {
                var retry = chunkRepository.claimStaleForSynthesis(current.id(), LocalDateTime.now(), leaseUntil(), maxAttempts);
                if (retry.isPresent()) {
                    current = retry.get();
                    break;
                }
            }
            if (current.status() == TtsAudioAssetStatus.PENDING) {
                var claimed = chunkRepository.claimPendingForSynthesis(current.id(), leaseUntil(), maxAttempts);
                if (claimed.isPresent()) {
                    current = claimed.get();
                    break;
                }
            }
            Thread.sleep(100L);
            current = chunkRepository.findById(current.id()).orElseThrow(
                    () -> new ChunkProcessingException("Chunk disappeared"));
        }
        if (current.status() != TtsAudioAssetStatus.SYNTHESIZING) {
            throw new ChunkProcessingException("Chunk claim was not acquired");
        }
        TtsAudioChunk claimed = current;
        try {
            byte[] bytes = textToSpeechService.synthesize(claimed.chunkText(), claimed.voice(), claimed.synthesisSpeed().doubleValue());
            if (bytes == null || bytes.length == 0) throw new ChunkProcessingException("Chunk provider returned empty audio");
            if (!chunkRepository.markUploading(claimed.id(), claimed.claimToken(), leaseUntil())) {
                throw new ClaimLostException("Chunk claim lost before upload");
            }
            AudioStorageService.StoredAudio stored = uploadChunkWithRetry(bytes, claimed);
            validateStoredAudio(stored);
            if (!chunkRepository.markReady(claimed.id(), claimed.claimToken(), new TtsAudioChunkRepository.StoredAudioCommand(
                    stored.storageProvider(), stored.storagePublicId(), stored.audioUrl(), stored.mimeType(),
                    stored.fileSize(), stored.durationMs()))) {
                throw new ClaimLostException("Chunk claim lost before ready update");
            }
            return chunkRepository.findById(claimed.id()).orElseThrow(() -> new ChunkProcessingException("Chunk disappeared"));
        } catch (Exception ex) {
            chunkRepository.markFailed(claimed.id(), claimed.claimToken(),
                    ex instanceof StorageUploadException ? STORAGE_UPLOAD_FAILED : PROVIDER_SYNTHESIS_FAILED,
                    safeMessage(ex));
            throw ex;
        }
    }

    private AudioStorageService.StoredAudio uploadChunkWithRetry(byte[] bytes, TtsAudioChunk chunk) throws Exception {
        Exception last = null;
        for (int attempt = 1; attempt <= uploadMaxAttempts; attempt++) {
            try {
                if (!chunkRepository.extendLease(chunk.id(), chunk.claimToken(), leaseUntil())) {
                    throw new ClaimLostException("Chunk claim lost before upload");
                }
                return audioStorageService.upload(bytes, cloudinaryPath.buildChunkPublicId(chunk.chunkKey()), MIME_TYPE_MP3);
            } catch (Exception ex) {
                last = ex;
                if (attempt < uploadMaxAttempts) sleepBeforeRetry(attempt);
            }
        }
        throw new StorageUploadException("Chunk upload failed after retries", last);
    }

    private AudioStorageService.StoredAudio uploadWithRetry(byte[] audioBytes, TtsAudioAsset asset, String publicId) throws StorageUploadException {
        Exception lastError = null;
        for (int attempt = 1; attempt <= uploadMaxAttempts; attempt++) {
            try {
                if (!assetRepository.extendClaimLease(asset.id(), asset.claimToken(), leaseUntil())) {
                    throw new ClaimLostException("TTS asset claim lost before storage upload");
                }
                return audioStorageService.upload(audioBytes, publicId, MIME_TYPE_MP3);
            } catch (Exception ex) {
                lastError = ex;
                if (ex instanceof ClaimLostException) {
                    break;
                }
                if (attempt < uploadMaxAttempts) {
                    sleepBeforeRetry(attempt);
                }
            }
        }
        throw new StorageUploadException("Audio upload failed after retries", lastError);
    }

    private void validateStoredAudio(AudioStorageService.StoredAudio storedAudio) throws StorageResponseInvalidException {
        if (storedAudio == null) {
            throw new StorageResponseInvalidException("Audio storage returned no metadata");
        }
        if (storedAudio.storagePublicId() == null || storedAudio.storagePublicId().isBlank()) {
            throw new StorageResponseInvalidException("Audio storage returned blank public ID");
        }
        if (storedAudio.audioUrl() == null || storedAudio.audioUrl().isBlank()) {
            throw new StorageResponseInvalidException("Audio storage returned blank URL");
        }
        if (storedAudio.fileSize() == null || storedAudio.fileSize() <= 0) {
            throw new StorageResponseInvalidException("Audio storage returned invalid file size");
        }
        if (!MIME_TYPE_MP3.equalsIgnoreCase(storedAudio.mimeType())) {
            throw new StorageResponseInvalidException("Audio storage returned invalid MIME type");
        }
    }

    private String errorCode(Exception ex) {
        if (ex instanceof StorageResponseInvalidException) {
            return STORAGE_RESPONSE_INVALID;
        }
        if (ex instanceof StorageUploadException) {
            return ex.getCause() instanceof ClaimLostException ? CLAIM_LOST : STORAGE_UPLOAD_FAILED;
        }
        return PROVIDER_SYNTHESIS_FAILED;
    }

    private void sleepBeforeRetry(int attempt) {
        if (uploadBackoffMillis <= 0) {
            return;
        }
        try {
            Thread.sleep(uploadBackoffMillis * attempt);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private LocalDateTime leaseUntil() {
        return LocalDateTime.now().plusSeconds(claimLeaseSeconds);
    }

    private String safeMessage(Exception ex) {
        String message = ex.getMessage();
        if (message == null || message.isBlank()) {
            return ex.getClass().getSimpleName();
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }

    private static final class StorageUploadException extends Exception {
        private StorageUploadException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private static final class StorageResponseInvalidException extends Exception {
        private StorageResponseInvalidException(String message) {
            super(message);
        }
    }

    private static final class ProviderSynthesisException extends Exception {
        private ProviderSynthesisException(String message) {
            super(message);
        }
    }

    private static final class ClaimLostException extends Exception {
        private ClaimLostException(String message) {
            super(message);
        }
    }

    private static final class AssemblyException extends Exception {
        private AssemblyException(String message) { super(message); }
    }

    private static final class ChunkProcessingException extends Exception {
        private ChunkProcessingException(String message) { super(message); }
    }
}
