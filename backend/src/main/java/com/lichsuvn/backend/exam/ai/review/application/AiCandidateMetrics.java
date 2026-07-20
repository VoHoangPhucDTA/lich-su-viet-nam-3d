package com.lichsuvn.backend.exam.ai.review.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

@Component
public class AiCandidateMetrics {
    private final MeterRegistry registry;

    public AiCandidateMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void lifecycle(String action) {
        counter("ai.candidate.lifecycle", "action", action, "outcome", "success").increment();
    }

    public void revision(String action) {
        counter("ai.candidate.revision", "action", action, "outcome", "success").increment();
    }

    public void provenance(String action, boolean valid) {
        counter("ai.candidate.provenance.validation", "action", action.toLowerCase(),
                "outcome", valid ? "success" : "failure").increment();
    }

    public void publishConflict() {
        counter("ai.candidate.publish.conflicts").increment();
    }

    private Counter counter(String name, String... tags) {
        return Counter.builder(name).tags(tags).register(registry);
    }
}
