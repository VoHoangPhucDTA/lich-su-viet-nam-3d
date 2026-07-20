package com.lichsuvn.backend.exam.ai.review.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

@Component
public class AiReceiptCleanupMetrics {
    private final Counter runs;
    private final Counter deleted;
    private final Counter failures;

    public AiReceiptCleanupMetrics(MeterRegistry registry) {
        runs = registry.counter("ai.receipt.cleanup.runs");
        deleted = registry.counter("ai.receipt.cleanup.deleted");
        failures = registry.counter("ai.receipt.cleanup.failures");
    }
    public void run() { runs.increment(); }
    public void deleted(int count) { deleted.increment(count); }
    public void failure() { failures.increment(); }
}
