package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.infrastructure.TtsAudioAssetRepository;
import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.concurrent.RejectedExecutionException;

@Service
@ConditionalOnBean(NamedParameterJdbcTemplate.class)
public class TtsAudioAssetRecoveryService {
    private static final Logger log = LoggerFactory.getLogger(TtsAudioAssetRecoveryService.class);

    private final TtsAudioAssetRepository assetRepository;
    private final TtsEventNarrationRepository eventNarrationRepository;
    private final NarrationTextBuilder narrationTextBuilder;
    private final TtsAudioAssetWorker worker;
    private final TtsAssetWorkerSubmitter submitter;
    private final boolean assetFlowEnabled;
    private final int maxAttempts;
    private final int recoveryLimit;

    public TtsAudioAssetRecoveryService(
            TtsAudioAssetRepository assetRepository,
            TtsEventNarrationRepository eventNarrationRepository,
            NarrationTextBuilder narrationTextBuilder,
            TtsAudioAssetWorker worker,
            TtsAssetWorkerSubmitter submitter,
            @Value("${app.tts.asset-flow-enabled:false}") boolean assetFlowEnabled,
            @Value("${app.tts.asset-max-attempts:3}") int maxAttempts,
            @Value("${app.tts.asset-recovery-limit:10}") int recoveryLimit
    ) {
        this.assetRepository = assetRepository;
        this.eventNarrationRepository = eventNarrationRepository;
        this.narrationTextBuilder = narrationTextBuilder;
        this.worker = worker;
        this.submitter = submitter;
        this.assetFlowEnabled = assetFlowEnabled;
        this.maxAttempts = maxAttempts;
        this.recoveryLimit = recoveryLimit;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnStartup() {
        recoverStaleClaims();
    }

    @Scheduled(fixedDelayString = "${app.tts.asset-recovery-interval-ms:60000}")
    public void recoverStaleClaims() {
        if (!assetFlowEnabled) {
            return;
        }
        for (String assetId : assetRepository.findStaleClaimIds(LocalDateTime.now(), maxAttempts, recoveryLimit)) {
            assetRepository.findById(assetId).ifPresent(asset ->
                    eventNarrationRepository.findPublishedById(asset.eventId()).ifPresent(event -> {
                        String normalizedText = narrationTextBuilder.normalizeForSynthesis(narrationTextBuilder.build(event));
                        try {
                            submitter.submit(() -> worker.processStale(asset.id(), normalizedText));
                        } catch (RejectedExecutionException ex) {
                            log.warn("TTS stale recovery worker queue rejected assetId={}", asset.id());
                        }
                    })
            );
        }
    }
}
