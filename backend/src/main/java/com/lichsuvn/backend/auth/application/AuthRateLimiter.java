package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AuthRateLimiter {
    private static final int MAX_ATTEMPTS = 20;
    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public void check(String key) {
        Instant now = Instant.now();
        Bucket bucket = buckets.compute(key, (ignored, current) -> {
            if (current == null || now.isAfter(current.windowStartedAt().plus(WINDOW))) {
                return new Bucket(now, 1);
            }
            return new Bucket(current.windowStartedAt(), current.count() + 1);
        });

        if (bucket.count() > MAX_ATTEMPTS) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many authentication requests");
        }
    }

    private record Bucket(Instant windowStartedAt, int count) {
    }
}
