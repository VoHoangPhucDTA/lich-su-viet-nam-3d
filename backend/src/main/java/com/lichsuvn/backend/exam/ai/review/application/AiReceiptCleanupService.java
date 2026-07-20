package com.lichsuvn.backend.exam.ai.review.application;

import com.lichsuvn.backend.exam.ai.review.infrastructure.AiGenerationReceiptRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class AiReceiptCleanupService {
    private static final Logger log = LoggerFactory.getLogger(AiReceiptCleanupService.class);
    private final AiGenerationReceiptRepository receipts;
    private final AiReceiptCleanupMetrics metrics;
    private final boolean enabled;
    private final int retentionHours;
    private final int batchSize;

    public AiReceiptCleanupService(AiGenerationReceiptRepository receipts, AiReceiptCleanupMetrics metrics,
                                   @Value("${app.ai-receipt.cleanup-enabled:true}") boolean enabled,
                                   @Value("${app.ai-receipt.retention-hours:24}") int retentionHours,
                                   @Value("${app.ai-receipt.cleanup-batch-size:100}") int batchSize) {
        this.receipts = receipts;
        this.metrics = metrics;
        this.enabled = enabled;
        this.retentionHours = Math.max(1, retentionHours);
        this.batchSize = Math.max(1, Math.min(1000, batchSize));
    }

    @Scheduled(cron = "${app.ai-receipt.cleanup-cron:0 17 * * * *}")
    @Transactional
    public void cleanup() {
        if (!enabled) return;
        metrics.run();
        LocalDateTime now = LocalDateTime.now();
        try {
            int deleted = receipts.deleteExpiredUnreferenced(now, now.minusHours(retentionHours), batchSize);
            metrics.deleted(deleted);
            log.info("AI receipt cleanup completed deleted={}", deleted);
        } catch (RuntimeException ex) {
            metrics.failure();
            log.warn("AI receipt cleanup failed");
            throw ex;
        }
    }
}
