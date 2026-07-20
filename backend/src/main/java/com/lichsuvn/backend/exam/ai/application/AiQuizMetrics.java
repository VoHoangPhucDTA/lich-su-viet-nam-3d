package com.lichsuvn.backend.exam.ai.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class AiQuizMetrics {
    private final Counter requests;
    private final Counter success;
    private final Counter partial;
    private final Counter failure;
    private final Counter timeout;
    private final Counter unavailable;
    private final Timer latency;

    public AiQuizMetrics(MeterRegistry registry) {
        requests = registry.counter("ai.quiz.generation.requests");
        success = registry.counter("ai.quiz.generation.success");
        partial = registry.counter("ai.quiz.generation.partial");
        failure = registry.counter("ai.quiz.generation.failure");
        timeout = registry.counter("ai.service.timeout");
        unavailable = registry.counter("ai.service.unavailable");
        latency = registry.timer("ai.quiz.generation.latency");
    }

    public void request() { requests.increment(); }

    public void success(boolean isPartial) {
        success.increment();
        if (isPartial) partial.increment();
    }

    public void failure(String code) {
        failure.increment();
        if ("AI_SERVICE_TIMEOUT".equals(code)) timeout.increment();
        if ("AI_SERVICE_UNAVAILABLE".equals(code)) unavailable.increment();
    }

    public void latency(long nanos) {
        latency.record(Duration.ofNanos(nanos));
    }
}
